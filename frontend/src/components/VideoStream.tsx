/**
 * VideoStream – komponen untuk menampilkan frame UAV + overlay bounding box
 */

import { useEffect, useRef } from "react";
import type { Detection } from "../hooks/useUAVStream";
import { getLabelColor } from "../utils/labels";
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
      // Sesuaikan ukuran canvas dengan gambar asli
      if (canvas.width !== img.naturalWidth) canvas.width = img.naturalWidth;
      if (canvas.height !== img.naturalHeight) canvas.height = img.naturalHeight;

      ctx.drawImage(img, 0, 0);

      if (showOverlay) {
        for (const det of detections) {
          const color = getLabelColor(det.label);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(det.x, det.y, det.w, det.h);

          // Label text & background
          const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
          ctx.font = "bold 13px system-ui, sans-serif";
          const textW = ctx.measureText(label).width + 10;
          const textH = 20;

          // Background pill
          ctx.fillStyle = color;
          ctx.fillRect(det.x, Math.max(0, det.y - textH), textW, textH);

          // Text
          ctx.fillStyle = "#ffffff";
          ctx.fillText(label, det.x + 5, Math.max(14, det.y - 5));
        }
      }
    };
    img.src = frameDataUrl;
    imgRef.current = img;
  }, [frameDataUrl, detections, showOverlay]);

  if (!frameDataUrl) {
    return (
      <div className={styles.placeholder}>
        <span>Menunggu stream UAV...</span>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <canvas ref={canvasRef} className={styles.canvas} />
    </div>
  );
}
