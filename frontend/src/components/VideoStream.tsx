/**
 * VideoStream – Komponen tampilan frame kamera drone UAV & overlay deteksi tandan sawit
 */

import { useEffect, useRef } from "react";
import type { Detection } from "../hooks/useUAVStream";
import { getLabelColor } from "../utils/labels";
import { RadioIcon } from "./icons";
import styles from "./VideoStream.module.css";

interface Props {
  frameDataUrl: string | null;
  detections: Detection[];
  showOverlay?: boolean;
}

export function VideoStream({ frameDataUrl, detections, showOverlay = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameDataUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Sesuaikan dimensi canvas dengan frame asli kamera
      if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
      if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;

      ctx.drawImage(img, 0, 0);

      if (showOverlay && detections.length > 0) {
        for (const det of detections) {
          const color = getLabelColor(det.label);

          // Bounding Box Rectangle
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(det.x, det.y, det.w, det.h);

          // Tactical corner brackets for drone payload precision look
          const bracketLen = Math.min(14, det.w / 4, det.h / 4);
          ctx.lineWidth = 4.5;

          // Top-left corner
          ctx.beginPath();
          ctx.moveTo(det.x, det.y + bracketLen);
          ctx.lineTo(det.x, det.y);
          ctx.lineTo(det.x + bracketLen, det.y);
          ctx.stroke();

          // Bottom-right corner
          ctx.beginPath();
          ctx.moveTo(det.x + det.w, det.y + det.h - bracketLen);
          ctx.lineTo(det.x + det.w, det.y + det.h);
          ctx.lineTo(det.x + det.w - bracketLen, det.y + det.h);
          ctx.stroke();

          // Label text & pill
          const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
          ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
          const textMetrics = ctx.measureText(label);
          const textW = textMetrics.width + 14;
          const textH = 22;
          const pillY = Math.max(0, det.y - textH - 3);

          // Solid background pill with high contrast
          ctx.fillStyle = color;
          ctx.fillRect(det.x, pillY, textW, textH);

          // Pill border
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1;
          ctx.strokeRect(det.x, pillY, textW, textH);

          // Clean white text
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, det.x + 7, pillY + 16);
        }
      }
    };
    img.src = frameDataUrl;
    imgRef.current = img;
  }, [frameDataUrl, detections, showOverlay]);

  return (
    <div className={styles.container} role="region" aria-label="Kamera Pengawasan Drone">
      <div className={styles.topBar}>
        <div className={styles.streamInfo}>
          <span className={styles.liveTag}>
            <span className={styles.liveDot} />
            LIVE
          </span>
          <span className={styles.feedTitle}>Feed Kamera Optik Drone (Kebun Sawit)</span>
        </div>

        <div className={styles.detBadge}>
          <span>{detections.length} Tandan Terdeteksi</span>
        </div>
      </div>

      <div className={styles.viewport}>
        {/* Subtle Green Corner Accents */}
        <div className={styles.cornerTL} aria-hidden="true" />
        <div className={styles.cornerTR} aria-hidden="true" />
        <div className={styles.cornerBL} aria-hidden="true" />
        <div className={styles.cornerBR} aria-hidden="true" />

        {!frameDataUrl ? (
          <div className={styles.placeholder}>
            <div className={styles.radarRing}>
              <RadioIcon size={36} />
            </div>
            <div className={styles.placeholderText}>
              <span className={styles.placeholderTitle}>Menunggu Sinyal Kamera Drone...</span>
              <span className={styles.placeholderSub}>
                Pastikan backend inferensi aktif di port 3000 atau aktifkan simulator webcam melalui tombol
                kontrol di kanan atas.
              </span>
            </div>
          </div>
        ) : (
          <canvas ref={canvasRef} className={styles.canvas} />
        )}
      </div>

      <div className={styles.bottomStrip}>
        <div className={styles.bottomMetrics}>
          <span className={styles.bottomItem}>
            Mode Sensor: <strong>Optical RGB Telemetry</strong>
          </span>
          <span className={styles.bottomItem}>
            Resolusi: <strong>640×480 HD</strong>
          </span>
        </div>
        <div>
          <span>YOLO11s-CBAM-WIoU Computer Vision Pipeline</span>
        </div>
      </div>
    </div>
  );
}
