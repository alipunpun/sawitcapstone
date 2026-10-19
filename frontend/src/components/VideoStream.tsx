/**
 * VideoStream – komponen untuk menampilkan frame UAV + overlay bounding box
 */

import { useEffect, useRef } from "react";
import type { Detection } from "../hooks/useUAVStream";
import styles from "./VideoStream.module.css";

interface Props {
  frameDataUrl: string | null;
  detections: Detection[];
  showOverlay?: boolean;
}

const LABEL_COLORS: Record<string, string> = {
  oil_palm: "#22c55e",
  oil_palm_young: "#f59e0b",
  non_palm: "#ef4444",
};

function getColor(label: string): string {
  return LABEL_COLORS[label] ?? "#3b82f6";
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
          const color = getColor(det.label);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.strokeRect(det.x, det.y, det.w, det.h);

          // Label background
          const label = `${det.label} ${(det.confidence * 100).toFixed(0)}%`;
          ctx.font = "bold 12px sans-serif";
          const textW = ctx.measureText(label).width + 8;
          ctx.fillStyle = color;
          ctx.fillRect(det.x, det.y - 18, textW, 18);
          ctx.fillStyle = "#fff";
          ctx.fillText(label, det.x + 4, det.y - 4);
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

