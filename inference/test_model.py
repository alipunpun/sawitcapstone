"""
test_model.py
=============
Script untuk menguji model oil_palm_fruit_yolov11n.pt
secara offline (tanpa UAV / tanpa backend).

Cara pakai:
    python test_model.py --mode image  --source test_images/
    python test_model.py --mode video  --source test_video.mp4
    python test_model.py --mode webcam

Output:
    - Gambar hasil deteksi disimpan ke folder output_test/
    - Metrik dicetak ke terminal: confidence, latency, FPS, total deteksi
"""

import argparse
import os
import time
from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

# -----------------------------------------------------------------------
# Konfigurasi
# -----------------------------------------------------------------------
MODEL_PATH = Path(__file__).parent / "oil_palm_fruit_yolov11n.pt"
OUTPUT_DIR = Path(__file__).parent / "output_test"
CONF_THRESHOLD = 0.25   # Turunkan ke 0.1 jika objek jauh/kecil

# -----------------------------------------------------------------------
# Load model
# -----------------------------------------------------------------------
def load_model(model_path: Path) -> YOLO:
    print(f"[model] Memuat model dari: {model_path}")
    if not model_path.exists():
        raise FileNotFoundError(f"Model tidak ditemukan: {model_path}")
    model = YOLO(str(model_path))
    print(f"[model] Berhasil dimuat!")
    print(f"[model] Kelas yang dikenali: {model.names}")
    return model


# -----------------------------------------------------------------------
# Inferensi 1 frame
# -----------------------------------------------------------------------
def infer_frame(model: YOLO, frame_bgr: np.ndarray, conf: float = CONF_THRESHOLD):
    """Jalankan inferensi dan kembalikan (annotated_frame, detections, latency_ms)."""
    t0 = time.perf_counter()
    results = model(frame_bgr, conf=conf, verbose=False)[0]
    latency_ms = (time.perf_counter() - t0) * 1000

    detections = []
    for box in results.boxes:
        x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
        label = model.names[int(box.cls[0])]
        confidence = float(box.conf[0])
        detections.append({
            "label": label,
            "confidence": round(confidence, 3),
            "x": x1, "y": y1,
            "w": x2 - x1, "h": y2 - y1,
        })

    annotated = results.plot()
    return annotated, detections, latency_ms


# -----------------------------------------------------------------------
# Mode: gambar statis
# -----------------------------------------------------------------------
def test_images(model: YOLO, source_dir: str):
    source = Path(source_dir)
    if not source.exists():
        print(f"⚠️  Folder/file {source} tidak ditemukan.")
        return

    if source.is_file():
        image_files = [source]
    else:
        image_files = (
            list(source.glob("*.jpg"))
            + list(source.glob("*.jpeg"))
            + list(source.glob("*.png"))
            + list(source.glob("*.webp"))
        )

    if not image_files:
        print(f"⚠️  Tidak ada gambar di {source}. Tambahkan gambar untuk diuji.")
        return

    OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
    total_det = 0
    total_latency = 0.0

    print(f"\n{'='*60}")
    print(f"  Menguji {len(image_files)} gambar")
    print(f"{'='*60}")

    for img_path in image_files:
        frame = cv2.imread(str(img_path))
        if frame is None:
            print(f"  ⚠️  Gagal membaca gambar: {img_path.name}")
            continue

        annotated, detections, latency_ms = infer_frame(model, frame)
        total_det += len(detections)
        total_latency += latency_ms

        out_path = OUTPUT_DIR / f"result_{img_path.name}"
        cv2.imwrite(str(out_path), annotated)

        print(f"\n  📷 {img_path.name}")
        print(f"     Resolusi    : {frame.shape[1]}x{frame.shape[0]}")
        print(f"     Latency     : {latency_ms:.1f} ms (~{1000/latency_ms:.1f} fps)")
        print(f"     Deteksi     : {len(detections)} objek")
        for d in detections:
            print(f"       - {d['label']:<20} conf={d['confidence']:.3f}  bbox=[{d['x']},{d['y']},{d['w']}x{d['h']}]")
        if not detections:
            print(f"       (tidak ada deteksi — coba turunkan --conf ke 0.1 atau 0.05)")
        print(f"     Disimpan ke : {out_path}")

    n = len(image_files)
    avg_latency = total_latency / n if n > 0 else 0
    avg_fps = 1000 / avg_latency if avg_latency > 0 else 0
    print(f"\n{'='*60}")
    print(f"  RINGKASAN: {n} gambar diuji")
    print(f"  Total deteksi    : {total_det}")
    print(f"  Rata-rata latency: {avg_latency:.1f} ms")
    print(f"  FPS estimasi     : {avg_fps:.1f} fps")
    print(f"{'='*60}\n")


# -----------------------------------------------------------------------
# Mode: video file
# -----------------------------------------------------------------------
def test_video(model: YOLO, source_path: str, max_frames: int = 300):
    cap = cv2.VideoCapture(source_path)
    if not cap.isOpened():
        print(f"❌ Gagal membuka video: {source_path}")
        return

    fps_src = cap.get(cv2.CAP_PROP_FPS) or 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
    out_path = OUTPUT_DIR / "result_video.mp4"
    writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps_src, (w, h))

    print(f"\n{'='*60}")
    print(f"  Video    : {source_path}")
    print(f"  Resolusi : {w}x{h} @ {fps_src:.1f} fps | Total frame: {total_frames}")
    print(f"  Maksimal : {max_frames} frame pertama")
    print(f"{'='*60}")

    frame_no = 0
    latency_sum = 0.0
    det_sum = 0

    while cap.isOpened() and frame_no < max_frames:
        ret, frame = cap.read()
        if not ret:
            break

        annotated, detections, latency_ms = infer_frame(model, frame)
        latency_sum += latency_ms
        det_sum += len(detections)
        writer.write(annotated)

        if frame_no % 30 == 0:
            fps_inf = 1000 / latency_ms if latency_ms > 0 else 0
            print(f"  Frame {frame_no:>4}/{min(max_frames, total_frames)}  |  {len(detections)} deteksi  |  {latency_ms:.1f}ms  |  ~{fps_inf:.1f} fps")

        frame_no += 1

    cap.release()
    writer.release()

    if frame_no > 0:
        avg_latency = latency_sum / frame_no
        avg_fps = 1000 / avg_latency if avg_latency > 0 else 0
        print(f"\n  RINGKASAN VIDEO ({frame_no} frame):")
        print(f"  Total deteksi    : {det_sum}")
        print(f"  Rata-rata latency: {avg_latency:.1f} ms")
        print(f"  FPS inferensi    : {avg_fps:.1f} fps")
        print(f"  Output video     : {out_path}")
        print(f"{'='*60}\n")


# -----------------------------------------------------------------------
# Mode: webcam langsung
# -----------------------------------------------------------------------
def test_webcam(model: YOLO, camera_index: int = 0):
    cap = cv2.VideoCapture(camera_index)
    if not cap.isOpened():
        print(f"❌ Kamera index {camera_index} tidak dapat diakses.")
        return

    print("  Menekan 'q' untuk keluar dari preview webcam...")
    frame_no = 0
    latency_sum = 0.0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        annotated, detections, latency_ms = infer_frame(model, frame)
        latency_sum += latency_ms
        frame_no += 1
        avg_fps = 1000 / (latency_sum / frame_no) if frame_no > 0 else 0

        cv2.putText(annotated, f"FPS: {avg_fps:.1f}  Det: {len(detections)}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 255, 0), 2)
        cv2.imshow("Oil Palm Detection Test", annotated)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    print(f"\n  Selesai: {frame_no} frame diproses, avg FPS = {avg_fps:.1f}")


# -----------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------
def main():
    global CONF_THRESHOLD
    parser = argparse.ArgumentParser(description="Test Oil Palm YOLO Model")
    parser.add_argument("--mode", choices=["image", "video", "webcam"], default="image",
                        help="Mode pengujian (default: image)")
    parser.add_argument("--source", default="test_images/",
                        help="Path gambar/folder/video (default: test_images/)")
    parser.add_argument("--conf", type=float, default=CONF_THRESHOLD,
                        help=f"Confidence threshold (default: {CONF_THRESHOLD})")
    parser.add_argument("--camera", type=int, default=0,
                        help="Index kamera untuk mode webcam (default: 0)")
    parser.add_argument("--max-frames", type=int, default=300,
                        help="Jumlah frame maks untuk mode video (default: 300)")
    args = parser.parse_args()

    CONF_THRESHOLD = args.conf

    model = load_model(MODEL_PATH)

    print(f"[info] Mode        : {args.mode}")
    print(f"[info] Conf thresh : {CONF_THRESHOLD}")
    print(f"[info] Output dir  : {OUTPUT_DIR.resolve()}")
    print()

    if args.mode == "image":
        test_images(model, args.source)
    elif args.mode == "video":
        test_video(model, args.source, max_frames=args.max_frames)
    elif args.mode == "webcam":
        test_webcam(model, camera_index=args.camera)


if __name__ == "__main__":
    main()
