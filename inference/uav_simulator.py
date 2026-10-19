"""
uav_simulator.py
=================
Simulator UAV berbasis Python – membaca video dari file/webcam dan
mengirim frame ke backend Elysia via WebSocket /ws/stream.

Gunakan ini untuk testing tanpa browser:
  python uav_simulator.py --source 0           # webcam
  python uav_simulator.py --source video.mp4   # file video
  python uav_simulator.py --source test        # pola warna sintetis

Dependensi: pip install websockets opencv-python
"""

import asyncio
import argparse
import base64
import time
import sys

import cv2
import numpy as np


BACKEND_WS = "ws://localhost:3000/ws/stream"


def create_test_frame(width: int = 640, height: int = 480, frame_no: int = 0) -> np.ndarray:
    """Buat frame sintetis bergradient + nomor frame."""
    img = np.zeros((height, width, 3), dtype=np.uint8)
    hue = int((frame_no * 2) % 180)
    color_bgr = cv2.cvtColor(np.uint8([[[hue, 220, 200]]]), cv2.COLOR_HSV2BGR)[0][0].tolist()
    img[:] = color_bgr

    # Grid
    for y in range(0, height, 60):
        cv2.line(img, (0, y), (width, y), (50, 50, 50), 1)
    for x in range(0, width, 60):
        cv2.line(img, (x, 0), (x, height), (50, 50, 50), 1)

    cv2.putText(img, f"FRAME #{frame_no}", (20, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (255, 255, 255), 2)
    cv2.putText(img, f"UAV SIMULATOR", (20, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (200, 200, 200), 1)
    cv2.putText(img, time.strftime("%H:%M:%S"), (20, 130),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 1)
    return img


async def stream(source: str, fps: int, quality: int):
    import websockets

    if source == "test":
        cap = None
    elif source.isdigit():
        cap = cv2.VideoCapture(int(source))
    else:
        cap = cv2.VideoCapture(source)

    frame_no = 0
    interval = 1.0 / fps

    print(f"Menghubungkan ke {BACKEND_WS} ...")
    async with websockets.connect(BACKEND_WS) as ws:
        print(f"✅ Terhubung! Mengirim {fps} fps | source={source!r}")
        try:
            while True:
                t_start = time.perf_counter()

                if cap is None:
                    frame = create_test_frame(frame_no=frame_no)
                else:
                    ret, frame = cap.read()
                    if not ret:
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        ret, frame = cap.read()
                        if not ret:
                            break
                    frame = cv2.resize(frame, (640, 480))

                # Encode JPEG
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, quality])
                b64 = base64.b64encode(buf.tobytes()).decode()

                frame_id = f"uav-{frame_no}-{int(time.time() * 1000)}"
                payload = f'{{"type":"frame","data":"{b64}","frame_id":"{frame_id}"}}'
                await ws.send(payload)

                frame_no += 1
                elapsed = time.perf_counter() - t_start
                sleep_for = max(0.0, interval - elapsed)
                if frame_no % 30 == 0:
                    print(f"  frame {frame_no} | {elapsed*1000:.1f}ms encode | sleep {sleep_for*1000:.0f}ms")
                await asyncio.sleep(sleep_for)

        except KeyboardInterrupt:
            print("\nDihentikan.")
        finally:
            if cap:
                cap.release()


def main():
    parser = argparse.ArgumentParser(description="UAV Frame Simulator")
    parser.add_argument("--source", default="test",
                        help="'test' | '0' (webcam) | path/to/video.mp4")
    parser.add_argument("--fps", type=int, default=10, help="Target FPS (default: 10)")
    parser.add_argument("--quality", type=int, default=70,
                        help="JPEG quality 1-100 (default: 70)")
    args = parser.parse_args()

    asyncio.run(stream(args.source, args.fps, args.quality))


if __name__ == "__main__":
    main()

