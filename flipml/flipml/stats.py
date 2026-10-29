"""Aggregate-only evaluation.

A site evaluates a model on its own held-out rows and returns sufficient statistics: counts,
sums and fixed-bin histograms. No per-row predictions, scores or labels leave the site. The
coordinator merges the statistics from every site and computes the final metrics. AUROC is
computed from score histograms, so it is exact up to the bin width.
"""
import numpy as np

from .model import predict

BINS = 20


def eval_stats(params, X, y, task: str, k: int, target_mean: float = 0.0, target_std: float = 1.0) -> dict:
    n = int(len(y))
    if task == "classification":
        p = predict(params, X, task)
        pred = p.argmax(1)
        cm = np.zeros((k, k), dtype=int)
        np.add.at(cm, (y, pred), 1)
        bins = np.minimum((p * BINS).astype(int), BINS - 1)
        hist = np.zeros((k, 2, BINS), dtype=int)  # [class][negative, positive][score bin]
        for c in range(k):
            pos = y == c
            hist[c, 1] = np.bincount(bins[pos, c], minlength=BINS)
            hist[c, 0] = np.bincount(bins[~pos, c], minlength=BINS)
        conf = p.max(1)
        cb = np.minimum((conf * BINS).astype(int), BINS - 1)
        loss = float(-np.sum(np.log(np.clip(p[np.arange(n), y], 1e-12, None))))
        return {"task": task, "n": n, "loss_sum": loss, "confusion": cm.tolist(), "score_hist": hist.tolist(),
                "calib_count": np.bincount(cb, minlength=BINS).tolist(),
                "calib_conf": np.bincount(cb, weights=conf, minlength=BINS).tolist(),
                "calib_correct": np.bincount(cb, weights=(pred == y).astype(float), minlength=BINS).tolist()}
    pred_std = predict(params, X, task)
    loss = float(0.5 * np.sum((pred_std - y) ** 2))
    pred, truth = pred_std * target_std + target_mean, y * target_std + target_mean
    err = pred - truth
    return {"task": task, "n": n, "loss_sum": loss, "sse": float(np.sum(err ** 2)), "sae": float(np.sum(np.abs(err))),
            "sum_y": float(np.sum(truth)), "sum_y2": float(np.sum(truth ** 2))}


def merge_stats(items: list[dict]) -> dict:
    items = [s for s in items if s and s.get("n")]
    if not items:
        return {}
    out = {"task": items[0]["task"]}
    for key in items[0]:
        if key == "task":
            continue
        out[key] = np.sum([np.asarray(s[key]) for s in items], axis=0).tolist()
    return out


def _auroc(neg: np.ndarray, pos: np.ndarray) -> float | None:
    P, N = pos.sum(), neg.sum()
    if P == 0 or N == 0:
        return None
    below = np.concatenate([[0], np.cumsum(neg)[:-1]])
    return float(np.sum(pos * (below + 0.5 * neg)) / (P * N))


def finalize(s: dict, classes: list[str] | None = None) -> dict:
    if not s:
        return {}
    n = max(1, s["n"])
    if s["task"] == "regression":
        mean_y = s["sum_y"] / n
        sst = s["sum_y2"] - n * mean_y ** 2
        return {"task": "regression", "n": s["n"], "loss": s["loss_sum"] / n, "mae": s["sae"] / n,
                "rmse": float(np.sqrt(s["sse"] / n)), "r2": float(1 - s["sse"] / sst) if sst > 0 else None}
    cm = np.asarray(s["confusion"])
    k = len(cm)
    per_class = []
    hist = np.asarray(s["score_hist"])
    for c in range(k):
        tp = cm[c, c]
        prec = tp / cm[:, c].sum() if cm[:, c].sum() else 0.0
        rec = tp / cm[c, :].sum() if cm[c, :].sum() else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        per_class.append({"class": classes[c] if classes else str(c), "precision": float(prec), "recall": float(rec),
                          "f1": float(f1), "support": int(cm[c, :].sum()), "auroc": _auroc(hist[c, 0], hist[c, 1])})
    aucs = [c["auroc"] for c in per_class if c["auroc"] is not None]
    counts = np.asarray(s["calib_count"], float)
    conf = np.asarray(s["calib_conf"], float)
    correct = np.asarray(s["calib_correct"], float)
    calibration = [{"bin": b / len(counts), "count": int(counts[b]),
                    "confidence": float(conf[b] / counts[b]) if counts[b] else None,
                    "accuracy": float(correct[b] / counts[b]) if counts[b] else None} for b in range(len(counts))]
    ece = float(np.sum(np.abs(conf - correct)) / n)
    return {
        "task": "classification", "n": s["n"], "loss": s["loss_sum"] / n,
        "accuracy": float(np.trace(cm) / n),
        "precision": float(np.mean([c["precision"] for c in per_class])),
        "recall": float(np.mean([c["recall"] for c in per_class])),
        "f1": float(np.mean([c["f1"] for c in per_class])),
        "auroc": float(np.mean(aucs)) if aucs else None,
        "ece": ece, "calibration": calibration,
        "confusion_matrix": cm.tolist(), "per_class": per_class,
    }
