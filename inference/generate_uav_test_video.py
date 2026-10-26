"""
generate_uav_test_video.py
==========================
Membuat video simulasi penerbangan drone (UAV) di atas perkebunan kelapa sawit.
Video ini menggabungkan sampel citra kelapa sawit dengan dinamika pergerakan kamera drone
(panning, altitude zooming, camera shake, dan On-Screen Display / OSD UAV telemetry).

Output: inference/test_videos/uav_sawit_flight.mp4
"""

import math
import os
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import cv2
import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
TEST_IMAGES_DIR = SCRIPT_DIR / "test_images"
OUTPUT_DIR = SCRIPT_DIR / "test_videos"
OUTPUT_FILE = OUTPUT_DIR / "uav_sawit_flight.mp4"


def draw_uav_osd(
    frame: np.ndarray,
    frame_idx: int,
    total_frames: int,
    fps: int,
    altitude_m: float,
    speed_ms: float,
    battery_pct: float,
    heading_deg: float,
    lat: float,
    lon: float,
) -> np.ndarray:
    """Tambahkan overlay telemetry OSD khas UAV / drone."""
    h, w = frame.shape[:2]
    overlay = frame.copy()

    # Semi-transparent top and bottom telemetry bars
    cv2.rectangle(overlay, (0, 0), (w, 38), (20, 20, 20), -1)
    cv2.rectangle(overlay, (0, h - 35), (w, h), (20, 20, 20), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    # Center crosshair / gimbal reticle
    cx, cy = w // 2, h // 2
    cross_size = 18
    color_reticle = (0, 255, 120)  # Drone green
    cv2.line(frame, (cx - cross_size, cy), (cx - 5, cy), color_reticle, 1)
    cv2.line(frame, (cx + 5, cy), (cx + cross_size, cy), color_reticle, 1)
    cv2.line(frame, (cx, cy - cross_size), (cx, cy - 5), color_reticle, 1)
    cv2.line(frame, (cx, cy + 5), (cx, cy + cross_size), color_reticle, 1)
    cv2.circle(frame, (cx, cy), 3, color_reticle, -1)

    # Artificial horizon pitch lines
    pitch_offset = int(math.sin(frame_idx * 0.05) * 6)
    cv2.line(frame, (cx - 45, cy + pitch_offset), (cx - 20, cy + pitch_offset), (0, 255, 255), 1)
    cv2.line(frame, (cx + 20, cy + pitch_offset), (cx + 45, cy + pitch_offset), (0, 255, 255), 1)

    # Top bar info
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.45
    color_text = (240, 240, 240)

    # Left: UAV Model & Status
    cv2.putText(frame, "UAV-SAWIT-01 [AUTONOMOUS]", (12, 24), font, font_scale, (50, 220, 50), 1)

    # Middle: GPS & Satellites
    gps_str = f"GPS: {lat:.6f}, {lon:.6f} | SATS: 16"
    cv2.putText(frame, gps_str, (cx - 150, 24), font, font_scale, color_text, 1)

    # Right: Battery & Recording
    rec_blink = "REC ●" if (frame_idx // 8) % 2 == 0 else "REC  "
    cv2.putText(frame, f"BAT: {battery_pct:.1f}% | {rec_blink}", (w - 180, 24), font, font_scale, (0, 100, 255), 1)

    # Bottom bar info
    alt_str = f"ALT: {altitude_m:.1f} m"
    spd_str = f"SPD: {speed_ms:.1f} m/s"
    hdg_str = f"HDG: {heading_deg:.0f}°"
    fps_str = f"SIM FPS: {fps}"
    time_str = f"T: {frame_idx / fps:.1f}s"

    cv2.putText(frame, alt_str, (15, h - 12), font, font_scale, (0, 230, 255), 1)
    cv2.putText(frame, spd_str, (120, h - 12), font, font_scale, color_text, 1)
    cv2.putText(frame, hdg_str, (225, h - 12), font, font_scale, color_text, 1)
    cv2.putText(frame, fps_str, (w - 200, h - 12), font, font_scale, color_text, 1)
    cv2.putText(frame, time_str, (w - 80, h - 12), font, font_scale, (0, 255, 120), 1)

    return frame


def create_uav_simulation_video(
    duration_sec: int = 20,
    fps: int = 15,
    width: int = 640,
    height: int = 480,
) -> Path:
    """Generate file video simulasi rekaman drone kelapa sawit."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Kumpulkan citra kelapa sawit yang tersedia
    image_paths = sorted(list(TEST_IMAGES_DIR.glob("*.jpg")))
    loaded_images = []
    for p in image_paths:
        img = cv2.imread(str(p))
        if img is not None:
            loaded_images.append(img)

    if not loaded_images:
        print("[warn] Tidak ada citra di test_images, membuat kanvas sintetis...")
        # Buat fallback image
        blank = np.zeros((height, width, 3), dtype=np.uint8)
        blank[:] = (34, 139, 34)  # Forest green
        loaded_images.append(blank)

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(OUTPUT_FILE), fourcc, fps, (width, height))

    total_frames = duration_sec * fps
    print(f"[info] Memulai pembuatan video UAV: {OUTPUT_FILE}")
    print(f"[info] Durasi: {duration_sec}s | FPS: {fps} | Total frame: {total_frames} | Ukuran: {width}x{height}")

    # Initial telemetry state
    base_lat = 0.528412
    base_lon = 101.447821
    base_alt = 18.0  # meter (ketinggian terbang khas drone inspeksi kebun)
    base_speed = 3.5  # m/s

    num_images = len(loaded_images)

    for i in range(total_frames):
        # Transisi antar citra dengan pergerakan drone
        img_idx = (i // (fps * 4)) % num_images
        next_img_idx = (img_idx + 1) % num_images
        alpha = ((i % (fps * 4)) / (fps * 4))

        curr_src = loaded_images[img_idx]
        next_src = loaded_images[next_img_idx]

        # Resize source image to larger canvas for panning and zooming
        canvas_w, canvas_h = int(width * 1.5), int(height * 1.5)
        curr_scaled = cv2.resize(curr_src, (canvas_w, canvas_h))
        next_scaled = cv2.resize(next_src, (canvas_w, canvas_h))

        # Dynamic panning simulation
        t = i / float(fps)
        pan_x = int((math.sin(t * 0.4) + 1.0) * 0.5 * (canvas_w - width))
        pan_y = int((math.cos(t * 0.3) + 1.0) * 0.5 * (canvas_h - height))

        # Crop current frame viewport
        crop_curr = curr_scaled[pan_y : pan_y + height, pan_x : pan_x + width]

        # Subtle zoom / altitude change
        alt_osc = math.sin(t * 0.2) * 3.5
        altitude = base_alt + alt_osc
        speed = base_speed + math.sin(t * 0.5) * 0.8
        battery = max(20.0, 98.0 - (i / total_frames) * 12.0)
        heading = (180 + math.sin(t * 0.15) * 35) % 360
        lat = base_lat + (i * 0.000008)
        lon = base_lon + (i * 0.000005)

        # UAV slight camera jitter / vibration
        jitter_x = int(math.sin(i * 1.8) * 1)
        jitter_y = int(math.cos(i * 2.1) * 1)
        m_jitter = np.float32([[1, 0, jitter_x], [0, 1, jitter_y]])
        frame = cv2.warpAffine(crop_curr, m_jitter, (width, height), borderMode=cv2.BORDER_REFLECT)

        # Apply UAV OSD overlay
        frame_with_osd = draw_uav_osd(
            frame,
            frame_idx=i,
            total_frames=total_frames,
            fps=fps,
            altitude_m=altitude,
            speed_ms=speed,
            battery_pct=battery,
            heading_deg=heading,
            lat=lat,
            lon=lon,
        )

        writer.write(frame_with_osd)

    writer.release()
    file_size_mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print(f"[OK] Video berhasil dibuat: {OUTPUT_FILE} ({file_size_mb:.2f} MB)")
    return OUTPUT_FILE


if __name__ == "__main__":
    create_uav_simulation_video(duration_sec=20, fps=15)
