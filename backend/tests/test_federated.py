import math

import numpy as np
import pytest

from flipml import finalize, finalize_moments, init_params, merge_moments, merge_stats, synth
from flipml.site import SiteData, TaskRejected, handle


def _federate(task, family="linear", rounds=12, clip=None):
    gen, target = (synth.classification_sites, "label") if task == "classification" else (synth.regression_sites, "target")
    sites = [SiteData.from_arrays(c) for c in gen(3, 5)]
    feats = [h for h in sites[0].header if h != target]
    classes = next(c["values"] for c in sites[0].schema()["columns"] if c["name"] == target) if task == "classification" else None
    base = {"task": task, "features": feats, "target": target, "classes": classes, "seed": 3}
    preps = [handle(s, "prepare", base) for s in sites]
    mean, std = finalize_moments(merge_moments([p["moments"] for p in preps]))
    prep = {"mean": mean, "std": std}
    if task == "regression":
        tm, ts = finalize_moments(merge_moments([p["target_moments"] for p in preps]))
        prep.update(target_mean=tm[0], target_std=ts[0])
    params = init_params(family, len(feats), len(classes) if classes else 1, 32, np.random.default_rng(0))
    common = {**base, "prep": prep, "family": family}
    first = res = None
    for r in range(rounds):
        res = [handle(s, "train", {**common, "params": [p.tolist() for p in params], "epochs": 1, "batch_size": 32,
                                   "lr": 0.1, "mu": 0.0, "round": r, "clip": clip}) for s in sites]
        tot = sum(x["n"] for x in res)
        params = [p + sum(np.asarray(x["delta"][i]) * x["n"] for x in res) / tot for i, p in enumerate(params)]
        m = finalize(merge_stats([handle(s, "eval", {**common, "params": [p.tolist() for p in params]}) for s in sites]), classes)
        first = first or m
    return sites, common, params, first, m, res


def test_classification_learns_with_aggregate_metrics():
    _, _, _, first, last, _ = _federate("classification")
    assert last["loss"] < first["loss"]
    assert last["accuracy"] > 0.7 and last["auroc"] > 0.8
    assert 0 <= last["ece"] <= 1 and len(last["calibration"]) == 20


def test_regression_learns():
    _, _, _, first, last, _ = _federate("regression")
    assert last["rmse"] < first["rmse"] and last["r2"] > 0.5


def test_clipping_bounds_each_update():
    *_, res = _federate("classification", rounds=1, clip=0.05)
    assert all(math.sqrt(sum(np.sum(np.asarray(d) ** 2) for d in x["delta"])) <= 0.05 + 1e-9 for x in res)


def test_site_rejects_unsafe_tasks():
    sites, common, params, *_ = _federate("classification", rounds=1)
    s = sites[0]
    with pytest.raises(TaskRejected):
        handle(s, "exec", common)  # only prepare / train / eval exist
    with pytest.raises(TaskRejected):
        handle(s, "eval", {**common, "features": ["../../etc/passwd"]})
    with pytest.raises(TaskRejected):
        handle(s, "train", {**common, "params": [p.tolist() for p in params], "epochs": 500, "batch_size": 32, "lr": 0.1, "mu": 0})
    with pytest.raises(TaskRejected):
        handle(s, "eval", {**common, "params": [[1.0]]})  # wrong shapes
    # Evaluation output is aggregate only: counts, sums and histograms.
    out = handle(s, "eval", {**common, "params": [p.tolist() for p in params]})
    assert set(out) == {"task", "n", "loss_sum", "confusion", "score_hist", "calib_count", "calib_conf", "calib_correct"}


def test_schema_hides_rare_category_values():
    from flipml.site import profile
    rows = [[str(i), "common"] for i in range(30)] + [["99", "rare_name"]]
    col = profile(["x", "cat"], rows)["columns"][1]
    assert col["values"] == ["common"] and col["distinct"] == 2


def test_dp_accountant_behaves():
    from app.privacy import epsilon_for_releases, gaussian_epsilon, summary
    assert gaussian_epsilon(0, 10) is None
    e10, e40 = gaussian_epsilon(1.0, 10), gaussian_epsilon(1.0, 40)
    assert 0 < e10 < e40
    assert gaussian_epsilon(2.0, 40) < e40
    rho = 100 / (2 * 1.1 ** 2)
    e = gaussian_epsilon(1.1, 100)
    assert rho < e <= rho + 2 * math.sqrt(rho * math.log(1e5))
    # Composition across trials equals one long run with the same noise.
    assert abs(epsilon_for_releases([(1.0, 10), (1.0, 30)]) - e40) < 1e-9
    assert epsilon_for_releases([(1.0, 10), (0.0, 5)]) is None
    assert summary(False, 0.5, 1.0, 10)["guarantee"] is False
    s = summary(True, 1.0, 1.0, 10)
    assert s["guarantee"] and s["unit"] == "client" and s["epsilon"] == e10
