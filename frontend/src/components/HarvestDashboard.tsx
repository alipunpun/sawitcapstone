/**
 * HarvestDashboard – Ringkasan Eksekutif Stakeholder & Harvest Readiness Index (HRI)
 * Mengagregasi performa sesi dari GET /api/session/summary untuk 5 kelas model CBAM.
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { CBAM_CLASSES, getLabelInfo } from "../utils/labels";
import { ActivityIcon, SproutIcon } from "./icons";
import styles from "./HarvestDashboard.module.css";

export interface SessionSummary {
  session_start: string;
  total_frames: number;
  total_detections: number;
  class_counts: Record<string, number>;
  harvest_readiness_index: number;
}

interface Props {
  /** Trigger refresh reaktif saat ada frame deteksi baru dari WebSocket */
  liveDetectionCount?: number;
}

const EMPTY_SUMMARY: SessionSummary = {
  session_start: "",
  total_frames: 0,
  total_detections: 0,
  class_counts: {
    Ripe: 0,
    Underripe: 0,
    Unripe: 0,
    Abnormal: 0,
    Flower: 0,
  },
  harvest_readiness_index: 0,
};

function getReadinessStatus(hri: number, fruitTotal: number) {
  if (fruitTotal === 0) {
    return {
      label: "Belum Siap Panen",
      tone: "neutral" as const,
      hint: "Menunggu deteksi tandan buah sawit dari stream UAV untuk menghitung indeks panen.",
      barColor: "#94a3b8",
    };
  }
  if (hri >= 60) {
    return {
      label: "Siap Panen",
      tone: "ready" as const,
      hint: "Proporsi tandan matang ≥ 60% dari total tandan buah — direkomendasikan segera panen.",
      barColor: "#16a34a",
    };
  }
  if (hri >= 30) {
    return {
      label: "Persiapan Panen",
      tone: "preparing" as const,
      hint: "Proporsi tandan matang 30%–59% — jadwalkan persiapan tim dan logistik panen.",
      barColor: "#d97706",
    };
  }
  return {
    label: "Belum Siap Panen",
    tone: "notReady" as const,
    hint: "Dominasi tandan mengkal/mentah (< 30% matang) — pertahankan rotasi pemantauan.",
    barColor: "#dc2626",
  };
}

export function HarvestDashboard({ liveDetectionCount }: Props) {
  const [summary, setSummary] = useState<SessionSummary>(EMPTY_SUMMARY);
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/session/summary", { cache: "no-store" });
      if (!res.ok) {
        setApiAvailable(false);
        return;
      }
      const data = (await res.json()) as SessionSummary;
      setSummary({
        session_start: data.session_start ?? "",
        total_frames: Number(data.total_frames ?? 0),
        total_detections: Number(data.total_detections ?? 0),
        class_counts: data.class_counts ?? EMPTY_SUMMARY.class_counts,
        harvest_readiness_index: Number.isFinite(data.harvest_readiness_index)
          ? data.harvest_readiness_index
          : 0,
      });
      setApiAvailable(true);
    } catch {
      setApiAvailable(false);
    }
  }, []);

  // Polling berkala setiap 2.5 detik agar metrik selalu tersinkron lintas perangkat
  useEffect(() => {
    const initialTimer = window.setTimeout(fetchSummary, 0);
    const intervalTimer = window.setInterval(fetchSummary, 2500);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [fetchSummary]);

  // Sinkronisasi reaktif ketika ada deteksi baru masuk lewat WebSocket
  useEffect(() => {
    if (liveDetectionCount === undefined || liveDetectionCount <= 0) return;
    const syncTimer = window.setTimeout(fetchSummary, 0);
    return () => window.clearTimeout(syncTimer);
  }, [liveDetectionCount, fetchSummary]);

  const counts = summary.class_counts;
  const fruitTotal =
    (counts.Ripe ?? 0) +
    (counts.Underripe ?? 0) +
    (counts.Unripe ?? 0) +
    (counts.Abnormal ?? 0);

  const hri = Math.max(0, Math.min(100, summary.harvest_readiness_index || 0));
  const status = getReadinessStatus(hri, fruitTotal);

  const formattedSessionStart = summary.session_start
    ? new Date(summary.session_start).toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";

  return (
    <section
      className={styles.dashboard}
      aria-label="Dashboard Ringkasan Stakeholder & Kesiapan Panen"
    >
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.iconWrap}>
            <SproutIcon size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className={styles.title}>Dashboard Kesiapan Panen (Stakeholder)</h2>
            <p className={styles.subtitle}>
              Agregasi 5 kelas CBAM secara real-time · Indeks dihitung dari rasio Ripe terhadap total buah (tanpa Flower)
            </p>
          </div>
        </div>

        <div className={styles.sessionMeta}>
          <span className={styles.metaPill}>
            <ActivityIcon size={13} aria-hidden="true" />
            <span>Sesi: {formattedSessionStart}</span>
          </span>
          <span className={styles.metaPill}>
            Frame: <strong>{summary.total_frames.toLocaleString("id-ID")}</strong>
          </span>
          <span className={styles.metaPill}>
            Deteksi: <strong>{summary.total_detections.toLocaleString("id-ID")}</strong>
          </span>
          {!apiAvailable && (
            <span className={styles.offlineBadge}>API sinkronisasi tertunda</span>
          )}
        </div>
      </div>

      <div className={styles.contentGrid}>
        {/* Bagian 1: Kartu Utama Harvest Readiness Index (HRI) */}
        <div className={styles.hriCard}>
          <div className={styles.hriTop}>
            <div>
              <span className={styles.hriLabel}>Harvest Readiness Index (HRI)</span>
              <div className={styles.hriValueRow}>
                <span className={styles.hriValue}>{hri.toFixed(1)}%</span>
                <span className={styles.hriFraction}>
                  {counts.Ripe ?? 0} matang / {fruitTotal} total buah
                </span>
              </div>
            </div>

            <span className={`${styles.recommendationBadge} ${styles[status.tone]}`}>
              {status.label}
            </span>
          </div>

          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuenow={Math.round(hri)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Persentase kesiapan panen sawit"
          >
            <div
              className={styles.progressFill}
              style={{ width: `${hri}%`, background: status.barColor }}
            />
          </div>

          <div className={styles.thresholdLegend}>
            <span>&lt; 30%: Belum Siap</span>
            <span>30%–59%: Persiapan Panen</span>
            <span>≥ 60%: Siap Panen</span>
          </div>

          <p className={styles.hriHint}>{status.hint}</p>
        </div>

        {/* Bagian 2: Grid Rincian 5 Kelas CBAM */}
        <div className={styles.classGrid} aria-label="Distribusi 5 Kelas Deteksi Sawit">
          {CBAM_CLASSES.map((cls) => {
            const meta = getLabelInfo(cls);
            const count = counts[cls] ?? 0;
            const sharePct =
              summary.total_detections > 0
                ? (count / summary.total_detections) * 100
                : 0;

            return (
              <div
                key={cls}
                className={styles.classCard}
                style={{ "--class-accent": meta.color } as CSSProperties}
              >
                <div className={styles.classTop}>
                  <div className={styles.classTitleGroup}>
                    <span
                      className={styles.classDot}
                      style={{ background: meta.color }}
                      aria-hidden="true"
                    />
                    <span className={styles.classKey}>{meta.key}</span>
                  </div>
                  <span
                    className={styles.classShortBadge}
                    style={{
                      background: meta.badge.bg,
                      color: meta.badge.text,
                      borderColor: meta.badge.border,
                    }}
                  >
                    {meta.shortLabelId}
                  </span>
                </div>

                <div className={styles.classMetrics}>
                  <span className={styles.classCount}>
                    {count.toLocaleString("id-ID")}
                  </span>
                  <span className={styles.classPct}>{sharePct.toFixed(1)}%</span>
                </div>

                <div className={styles.miniTrack}>
                  <div
                    className={styles.miniFill}
                    style={{
                      width: `${Math.min(100, sharePct)}%`,
                      background: meta.color,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
