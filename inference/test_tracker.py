"""
test_tracker.py – Pengujian Unit Komprehensif untuk ObjectTracker (Step 10)
============================================================================
Menguji kemampuan pelacakan dan deduplikasi TBS kelapa sawit:
  1. Perhitungan IoU dan jarak centroid
  2. Frame awal: pembuatan track baru (is_duplicate = False)
  3. Frame berurutan dengan overlap (IoU >= 0.3) -> is_duplicate = True
  4. Gerak cepat UAV: overlap rendah tapi jarak centroid <= 80px -> cocok
  5. Kemunculan buah baru di frame berikutnya
  6. Penghapusan track kedaluwarsa setelah max_age (30 frame)
  7. Penugasan optimal 1-ke-1 tanpa bentrok (Hungarian assignment)
  8. Fungsi reset dan statistik tracker
"""

import math
import unittest
from object_tracker import (
    ObjectTracker,
    compute_centroid,
    compute_centroid_distance,
    compute_iou,
)


class TestObjectTrackerGeometry(unittest.TestCase):
    """Pengujian fungsi pembantu geometri (IoU dan centroid)."""

    def test_iou_identical_boxes(self):
        box1 = (100.0, 100.0, 50.0, 50.0)
        box2 = (100.0, 100.0, 50.0, 50.0)
        self.assertAlmostEqual(compute_iou(box1, box2), 1.0, places=4)

    def test_iou_disjoint_boxes(self):
        box1 = (0.0, 0.0, 50.0, 50.0)
        box2 = (100.0, 100.0, 50.0, 50.0)
        self.assertEqual(compute_iou(box1, box2), 0.0)

    def test_iou_partial_overlap(self):
        # box1: [0, 0, 100, 100] (area 10000)
        # box2: [50, 0, 100, 100] (area 10000)
        # inter: [50, 0, 50, 100] (area 5000)
        # union: 10000 + 10000 - 5000 = 15000
        # iou: 5000 / 15000 = 1/3 ~ 0.3333
        box1 = (0.0, 0.0, 100.0, 100.0)
        box2 = (50.0, 0.0, 100.0, 100.0)
        self.assertAlmostEqual(compute_iou(box1, box2), 1.0 / 3.0, places=4)

    def test_centroid_and_distance(self):
        box1 = (100.0, 100.0, 60.0, 80.0)  # centroid = (130, 140)
        c1 = compute_centroid(box1)
        self.assertEqual(c1, (130.0, 140.0))

        box2 = (130.0, 140.0, 60.0, 80.0)  # centroid = (160, 180)
        c2 = compute_centroid(box2)
        # distance: sqrt((160-130)^2 + (180-140)^2) = sqrt(900 + 1600) = 50.0
        dist = compute_centroid_distance(c1, c2)
        self.assertAlmostEqual(dist, 50.0, places=4)


class TestObjectTrackerDeduplication(unittest.TestCase):
    """Pengujian logika pelacakan dan deduplikasi multi-frame."""

    def setUp(self):
        self.tracker = ObjectTracker(iou_threshold=0.3, max_dist=80.0, max_age=30)

    def test_first_frame_all_new_tracks(self):
        """Pada frame 1, semua deteksi baru harus mendapat track_id unik dan is_duplicate = False."""
        dets = [
            {"label": "Ripe", "confidence": 0.92, "x": 100, "y": 100, "w": 60, "h": 60},
            {"label": "Underripe", "confidence": 0.88, "x": 300, "y": 200, "w": 70, "h": 70},
        ]
        result = self.tracker.update(dets)

        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["track_id"], "TRK-0001")
        self.assertFalse(result[0]["is_duplicate"])
        self.assertEqual(result[1]["track_id"], "TRK-0002")
        self.assertFalse(result[1]["is_duplicate"])
        self.assertEqual(len(self.tracker.tracks), 2)

    def test_frame_overlap_same_fruit(self):
        """Buah yang sama bergeser sedikit (IoU >= 0.3) harus mempertahankan track_id dan ditandai is_duplicate = True."""
        frame1 = [
            {"label": "Ripe", "confidence": 0.90, "x": 100, "y": 100, "w": 60, "h": 60},
        ]
        res1 = self.tracker.update(frame1)
        track_id_1 = res1[0]["track_id"]
        self.assertFalse(res1[0]["is_duplicate"])

        # Frame 2: UAV bergeser 10px, bbox bergeser ke (110, 105)
        frame2 = [
            {"label": "Ripe", "confidence": 0.93, "x": 110, "y": 105, "w": 60, "h": 60},
        ]
        res2 = self.tracker.update(frame2)
        self.assertEqual(len(res2), 1)
        self.assertEqual(res2[0]["track_id"], track_id_1)
        self.assertTrue(res2[0]["is_duplicate"], "Deteksi kedua harus ditandai is_duplicate = True")

    def test_fast_uav_movement_centroid_matching(self):
        """Gerak cepat UAV: IoU < 0.3 tapi jarak centroid <= 80px tetap dianggap buah yang sama."""
        frame1 = [
            {"label": "Ripe", "confidence": 0.90, "x": 100, "y": 100, "w": 50, "h": 50},  # centroid: (125, 125)
        ]
        res1 = self.tracker.update(frame1)
        original_id = res1[0]["track_id"]

        # Frame 2: Pergeseran cepat sejauh 45 piksel ke kanan (IoU hampir 0 tapi jarak 45px <= 80px)
        frame2 = [
            {"label": "Ripe", "confidence": 0.89, "x": 145, "y": 100, "w": 50, "h": 50},  # centroid: (170, 125), dist = 45px
        ]
        # Verifikasi IoU sebelum update
        box1 = (100, 100, 50, 50)
        box2 = (145, 100, 50, 50)
        iou = compute_iou(box1, box2)
        self.assertLess(iou, 0.3, "IoU harus < 0.3 untuk menguji cabang centroid distance")

        res2 = self.tracker.update(frame2)
        self.assertEqual(res2[0]["track_id"], original_id)
        self.assertTrue(res2[0]["is_duplicate"])

    def test_new_fruit_appearing_later(self):
        """Buah baru yang muncul di koordinat berbeda harus diberi ID baru dan is_duplicate = False."""
        # Frame 1: Hanya buah A
        frame1 = [
            {"label": "Ripe", "confidence": 0.91, "x": 100, "y": 100, "w": 60, "h": 60},
        ]
        res1 = self.tracker.update(frame1)
        id_a = res1[0]["track_id"]

        # Frame 2: Buah A masih ada, dan buah B baru masuk di (400, 400)
        frame2 = [
            {"label": "Ripe", "confidence": 0.92, "x": 105, "y": 102, "w": 60, "h": 60},
            {"label": "Unripe", "confidence": 0.85, "x": 400, "y": 400, "w": 65, "h": 65},
        ]
        res2 = self.tracker.update(frame2)
        self.assertEqual(len(res2), 2)

        # Cari buah A dan buah B dari hasil
        item_a = next(r for r in res2 if r["track_id"] == id_a)
        item_b = next(r for r in res2 if r["track_id"] != id_a)

        self.assertTrue(item_a["is_duplicate"])
        self.assertFalse(item_b["is_duplicate"])
        self.assertEqual(item_b["track_id"], "TRK-0002")

    def test_track_expiration_after_max_age(self):
        """Track yang tidak terlihat selama lebih dari max_age frame harus dihapus otomatis."""
        tracker = ObjectTracker(max_age=5)

        # Frame 1: Buah muncul
        tracker.update([{"label": "Ripe", "confidence": 0.90, "x": 100, "y": 100, "w": 50, "h": 50}])
        self.assertEqual(len(tracker.tracks), 1)

        # Lewati 5 frame kosong (track masih ada pada toleransi max_age)
        for _ in range(5):
            tracker.update([])
        self.assertEqual(len(tracker.tracks), 1)

        # Frame ke-6 kosong -> melebihi max_age (5) -> track dihapus
        tracker.update([])
        self.assertEqual(len(tracker.tracks), 0, "Track harus sudah terhapus setelah melewati max_age")

        # Jika buah muncul lagi di koordinat yang sama, dibuat track baru (bukan duplikat lama)
        res_new = tracker.update([{"label": "Ripe", "confidence": 0.90, "x": 100, "y": 100, "w": 50, "h": 50}])
        self.assertFalse(res_new[0]["is_duplicate"])
        self.assertEqual(res_new[0]["track_id"], "TRK-0002")

    def test_multiple_target_hungarian_assignment(self):
        """Memastikan beberapa buah yang berdekatan dipasangkan secara 1-ke-1 secara konsisten."""
        frame1 = [
            {"label": "Ripe", "confidence": 0.90, "x": 100, "y": 100, "w": 50, "h": 50},
            {"label": "Underripe", "confidence": 0.85, "x": 200, "y": 100, "w": 50, "h": 50},
            {"label": "Unripe", "confidence": 0.88, "x": 300, "y": 100, "w": 50, "h": 50},
        ]
        res1 = self.tracker.update(frame1)
        ids1 = [r["track_id"] for r in res1]

        # Frame 2: Semua buah bergeser ke kanan sejauh 15 piksel
        frame2 = [
            {"label": "Underripe", "confidence": 0.86, "x": 215, "y": 102, "w": 50, "h": 50},
            {"label": "Unripe", "confidence": 0.89, "x": 315, "y": 101, "w": 50, "h": 50},
            {"label": "Ripe", "confidence": 0.91, "x": 115, "y": 103, "w": 50, "h": 50},
        ]
        res2 = self.tracker.update(frame2)

        # Setiap elemen harus cocok dengan target yang tepat berdasarkan posisi
        res2_by_label = {r["label"]: r for r in res2}
        self.assertEqual(res2_by_label["Ripe"]["track_id"], ids1[0])
        self.assertEqual(res2_by_label["Underripe"]["track_id"], ids1[1])
        self.assertEqual(res2_by_label["Unripe"]["track_id"], ids1[2])

        for r in res2:
            self.assertTrue(r["is_duplicate"])

    def test_reset_and_stats(self):
        """Memastikan fungsi reset membersihkan semua riwayat dan statistik."""
        self.tracker.update([{"label": "Ripe", "confidence": 0.90, "x": 100, "y": 100, "w": 50, "h": 50}])
        stats = self.tracker.get_stats()
        self.assertEqual(stats["active_tracks"], 1)
        self.assertEqual(stats["total_tracks_created"], 1)

        self.tracker.reset()
        stats_after = self.tracker.get_stats()
        self.assertEqual(stats_after["active_tracks"], 0)
        self.assertEqual(stats_after["total_tracks_created"], 0)
        self.assertEqual(stats_after["total_frames_tracked"], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
