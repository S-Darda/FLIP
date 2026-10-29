"""Federated learning engine.

Each participating node (hospital, bank, lab...) holds its own data partition. Per round the
coordinator sends the global weights to the selected nodes, each node trains locally and
returns only a weight update, and the coordinator aggregates the updates (FedAvg, or FedProx
with a proximal term). Optional differential privacy clips each node's update and adds
Gaussian noise to the aggregate (accounting in privacy.py).

In this prototype every node is simulated inside the server process, so the coordinator can
see each individual update and the source data. It demonstrates the protocol; it is not a
deployment in which raw rows stay at participating sites.

Models are written directly in numpy so the platform has no GPU or framework dependency:
softmax (multinomial logistic) regression and a one-hidden-layer MLP.
"""
from __future__ import annotations

import csv
import math
import time
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .privacy import summary as dp_summary

NODE_PREFIX = {"Healthcare": "Hospital", "Finance": "Bank", "Research": "Lab",
               "Retail": "Store", "Public Sector": "Agency"}
MAX_CSV_ROWS = 200_000


class DatasetError(ValueError):
    pass


@dataclass
class NodeData:
    name: str
    X_train: np.ndarray
    y_train: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray


@dataclass
class TrainingConfig:
    model_type: str = "logreg"
    algorithm: str = "FedAvg"
    rounds: int = 20
    num_nodes: int = 4
    client_fraction: float = 1.0
    local_epochs: int = 2
    batch_size: int = 32
    learning_rate: float = 0.1
    mu: float = 0.0
    dp_enabled: bool = False
    clip_norm: float = 1.0
    noise_multiplier: float = 0.0
    hidden_units: int = 32
    seed: int = 7


# ---------------------------------------------------------------- data

def profile_csv(path: Path) -> dict:
    """Summarise an uploaded CSV and say whether it can be used for training."""
    try:
        X, y, features, classes, label = load_csv(path)
        return {"rows": len(y), "columns": len(features) + 1, "label_column": label,
                "classes": len(classes), "trainable": True,
                "note": f"{len(features)} numeric features, label '{label}' with {len(classes)} classes"}
    except DatasetError as exc:
        rows, cols = _count_rows(path)
        return {"rows": rows, "columns": cols, "label_column": None, "classes": 0,
                "trainable": False, "note": str(exc)}


def _count_rows(path: Path) -> tuple[int, int]:
    try:
        with open(path, newline="", encoding="utf-8", errors="replace") as fh:
            reader = csv.reader(fh)
            header = next(reader, [])
            return sum(1 for _ in reader), len(header)
    except OSError:
        return 0, 0


def _to_float(v: str) -> float | None:
    v = v.strip()
    if v == "" or v.lower() in ("na", "nan", "null", "?"):
        return math.nan
    try:
        return float(v)
    except ValueError:
        return None


def load_csv(path: Path):
    """Last column is the label; every other column that is numeric becomes a feature."""
    if path.suffix.lower() not in (".csv", ".txt"):
        raise DatasetError("Only CSV files can be used for training")
    with open(path, newline="", encoding="utf-8", errors="replace") as fh:
        reader = csv.reader(fh)
        header = next(reader, None)
        if not header or len(header) < 2:
            raise DatasetError("CSV needs a header row and at least two columns")
        rows = []
        for i, row in enumerate(reader):
            if i >= MAX_CSV_ROWS:
                break
            if len(row) == len(header):
                rows.append(row)
    if len(rows) < 20:
        raise DatasetError("CSV needs at least 20 data rows")

    label_name = header[-1].strip() or "label"
    labels = [r[-1].strip() for r in rows]
    classes = sorted(set(labels), key=lambda s: (_to_float(s) is None, _to_float(s) or 0, s))
    if len(classes) < 2:
        raise DatasetError(f"Label column '{label_name}' has only one class")
    if len(classes) > 50:
        raise DatasetError(f"Label column '{label_name}' has {len(classes)} distinct values; "
                           "put a categorical label in the last column")

    feature_idx, features = [], []
    for j, name in enumerate(header[:-1]):
        vals = [_to_float(r[j]) for r in rows]
        if all(v is not None for v in vals) and not all(math.isnan(v) for v in vals):
            feature_idx.append(j)
            features.append(name.strip() or f"col{j + 1}")
    if not feature_idx:
        raise DatasetError("No numeric feature columns found")

    X = np.array([[_to_float(r[j]) for j in feature_idx] for r in rows], dtype=float)
    col_means = np.nanmean(X, axis=0)
    nan_r, nan_c = np.where(np.isnan(X))
    X[nan_r, nan_c] = col_means[nan_c]
    index = {c: k for k, c in enumerate(classes)}
    y = np.array([index[v] for v in labels], dtype=int)
    return X, y, features, classes, label_name


def _split(X, y, rng, test_frac=0.2):
    idx = rng.permutation(len(y))
    cut = max(1, int(len(y) * test_frac))
    return X[idx[cut:]], y[idx[cut:]], X[idx[:cut]], y[idx[:cut]]


def _node_names(domain: str, n: int) -> list[str]:
    prefix = NODE_PREFIX.get(domain, "Node")
    return [f"{prefix} {chr(65 + i)}" if i < 26 else f"{prefix} {i + 1}" for i in range(n)]


def synthetic_nodes(num_nodes: int, domain: str, seed: int, n_classes: int = 3, dim: int = 12):
    """Non-IID synthetic data: every node has its own class mix, size and feature shift."""
    rng = np.random.default_rng(seed)
    means = rng.normal(0, 1.0, (n_classes, dim))
    nodes = []
    for name in _node_names(domain, num_nodes):
        n = int(rng.integers(250, 700))
        probs = rng.dirichlet([0.8] * n_classes)
        y = rng.choice(n_classes, size=n, p=probs)
        shift = rng.normal(0, 0.25, dim)
        X = means[y] + rng.normal(0, 1.35, (n, dim)) + shift
        nodes.append(NodeData(name, *_split(X, y, rng)))
    features = [f"feature_{i + 1}" for i in range(dim)]
    classes = [f"Class {chr(65 + k)}" for k in range(n_classes)]
    return nodes, features, classes


def csv_nodes(path: Path, num_nodes: int, domain: str, seed: int):
    """Partition a CSV across nodes with a label-skewed (Dirichlet) split to mimic real silos."""
    X, y, features, classes, _ = load_csv(path)
    rng = np.random.default_rng(seed)
    if len(y) < num_nodes * 10:
        raise DatasetError(f"{len(y)} rows is too few for {num_nodes} nodes")
    buckets: list[list[int]] = [[] for _ in range(num_nodes)]
    for c in range(len(classes)):
        idx = rng.permutation(np.where(y == c)[0])
        props = rng.dirichlet([1.0] * num_nodes)
        cuts = (np.cumsum(props) * len(idx)).astype(int)[:-1]
        for node, part in enumerate(np.split(idx, cuts)):
            buckets[node].extend(part.tolist())
    # Make sure every node has enough rows to train and test on.
    pool = rng.permutation(len(y)).tolist()
    for b in buckets:
        while len(b) < 10:
            b.append(pool.pop())
    # Standardise with statistics that, in a deployment, would come from secure aggregation.
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd[sd == 0] = 1.0
    X = (X - mu) / sd
    nodes = [NodeData(name, *_split(X[np.array(b)], y[np.array(b)], rng))
             for name, b in zip(_node_names(domain, num_nodes), buckets)]
    return nodes, features, [str(c) for c in classes]


# ---------------------------------------------------------------- models

def _softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def init_params(model_type: str, d: int, k: int, hidden: int, rng) -> list[np.ndarray]:
    if model_type == "mlp":
        return [rng.normal(0, math.sqrt(2 / d), (d, hidden)), np.zeros(hidden),
                rng.normal(0, math.sqrt(1 / hidden), (hidden, k)), np.zeros(k)]
    return [np.zeros((d, k)), np.zeros(k)]


def predict_proba(params, X):
    if len(params) == 4:
        h = np.maximum(0, X @ params[0] + params[1])
        return _softmax(h @ params[2] + params[3])
    return _softmax(X @ params[0] + params[1])


def _loss(probs, y):
    return float(-np.mean(np.log(np.clip(probs[np.arange(len(y)), y], 1e-12, None))))


def _grads(params, X, y, k):
    n = len(y)
    onehot = np.eye(k)[y]
    if len(params) == 4:
        z1 = X @ params[0] + params[1]
        h = np.maximum(0, z1)
        p = _softmax(h @ params[2] + params[3])
        dz2 = (p - onehot) / n
        dh = dz2 @ params[2].T
        dz1 = dh * (z1 > 0)
        return [X.T @ dz1, dz1.sum(0), h.T @ dz2, dz2.sum(0)]
    p = _softmax(X @ params[0] + params[1])
    dz = (p - onehot) / n
    return [X.T @ dz, dz.sum(0)]


def _flat_norm(arrays) -> float:
    return float(math.sqrt(sum(float(np.sum(a * a)) for a in arrays)))


# ---------------------------------------------------------------- session

@dataclass
class FederatedSession:
    cfg: TrainingConfig
    nodes: list[NodeData]
    features: list[str]
    classes: list[str]
    params: list[np.ndarray] = field(init=False)
    rng: np.random.Generator = field(init=False)
    started: float = field(init=False)
    rounds_run: int = field(init=False, default=0)

    def __post_init__(self):
        self.rng = np.random.default_rng(self.cfg.seed)
        self.params = init_params(self.cfg.model_type, len(self.features), len(self.classes),
                                  self.cfg.hidden_units, self.rng)
        self.started = time.perf_counter()

    @property
    def k(self) -> int:
        return len(self.classes)

    def _local_train(self, node: NodeData) -> list[np.ndarray]:
        cfg = self.cfg
        w = [p.copy() for p in self.params]
        n = len(node.y_train)
        for _ in range(cfg.local_epochs):
            order = self.rng.permutation(n)
            for start in range(0, n, cfg.batch_size):
                b = order[start:start + cfg.batch_size]
                g = _grads(w, node.X_train[b], node.y_train[b], self.k)
                for i in range(len(w)):
                    step = g[i]
                    if cfg.algorithm == "FedProx" and cfg.mu > 0:
                        step = step + cfg.mu * (w[i] - self.params[i])
                    w[i] -= cfg.learning_rate * step
        return w

    def evaluate(self) -> tuple[float, float, list[dict]]:
        per_node, correct, total, loss_sum = [], 0, 0, 0.0
        for node in self.nodes:
            p = predict_proba(self.params, node.X_test)
            acc = float(np.mean(p.argmax(1) == node.y_test))
            loss = _loss(p, node.y_test)
            per_node.append({"name": node.name, "accuracy": acc, "loss": loss,
                             "train_samples": int(len(node.y_train)),
                             "test_samples": int(len(node.y_test))})
            correct += acc * len(node.y_test)
            loss_sum += loss * len(node.y_test)
            total += len(node.y_test)
        return correct / total, loss_sum / total, per_node

    def run_round(self, rnd: int) -> dict:
        t0 = time.perf_counter()
        self.rounds_run += 1
        cfg = self.cfg
        m = max(1, round(cfg.client_fraction * len(self.nodes)))
        chosen = set(self.rng.choice(len(self.nodes), size=m, replace=False).tolist())

        updates, weights, norms = [], [], {}
        for i, node in enumerate(self.nodes):
            if i not in chosen:
                continue
            local = self._local_train(node)
            delta = [lw - gw for lw, gw in zip(local, self.params)]
            norm = _flat_norm(delta)
            if cfg.dp_enabled and norm > cfg.clip_norm:
                delta = [d * (cfg.clip_norm / norm) for d in delta]
            norms[i] = norm
            updates.append(delta)
            # Under DP every node counts equally so one node cannot dominate the sensitivity bound.
            weights.append(1.0 if cfg.dp_enabled else float(len(node.y_train)))

        total = sum(weights)
        agg = [sum(w * u[j] for w, u in zip(weights, updates)) / total for j in range(len(self.params))]
        if cfg.dp_enabled and cfg.noise_multiplier > 0:
            sigma = cfg.noise_multiplier * cfg.clip_norm / len(updates)
            agg = [a + self.rng.normal(0, sigma, a.shape) for a in agg]
        self.params = [p + a for p, a in zip(self.params, agg)]

        acc, loss, per_node = self.evaluate()
        for i, nd in enumerate(per_node):
            nd["selected"] = i in chosen
            nd["update_norm"] = norms.get(i)
        return {"round": rnd, "accuracy": acc, "loss": loss, "nodes": per_node,
                "duration_ms": int((time.perf_counter() - t0) * 1000)}

    def report(self) -> dict:
        k = self.k
        cm = np.zeros((k, k), dtype=int)
        for node in self.nodes:
            pred = predict_proba(self.params, node.X_test).argmax(1)
            np.add.at(cm, (node.y_test, pred), 1)
        per_class = []
        for c in range(k):
            tp = cm[c, c]
            prec = tp / cm[:, c].sum() if cm[:, c].sum() else 0.0
            rec = tp / cm[c, :].sum() if cm[c, :].sum() else 0.0
            f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
            per_class.append({"class": self.classes[c], "precision": float(prec), "recall": float(rec),
                              "f1": float(f1), "support": int(cm[c, :].sum())})
        acc, loss, per_node = self.evaluate()
        importance = None
        if self.cfg.model_type == "logreg":
            mag = np.linalg.norm(self.params[0], axis=1)
            order = np.argsort(-mag)[:12]
            importance = [{"feature": self.features[i], "weight": float(mag[i])} for i in order]
        privacy = dp_summary(self.cfg.dp_enabled, self.cfg.noise_multiplier, self.cfg.clip_norm, self.rounds_run)
        return {
            "accuracy": acc, "loss": loss,
            "precision": float(np.mean([c["precision"] for c in per_class])),
            "recall": float(np.mean([c["recall"] for c in per_class])),
            "f1": float(np.mean([c["f1"] for c in per_class])),
            "confusion_matrix": cm.tolist(), "classes": self.classes,
            "per_class": per_class, "nodes": per_node,
            "train_samples": int(sum(len(n.y_train) for n in self.nodes)),
            "test_samples": int(sum(len(n.y_test) for n in self.nodes)),
            "features": len(self.features), "feature_importance": importance,
            "training_seconds": round(time.perf_counter() - self.started, 2),
            "privacy_epsilon": privacy["epsilon"],
            "privacy": privacy,
            "parameters": int(sum(p.size for p in self.params)),
        }

    def export_weights(self) -> dict:
        names = ["W1", "b1", "W2", "b2"] if len(self.params) == 4 else ["W", "b"]
        return {"model_type": self.cfg.model_type, "features": self.features, "classes": self.classes,
                "params": {n: p.round(6).tolist() for n, p in zip(names, self.params)}}
