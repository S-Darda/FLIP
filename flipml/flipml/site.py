"""Work a site performs for the coordinator. Used by the real site agent and by the in-process
simulator, so both follow the same protocol.

A site only answers three allowlisted task kinds:

  prepare  build train/validation/test splits locally; return feature moments and label counts
  train    run local SGD from the given global weights; return a (clipped) weight update
  eval     score the given weights on the local validation or test split; return aggregate stats

Inputs are validated before use, and no task can make a site run code, read other files or
return rows.
"""
from __future__ import annotations

import csv
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .model import FAMILIES, TASKS, init_params
from .preprocess import moments, standardize, target_moments
from .stats import eval_stats
from .train import clip, local_update

KINDS = ("prepare", "train", "eval")
MAX_ROWS = 500_000
LIMITS = {"epochs": (1, 20), "batch_size": (4, 1024), "lr": (1e-5, 5.0), "mu": (0.0, 10.0), "clip": (1e-4, 100.0)}


class TaskRejected(ValueError):
    """The site refuses a task that is malformed or outside its policy."""


def _num(v: str) -> float | None:
    v = v.strip()
    if v == "" or v.lower() in ("na", "nan", "null", "?"):
        return math.nan
    try:
        return float(v)
    except ValueError:
        return None


def read_table(path: Path) -> tuple[list[str], list[list[str]]]:
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.reader(fh)
        header = [h.strip() for h in next(reader, [])]
        rows = [r for i, r in zip(range(MAX_ROWS), reader) if len(r) == len(header)]
    if len(header) < 2 or not rows:
        raise ValueError("CSV needs a header row, at least two columns and some data")
    return header, rows


def profile(header: list[str], rows: list[list[str]], min_count: int = 5, max_values: int = 20) -> dict:
    """Schema a site may share: column names, types, missing counts and, for low-cardinality
    columns, the category values, but only values that occur at least `min_count` times."""
    cols = []
    for j, name in enumerate(header):
        raw = [r[j].strip() for r in rows]
        parsed = [_num(v) for v in raw]
        numeric = all(p is not None for p in parsed)
        missing = sum(1 for p in parsed if p is not None and math.isnan(p)) if numeric else sum(1 for v in raw if v == "")
        counts: dict[str, int] = {}
        for v in raw:
            if v != "":
                counts[v] = counts.get(v, 0) + 1
        distinct = len(counts)
        values = None
        if distinct <= max_values:
            values = sorted((v for v, c in counts.items() if c >= min_count), key=lambda s: (_num(s) is None, _num(s) or 0, s))
        cols.append({"name": name, "type": "numeric" if numeric else "categorical", "missing": missing,
                     "distinct": distinct, "values": values})
    return {"rows": len(rows), "columns": cols}


@dataclass
class SiteData:
    """One dataset held at a site: named columns of raw string values."""
    header: list[str]
    rows: list[list[str]]
    _cache: dict = field(default_factory=dict, repr=False)

    @classmethod
    def from_csv(cls, path: Path) -> "SiteData":
        return cls(*read_table(path))

    @classmethod
    def from_arrays(cls, columns: dict[str, np.ndarray]) -> "SiteData":
        header = list(columns)
        n = len(next(iter(columns.values())))
        rows = [[str(columns[h][i]) for h in header] for i in range(n)]
        return cls(header, rows)

    def schema(self) -> dict:
        return profile(self.header, self.rows)

    def _matrix(self, features, target, task, classes, seed):
        key = (tuple(features), target, task, tuple(classes or ()), seed)
        if key in self._cache:
            return self._cache[key]
        idx = {h: j for j, h in enumerate(self.header)}
        missing = [c for c in [*features, target] if c not in idx]
        if missing:
            raise TaskRejected(f"unknown column(s): {', '.join(missing)}")
        X, y = [], []
        class_index = {c: i for i, c in enumerate(classes or [])}
        for r in self.rows:
            t = r[idx[target]].strip()
            if task == "classification":
                if t not in class_index:
                    continue
                label = class_index[t]
            else:
                label = _num(t)
                if label is None or math.isnan(label):
                    continue
            vals = [_num(r[idx[f]]) for f in features]
            if any(v is None for v in vals):
                raise TaskRejected("feature columns must be numeric")
            X.append(vals)
            y.append(label)
        if len(y) < 10:
            raise TaskRejected("fewer than 10 usable rows for this study")
        X = np.asarray(X, float)
        y = np.asarray(y, int if task == "classification" else float)
        order = np.random.default_rng(seed).permutation(len(y))
        a, b = int(len(y) * 0.70), int(len(y) * 0.85)
        splits = {"train": order[:a], "val": order[a:b], "test": order[b:]}
        self._cache[key] = (X, y, splits)
        return self._cache[key]


def _check(payload: dict, key: str, lo: float, hi: float) -> float:
    v = payload.get(key)
    if not isinstance(v, (int, float)) or not lo <= v <= hi:
        raise TaskRejected(f"{key} must be between {lo} and {hi}")
    return v


def _params(payload: dict) -> list[np.ndarray]:
    try:
        return [np.asarray(p, float) for p in payload["params"]]
    except (KeyError, TypeError, ValueError) as exc:
        raise TaskRejected("malformed model parameters") from exc


def handle(data: SiteData, kind: str, p: dict) -> dict:
    """Execute one allowlisted task and return only what may leave the site."""
    if kind not in KINDS:
        raise TaskRejected(f"task kind {kind!r} is not allowed")
    task = p.get("task")
    if task not in TASKS:
        raise TaskRejected("unknown task type")
    features, target = p.get("features"), p.get("target")
    if not isinstance(features, list) or not features or not all(isinstance(f, str) for f in features) or not isinstance(target, str):
        raise TaskRejected("features and target must be column names")
    if target in features:
        raise TaskRejected("the target cannot also be a feature")
    classes = p.get("classes") if task == "classification" else None
    seed = int(p.get("seed", 0))
    X, y, splits = data._matrix(features, target, task, classes, seed)

    if kind == "prepare":
        tr = splits["train"]
        out = {"n_train": int(len(tr)), "n_val": int(len(splits["val"])), "n_test": int(len(splits["test"])),
               "moments": moments(X[tr])}
        if task == "classification":
            out["class_counts"] = np.bincount(y[tr], minlength=len(classes)).tolist()
        else:
            out["target_moments"] = target_moments(y[tr])
        return out

    prep = p.get("prep") or {}
    try:
        Xs = standardize(X, prep["mean"], prep["std"])
    except (KeyError, ValueError) as exc:
        raise TaskRejected("missing or malformed preprocessing statistics") from exc
    t_mean, t_std = float(prep.get("target_mean", 0.0)), float(prep.get("target_std", 1.0)) or 1.0
    ys = y if task == "classification" else (y - t_mean) / t_std
    out_dim = len(classes) if task == "classification" else 1
    params = _params(p)
    family = p.get("family")
    if family not in FAMILIES:
        raise TaskRejected("model family not allowlisted")
    expected = [a.shape for a in init_params(family, len(features), out_dim, p.get("hidden", 32), np.random.default_rng(0))]
    if [a.shape for a in params] != expected:
        raise TaskRejected("parameter shapes do not match the study")

    if kind == "train":
        epochs = int(_check(p, "epochs", *LIMITS["epochs"]))
        batch = int(_check(p, "batch_size", *LIMITS["batch_size"]))
        lr = _check(p, "lr", *LIMITS["lr"])
        mu = _check(p, "mu", *LIMITS["mu"])
        tr = splits["train"]
        rng = np.random.default_rng(seed * 7919 + int(p.get("round", 0)))
        delta = local_update(params, Xs[tr], ys[tr], task, out_dim, epochs=epochs, batch_size=batch, lr=lr, mu=mu, rng=rng)
        norm = None
        if p.get("clip") is not None:
            delta, norm = clip(delta, _check(p, "clip", *LIMITS["clip"]))
        return {"delta": [d.tolist() for d in delta], "n": int(len(tr)), "norm": norm}

    split = p.get("split", "val")
    if split not in ("val", "test"):
        raise TaskRejected("split must be val or test")
    rows = splits[split]
    return eval_stats(params, Xs[rows], ys[rows], task, out_dim, t_mean, t_std)
