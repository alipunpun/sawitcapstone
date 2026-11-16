/**
 * HarvestDashboard.tsx – Ringkasan Eksekutif Stakeholder & Harvest Readiness Index (HRI)
 * Step 8 & Step 9 Roadmap Capstone: Dashboard Stakeholder & Penyimpanan Database SQLite
 *
 * Mengagregasi 5 kelas kematangan TBS (Ripe, Underripe, Unripe, Abnormal, Flower)
 * dari GET /api/session/summary & feed real-time WebSocket, dilengkapi:
 *   8.1 Kartu Ringkasan Sesi & Durasi
 *   8.2 Grafik Distribusi & Tren Waktu Nyata (ClassChart)
 *   8.3 Rekomendasi Panen Otomatis & Ambang Batas Terkonfigurasi (HarvestRecommendation)
 *   8.4 Export Laporan CSV & Cetak PDF
 *   9.0 Kontrol Sesi Monitoring & Integrasi Database SQLite Persisten
 */

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { CBAM_CLASSES, getLabelInfo } from "../utils/labels";
import type { DetectionRecord } from "../hooks/useUAVStream";
import {
  ActivityIcon,
  ClockIcon,
  DownloadIcon,
  PlayIcon,
  PrinterIcon,
  SproutIcon,
  SquareIcon,
} from "./icons";
import { ClassChart } from "./ClassChart";
import { HarvestRecommendation } from "./HarvestRecommendation";
import styles from "./HarvestDashboard.module.css";

export interface SessionSummary {
  session_id?: string;
  session_start: string;
  total_frames: number;
  total_detections: number;
  class_counts: Record<string, number>;
  harvest_readiness_index: number;
}

interface Props {
  /** Trigger refresh reaktif saat ada frame deteksi baru dari WebSocket */
  liveDetectionCount?: number;
  /** Riwayat deteksi frame UAV untuk visualisasi tren waktu */
  history?: DetectionRecord[];
}

const EMPTY_SUMMARY: SessionSummary = {
  session_id: "",
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

function formatDuration(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${hrs.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function HarvestDashboard({ liveDetectionCount, history = [] }: Props) {
  const [summary, setSummary] = useState<SessionSummary>(EMPTY_SUMMARY);
  const [apiAvailable, setApiAvailable] = useState<boolean>(true);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch("/api/session/summary", { cache: "no-store" });
      if (!res.ok) {
        setApiAvailable(false);
        return;
      }
      const data = (await res.json()) as SessionSummary;
      setSummary({
        session_id: data.session_id ?? "",
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

  // Polling berkala setiap 2.5 detik
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

  // Timer durasi sesi berjalan
  useEffect(() => {
    if (!summary.session_start) return;
    const startMs = new Date(summary.session_start).getTime();
    const tick = () => {
      const now = Date.now();
      setDurationSec(Math.max(0, Math.floor((now - startMs) / 1000)));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [summary.session_start]);

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

  // Fitur 9.0: Memulai Sesi Monitoring Baru di SQLite
  const handleStartSession = async () => {
    if (!window.confirm("Mulai sesi monitoring baru? Sesi berjalan akan diselesaikan dan disimpan.")) return;
    setIsStartingSession(true);
    try {
      await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uav_id: "UAV-01" }),
      });
      await fetchSummary();
    } catch (err) {
      console.error("Gagal memulai sesi baru:", err);
    } finally {
      setIsStartingSession(false);
    }
  };

  // Fitur 9.0: Mengakhiri Sesi Monitoring di SQLite
  const handleEndSession = async () => {
    if (!window.confirm("Akhiri sesi monitoring saat ini dan simpan ringkasan ke database?")) return;
    try {
      await fetch("/api/session/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: summary.session_id }),
      });
      await fetchSummary();
    } catch (err) {
      console.error("Gagal mengakhiri sesi:", err);
    }
  };

  // Fitur 9.0: Unduh CSV Database Lengkap
  const handleDownloadDbCsv = () => {
    if (!summary.session_id) {
      handleExportClientCSV();
      return;
    }
    window.open(`/api/export/${summary.session_id}/csv`, "_blank");
  };

  // Fitur 8.4: Export Laporan CSV Client-Side Fallback
  const handleExportClientCSV = () => {
    const reportDate = new Date().toLocaleString("id-ID");
    const rows = [
      ["LAPORAN REKAPITULASI PEMANTAUAN TBS KELAPA SAWIT (UAV)"],
      ["ID Sesi", summary.session_id || "-"],
      ["Waktu Laporan", reportDate],
      ["Waktu Mulai Sesi", summary.session_start || "-"],
      ["Durasi Monitoring", formatDuration(durationSec)],
      ["Total Frame UAV", summary.total_frames.toString()],
      ["Total TBS Terdeteksi", summary.total_detections.toString()],
      ["Total Buah (Non-Bunga)", fruitTotal.toString()],
      ["Harvest Readiness Index (%)", hri.toFixed(2)],
      ["Status Kesiapan", status.label],
      [],
      ["Kelas Model CBAM", "Nama Agrikultur", "Jumlah TBS", "Proporsi (%)"],
      ...CBAM_CLASSES.map((cls) => {
        const meta = getLabelInfo(cls);
        const count = counts[cls] ?? 0;
        const pct =
          summary.total_detections > 0
            ? ((count / summary.total_detections) * 100).toFixed(2)
            : "0.00";
        return [cls, meta.labelId, count.toString(), `${pct}%`];
      }),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `laporan_panen_sawit_${summary.session_id || dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Fitur 8.4 & 9.0: Export / Cetak Laporan PDF
  const handlePrintPDF = () => {
    if (summary.session_id) {
      window.open(`/api/export/${summary.session_id}/pdf`, "_blank");
    } else {
      window.print();
    }
  };

  return (
    <section
      className={styles.dashboard}
      aria-label="Dashboard Ringkasan Stakeholder & Kesiapan Panen"
    >
      {/* Header Dashboard & Tombol Export */}
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.iconWrap}>
            <SproutIcon size={20} aria-hidden="true" />
          </div>
          <div>
            <h2 className={styles.title}>Dashboard Stakeholder & Kesiapan Panen</h2>
            <p className={styles.subtitle}>
              Sistem Klasifikasi 5 Kelas YOLO11s-CBAM-WIoU · Persisten SQLite Database (Step 9)
            </p>
          </div>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.sessionMeta}>
            {summary.session_id && (
              <span className={styles.metaPill}>
                <span>ID: <strong>{summary.session_id}</strong></span>
              </span>
            )}
            <span className={styles.metaPill}>
              <ActivityIcon size={13} aria-hidden="true" />
              <span>Sesi: {formattedSessionStart}</span>
            </span>
            <span className={styles.metaPill}>
              <ClockIcon size={13} aria-hidden="true" />
              <span>Durasi: <strong>{formatDuration(durationSec)}</strong></span>
            </span>
            <span className={styles.metaPill}>
              Frame: <strong>{summary.total_frames.toLocaleString("id-ID")}</strong>
            </span>
            <span className={styles.metaPill}>
              Total TBS: <strong>{summary.total_detections.toLocaleString("id-ID")}</strong>
            </span>
            {!apiAvailable && (
              <span className={styles.offlineBadge}>API Offline</span>
            )}
          </div>

          <div className={styles.actionButtonGroup}>
            {/* Kontrol Sesi Monitoring (Step 9) */}
            <button
              type="button"
              className={styles.sessionControlBtn}
              onClick={handleStartSession}
              disabled={isStartingSession}
              title="Mulai sesi monitoring penerbangan UAV baru"
            >
              <PlayIcon size={13} aria-hidden="true" />
              <span>Sesi Baru</span>
            </button>
            <button
              type="button"
              className={`${styles.sessionControlBtn} ${styles.endBtn}`}
              onClick={handleEndSession}
              title="Selesaikan sesi saat ini dan simpan rekapitulasi ke SQLite"
            >
              <SquareIcon size={13} aria-hidden="true" />
              <span>Selesaikan</span>
            </button>

            {/* Export CSV & Laporan PDF (Step 8.4 & 9) */}
            <button
              type="button"
              className={styles.exportBtn}
              onClick={handleDownloadDbCsv}
              title="Unduh data deteksi mentah dalam format CSV dari database SQLite"
            >
              <DownloadIcon size={14} aria-hidden="true" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              className={`${styles.exportBtn} ${styles.printBtn}`}
              onClick={handlePrintPDF}
              title="Buka laporan rekapitulasi resmi sesi untuk cetak / simpan ke PDF"
            >
              <PrinterIcon size={14} aria-hidden="true" />
              <span>Laporan PDF</span>
            </button>
          </div>
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

      {/* Bagian 3: Visualisasi Tren Waktu Nyata & Rekomendasi Panen Otomatis (Step 8.2 & 8.3) */}
      <div className={styles.subGrid}>
        <div className={styles.subCol}>
          <ClassChart
            classCounts={summary.class_counts}
            totalDetections={summary.total_detections}
            history={history}
          />
        </div>
        <div className={styles.subCol}>
          <HarvestRecommendation
            hri={hri}
            ripeCount={counts.Ripe ?? 0}
            fruitTotal={fruitTotal}
          />
        </div>
      </div>
    </section>
  );
}
