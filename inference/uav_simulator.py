"""
uav_simulator.py
=================
Simulator UAV berbasis Python untuk menguji sistem deteksi TBS kelapa sawit.
Membaca video dari file/webcam/simulasi sintetis dan mengirim frame ke backend Elysia
via WebSocket /ws/stream secara real-time.

Contoh Penggunaan:
  python uav_simulator.py --source test_videos/uav_sawit_flight.mp4 --fps 15
  python uav_simulator.py --source test --fps 15
  python uav_simulator.py --source sim --fps 15
  python uav_simulator.py --source 0 --fps 15

Sesuai Subbab 1.5 Batasan Masalah: Pengujian dilakukan tanpa drone fisik.
"""

import argparse
import asyncio
import base64
import math
import os
import sys
import time
from pathlib import Path

# Pastikan output UTF-8 di terminal Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import cv2
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_VIDEO = SCRIPT_DIR / "test_videos" / "uav_sawit_flight.mp4"
DEFAULT_SOURCE = str(DEFAULT_VIDEO) if DEFAULT_VIDEO.exists() else "test"
TEST_IMAGES_DIR = SCRIPT_DIR / "test_images"


def create_test_frame(width: int = 640, height: int = 480, frame_no: int = 0) -> np.ndarray:
    """Buat frame sintetis dengan pola gradien dan telemetry UAV."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    hue = int((frame_no * 2) % 180)
    color_bgr = cv2.cvtColor(np.uint8([[[hue, 180, 160]]]), cv2.COLOR_HSV2BGR)[0][0].tolist()
    img[:] = color_bgr

    # Grid
    for y in range(0, height, 60):
        cv2.line(img, (0, y), (width, y), (40, 40, 40), 1)
    for x in range(0, width, 60):
        cv2.line(img, (x, 0), (x, height), (40, 40, 40), 1)

    # Telemetry OSD
    cx, cy = width // 2, height // 2
    cv2.line(img, (cx - 20, cy), (cx + 20, cy), (0, 255, 0), 1)
    cv2.line(img, (cx, cy - 20), (cx, cy + 20), (0, 255, 0), 1)
    cv2.circle(img, (cx, cy), 5, (0, 255, 0), 1)

    font = cv2.FONT_HERSHEY_SIMPLEX
    cv2.putText(img, f"FRAME #{frame_no}", (20, 40), font, 0.9, (255, 255, 255), 2)
    cv2.putText(img, "UAV SIMULATOR [TEST PATTERN]", (20, 75), font, 0.6, (200, 255, 200), 1)
    cv2.putText(img, f"TIME: {time.strftime('%H:%M:%S')}", (20, 105), font, 0.55, (220, 220, 220), 1)
    cv2.putText(img, "ALT: 18.5m | SPEED: 3.2m/s | SATS: 14", (20, height - 20), font, 0.5, (0, 230, 255), 1)
    return img


class UAVFlightSimulator:
    """Simulasi penerbangan UAV kontinu berbasis citra sawit dan telemetry OSD."""

    def __init__(self, width: int = 640, height: int = 480):
        self.width = width
        self.height = height
        self.images: list[np.ndarray] = []
        if TEST_IMAGES_DIR.exists():
            for p in sorted(TEST_IMAGES_DIR.glob("*.jpg")):
                im = cv2.imread(str(p))
                if im is not None:
                    self.images.append(im)

        if not self.images:
            fallback = np.zeros((height, width, 3), dtype=np.uint8)
            fallback[:] = (34, 139, 34)
            self.images.append(fallback)

    def get_frame(self, frame_no: int, fps: int) -> np.ndarray:
        num_imgs = len(self.images)
        img_idx = (frame_no // (fps * 3)) % num_imgs
        src = self.images[img_idx]

        canvas_w, canvas_h = int(self.width * 1.4), int(self.height * 1.4)
        scaled = cv2.resize(src, (canvas_w, canvas_h))

        t = frame_no / float(fps)
        pan_x = int((math.sin(t * 0.35) + 1.0) * 0.5 * (canvas_w - self.width))
        pan_y = int((math.cos(t * 0.28) + 1.0) * 0.5 * (canvas_h - self.height))

        crop = scaled[pan_y : pan_y + self.height, pan_x : pan_x + self.width].copy()

        # Telemetry OSD
        h, w = self.height, self.width
        cx, cy = w // 2, h // 2
        cv2.line(crop, (cx - 15, cy), (cx + 15, cy), (0, 255, 100), 1)
        cv2.line(crop, (cx, cy - 15), (cx, cy + 15), (0, 255, 100), 1)

        font = cv2.FONT_HERSHEY_SIMPLEX
        alt = 15.0 + math.sin(t * 0.2) * 3.0
        spd = 3.5 + math.sin(t * 0.4) * 0.5
        cv2.putText(crop, f"UAV-FLIGHT-SIM #{frame_no}", (15, 25), font, 0.55, (50, 255, 50), 1)
        cv2.putText(crop, f"ALT: {alt:.1f}m | SPD: {spd:.1f}m/s", (15, h - 15), font, 0.5, (0, 230, 255), 1)
        cv2.putText(crop, f"T: {t:.1f}s", (w - 80, h - 15), font, 0.5, (0, 255, 100), 1)
        return crop


async def stream(
    source: str,
    fps: int = 15,
    quality: int = 70,
    backend_ws: str = "ws://localhost:3000/ws/stream",
    duration: float = 0.0,
    loop: bool = True,
    auto_reconnect: bool = True,
):
    """Kirim aliran frame secara kontinu ke WebSocket backend Elysia."""
    import websockets

    is_sim_mode = source.lower() in ("sim", "synthetic", "synthetic_uav")
    is_test_mode = source.lower() == "test"

    sim_generator = None
    if is_sim_mode:
        sim_generator = UAVFlightSimulator(640, 480)

    interval = 1.0 / max(1, fps)
    frame_no = 0
    total_bytes_sent = 0
    start_time = time.time()
    last_log_time = time.time()

    print("=" * 65)
    print("  UAV Video Stream Simulator (Step 5 - Capstone)")
    print("=" * 65)
    print(f"  Backend WS : {backend_ws}")
    print(f"  Source     : {source}")
    print(f"  Target FPS : {fps}")
    print(f"  Quality    : {quality}%")
    print(f"  Duration   : {'Tanpa batas (tekan Ctrl+C untuk berhenti)' if duration <= 0 else f'{duration} detik'}")
    print("=" * 65)

    def open_capture():
        nonlocal is_sim_mode, sim_generator
        if is_test_mode or is_sim_mode:
            return None
        if source.isdigit():
            cap = cv2.VideoCapture(int(source))
        else:
            if not os.path.exists(source) and not source.startswith(("rtsp://", "http://", "udp://")):
                print(f"[WARN] File video '{source}' tidak ditemukan!")
                print(f"[INFO] Beralih otomatis ke mode simulasi penerbangan sintetis.")
                is_sim_mode = True
                sim_generator = UAVFlightSimulator(640, 480)
                return None
            cap = cv2.VideoCapture(source)
        return cap

    cap = open_capture()

    while True:
        try:
            print(f"[INFO] Menghubungkan ke {backend_ws} ...")
            async with websockets.connect(backend_ws) as ws:
                print(f"[OK] Terhubung ke Backend Elysia! Mengirim frame @ {fps} FPS...")
                conn_start = time.time()
                frames_in_session = 0

                while True:
                    t_frame_start = time.perf_counter()

                    # Cek batasan durasi jika diset
                    elapsed_total = time.time() - start_time
                    if duration > 0 and elapsed_total >= duration:
                        print(f"\n[INFO] Batas durasi {duration}s tercapai. Menghentikan stream.")
                        return

                    # Baca / buat frame
                    if is_test_mode:
                        frame = create_test_frame(frame_no=frame_no)
                    elif is_sim_mode and sim_generator is not None:
                        frame = sim_generator.get_frame(frame_no=frame_no, fps=fps)
                    else:
                        ret, frame = cap.read()
                        if not ret:
                            if loop:
                                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                                ret, frame = cap.read()
                            if not ret:
                                print("\n[INFO] Video telah selesai.")
                                return
                        frame = cv2.resize(frame, (640, 480))

                    # Encode JPEG ke base64
                    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
                    b64 = base64.b64encode(buf.tobytes()).decode("ascii")

                    frame_id = f"uav-{frame_no}-{int(time.time() * 1000)}"
                    payload = f'{{"type":"frame","data":"{b64}","frame_id":"{frame_id}"}}'

                    await ws.send(payload)

                    frame_no += 1
                    frames_in_session += 1
                    payload_len = len(payload)
                    total_bytes_sent += payload_len

                    # Log periodik tiap 30 frame (~2 detik pada 15 FPS)
                    now = time.time()
                    if now - last_log_time >= 2.0:
                        session_fps = frames_in_session / max(0.001, (now - conn_start))
                        throughput_kbps = (total_bytes_sent / 1024.0) / max(0.001, (now - start_time))
                        print(
                            f"  [STREAM] Frame #{frame_no:05d} | "
                            f"Live FPS: {session_fps:.1f} | "
                            f"Bandwidth: {throughput_kbps:.1f} KB/s | "
                            f"Total: {elapsed_total:.1f}s"
                        )
                        last_log_time = now

                    # Jaga target FPS secara stabil
                    elapsed_encode = time.perf_counter() - t_frame_start
                    sleep_time = max(0.0, interval - elapsed_encode)
                    await asyncio.sleep(sleep_time)

        except KeyboardInterrupt:
            print("\n[STOP] Streaming dihentikan oleh pengguna (Ctrl+C).")
            break
        except Exception as exc:
            print(f"[WARN] Koneksi WebSocket terputus / gagal: {exc}")
            if not auto_reconnect:
                break
            print("[INFO] Mencoba menghubungkan kembali dalam 2 detik...")
            await asyncio.sleep(2.0)
        finally:
            if not auto_reconnect:
                break

    if cap:
        cap.release()

    # Tampilkan ringkasan statistik
    total_time = max(0.001, time.time() - start_time)
    avg_fps = frame_no / total_time
    total_mb = total_bytes_sent / (1024 * 1024)
    print("\n" + "=" * 65)
    print("  RINGKASAN STREAM UAV SIMULATOR")
    print("=" * 65)
    print(f"  Total frame terkirim : {frame_no} frame")
    print(f"  Durasi total         : {total_time:.2f} detik")
    print(f"  Rata-rata FPS        : {avg_fps:.2f} FPS")
    print(f"  Total data terkirim  : {total_mb:.2f} MB")
    print(f"  Throughput rata-rata : {(total_mb * 1024) / total_time:.1f} KB/s")
    print("=" * 65)


def main():
    parser = argparse.ArgumentParser(
        description="UAV Frame Simulator – Pengujian Sistem Deteksi TBS Kelapa Sawit (Step 5)"
    )
    parser.add_argument(
        "--source",
        default=DEFAULT_SOURCE,
        help=(
            f"Sumber video: path ke .mp4 (default: '{DEFAULT_SOURCE}'), "
            "'test' (pola uji), 'sim' (simulasi drone sintetis), atau '0' (webcam)"
        ),
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=15,
        help="Target streaming FPS (default: 15, sesuai requirement Step 5)",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=70,
        help="Kualitas kompresi JPEG 1-100 (default: 70)",
    )
    parser.add_argument(
        "--backend",
        default="ws://localhost:3000/ws/stream",
        help="URL WebSocket backend stream (default: ws://localhost:3000/ws/stream)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=0.0,
        help="Batas waktu streaming dalam detik (0 = tanpa batas, default: 0)",
    )
    parser.add_argument(
        "--no-loop",
        action="store_true",
        help="Jangan ulang video dari awal jika mencapai akhir file",
    )
    parser.add_argument(
        "--no-reconnect",
        action="store_true",
        help="Jangan auto-reconnect jika backend terputus",
    )

    args = parser.parse_args()

    try:
        asyncio.run(
            stream(
                source=args.source,
                fps=args.fps,
                quality=args.quality,
                backend_ws=args.backend,
                duration=args.duration,
                loop=not args.no_loop,
                auto_reconnect=not args.no_reconnect,
            )
        )
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
