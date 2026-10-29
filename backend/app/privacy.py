"""Differential-privacy accounting for DP-FedAvg/FedProx runs.

Mechanism (see federated.py): each selected client's update is clipped to L2 norm C, the
coordinator averages the clipped updates with equal weights and adds Gaussian noise with
std z*C/m to the average. That equals adding N(0, (zC)^2) to the *sum*, whose sensitivity to
adding or removing one client is C, so each round is a Gaussian mechanism with noise
multiplier z at the **client level** (one client's entire contribution is the protected unit).

Accountant: Rényi DP of the Gaussian mechanism, eps_RDP(alpha) = alpha / (2 z^2) per round,
composed linearly over rounds, converted to (eps, delta) with the conversion of
Balle et al. (2020), minimised over a grid of orders. No privacy amplification from client
subsampling is claimed, so the figure is conservative when only some clients join a round.
Assumes the number of participants per round is public, as in standard DP-FedAvg.
"""
import math

DEFAULT_DELTA = 1e-5
ORDERS = [1 + x / 10 for x in range(1, 100)] + list(range(12, 64)) + [80, 96, 128, 192, 256, 512]

UNIT = "client"
ACCOUNTANT = "RDP, Gaussian mechanism, no subsampling amplification"


def gaussian_epsilon(noise_multiplier: float, rounds: int, delta: float = DEFAULT_DELTA) -> float | None:
    """(epsilon, delta)-DP spent after `rounds` releases. None if there is no noise (no guarantee)."""
    if noise_multiplier <= 0 or rounds <= 0:
        return None
    best = math.inf
    for a in ORDERS:
        rdp = rounds * a / (2 * noise_multiplier ** 2)
        eps = rdp + math.log((a - 1) / a) - (math.log(delta) + math.log(a)) / (a - 1)
        best = min(best, eps)
    return max(0.0, best)


def summary(dp_enabled: bool, noise_multiplier: float, clip_norm: float, rounds_run: int,
            delta: float = DEFAULT_DELTA) -> dict:
    """What the report says about privacy, including when no formal guarantee applies."""
    if not dp_enabled or noise_multiplier <= 0:
        return {"guarantee": False, "unit": None, "epsilon": None, "delta": None,
                "note": "No differential privacy. Individual updates were clipped only if DP was on; "
                        "the trained model and metrics carry no formal privacy guarantee."}
    eps = gaussian_epsilon(noise_multiplier, rounds_run, delta)
    return {"guarantee": True, "unit": UNIT, "epsilon": eps, "delta": delta, "accountant": ACCOUNTANT,
            "noise_multiplier": noise_multiplier, "clip_norm": clip_norm, "rounds": rounds_run,
            "note": "Client-level (epsilon, delta)-DP for the released global model under the stated mechanism. "
                    "It does not cover metadata such as round participation or timing."}
