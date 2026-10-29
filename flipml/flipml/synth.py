"""Synthetic site datasets for simulations, demos and tests. Contains no real records."""
import numpy as np


def classification_sites(n_sites: int, seed: int, n_classes: int = 3, dim: int = 10) -> list[dict]:
    """Non-IID tabular classification: each site has its own class mix, size and feature shift."""
    rng = np.random.default_rng(seed)
    means = rng.normal(0, 1.0, (n_classes, dim))
    out = []
    for _ in range(n_sites):
        n = int(rng.integers(250, 700))
        y = rng.choice(n_classes, size=n, p=rng.dirichlet([0.8] * n_classes))
        X = means[y] + rng.normal(0, 1.35, (n, dim)) + rng.normal(0, 0.25, dim)
        cols = {f"feature_{j + 1}": np.round(X[:, j], 4) for j in range(dim)}
        cols["label"] = np.array([f"class_{chr(97 + c)}" for c in y])
        out.append(cols)
    return out


def regression_sites(n_sites: int, seed: int, dim: int = 8) -> list[dict]:
    rng = np.random.default_rng(seed)
    w = rng.normal(0, 1.0, dim)
    out = []
    for _ in range(n_sites):
        n = int(rng.integers(250, 700))
        shift = rng.normal(0, 0.4, dim)
        X = rng.normal(0, 1.0, (n, dim)) + shift
        y = 50 + 8 * (X @ w) + rng.normal(0, 6.0, n)
        cols = {f"feature_{j + 1}": np.round(X[:, j], 4) for j in range(dim)}
        cols["target"] = np.round(y, 3)
        out.append(cols)
    return out


def readmission_site(seed: int, n: int, age_shift: float = 0.0, severity: float = 1.0) -> dict:
    """Hospital-style readmission table; each hospital gets a different case mix."""
    rng = np.random.default_rng(seed)
    age = (rng.normal(64 + age_shift, 14, n)).clip(18, 98)
    stay = (rng.gamma(2.2 * severity, 2.0, n)).clip(1, 40)
    prior = rng.poisson(1.1 * severity, n)
    meds = rng.poisson(9, n)
    hba1c = rng.normal(6.8, 1.3, n).clip(4, 14)
    bmi = rng.normal(28, 5.5, n).clip(15, 55)
    z = -6.2 + 0.03 * age + 0.11 * stay + 0.55 * prior + 0.06 * meds + 0.25 * hba1c + 0.02 * bmi
    y = rng.random(n) < 1 / (1 + np.exp(-z))
    los = 2 + 0.4 * stay + 0.05 * age + rng.normal(0, 1.5, n)
    return {"age": np.round(age), "length_of_stay": np.round(stay, 1), "prior_admissions": prior,
            "num_medications": meds, "hba1c": np.round(hba1c, 1), "bmi": np.round(bmi, 1),
            "discharge_los_days": np.round(los, 1), "readmitted": np.where(y, "yes", "no")}
