/**
 * DetectionPanel – daftar deteksi terbaru
 */

import type { Detection } from "../hooks/useUAVStream";
import styles from "./DetectionPanel.module.css";

interface Props {
  detections: Detection[];
}

const COLORS: Record<string, string> = {
  oil_palm: "#22c55e",
  oil_palm_young: "#f59e0b",
  non_palm: "#ef4444",
};

export function DetectionPanel({ detections }: Props) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.title}>Deteksi Terakhir</h3>
      {detections.length === 0 ? (
        <p className={styles.empty}>Tidak ada deteksi</p>
      ) : (
        <ul className={styles.list}>
          {detections.map((d, i) => (
            <li key={i} className={styles.item}>
              <span
                className={styles.dot}
                style={{ background: COLORS[d.label] ?? "#3b82f6" }}
              />
              <span className={styles.label}>{d.label}</span>
              <span className={styles.conf}>
                {(d.confidence * 100).toFixed(1)}%
              </span>
              <span className={styles.box}>
                [{d.x},{d.y}] {d.w}×{d.h}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

