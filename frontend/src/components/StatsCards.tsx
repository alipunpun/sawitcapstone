/**
 * StatsCards – 4 Kartu Ringkasan Metrik Operasional Drone & Perkebunan
 */

import type { Stats } from "../hooks/useUAVStream";
import { FilmIcon, TargetIcon, ZapIcon, ClockIcon } from "./icons";
import styles from "./StatsCards.module.css";

interface Props {
  stats: Stats;
}

export function StatsCards({ stats }: Props) {
  const cards = [
    {
      title: "Total Frame Visual",
      value: stats.frameCount.toLocaleString(),
      subtext: "Frame tangkapan drone diterima",
      Icon: FilmIcon,
      color: "#15803d",
      bgColor: "#f0fdf4",
      borderColor: "#bbf7d0",
    },
    {
      title: "Akumulasi Tandan Sawit",
      value: stats.detectionCount.toLocaleString(),
      subtext: "Objek sawit teridentifikasi",
      Icon: TargetIcon,
      color: "#16a34a",
      bgColor: "#f0fdf4",
      borderColor: "#bbf7d0",
    },
    {
      title: "Kecepatan Inferensi",
      value: stats.fps > 0 ? stats.fps.toFixed(1) : "0.0",
      unit: "FPS",
      subtext: "Throughput pemrosesan real-time",
      Icon: ZapIcon,
      color: "#d97706",
      bgColor: "#fffbeb",
      borderColor: "#fde68a",
    },
    {
      title: "Latensi Model YOLO",
      value: stats.latencyMs !== null ? stats.latencyMs.toFixed(1) : "-",
      unit: stats.latencyMs !== null ? "ms" : "",
      subtext: "Waktu inferensi per frame",
      Icon: ClockIcon,
      color: "#0284c7",
      bgColor: "#f0f9ff",
      borderColor: "#bae6fd",
    },
  ];

  return (
    <div className={styles.grid} role="region" aria-label="Metrik Operasional Drone">
      {cards.map((c, i) => {
        const IconComponent = c.Icon;
        return (
          <div
            key={i}
            className={styles.card}
            style={
              {
                "--card-accent": c.color,
                "--icon-bg": c.bgColor,
                "--icon-border": c.borderColor,
              } as React.CSSProperties
            }
          >
            <div className={styles.cardHeader}>
              <span className={styles.cardTitle}>{c.title}</span>
              <div className={styles.iconWrapper}>
                <IconComponent size={20} aria-hidden="true" />
              </div>
            </div>

            <div className={styles.cardBody}>
              <span className={styles.cardValue} style={{ color: c.color }}>
                {c.value}
              </span>
              {c.unit && <span className={styles.cardUnit}>{c.unit}</span>}
            </div>

            <span className={styles.cardSubtext}>{c.subtext}</span>
          </div>
        );
      })}
    </div>
  );
}
