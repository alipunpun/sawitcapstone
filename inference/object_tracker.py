"""
object_tracker.py – Object Tracking & Deduplication untuk Deteksi TBS Kelapa Sawit (UAV)
========================================================================================
Step 10 Roadmap Capstone: Deduplikasi (Anti Double-Count)

Karena kamera drone UAV bergerak sepanjang blok kebun, tandan buah sawit (TBS) yang
sama dapat terdeteksi pada banyak frame berurutan. ObjectTracker menetapkan Track ID
unik dan menandai deteksi redundan (is_duplicate = True) sehingga hanya TBS baru
yang dihitung dalam estimasi hasil panen dan Harvest Readiness Index (HRI).

Algoritma Pencocokan:
  1. Intersection over Union (IoU) threshold >= 0.3 ATAU
  2. Jarak Centroid Euclidean <= 80 piksel (menangani gerak cepat UAV)
  3. Optimasi penugasan 1-ke-1 via Hungarian Algorithm (scipy.optimize.linear_sum_assignment)
  4. Fallback greedy matching jika scipy tidak tersedia
  5. Siklus hidup track (max_age = 30 frame) untuk menghapus objek yang keluar dari FOV
"""

import math
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from scipy.optimize import linear_sum_assignment
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


def compute_iou(box_a: Tuple[float, float, float, float], box_b: Tuple[float, float, float, float]) -> float:
    """
    Menghitung Intersection over Union (IoU) antara dua bounding box format [x, y, w, h].
    """
    ax, ay, aw, ah = box_a
    bx, by, bw, bh = box_b

    ax1, ay1, ax2, ay2 = ax, ay, ax + aw, ay + ah
    bx1, by1, bx2, by2 = bx, by, bx + bw, by + bh

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    intersection = inter_w * inter_h

    area_a = max(0.0, aw * ah)
    area_b = max(0.0, bw * bh)
    union = area_a + area_b - intersection

    if union <= 0.0:
        return 0.0
    return float(intersection / union)


def compute_centroid(box: Tuple[float, float, float, float]) -> Tuple[float, float]:
    """Menghitung koordinat centroid (titik tengah) (cx, cy) dari [x, y, w, h]."""
    x, y, w, h = box
    return (float(x + w / 2.0), float(y + h / 2.0))


def compute_centroid_distance(c1: Tuple[float, float], c2: Tuple[float, float]) -> float:
    """Menghitung jarak Euclidean antar dua centroid dalam piksel."""
    return float(math.hypot(c1[0] - c2[0], c1[1] - c2[1]))


@dataclass
class Track:
    track_id: str
    label: str
    confidence: float
    bbox: Tuple[float, float, float, float]  # (x, y, w, h)
    centroid: Tuple[float, float]
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    hits: int = 1
    age: int = 1
    time_since_update: int = 0


class ObjectTracker:
    """
    Pelacak objek multi-frame untuk deduplikasi deteksi TBS kelapa sawit.
    """

    def __init__(
        self,
        iou_threshold: float = 0.3,
        max_dist: float = 80.0,
        max_age: int = 30,
        iou_weight: float = 0.5,
        dist_weight: float = 0.5,
    ):
        """
        Inisialisasi ObjectTracker.

        :param iou_threshold: Ambang batas minimum IoU agar dianggap objek yang sama (default: 0.3)
        :param max_dist: Jarak centroid maksimum (piksel) agar dianggap objek yang sama (default: 80.0px)
        :param max_age: Jumlah frame tanpa deteksi sebelum track dihapus (default: 30 frame)
        :param iou_weight: Bobot komponen IoU pada cost matrix
        :param dist_weight: Bobot komponen Centroid Distance pada cost matrix
        """
        self.iou_threshold = float(iou_threshold)
        self.max_dist = float(max_dist)
        self.max_age = int(max_age)
        self.iou_weight = float(iou_weight)
        self.dist_weight = float(dist_weight)

        self.tracks: Dict[str, Track] = {}
        self.next_id: int = 1
        self.total_tracks_created: int = 0
        self.frame_count: int = 0

    def reset(self) -> None:
        """Mereset semua active tracks dan counter (digunakan saat sesi monitoring baru dimulai)."""
        self.tracks.clear()
        self.next_id = 1
        self.total_tracks_created = 0
        self.frame_count = 0

    def get_stats(self) -> Dict[str, Any]:
        """Mengambil ringkasan statistik performa pelacakan dan deduplikasi."""
        return {
            "active_tracks": len(self.tracks),
            "total_tracks_created": self.total_tracks_created,
            "total_frames_tracked": self.frame_count,
            "has_scipy": HAS_SCIPY,
            "iou_threshold": self.iou_threshold,
            "max_dist": self.max_dist,
            "max_age": self.max_age,
        }

    def update(self, detections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Memperbarui track dengan deteksi baru dari frame saat ini.

        :param detections: List dictionary deteksi dari YOLO:
                           [{ 'label': str, 'confidence': float, 'x': int|float, 'y': int|float, 'w': int|float, 'h': int|float }]
        :return: List dictionary yang sama dengan penambahan:
                 'track_id': str (ID unik tanda buah sawit, misal 'TRK-0001')
                 'is_duplicate': bool (True jika objek sudah terhitung sebelumnya, False jika TBS baru)
        """
        self.frame_count += 1
        now = time.time()

        # Update umur setiap track yang sedang aktif
        for track in self.tracks.values():
            track.age += 1
            track.time_since_update += 1

        if not detections:
            # Hapus track yang sudah melampaui max_age tanpa deteksi
            self._prune_dead_tracks()
            return []

        # Ekstrak data bounding box & centroid untuk setiap deteksi masuk
        det_boxes: List[Tuple[float, float, float, float]] = []
        det_centroids: List[Tuple[float, float]] = []
        for d in detections:
            box = (float(d.get("x", 0)), float(d.get("y", 0)), float(d.get("w", 0)), float(d.get("h", 0)))
            det_boxes.append(box)
            det_centroids.append(compute_centroid(box))

        active_track_ids = list(self.tracks.keys())
        num_tracks = len(active_track_ids)
        num_dets = len(detections)

        matched_track_indices = set()
        matched_det_indices = set()
        matches: List[Tuple[int, int]] = []  # (track_idx, det_idx)

        if num_tracks > 0 and num_dets > 0:
            # Bangun Cost Matrix antara active tracks dan detections
            cost_matrix = np.full((num_tracks, num_dets), 1e5, dtype=np.float64)

            for i, tid in enumerate(active_track_ids):
                track = self.tracks[tid]
                for j in range(num_dets):
                    iou = compute_iou(track.bbox, det_boxes[j])
                    dist = compute_centroid_distance(track.centroid, det_centroids[j])

                    # Kriteria Step 10: IoU >= threshold ATAU centroid distance <= max_dist
                    is_match_candidate = (iou >= self.iou_threshold) or (dist <= self.max_dist)

                    if is_match_candidate:
                        iou_cost = 1.0 - iou
                        norm_dist = min(1.0, dist / max(1.0, self.max_dist))
                        combined = (self.iou_weight * iou_cost) + (self.dist_weight * norm_dist)

                        # Sedikit prioritas jika label kelas konsisten
                        if track.label == detections[j].get("label"):
                            combined *= 0.95

                        cost_matrix[i, j] = combined

            # Penugasan optimal (Hungarian Algorithm) atau Greedy Fallback
            if HAS_SCIPY:
                row_ind, col_ind = linear_sum_assignment(cost_matrix)
                for r, c in zip(row_ind, col_ind):
                    if cost_matrix[r, c] < 1e4:  # Hanya pasangkan jika memenuhi kriteria
                        matches.append((r, c))
                        matched_track_indices.add(r)
                        matched_det_indices.add(c)
            else:
                # Greedy fallback matching
                candidates = []
                for r in range(num_tracks):
                    for c in range(num_dets):
                        if cost_matrix[r, c] < 1e4:
                            candidates.append((cost_matrix[r, c], r, c))
                candidates.sort(key=lambda x: x[0])

                for cost, r, c in candidates:
                    if r not in matched_track_indices and c not in matched_det_indices:
                        matches.append((r, c))
                        matched_track_indices.add(r)
                        matched_det_indices.add(c)

        output_detections: List[Dict[str, Any]] = []

        # 1. Proses deteksi yang cocok dengan track yang sudah ada -> is_duplicate = True
        det_to_track_map: Dict[int, str] = {}
        for r, c in matches:
            tid = active_track_ids[r]
            track = self.tracks[tid]

            # Update informasi track dengan data bounding box terbaru
            track.bbox = det_boxes[c]
            track.centroid = det_centroids[c]
            track.confidence = float(detections[c].get("confidence", track.confidence))
            # Perbarui label ke deteksi terbaru jika confidence lebih tinggi
            if float(detections[c].get("confidence", 0)) >= track.confidence:
                track.label = str(detections[c].get("label", track.label))
            track.last_seen = now
            track.hits += 1
            track.time_since_update = 0

            det_to_track_map[c] = tid

        # 2. Proses semua deteksi untuk output
        for j, det in enumerate(detections):
            det_copy = dict(det)
            if j in matched_det_indices:
                det_copy["track_id"] = det_to_track_map[j]
                det_copy["is_duplicate"] = True
            else:
                # Objek baru terdeteksi! Buat Track ID baru -> is_duplicate = False
                new_track_id = f"TRK-{self.next_id:04d}"
                self.next_id += 1
                self.total_tracks_created += 1

                new_track = Track(
                    track_id=new_track_id,
                    label=str(det.get("label", "Unknown")),
                    confidence=float(det.get("confidence", 0.0)),
                    bbox=det_boxes[j],
                    centroid=det_centroids[j],
                    first_seen=now,
                    last_seen=now,
                    hits=1,
                    age=1,
                    time_since_update=0,
                )
                self.tracks[new_track_id] = new_track

                det_copy["track_id"] = new_track_id
                det_copy["is_duplicate"] = False

            output_detections.append(det_copy)

        # 3. Hapus track lama yang sudah melampaui max_age tanpa deteksi
        self._prune_dead_tracks()

        return output_detections

    def _prune_dead_tracks(self) -> None:
        """Menghapus track yang hilang lebih lama dari max_age frame."""
        dead_keys = [
            tid for tid, track in self.tracks.items()
            if track.time_since_update > self.max_age
        ]
        for tid in dead_keys:
            del self.tracks[tid]
