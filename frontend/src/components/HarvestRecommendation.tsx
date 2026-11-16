/**
 * HarvestRecommendation.tsx – Panel Rekomendasi Panen Otomatis dengan Threshold Terkonfigurasi
 * Step 8.3 Roadmap Capstone (Precision AgriTech Green & White Design)
 */

import { useState } from "react";
import { ZapIcon } from "./icons";
import styles from "./HarvestRecommendation.module.css";

interface Props {
  hri: number;
  ripeCount: number;
  fruitTotal: number;
}

export function HarvestRecommendation({ hri, ripeCount, fruitTotal }: Props) {
  const [threshold, setThreshold] = useState<number>(50);

  const isReady = hri >= threshold;
  const isPreparing = !isReady && hri >= Math.max(25, threshold - 20);

  let statusBadge = {
    title: "BELUM SIAP PANEN",
    className: styles.notReady,
    icon: "⛔",
    action: "Blok didominasi TBS mengkal & mentah. Tunda rotasi pemanenan dan jadwalkan inspeksi drone 5–7 hari mendatang.",
  };

  if (fruitTotal === 0) {
    statusBadge = {
      title: "MENUNGGU DETEKSI",
      className: styles.neutral,
      icon: "📡",
      action: "UAV belum mendeteksi tandan sawit pada blok aktif. Alirkan video stream atau aktifkan simulator kamera.",
    };
  } else if (isReady) {
    statusBadge = {
      title: "SIAP PANEN",
      className: styles.ready,
      icon: "✅",
      action: "Segera kerahkan tenaga pemanen (dodos/egrek), atur titik kumpul TBS (TPH), dan siapkan armada truk pengangkut ke PKS.",
    };
  } else if (isPreparing) {
    statusBadge = {
      title: "PERSIAPAN PANEN",
      className: styles.preparing,
      icon: "⏳",
      action: "Mulai persiapkan rotasi pemanenan dalam 2–3 hari. Pastikan piringan pohon dan akses pasar pikul bersih.",
    };
  }

  return (
    <div className={styles.card} role="region" aria-label="Rekomendasi Panen Otomatis">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <div className={styles.iconWrap}>
            <ZapIcon size={16} aria-hidden="true" />
          </div>
          <div>
            <h4 className={styles.title}>Rekomendasi Panen Otomatis</h4>
            <p className={styles.subtitle}>Keputusan berbasis ambang batas kematangan TBS</p>
          </div>
        </div>

        <div className={styles.thresholdControl}>
          <span className={styles.thresholdLabel}>Ambang Batas:</span>
          <span className={styles.thresholdVal}>{threshold}%</span>
          <input
            type="range"
            min={30}
            max={75}
            step={5}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className={styles.slider}
            aria-label="Atur ambang batas persentase panen"
          />
        </div>
      </div>

      <div className={`${styles.recommendationBanner} ${statusBadge.className}`}>
        <div className={styles.bannerTop}>
          <span className={styles.statusIcon}>{statusBadge.icon}</span>
          <div className={styles.bannerText}>
            <span className={styles.statement}>
              Blok pemantauan ini memiliki <strong>{hri.toFixed(1)}%</strong> TBS matang ({ripeCount} dari {fruitTotal} total buah).
            </span>
            <span className={styles.recommendationTitle}>
              REKOMENDASI: {statusBadge.title}
            </span>
          </div>
        </div>

        <div className={styles.actionNote}>
          <span className={styles.actionLabel}>Rekomendasi Tindakan:</span>
          <p className={styles.actionDesc}>{statusBadge.action}</p>
        </div>
      </div>
    </div>
  );
}
