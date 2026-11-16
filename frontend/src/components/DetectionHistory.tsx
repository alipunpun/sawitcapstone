/**
 * DetectionHistory – Tabel Riwayat Telemetri & Deteksi Tandan Buah Sawit
 */

import type { DetectionRecord } from "../hooks/useUAVStream";
import { getLabelColor } from "../utils/labels";
import { FilmIcon, Trash2Icon, ActivityIcon } from "./icons";
import styles from "./DetectionHistory.module.css";

interface Props {
  history: DetectionRecord[];
  onClear?: () => void;
}

function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function truncateFrameId(id: string): string {
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function DetectionHistory({ history, onClear }: Props) {
  return (
    <div className={styles.container} role="region" aria-label="Riwayat Deteksi Drone">
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <FilmIcon size={20} style={{ color: "#16a34a" }} aria-hidden="true" />
          <h3 className={styles.title}>Riwayat Telemetri & Deteksi Misi Drone</h3>
          <span className={styles.badge}>{history.length} entri</span>
        </div>
        {history.length > 0 && onClear && (
          <button
            className={styles.clearBtn}
            onClick={onClear}
            type="button"
            title="Bersihkan riwayat deteksi"
          >
            <Trash2Icon size={14} aria-hidden="true" />
            <span>Bersihkan Log</span>
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <ActivityIcon size={26} />
          </div>
          <p>Belum ada data riwayat deteksi. Riwayat akan otomatis tercatat saat stream kamera drone aktif.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Frame ID</th>
                <th>Jumlah Objek</th>
                <th>Klasifikasi Tandan Teridentifikasi</th>
                <th>Latensi</th>
                <th>Throughput</th>
              </tr>
            </thead>
            <tbody>
              {history.map((rec, idx) => {
                // Kumpulkan kelas unik beserta jumlahnya
                const classCounts: Record<string, number> = {};
                for (const d of rec.detections) {
                  classCounts[d.label] = (classCounts[d.label] ?? 0) + 1;
                }
                const classes = Object.entries(classCounts);

                return (
                  <tr key={`${rec.frame_id}-${idx}`}>
                    <td className={styles.timeCell}>{formatTime(rec.received_at)}</td>
                    <td className={styles.idCell} title={rec.frame_id}>
                      <code>{truncateFrameId(rec.frame_id)}</code>
                    </td>
                    <td>
                      <span
                        className={`${styles.countBadge} ${
                          rec.detections.length > 0 ? styles.countActive : styles.countZero
                        }`}
                      >
                        {rec.detections.length}
                      </span>
                    </td>
                    <td>
                      {classes.length === 0 ? (
                        <span className={styles.noneText}>Nihil (Tidak ada tandan)</span>
                      ) : (
                        <div className={styles.tagGroup}>
                          {classes.map(([label, count]) => (
                            <span
                              key={label}
                              className={styles.classTag}
                              style={{
                                borderColor: getLabelColor(label),
                                color: "#0f172a",
                              }}
                            >
                              <span
                                className={styles.tagDot}
                                style={{ background: getLabelColor(label) }}
                              />
                              {label} {count > 1 ? `(${count})` : ""}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className={styles.metricCell}>
                      {rec.latency_ms > 0 ? `${rec.latency_ms.toFixed(1)} ms` : "-"}
                    </td>
                    <td className={styles.metricCell}>
                      {rec.fps > 0 ? `${rec.fps.toFixed(1)} FPS` : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
