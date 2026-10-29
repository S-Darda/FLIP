"""Federated standardisation: each site reports per-feature counts, sums and sums of squares
(aggregates only); the coordinator merges them into global means and standard deviations."""
import numpy as np


def moments(X: np.ndarray) -> dict:
    """NaN-aware per-column sufficient statistics."""
    mask = ~np.isnan(X)
    Xz = np.where(mask, X, 0.0)
    return {"count": mask.sum(0).astype(float).tolist(), "sum": Xz.sum(0).tolist(),
            "sumsq": (Xz ** 2).sum(0).tolist()}


def target_moments(y: np.ndarray) -> dict:
    return moments(y.reshape(-1, 1).astype(float))


def merge_moments(items: list[dict]) -> dict:
    keys = ("count", "sum", "sumsq")
    return {k: np.sum([np.asarray(m[k], float) for m in items], axis=0).tolist() for k in keys}


def finalize_moments(m: dict) -> tuple[list[float], list[float]]:
    count = np.maximum(np.asarray(m["count"], float), 1.0)
    mean = np.asarray(m["sum"], float) / count
    var = np.asarray(m["sumsq"], float) / count - mean ** 2
    std = np.sqrt(np.maximum(var, 0.0))
    std[std < 1e-9] = 1.0
    return mean.tolist(), std.tolist()


def standardize(X: np.ndarray, mean, std) -> np.ndarray:
    """Impute missing values with the global mean, then scale to zero mean and unit variance."""
    mean, std = np.asarray(mean, float), np.asarray(std, float)
    X = np.where(np.isnan(X), mean, X)
    return (X - mean) / std
