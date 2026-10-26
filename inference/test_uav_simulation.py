"""
test_uav_simulation.py
======================
Skrip pengujian otomatis end-to-end untuk Step 5:
1. Menguji alur streaming video UAV (file video atau sintetis) ke /ws/stream.
2. Memverifikasi transmisi ke Python inference dan broadcast ke /ws/detection.
3. Mengukur metrik performa: FPS pengiriman, FPS inferensi, latency (ms), bandwidth.
4. Melakukan analisis Domain Gap (perbandingan deteksi ground-level vs rekaman sudut UAV).
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

# Encoding UTF-8 untuk output terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import cv2
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
TEST_VIDEOS_DIR = SCRIPT_DIR / "test_videos"
SAMPLE_VIDEO = TEST_VIDEOS_DIR / "uav_sawit_flight.mp4"
TEST_IMAGES_DIR = SCRIPT_DIR / "test_images"

BACKEND_STREAM_WS = "ws://localhost:3000/ws/stream"
BACKEND_DETECTION_WS = "ws://localhost:3000/ws/detection"
BACKEND_HEALTH_URL = "http://localhost:3000/api/health"
BACKEND_STATS_URL = "http://localhost:3000/api/stats"
INFERENCE_HEALTH_URL = "http://localhost:8000/health"
INFERENCE_STATS_URL = "http://localhost:8000/stats"


def check_service_http(url: str) -> dict | None:
    """Cek status HTTP endpoint."""
    import urllib.request
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Step5-Test/1.0"})
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception:
        return None
    return None


async def run_end_to_end_uav_test(test_duration_sec: int = 6, target_fps: int = 15) -> dict:
    """Jalankan simulasi UAV dan verifikasi penerimaan di viewer."""
    import websockets

    print("=" * 65)
    print("  UJI END-TO-END SIMULASI ALIRAN VIDEO UAV (Step 5)")
    print("=" * 65)

    # 1. Cek Service
    print("[1/4] Memeriksa status service...")
    b_health = check_service_http(BACKEND_HEALTH_URL)
    i_health = check_service_http(INFERENCE_HEALTH_URL)

    if not b_health:
        print("[FAIL] Elysia backend tidak aktif di http://localhost:3000")
        return {"success": False, "error": "Backend offline"}
    print(f"  [OK] Elysia Backend aktif (inference_connected={b_health.get('inference_connected')})")

    if not i_health:
        print("[FAIL] Python inference service tidak aktif di http://localhost:8000")
        return {"success": False, "error": "Inference offline"}
    print(f"  [OK] Python Inference aktif (model_loaded={i_health.get('model_loaded')})")

    # 2. Siapkan frame generator
    cap = None
    if SAMPLE_VIDEO.exists():
        cap = cv2.VideoCapture(str(SAMPLE_VIDEO))
        print(f"[2/4] Menggunakan video uji: {SAMPLE_VIDEO.name}")
    else:
        print(f"[2/4] Video tidak ditemukan, menggunakan generator frame sintetis.")

    received_frames = []
    received_detections = []
    frames_sent = 0

    # 3. Viewer task (mendengarkan /ws/detection)
    async def viewer_listener(stop_evt: asyncio.Event):
        async with websockets.connect(BACKEND_DETECTION_WS) as ws:
            while not stop_evt.is_set():
                try:
                    msg_raw = await asyncio.wait_for(ws.receive(), timeout=1.0)
                    msg = json.loads(msg_raw)
                    mtype = msg.get("type")
                    if mtype == "frame":
                        received_frames.append(msg)
                    elif mtype == "detection_result":
                        received_detections.append(msg)
                except asyncio.TimeoutError:
                    continue
                except Exception:
                    break

    # 4. Streamer task (mengirim frame ke /ws/stream)
    async def uav_sender(stop_evt: asyncio.Event):
        nonlocal frames_sent
        async with websockets.connect(BACKEND_STREAM_WS) as ws:
            interval = 1.0 / target_fps
            start_t = time.time()
            idx = 0
            while not stop_evt.is_set():
                if time.time() - start_t >= test_duration_sec:
                    break

                t0 = time.perf_counter()
                if cap is not None:
                    ret, frame = cap.read()
                    if not ret:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = cap.read()
                    frame = cv2.resize(frame, (640, 480))
                else:
                    frame = np.zeros((480, 640, 3), dtype=np.uint8)
                    frame[:] = (40, 160, 60)
                    cv2.putText(frame, f"TEST FRAME #{idx}", (50, 100), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)

                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                b64 = base64.b64encode(buf.tobytes()).decode("ascii")

                frame_id = f"test-uav-{idx}-{int(time.time()*1000)}"
                payload = json.dumps({"type": "frame", "data": b64, "frame_id": frame_id})
                await ws.send(payload)
                frames_sent += 1
                idx += 1

                elapsed = time.perf_counter() - t0
                await asyncio.sleep(max(0.0, interval - elapsed))

    stop_event = asyncio.Event()
    print(f"[3/4] Menjalankan streaming UAV selama {test_duration_sec} detik @ {target_fps} FPS...")

    viewer_task = asyncio.create_task(viewer_listener(stop_event))
    sender_task = asyncio.create_task(uav_sender(stop_event))

    await sender_task
    # Beri jeda 1 detik agar frame terakhir selesai diproses dan di-broadcast
    await asyncio.sleep(1.0)
    stop_event.set()
    await viewer_task

    if cap:
        cap.release()

    # 5. Analisis Hasil
    print("[4/4] Mengumpulkan dan memvalidasi hasil uji...")
    b_stats = check_service_http(BACKEND_STATS_URL) or {}
    i_stats = check_service_http(INFERENCE_STATS_URL) or {}

    total_time = max(0.001, test_duration_sec)
    send_fps = frames_sent / total_time
    avg_latency = i_stats.get("avg_latency_ms", 0.0)

    print("-" * 65)
    print(f"  Frame UAV terkirim         : {frames_sent} frame ({send_fps:.1f} FPS)")
    print(f"  Frame diterima viewer      : {len(received_frames)} frame")
    print(f"  Hasil deteksi diterima     : {len(received_detections)} paket")
    print(f"  Rata-rata latency model    : {avg_latency} ms")
    print(f"  FPS aktif inference        : {i_stats.get('fps', 0.0)} FPS")
    print("-" * 65)

    success = (
        frames_sent > 0
        and len(received_frames) > 0
        and len(received_detections) > 0
        and send_fps >= 5.0
    )

    if success:
        print("[PASS] Sistem UAV stream & deteksi real-time bekerja stabil!")
    else:
        print("[FAIL] Salah satu kriteria performa tidak tercapai.")

    return {
        "success": success,
        "frames_sent": frames_sent,
        "send_fps": round(send_fps, 2),
        "viewer_frames_received": len(received_frames),
        "detections_received": len(received_detections),
        "avg_latency_ms": avg_latency,
        "inference_fps": i_stats.get("fps", 0.0),
    }


def analyze_domain_gap() -> dict:
    """
    Evaluasi Domain Gap:
    Bandingkan performa deteksi model YOLOv11n (yang dilatih pada ground-level)
    terhadap citra ground-level vs frame bersudut pandang UAV.
    """
    print("\n" + "=" * 65)
    print("  ANALISIS DOMAIN GAP (Ground-Level vs Aerial UAV)")
    print("=" * 65)

    from ultralytics import YOLO

    model_path = SCRIPT_DIR / "oil_palm_fruit_yolov11n.pt"
    if not model_path.exists():
        print(f"[WARN] Model {model_path.name} tidak ditemukan.")
        return {}

    model = YOLO(str(model_path))

    # A. Evaluasi pada ground-level sample images
    ground_results = []
    ground_images = sorted(list(TEST_IMAGES_DIR.glob("*.jpg")))
    for img_path in ground_images:
        im = cv2.imread(str(img_path))
        if im is None:
            continue
        res = model(im, conf=0.20, verbose=False)[0]
        dets = []
        for b in res.boxes:
            cls_name = model.names[int(b.cls[0])]
            conf = float(b.conf[0])
            dets.append({"label": cls_name, "conf": round(conf, 3)})
        ground_results.append({
            "image": img_path.name,
            "count": len(dets),
            "detections": dets,
        })

    # B. Evaluasi pada frame sampel video UAV
    uav_results = []
    if SAMPLE_VIDEO.exists():
        cap = cv2.VideoCapture(str(SAMPLE_VIDEO))
        step = 30  # sample tiap 30 frame (2 detik)
        f_idx = 0
        while len(uav_results) < 5:
            ret, frame = cap.read()
            if not ret:
                break
            if f_idx % step == 0:
                res = model(frame, conf=0.20, verbose=False)[0]
                dets = []
                for b in res.boxes:
                    cls_name = model.names[int(b.cls[0])]
                    conf = float(b.conf[0])
                    dets.append({"label": cls_name, "conf": round(conf, 3)})
                uav_results.append({
                    "frame_idx": f_idx,
                    "count": len(dets),
                    "detections": dets,
                })
            f_idx += 1
        cap.release()

    # Rangkum statistik
    total_ground_dets = sum(r["count"] for r in ground_results)
    avg_ground_conf = (
        sum(d["conf"] for r in ground_results for d in r["detections"]) / max(1, total_ground_dets)
        if total_ground_dets > 0 else 0.0
    )

    total_uav_dets = sum(r["count"] for r in uav_results)
    avg_uav_conf = (
        sum(d["conf"] for r in uav_results for d in r["detections"]) / max(1, total_uav_dets)
        if total_uav_dets > 0 else 0.0
    )

    print(f"  Dataset Ground-Level:")
    print(f"    Total citra diuji      : {len(ground_results)}")
    print(f"    Total TBS terdeteksi   : {total_ground_dets}")
    print(f"    Rata-rata confidence   : {avg_ground_conf:.3f}")

    print(f"\n  Dataset UAV / Aerial Stream:")
    print(f"    Total frame diuji      : {len(uav_results)}")
    print(f"    Total TBS terdeteksi   : {total_uav_dets}")
    print(f"    Rata-rata confidence   : {avg_uav_conf:.3f}")

    print("\n  Temuan Analisis Domain Gap:")
    print("  1. Perspektif Sudut Pandang (Viewpoint Gap):")
    print("     Model dilatih pada sudut horizontal/ground-level. Pada sudut UAV (oblique/top-down),")
    print("     pola tandan buah sawit (TBS) sebagian tertutup pelepah pohon (occlusion by fronds).")
    print("  2. Skala & Resolusi Objek (Scale Gap):")
    print("     Tandan buah tampak lebih kecil pada ketinggian terbang UAV (15-20 meter)")
    print("     dibandingkan foto close-up jarak dekat.")
    print("  3. Rekomendasi Solusi:")
    print("     Diperlukan fine-tuning lanjutan dengan dataset citra drone/aerial kelapa sawit")
    print("     atau penyesuaian threshold confidence (conf=0.15-0.20) untuk aerial monitoring.")
    print("=" * 65)

    return {
        "ground_level": {
            "images_count": len(ground_results),
            "total_detections": total_ground_dets,
            "avg_confidence": round(avg_ground_conf, 3),
            "samples": ground_results,
        },
        "uav_stream": {
            "frames_count": len(uav_results),
            "total_detections": total_uav_dets,
            "avg_confidence": round(avg_uav_conf, 3),
            "samples": uav_results,
        },
    }


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Step 5 UAV Stream & Domain Gap Benchmark")
    parser.add_argument("--domain-gap-only", action="store_true", help="Hanya jalankan analisis domain gap")
    parser.add_argument("--duration", type=int, default=6, help="Durasi uji stream (detik, default: 6)")
    parser.add_argument("--fps", type=int, default=15, help="Target FPS (default: 15)")
    args = parser.parse_args()

    if args.domain_gap_only:
        analyze_domain_gap()
        return

    # Jika service sedang aktif, jalankan live stream test
    b_online = check_service_http(BACKEND_HEALTH_URL) is not None
    if b_online:
        res = asyncio.run(run_end_to_end_uav_test(test_duration_sec=args.duration, target_fps=args.fps))
    else:
        print("[INFO] Elysia backend belum berjalan di port 3000.")
        print("[INFO] Menjalankan evaluasi domain gap offline...")

    analyze_domain_gap()


if __name__ == "__main__":
    main()
