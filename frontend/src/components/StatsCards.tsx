/**
 * StatsCards – 4 kartu ringkasan metrik performa & status sistem
 */

import type { Stats } from "../hooks/useUAVStream";
import styles from "./StatsCards.module.css";

interface Props {
  stats: Stats;
}

export function StatsCards({ stats }: Props) {
  const cards = [
    {
      title: "Total Frame",
      value: stats.frameCount.toLocaleString(),
      subtext: "Frame stream diproses",
      icon: "🎞️",
      color: "#38bdf8", // Sky blue
    },
    {
      title: "Total Deteksi",
      value: stats.detectionCount.toLocaleString(),
      subtext: "Akumulasi objek sawit",
      icon: "🎯",
      color: "#4ade80", // Green
    },
    {
      title: "FPS Inferensi",
      value: stats.fps > 0 ? stats.fps.toFixed(1) : "0.0",
      unit: "fps",
      subtext: "Kecepatan pemrosesan",
      icon: "⚡",
      color: "#facc15", // Yellow
    },
    {
      title: "Latensi Model",
      value: stats.latencyMs !== null ? stats.latencyMs.toFixed(1) : "-",
      unit: stats.latencyMs !== null ? "ms" : "",
      subtext: "Waktu inferensi YOLO",
      icon: "⏱️",
      color: "#c084fc", // Purple
    },
  ];

  return (
    <div className={styles.grid}>
      {cards.map((c, i) => (
        <div key={i} className={styles.card}>
          <div className={styles.cardHeader}>
            <span className={styles.cardTitle}>{c.title}</span>
            <span className={styles.cardIcon}>{c.icon}</span>
          </div>
          <div className={styles.cardBody}>
            <span className={styles.cardValue} style={{ color: c.color }}>
              {c.value}
            </span>
            {c.unit && <span className={styles.cardUnit}>{c.unit}</span>}
          </div>
          <span className={styles.cardSubtext}>{c.subtext}</span>
        </div>
      ))}
    </div>
  );
}
