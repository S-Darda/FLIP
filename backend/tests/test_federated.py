import numpy as np

from app.federated import FederatedSession, TrainingConfig, synthetic_nodes


def _session(**kw):
    cfg = TrainingConfig(num_nodes=4, **kw)
    nodes, features, classes = synthetic_nodes(cfg.num_nodes, "Healthcare", seed=11)
    return FederatedSession(cfg, nodes, features, classes)


def test_fedavg_learns():
    s = _session(rounds=15)
    first = s.run_round(1)
    for r in range(2, 16):
        last = s.run_round(r)
    assert last["loss"] < first["loss"]
    assert last["accuracy"] > 0.6
    assert {n["name"] for n in last["nodes"]} == {"Hospital A", "Hospital B", "Hospital C", "Hospital D"}


def test_mlp_and_report_shape():
    s = _session(model_type="mlp", learning_rate=0.05)
    for r in range(1, 6):
        s.run_round(r)
    rep = s.report()
    k = len(rep["classes"])
    assert np.array(rep["confusion_matrix"]).shape == (k, k)
    assert 0 <= rep["f1"] <= 1 and rep["feature_importance"] is None


def test_dp_clips_updates():
    s = _session(dp_enabled=True, clip_norm=0.05, noise_multiplier=0.0, learning_rate=0.5)
    before = [p.copy() for p in s.params]
    s.run_round(1)
    step = np.sqrt(sum(np.sum((a - b) ** 2) for a, b in zip(s.params, before)))
    # The average of updates each clipped to 0.05 can't move further than 0.05.
    assert step <= 0.05 + 1e-9


def test_dp_accountant_behaves():
    from app.privacy import gaussian_epsilon, summary
    assert gaussian_epsilon(0, 10) is None
    e10, e40 = gaussian_epsilon(1.0, 10), gaussian_epsilon(1.0, 40)
    assert 0 < e10 < e40  # budget grows with rounds
    assert gaussian_epsilon(2.0, 40) < e40  # more noise, less spent
    # Cross-check against the zCDP closed form: rho = T / (2 z^2), eps <= rho + 2 sqrt(rho ln(1/delta)).
    import math
    rho = 100 / (2 * 1.1 ** 2)
    e = gaussian_epsilon(1.1, 100)
    assert rho < e <= rho + 2 * math.sqrt(rho * math.log(1e5))
    assert summary(False, 0.5, 1.0, 10)["guarantee"] is False
    s = summary(True, 1.0, 1.0, 10)
    assert s["guarantee"] and s["unit"] == "client" and s["epsilon"] == e10
