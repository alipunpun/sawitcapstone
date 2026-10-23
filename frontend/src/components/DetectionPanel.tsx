/**
 * DetectionPanel – daftar deteksi terbaru pada frame saat ini
 */

import type { Detection } from "../hooks/useUAVStream";
import { getLabelColor } from "../utils/labels";
import styles from "./DetectionPanel.module.css";

interface Props {
  detections: Detection[];
}

export function DetectionPanel({ detections }: Props) {
  // Hitung jumlah per kelas
  const classCounts = detections.reduce<Record<string, number>>((acc, d) => {
    acc[d.label] = (acc[d.label] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>Deteksi Frame Ini</h3>
        <span className={styles.badge}>{detections.length} objek</span>
      </div>

      {/* Ringkasan per kelas jika ada deteksi */}
      {detections.length > 0 && (
        <div className={styles.summary}>
          {Object.entries(classCounts).map(([label, count]) => (
            <span
              key={label}
              className={styles.summaryTag}
              style={{
                borderColor: getLabelColor(label),
                color: "#f8fafc",
              }}
            >
              <span
                className={styles.summaryDot}
                style={{ background: getLabelColor(label) }}
              />
              {label}: <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Daftar deteksi */}
      {detections.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>🔍</span>
          <p>Belum ada objek terdeteksi pada frame ini</p>
        </div>
      ) : (
        <ul className={styles.list}>
          {detections.map((d, i) => {
            const color = getLabelColor(d.label);
            const confPct = Math.round(d.confidence * 100);

            return (
              <li key={i} className={styles.item}>
                <div className={styles.itemTop}>
                  <div className={styles.itemLabel}>
                    <span
                      className={styles.dot}
                      style={{ background: color }}
                    />
                    <span className={styles.label}>{d.label}</span>
                  </div>
                  <span className={styles.conf}>{confPct}%</span>
                </div>

                {/* Bar indikator confidence */}
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${confPct}%`,
                      background: color,
                    }}
                  />
                </div>

                <div className={styles.itemMeta}>
                  <span className={styles.box}>
                    Pos: ({d.x}, {d.y}) · {d.w}×{d.h}px
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
