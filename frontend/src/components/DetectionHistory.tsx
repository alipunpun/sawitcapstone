/**
 * DetectionHistory – tabel riwayat deteksi objek terbaru
 */

import type { DetectionRecord } from "../hooks/useUAVStream";
import { getLabelColor } from "../utils/labels";
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
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.headerTitleGroup}>
          <h3 className={styles.title}>Riwayat Deteksi Terbaru</h3>
          <span className={styles.badge}>{history.length} entri</span>
        </div>
        {history.length > 0 && onClear && (
          <button className={styles.clearBtn} onClick={onClear} title="Bersihkan riwayat">
            Bersihkan
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className={styles.empty}>
          <span>📊</span>
          <p>Belum ada data riwayat deteksi. Riwayat akan muncul otomatis saat stream aktif.</p>
        </div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Frame ID</th>
                <th>Objek</th>
                <th>Kelas Terdeteksi</th>
                <th>Latensi</th>
                <th>FPS</th>
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
                        <span className={styles.noneText}>Nihil</span>
                      ) : (
                        <div className={styles.tagGroup}>
                          {classes.map(([label, count]) => (
                            <span
                              key={label}
                              className={styles.classTag}
                              style={{
                                borderColor: getLabelColor(label),
                                color: "#f8fafc",
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
                      {rec.fps > 0 ? rec.fps.toFixed(1) : "-"}
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
