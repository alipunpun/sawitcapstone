"""
test_integration.py
===================
Script pengujian integrasi otomatis untuk Step 3:
1. Menguji endpoint REST Python: GET /health dan GET /stats
2. Menguji WebSocket Python: ws://localhost:8000/ws/inference
   - Test ping/pong
   - Test pengiriman frame base64 (gambar sawit nyata)
   - Verifikasi skema response: frame_id, detections, latency_ms, fps, timestamp
3. (Opsional/End-to-End) Jika Elysia backend aktif di port 3000:
   - Verifikasi GET /api/health (inference_connected)
   - Uji alur UAV Stream -> Elysia -> Python -> Elysia -> Viewer WS
   - Verifikasi GET /api/detection/latest

Cara menjalankan:
  python test_integration.py
"""

import asyncio
import base64
import json
import sys
import time
from pathlib import Path
import urllib.request
import urllib.error

try:
    import websockets
except ImportError:
    print("[ERROR] Library 'websockets' belum terinstall. Jalankan: pip install websockets")
    sys.exit(1)


PYTHON_HTTP_URL = "http://localhost:8000"
PYTHON_WS_URL = "ws://localhost:8000/ws/inference"
BACKEND_HTTP_URL = "http://localhost:3000"
BACKEND_STREAM_WS = "ws://localhost:3000/ws/stream"
BACKEND_VIEWER_WS = "ws://localhost:3000/ws/detection"

TEST_IMAGES_DIR = Path(__file__).parent / "test_images"


def http_get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "TestIntegration/1.0"})
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


async def test_python_ws(image_b64: str):
    print("\n--- [Test 2] Menguji WebSocket Python (ws://localhost:8000/ws/inference) ---")
    async with websockets.connect(PYTHON_WS_URL) as ws:
        # 2a. Ping/Pong
        await ws.send(json.dumps({"type": "ping"}))
        pong_raw = await asyncio.wait_for(ws.recv(), timeout=5.0)
        pong_data = json.loads(pong_raw)
        assert pong_data.get("type") == "pong", f"Expected pong, got: {pong_data}"
        print("  [OK] 2a. WebSocket ping/pong berhasil.")

        # 2b. Kirim frame sawit
        frame_id = f"test-frame-{int(time.time() * 1000)}"
        payload = {
            "frame": image_b64,
            "frame_id": frame_id,
        }
        await ws.send(json.dumps(payload))
        resp_raw = await asyncio.wait_for(ws.recv(), timeout=25.0)
        resp_data = json.loads(resp_raw)

        print(f"  [OK] 2b. Menerima response inferensi untuk frame_id: {resp_data.get('frame_id')}")
        print(f"      Latency: {resp_data.get('latency_ms')} ms | FPS: {resp_data.get('fps')}")
        print(f"      Jumlah deteksi: {len(resp_data.get('detections', []))}")

        # Validasi skema
        assert resp_data.get("frame_id") == frame_id, "frame_id tidak cocok"
        assert "detections" in resp_data and isinstance(resp_data["detections"], list), "detections invalid"
        assert "latency_ms" in resp_data and isinstance(resp_data["latency_ms"], (int, float)), "latency_ms invalid"
        assert "fps" in resp_data and isinstance(resp_data["fps"], (int, float)), "fps invalid"
        assert "timestamp" in resp_data and isinstance(resp_data["timestamp"], (int, float)), "timestamp invalid"

        for det in resp_data["detections"]:
            for key in ("label", "confidence", "x", "y", "w", "h"):
                assert key in det, f"Key '{key}' hilang di deteksi: {det}"

        print("  [OK] 2c. Validasi skema JSON response Python 100% lolos.")


async def test_end_to_end_stream(image_b64: str):
    print("\n--- [Test 4] Menguji End-to-End Stream melalui Backend Elysia ---")
    # Cek apakah backend aktif
    try:
        health = http_get_json(f"{BACKEND_HTTP_URL}/api/health")
        print(f"  Backend aktif: {health}")
        if not health.get("inference_connected"):
            print("  [WARN] Backend belum mendeteksi Python terhubung (inference_connected=False).")
    except Exception as e:
        print(f"  [INFO] Backend Elysia di {BACKEND_HTTP_URL} tidak berjalan ({e}). Melewati test end-to-end.")
        return

    # Hubungkan Viewer WS dan Stream WS
    async with websockets.connect(BACKEND_VIEWER_WS) as viewer_ws:
        # Terima welcome message dari viewer
        welcome_raw = await asyncio.wait_for(viewer_ws.recv(), timeout=5.0)
        print(f"  Viewer WS menerima: {json.loads(welcome_raw).get('type')}")

        async with websockets.connect(BACKEND_STREAM_WS) as stream_ws:
            frame_id = f"e2e-sawit-{int(time.time() * 1000)}"
            stream_payload = {
                "type": "frame",
                "data": image_b64,
                "frame_id": frame_id,
            }
            await stream_ws.send(json.dumps(stream_payload))
            print(f"  Terkirim frame {frame_id} ke /ws/stream")

            # Tunggu pesan di viewer_ws
            detection_received = False
            for _ in range(5):
                msg_raw = await asyncio.wait_for(viewer_ws.recv(), timeout=20.0)
                msg = json.loads(msg_raw)
                if msg.get("type") == "detection_result" and msg.get("frame_id") == frame_id:
                    detection_received = True
                    print(f"  [OK] Viewer berhasil menerima detection_result untuk {frame_id}:")
                    print(f"      Detections: {len(msg.get('detections', []))} | Latency: {msg.get('latency_ms')}ms | FPS: {msg.get('fps')}")
                    break

            assert detection_received, "Viewer tidak menerima detection_result untuk frame yang dikirim!"

    # Cek GET /api/detection/latest
    latest = http_get_json(f"{BACKEND_HTTP_URL}/api/detection/latest")
    assert latest.get("success") is True
    assert latest.get("data", {}).get("frame_id") == frame_id
    print(f"  [OK] GET /api/detection/latest terverifikasi cocok dengan {frame_id}")


async def main():
    print("=" * 65)
    print("  PENGUJIAN INTEGRASI STEP 3: PYTHON <-> ELYSIA API")
    print("=" * 65)

    # 1. Test GET /health & GET /stats
    print("\n--- [Test 1] Menguji Endpoint REST Python (:8000) ---")
    try:
        health = http_get_json(f"{PYTHON_HTTP_URL}/health")
        print(f"  [OK] GET /health: status={health.get('status')}, model_loaded={health.get('model_loaded')}, classes={list(health.get('classes', {}).values())}")
        assert health.get("status") == "ok", "Status health bukan ok"
    except Exception as e:
        print(f"[ERROR] Gagal mengakses {PYTHON_HTTP_URL}/health: {e}")
        print("Pastikan Python inference service sudah berjalan: uvicorn main:app --port 8000")
        sys.exit(1)

    stats_before = http_get_json(f"{PYTHON_HTTP_URL}/stats")
    print(f"  [OK] GET /stats: frames_processed={stats_before.get('frames_processed')}, uptime={stats_before.get('uptime_seconds')}s")

    # Ambil salah satu gambar test sawit
    test_files = list(TEST_IMAGES_DIR.glob("*.jpg"))
    if not test_files:
        print(f"[ERROR] Tidak ada file gambar di {TEST_IMAGES_DIR}")
        sys.exit(1)

    sample_img_path = test_files[0]
    with open(sample_img_path, "rb") as f:
        image_b64 = base64.b64encode(f.read()).decode("utf-8")
    print(f"\n  Menggunakan sample gambar uji: {sample_img_path.name} ({len(image_b64)} chars base64)")

    # 2. Test WebSocket Python
    await test_python_ws(image_b64)

    # 3. Test GET /stats setelah WebSocket
    print("\n--- [Test 3] Verifikasi Metrik di GET /stats ---")
    stats_after = http_get_json(f"{PYTHON_HTTP_URL}/stats")
    print(f"  [OK] GET /stats setelah inferensi:")
    print(f"      frames_processed: {stats_after.get('frames_processed')}")
    print(f"      avg_latency_ms: {stats_after.get('avg_latency_ms')} ms")
    print(f"      fps: {stats_after.get('fps')}")
    assert stats_after.get("frames_processed", 0) > stats_before.get("frames_processed", 0)

    # 4. End-to-End Test (Elysia + Python)
    await test_end_to_end_stream(image_b64)

    print("\n" + "=" * 65)
    print("[SUCCESS] SEMUA PENGUJIAN INTEGRASI STEP 3 BERHASIL DILAKUKAN!")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(main())
