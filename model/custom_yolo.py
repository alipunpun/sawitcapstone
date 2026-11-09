"""
custom_yolo.py  --  Modifikasi Ultralytics YOLO11s untuk Capstone Deteksi Tandan Buah Sawit
  1) CBAMAttention  : modul attention (Channel + Spatial)
  2) WIoUBboxLoss   : Wise-IoU v3 menggantikan CIoU pada bbox loss
  3) apply_patches  : menyuntik keduanya ke library Ultralytics (monkey-patch, tanpa edit file library)
  4) create_init_checkpoint : transfer bobot pretrained yolo11s.pt -> arsitektur CBAM
WAJIB di-import (dan apply_patches() dipanggil) sebelum membuat/melatih/memuat model custom.
"""
import re
import torch
import torch.nn as nn

import ultralytics.utils.loss as _uloss

# ----------------------------------------------------------------------------
# 1) CBAM
# ----------------------------------------------------------------------------
class ChannelAttentionCBAM(nn.Module):
    """Channel attention: sigmoid( MLP(AvgPool(x)) + MLP(MaxPool(x)) )  -> (B,C,1,1)"""
    def __init__(self, c, reduction=16):
        super().__init__()
        hidden = max(c // reduction, 8)
        self.avg_pool = nn.AdaptiveAvgPool2d(1)
        self.max_pool = nn.AdaptiveMaxPool2d(1)
        self.mlp = nn.Sequential(
            nn.Conv2d(c, hidden, 1, bias=False),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden, c, 1, bias=False),
        )

    def forward(self, x):
        return torch.sigmoid(self.mlp(self.avg_pool(x)) + self.mlp(self.max_pool(x)))


class SpatialAttentionCBAM(nn.Module):
    """Spatial attention: sigmoid( Conv7x7([mean_c(x), max_c(x)]) )  -> (B,1,H,W)"""
    def __init__(self, kernel_size=7):
        super().__init__()
        assert kernel_size in (3, 7), "kernel_size harus 3 atau 7"
        self.conv = nn.Conv2d(2, 1, kernel_size, padding=kernel_size // 2, bias=False)

    def forward(self, x):
        avg = torch.mean(x, dim=1, keepdim=True)
        mx, _ = torch.max(x, dim=1, keepdim=True)
        return torch.sigmoid(self.conv(torch.cat([avg, mx], dim=1)))


class CBAMAttention(nn.Module):
    """CBAM: x -> x * ChannelAtt(x) -> * SpatialAtt(.)   (channel & resolusi tidak berubah)
    Argumen YAML: [c1]  (jumlah channel input; = output)."""
    def __init__(self, c1, reduction=16, kernel_size=7):
        super().__init__()
        self.ca = ChannelAttentionCBAM(c1, reduction)
        self.sa = SpatialAttentionCBAM(kernel_size)

    def forward(self, x):
        x = x * self.ca(x)
        return x * self.sa(x)


# ----------------------------------------------------------------------------
# 2) Wise-IoU v3
# ----------------------------------------------------------------------------
# Simpan referensi BboxLoss ASLI (aman walau modul ini di-reload setelah patch)
_OrigBboxLoss = getattr(_uloss, "_OrigBboxLoss", _uloss.BboxLoss)
_uloss._OrigBboxLoss = _OrigBboxLoss


def wiou_terms(pred, target, mean_iou, alpha=1.9, delta=3.0, version=3, eps=1e-7):
    """pred, target: (N,4) xyxy. Return (loss_per_box (N,), iou (N,)).
    Semua operasi skala-invarian sehingga tidak peduli satuan (piksel / unit stride)."""
    px1, py1, px2, py2 = pred.unbind(-1)
    tx1, ty1, tx2, ty2 = target.unbind(-1)

    inter = (torch.min(px2, tx2) - torch.max(px1, tx1)).clamp(0) * \
            (torch.min(py2, ty2) - torch.max(py1, ty1)).clamp(0)
    union = (px2 - px1) * (py2 - py1) + (tx2 - tx1) * (ty2 - ty1) - inter + eps
    iou = inter / union
    l_iou = 1.0 - iou

    # jarak pusat^2 / diagonal^2 kotak pembungkus (penyebut dilepas dari graf: tanda * pada paper)
    cx_p, cy_p = (px1 + px2) / 2, (py1 + py2) / 2
    cx_t, cy_t = (tx1 + tx2) / 2, (ty1 + ty2) / 2
    wg = torch.max(px2, tx2) - torch.min(px1, tx1)
    hg = torch.max(py2, ty2) - torch.min(py1, ty1)
    dist2 = (cx_p - cx_t) ** 2 + (cy_p - cy_t) ** 2
    r_wiou = torch.exp(dist2 / (wg ** 2 + hg ** 2 + eps).detach())

    loss_v1 = r_wiou * l_iou
    if version == 1:
        return loss_v1, iou

    beta = (l_iou.detach() / mean_iou.clamp_min(1e-6)).clamp(max=100.0)   # outlier degree
    r = beta / (delta * alpha ** (beta - delta))                           # focusing coefficient
    return r * loss_v1, iou


class WIoUBboxLoss(_OrigBboxLoss):
    """Pengganti BboxLoss bawaan. Komponen IoU = WIoU v3, komponen DFL = bawaan Ultralytics."""
    ALPHA, DELTA, MOMENTUM, VERSION = 1.9, 3.0, 0.01, 3

    def __init__(self, reg_max=16, *args, **kwargs):
        super().__init__(reg_max, *args, **kwargs)
        self.register_buffer("iou_mean", torch.ones(()), persistent=False)   # running mean L_IoU
        self.n_seen = 0

    def forward(self, pred_dist, pred_bboxes, anchor_points, target_bboxes,
                target_scores, target_scores_sum, fg_mask, *args, **kwargs):
        # DFL (dan nilai IoU lama) dari kelas induk -> kompatibel antar-versi Ultralytics
        loss_iou_orig, loss_dfl = super().forward(
            pred_dist, pred_bboxes, anchor_points, target_bboxes,
            target_scores, target_scores_sum, fg_mask, *args, **kwargs)

        if not bool(fg_mask.any()):          # tidak ada positif pada batch ini
            return loss_iou_orig, loss_dfl

        weight = target_scores.sum(-1)[fg_mask].float()
        pb = pred_bboxes[fg_mask].float()
        tb = target_bboxes[fg_mask].float()

        self.iou_mean = self.iou_mean.to(pb.device)
        with torch.no_grad():                # update running mean hanya saat training (grad aktif)
            if torch.is_grad_enabled():
                cur = (1.0 - _plain_iou(pb, tb)).mean()
                self.n_seen += 1
                m = max(self.MOMENTUM, 1.0 / self.n_seen)    # awal: rata-rata kumulatif
                self.iou_mean = self.iou_mean * (1 - m) + cur * m

        loss_box, _ = wiou_terms(pb, tb, self.iou_mean, self.ALPHA, self.DELTA, self.VERSION)
        loss_iou = (loss_box * weight).sum() / target_scores_sum
        return loss_iou, loss_dfl


def _plain_iou(pred, target, eps=1e-7):
    px1, py1, px2, py2 = pred.unbind(-1)
    tx1, ty1, tx2, ty2 = target.unbind(-1)
    inter = (torch.min(px2, tx2) - torch.max(px1, tx1)).clamp(0) * \
            (torch.min(py2, ty2) - torch.max(py1, ty1)).clamp(0)
    union = (px2 - px1) * (py2 - py1) + (tx2 - tx1) * (ty2 - ty1) - inter + eps
    return inter / union


# ----------------------------------------------------------------------------
# 3) Monkey-patch
# ----------------------------------------------------------------------------
def apply_patches(verbose=True):
    import ultralytics.nn.tasks as tasks
    tasks.CBAMAttention = CBAMAttention        # (1) parse_model() mencari nama modul via globals() tasks.py
    _uloss.BboxLoss = WIoUBboxLoss             # (2) v8DetectionLoss.__init__ memanggil BboxLoss(...) dari sini
    if verbose:
        print("[custom_yolo] patch aktif -> tasks.CBAMAttention & loss.BboxLoss = WIoUBboxLoss")


# ----------------------------------------------------------------------------
# 4) Transfer bobot COCO yolo11s.pt -> arsitektur CBAM (indeks layer bergeser)
# ----------------------------------------------------------------------------
OLD2NEW = {0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 7, 7: 9, 8: 10, 9: 11, 10: 12,
           11: 14, 12: 15, 13: 16, 14: 17, 15: 18, 16: 19, 17: 21, 18: 22,
           19: 23, 20: 25, 21: 26, 22: 27, 23: 29}


def create_init_checkpoint(yaml_path, out_path, pretrained="yolo11s.pt", nc=5):
    """Bangun model CBAM, isi bobot dari `pretrained` sesuai OLD2NEW, simpan sebagai .pt kompatibel Ultralytics."""
    apply_patches(verbose=False)
    from ultralytics import YOLO
    from ultralytics.nn.tasks import DetectionModel

    student = DetectionModel(str(yaml_path), nc=nc, verbose=False)
    teacher = YOLO(pretrained).model
    s_sd, t_sd = student.state_dict(), teacher.state_dict()

    new_sd, skipped = {}, []
    for k, v in t_sd.items():
        m = re.match(r"model\.(\d+)\.(.*)", k)
        if not m or int(m.group(1)) not in OLD2NEW:
            continue
        nk = f"model.{OLD2NEW[int(m.group(1))]}.{m.group(2)}"
        if nk in s_sd and s_sd[nk].shape == v.shape:
            new_sd[nk] = v
        else:
            skipped.append((k, nk))
    student.load_state_dict(new_sd, strict=False)

    torch.save({"model": student.float(), "train_args": {}, "epoch": -1}, out_path)
    print(f"[custom_yolo] Transfer bobot: {len(new_sd)}/{len(s_sd)} tensor model-CBAM terisi dari {pretrained}")
    print(f"[custom_yolo] Tidak ditransfer (bentuk beda, mis. head kelas 80->{nc}): {len(skipped)} tensor")
    print(f"[custom_yolo] Checkpoint awal disimpan: {out_path}")
    return out_path
