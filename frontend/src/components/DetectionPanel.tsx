/**
 * DetectionPanel – Analisis Hasil Deteksi Tandan Buah Sawit pada Frame Aktif
 */

import type { Detection } from "../hooks/useUAVStream";
import { getLabelColor, getLabelInfo } from "../utils/labels";
import { SearchIcon, SproutIcon } from "./icons";
import styles from "./DetectionPanel.module.css";

interface Props {
  detections: Detection[];
}

export function DetectionPanel({ detections }: Props) {
  // Hitung jumlah per label kelas
  const classCounts = detections.reduce<Record<string, number>>((acc, d) => {
    acc[d.label] = (acc[d.label] ?? 0) + 1;
    return acc;
  }, {});

  const ripeCount = classCounts["Ripe"] ?? 0;
  const unripeCount =
    (classCounts["Underripe"] ?? 0) + (classCounts["Unripe"] ?? 0);

  return (
    <div className={styles.panel} role="region" aria-label="Panel Analisis Deteksi Sawit">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <SproutIcon size={18} style={{ color: "#16a34a" }} aria-hidden="true" />
          <h3 className={styles.title}>Analisis Tandan Sawit</h3>
        </div>
        <span className={styles.badge}>{detections.length} objek</span>
      </div>

      {/* Ringkasan Cepat Agronomi */}
      <div className={styles.agronomyGrid}>
        <div className={`${styles.agronomyCard} ${styles.ripe}`}>
          <span className={styles.agronomyLabel}>Ripe · Siap Panen</span>
          <span className={styles.agronomyCount}>{ripeCount}</span>
        </div>
        <div className={`${styles.agronomyCard} ${styles.unripe}`}>
          <span className={styles.agronomyLabel}>Mengkal & Mentah</span>
          <span className={styles.agronomyCount}>{unripeCount}</span>
        </div>
      </div>

      {/* Ringkasan Distribusi per Kelas */}
      {detections.length > 0 && (
        <div className={styles.summary} aria-label="Distribusi Kelas Sawit">
          {Object.entries(classCounts).map(([label, count]) => {
            const info = getLabelInfo(label);
            return (
              <span key={label} className={styles.summaryTag}>
                <span className={styles.summaryDot} style={{ background: info.color }} />
                <span>
                  {label} ({info.shortLabelId}):
                </span>
                <strong>{count}</strong>
              </span>
            );
          })}
        </div>
      )}

      {/* List Deteksi */}
      {detections.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <SearchIcon size={24} />
          </div>
          <p className={styles.emptyText}>
            Tidak ada objek tandan sawit yang terdeteksi pada frame saat ini.
          </p>
        </div>
      ) : (
        <ul className={styles.list}>
          {detections.map((d, i) => {
            const color = getLabelColor(d.label);
            const info = getLabelInfo(d.label);
            const confPct = Math.round(d.confidence * 100);

            return (
              <li key={i} className={styles.item}>
                <div className={styles.itemTop}>
                  <div className={styles.itemLabel}>
                    <span className={styles.dot} style={{ background: color }} />
                    <span className={styles.label}>
                      {d.label} · {info.shortLabelId}
                    </span>
                  </div>
                  <span className={styles.conf}>{confPct}%</span>
                </div>

                {/* Progress bar confidence score */}
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
                    Posisi: [{d.x}, {d.y}] · {d.w}×{d.h}px
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
