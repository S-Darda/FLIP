import math

import numpy as np

from .model import loss_and_grads


def l2_norm(arrays) -> float:
    return float(math.sqrt(sum(float(np.sum(a * a)) for a in arrays)))


def clip(delta: list[np.ndarray], max_norm: float) -> tuple[list[np.ndarray], float]:
    """Scale an update down to L2 norm `max_norm` if it is larger. Returns (update, original norm)."""
    norm = l2_norm(delta)
    if norm > max_norm > 0:
        delta = [d * (max_norm / norm) for d in delta]
    return delta, norm


def local_update(global_params, X, y, task: str, out_dim: int, *, epochs: int, batch_size: int,
                 lr: float, mu: float, rng: np.random.Generator) -> list[np.ndarray]:
    """Mini-batch SGD from the global weights. mu > 0 adds the FedProx proximal term.
    Returns the weight *update* (local - global), which is all a site sends back."""
    w = [p.copy() for p in global_params]
    n = len(y)
    for _ in range(epochs):
        order = rng.permutation(n)
        for start in range(0, n, batch_size):
            b = order[start:start + batch_size]
            _, g = loss_and_grads(w, X[b], y[b], task, out_dim)
            for i in range(len(w)):
                step = g[i] + mu * (w[i] - global_params[i]) if mu > 0 else g[i]
                w[i] -= lr * step
    return [lw - gw for lw, gw in zip(w, global_params)]
