/**
 * ClassChart.tsx – Visualisasi Grafik Distribusi & Tren Waktu Nyata 5 Kelas CBAM
 * Step 8.2 Roadmap Capstone (Precision AgriTech Green & White Design)
 */

import { useMemo, useState } from "react";
import { CBAM_CLASSES, getLabelInfo, type PalmClass } from "../utils/labels";
import type { DetectionRecord } from "../hooks/useUAVStream";
import styles from "./ClassChart.module.css";

interface Props {
  classCounts: Record<string, number>;
  totalDetections: number;
  history?: DetectionRecord[];
}

type ChartMode = "bar" | "trend";

export function ClassChart({ classCounts, totalDetections, history = [] }: Props) {
  const [mode, setMode] = useState<ChartMode>("bar");
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    count: number;
    timeStr: string;
    x: number;
    y: number;
  } | null>(null);

  // Data bar chart
  const barData = useMemo(() => {
    const maxVal = Math.max(...CBAM_CLASSES.map((cls) => classCounts[cls] ?? 0), 1);
    return CBAM_CLASSES.map((cls) => {
      const meta = getLabelInfo(cls);
      const count = classCounts[cls] ?? 0;
      const pct = totalDetections > 0 ? (count / totalDetections) * 100 : 0;
      const heightPct = (count / maxVal) * 100;
      return {
        key: cls as PalmClass,
        label: meta.shortLabelId,
        fullLabel: meta.key,
        count,
        pct,
        heightPct,
        color: meta.color,
      };
    });
  }, [classCounts, totalDetections]);

  // Data tren waktu (10 interval terakhir dari riwayat deteksi frame)
  const trendData = useMemo(() => {
    if (history.length === 0) return [];
    // Kelompokkan 30 frame terakhir menjadi 6 interval waktu
    const slice = history.slice(-30);
    const bucketSize = Math.max(1, Math.ceil(slice.length / 6));
    const buckets: { timeStr: string; counts: Record<PalmClass, number> }[] = [];

    for (let i = 0; i < slice.length; i += bucketSize) {
      const chunk = slice.slice(i, i + bucketSize);
      const first = chunk[0];
      const timeStr = first?.received_at
        ? new Date(first.received_at).toLocaleTimeString("id-ID", {
            minute: "2-digit",
            second: "2-digit",
          })
        : `T-${buckets.length + 1}`;

      const counts: Record<PalmClass, number> = {
        Ripe: 0,
        Underripe: 0,
        Unripe: 0,
        Abnormal: 0,
        Flower: 0,
      };

      for (const rec of chunk) {
        for (const det of rec.detections) {
          if (det.label in counts) {
            counts[det.label as PalmClass]++;
          }
        }
      }

      buckets.push({ timeStr, counts });
    }

    return buckets;
  }, [history]);

  const maxTrendVal = useMemo(() => {
    let max = 1;
    for (const b of trendData) {
      for (const cls of CBAM_CLASSES) {
        if (b.counts[cls] > max) max = b.counts[cls];
      }
    }
    return max;
  }, [trendData]);

  // Koordinat SVG untuk grafik garis tren
  const svgWidth = 520;
  const svgHeight = 160;
  const paddingX = 40;
  const paddingY = 25;

  const pointsPerClass = useMemo<
    Record<PalmClass, { x: number; y: number; count: number; timeStr: string }[]>
  >(() => {
    const emptyResult: Record<
      PalmClass,
      { x: number; y: number; count: number; timeStr: string }[]
    > = {
      Ripe: [],
      Underripe: [],
      Unripe: [],
      Abnormal: [],
      Flower: [],
    };
    if (trendData.length < 2) return emptyResult;
    const stepX = (svgWidth - paddingX * 2) / (trendData.length - 1);
    const usableH = svgHeight - paddingY * 2;

    const result: Record<
      PalmClass,
      { x: number; y: number; count: number; timeStr: string }[]
    > = {
      Ripe: [],
      Underripe: [],
      Unripe: [],
      Abnormal: [],
      Flower: [],
    };

    CBAM_CLASSES.forEach((cls) => {
      trendData.forEach((bucket, idx) => {
        const x = paddingX + idx * stepX;
        const count = bucket.counts[cls];
        const y = svgHeight - paddingY - (count / maxTrendVal) * usableH;
        result[cls].push({ x, y, count, timeStr: bucket.timeStr });
      });
    });

    return result;
  }, [trendData, maxTrendVal]);

  return (
    <div className={styles.chartWrapper} role="region" aria-label="Grafik Distribusi Kelas TBS">
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.badgeDot} />
          <h4 className={styles.title}>Visualisasi Distribusi Kematangan</h4>
        </div>

        <div className={styles.modeTabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "bar"}
            className={`${styles.tabBtn} ${mode === "bar" ? styles.activeTab : ""}`}
            onClick={() => setMode("bar")}
          >
            Diagram Batang
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "trend"}
            className={`${styles.tabBtn} ${mode === "trend" ? styles.activeTab : ""}`}
            onClick={() => setMode("trend")}
          >
            Tren Garis Waktu
          </button>
        </div>
      </div>

      {mode === "bar" ? (
        <div className={styles.barArea}>
          <div className={styles.barGrid}>
            {barData.map((d) => (
              <div key={d.key} className={styles.barCol}>
                <span className={styles.barVal}>{d.count}</span>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      height: `${Math.max(6, d.heightPct)}%`,
                      backgroundColor: d.color,
                    }}
                    title={`${d.fullLabel}: ${d.count} TBS (${d.pct.toFixed(1)}%)`}
                  />
                </div>
                <span className={styles.barLabel}>{d.label}</span>
                <span className={styles.barPct}>{d.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={styles.trendArea}>
          {trendData.length < 2 ? (
            <div className={styles.emptyTrend}>
              <p>Mengumpulkan data frame UAV untuk membentuk garis tren waktu...</p>
            </div>
          ) : (
            <div className={styles.svgContainer}>
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className={styles.svg}
                preserveAspectRatio="xMidYMid meet"
              >
                {/* Horizontal gridlines */}
                {[0, 0.5, 1].map((ratio) => {
                  const y = svgHeight - paddingY - ratio * (svgHeight - paddingY * 2);
                  return (
                    <line
                      key={ratio}
                      x1={paddingX}
                      y1={y}
                      x2={svgWidth - paddingX}
                      y2={y}
                      className={styles.gridLine}
                    />
                  );
                })}

                {/* Garis per kelas CBAM */}
                {CBAM_CLASSES.map((cls) => {
                  const pts = pointsPerClass[cls];
                  if (!pts || pts.length < 2) return null;
                  const meta = getLabelInfo(cls);
                  const pathD = pts
                    .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
                    .join(" ");

                  return (
                    <g key={cls}>
                      <path
                        d={pathD}
                        fill="none"
                        stroke={meta.color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {pts.map((pt, i) => (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="#ffffff"
                          stroke={meta.color}
                          strokeWidth="2"
                          className={styles.pointDot}
                          onMouseEnter={() =>
                            setHoveredPoint({
                              label: `${cls} (${meta.shortLabelId})`,
                              count: pt.count,
                              timeStr: pt.timeStr,
                              x: pt.x,
                              y: pt.y,
                            })
                          }
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      ))}
                    </g>
                  );
                })}
              </svg>

              {/* Tooltip interaktif */}
              {hoveredPoint && (
                <div
                  className={styles.tooltip}
                  style={{
                    left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                    top: `${(hoveredPoint.y / svgHeight) * 100}%`,
                  }}
                >
                  <strong>{hoveredPoint.label}</strong>
                  <span>{hoveredPoint.count} TBS</span>
                  <small>{hoveredPoint.timeStr}</small>
                </div>
              )}
            </div>
          )}

          {/* Legend kelas */}
          <div className={styles.legendRow}>
            {CBAM_CLASSES.map((cls) => {
              const meta = getLabelInfo(cls);
              return (
                <span key={cls} className={styles.legendItem}>
                  <span className={styles.legendDot} style={{ background: meta.color }} />
                  <span>{meta.shortLabelId}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
