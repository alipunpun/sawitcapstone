"""
Inference Service – Oil Palm Detection (UAV Live Stream)
=========================================================
Menerima frame JPEG base64 via WebSocket dari Elysia backend,
menjalankan model deteksi objek YOLOv11n, lalu mengembalikan bounding box + label.

Endpoint WebSocket : ws://localhost:8000/ws/inference (dan alias /ws/infer)
Endpoint REST      : GET /health
"""

import asyncio
import base64
import io
import json
import logging
import random
import time
from collections import deque
from pathlib import Path
from typing import Any

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
from ultralytics import YOLO

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Metrics & State Tracking
# ---------------------------------------------------------------------------
START_TIME = time.time()
TOTAL_FRAMES = 0
TOTAL_LATENCY_MS = 0.0
FRAME_TIMESTAMPS: deque = deque(maxlen=60)


def record_frame_and_get_fps() -> float:
    """Catat pemrosesan frame dan hitung frame rate (FPS)."""
    global TOTAL_FRAMES
    TOTAL_FRAMES += 1
    now = time.time()
    FRAME_TIMESTAMPS.append(now)
    if len(FRAME_TIMESTAMPS) <= 1:
        return 0.0
    elapsed = now - FRAME_TIMESTAMPS[0]
    return round(len(FRAME_TIMESTAMPS) / elapsed, 1) if elapsed > 0 else 0.0


def get_current_fps() -> float:
    """Hitung FPS saat ini dari frame dalam 2 detik terakhir."""
    now = time.time()
    recent = [t for t in FRAME_TIMESTAMPS if now - t <= 2.0]
    if len(recent) <= 1:
        return 0.0
    elapsed = recent[-1] - recent[0]
    return round(len(recent) / elapsed, 1) if elapsed > 0 else 0.0


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="UAV Oil-Palm Inference Service", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model loader
# ---------------------------------------------------------------------------
MODEL_PATH = Path(__file__).parent / "oil_palm_fruit_yolov11n.pt"
MODEL: Any = None


def load_model() -> Any:
    """Load model YOLO dari file .pt yang tersedia."""
    if not MODEL_PATH.exists():
        log.warning(f"⚠️  Model tidak ditemukan di {MODEL_PATH} – menggunakan MOCK detection.")
        return None
    try:
        log.info(f"[model] Memuat model dari {MODEL_PATH} ...")
        model = YOLO(str(MODEL_PATH))
        log.info(f"[model] Berhasil dimuat! Kelas yang dikenali: {model.names}")
        return model
    except Exception as exc:
        log.error(f"❌ Gagal memuat model: {exc}")
        return None


def run_inference(model: Any, frame_bgr: np.ndarray, conf: float = 0.25) -> list[dict]:
    """
    Jalankan deteksi pada sebuah frame BGR.
    Kembalikan list bounding box:
      { label, confidence, x, y, w, h }   (koordinat dalam piksel)
    """
    if model is not None:
        results = model(frame_bgr, conf=conf, verbose=False)[0]
        detections = []
        for box in results.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "label": model.names[int(box.cls[0])],
                "confidence": round(float(box.conf[0]), 3),
                "x": int(x1),
                "y": int(y1),
                "w": int(x2 - x1),
                "h": int(y2 - y1),
            })
        return detections

    # --- MOCK fallback jika model gagal diload ---
    h, w = frame_bgr.shape[:2]
    n = random.randint(0, 3)
    mock_labels = ["Betina", "Black fruits", "Jantan", "Red fruits"]
    result = []
    for _ in range(n):
        bw = random.randint(40, 120)
        bh = random.randint(40, 120)
        bx = random.randint(0, max(1, w - bw))
        by = random.randint(0, max(1, h - bh))
        result.append({
            "label": random.choice(mock_labels),
            "confidence": round(random.uniform(0.55, 0.99), 3),
            "x": bx,
            "y": by,
            "w": bw,
            "h": bh,
        })
    return result


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
@app.on_event("startup")
async def startup_event() -> None:
    global MODEL
    MODEL = load_model()
    if MODEL is not None:
        try:
            log.info("[model] Melakukan warm-up model...")
            dummy = np.zeros((640, 640, 3), dtype=np.uint8)
            MODEL(dummy, conf=0.25, verbose=False)
            log.info("[model] Warm-up selesai, model siap untuk inferensi real-time.")
        except Exception as e:
            log.warning(f"[model] Warm-up gagal (non-fatal): {e}")
    log.info("Inference service siap menerima request.")


# ---------------------------------------------------------------------------
# REST
# ---------------------------------------------------------------------------
@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "inference",
        "model_loaded": MODEL is not None,
        "classes": MODEL.names if MODEL is not None else {},
        "frames_processed": TOTAL_FRAMES,
        "fps": get_current_fps(),
        "timestamp": time.time(),
    }


@app.get("/stats")
async def stats() -> dict:
    avg_latency = round(TOTAL_LATENCY_MS / max(1, TOTAL_FRAMES), 2) if TOTAL_FRAMES > 0 else 0.0
    return {
        "status": "ok",
        "service": "inference",
        "model_loaded": MODEL is not None,
        "classes": MODEL.names if MODEL is not None else {},
        "frames_processed": TOTAL_FRAMES,
        "avg_latency_ms": avg_latency,
        "fps": get_current_fps(),
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "timestamp": time.time(),
    }


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------
@app.websocket("/ws/infer")
@app.websocket("/ws/inference")
async def ws_infer(ws: WebSocket) -> None:
    await ws.accept()
    client_info = f"{ws.client.host}:{ws.client.port}" if ws.client else "unknown"
    log.info(f"[ws] Backend/Client terhubung ({client_info}). Total frame sebelumnya: {TOTAL_FRAMES}")
    try:
        while True:
            raw = await ws.receive_text()
            payload: dict = json.loads(raw)

            # Handle ping / heartbeat
            if payload.get("type") == "ping":
                await ws.send_text(json.dumps({"type": "pong", "timestamp": time.time()}))
                continue

            frame_b64: str = payload.get("frame", "")
            frame_id: str = payload.get("frame_id", "")

            if not frame_b64:
                await ws.send_text(json.dumps({"error": "no_frame", "frame_id": frame_id}))
                continue

            # Decode base64 → numpy BGR
            try:
                img_bytes = base64.b64decode(frame_b64)
                np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
                frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            except Exception as decode_err:
                log.warning(f"[ws] Gagal decode base64 frame {frame_id}: {decode_err}")
                await ws.send_text(json.dumps({"error": "decode_failed", "frame_id": frame_id}))
                continue

            if frame_bgr is None:
                await ws.send_text(json.dumps({"error": "decode_failed", "frame_id": frame_id}))
                continue

            # Inferensi
            t0 = time.perf_counter()
            detections = run_inference(MODEL, frame_bgr)
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)

            global TOTAL_LATENCY_MS
            TOTAL_LATENCY_MS += latency_ms
            fps = record_frame_and_get_fps()

            response = {
                "frame_id": frame_id,
                "detections": detections,
                "latency_ms": latency_ms,
                "fps": fps,
                "timestamp": time.time(),
            }
            await ws.send_text(json.dumps(response))

    except WebSocketDisconnect:
        log.info(f"[ws] Backend/Client memutus koneksi. Total frame diproses: {TOTAL_FRAMES}")
    except Exception as exc:
        log.error(f"[ws] Error dalam inference loop: {exc}")
        try:
            await ws.close(code=1011)
        except Exception:
            pass
