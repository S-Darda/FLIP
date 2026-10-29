"""Model families supported in Phase 1.

linear: multinomial logistic regression (classification) or linear regression (regression)
mlp:    one hidden ReLU layer with a softmax or linear output

Regression targets are expected to be standardised by the caller; the loss is mean squared
error in that standardised space.
"""
import math

import numpy as np

TASKS = ("classification", "regression")
FAMILIES = {"linear": "Linear (logistic / linear regression)", "mlp": "Neural network (MLP)"}


def init_params(family: str, d: int, out: int, hidden: int, rng: np.random.Generator) -> list[np.ndarray]:
    if family == "mlp":
        return [rng.normal(0, math.sqrt(2 / d), (d, hidden)), np.zeros(hidden),
                rng.normal(0, math.sqrt(1 / hidden), (hidden, out)), np.zeros(out)]
    if family == "linear":
        return [np.zeros((d, out)), np.zeros(out)]
    raise ValueError(f"unknown model family {family!r}")


def _softmax(z):
    z = z - z.max(axis=1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(axis=1, keepdims=True)


def _forward(params, X):
    if len(params) == 4:
        z1 = X @ params[0] + params[1]
        h = np.maximum(0, z1)
        return h @ params[2] + params[3], (z1, h)
    return X @ params[0] + params[1], None


def predict(params, X, task: str) -> np.ndarray:
    """Class probabilities (n, k) for classification; predictions (n,) for regression."""
    out, _ = _forward(params, X)
    return _softmax(out) if task == "classification" else out[:, 0]


def loss_and_grads(params, X, y, task: str, out_dim: int):
    n = len(y)
    out, cache = _forward(params, X)
    if task == "classification":
        p = _softmax(out)
        loss = float(-np.mean(np.log(np.clip(p[np.arange(n), y], 1e-12, None))))
        dz = (p - np.eye(out_dim)[y]) / n
    else:
        err = out[:, 0] - y
        loss = float(0.5 * np.mean(err ** 2))
        dz = (err / n)[:, None]
    if len(params) == 4:
        z1, h = cache
        dh = dz @ params[2].T
        dz1 = dh * (z1 > 0)
        return loss, [X.T @ dz1, dz1.sum(0), h.T @ dz, dz.sum(0)]
    return loss, [X.T @ dz, dz.sum(0)]
