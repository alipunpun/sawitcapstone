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
# App
# ---------------------------------------------------------------------------
app = FastAPI(title="UAV Oil-Palm Inference Service", version="0.2.0")

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
        "timestamp": time.time(),
    }


# ---------------------------------------------------------------------------
# WebSocket
# ---------------------------------------------------------------------------
@app.websocket("/ws/infer")
@app.websocket("/ws/inference")
async def ws_infer(ws: WebSocket) -> None:
    await ws.accept()
    log.info("Backend terhubung ke inference service.")
    try:
        while True:
            raw = await ws.receive_text()
            payload: dict = json.loads(raw)

            frame_b64: str = payload.get("frame", "")
            frame_id: str = payload.get("frame_id", "")

            if not frame_b64:
                await ws.send_text(json.dumps({"error": "no_frame"}))
                continue

            # Decode base64 → numpy BGR
            img_bytes = base64.b64decode(frame_b64)
            np_arr = np.frombuffer(img_bytes, dtype=np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame_bgr is None:
                await ws.send_text(json.dumps({"error": "decode_failed"}))
                continue

            # Inferensi
            t0 = time.perf_counter()
            detections = run_inference(MODEL, frame_bgr)
            latency_ms = round((time.perf_counter() - t0) * 1000, 1)

            response = {
                "frame_id": frame_id,
                "detections": detections,
                "latency_ms": latency_ms,
                "timestamp": time.time(),
            }
            await ws.send_text(json.dumps(response))

    except WebSocketDisconnect:
        log.info("Backend memutus koneksi ke inference service.")
    except Exception as exc:
        log.error("Error dalam inference loop: %s", exc)
        await ws.close(code=1011)
