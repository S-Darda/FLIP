"""flipml: the training and evaluation code shared by the FLIP coordinator and site agents.

Everything here is plain numpy and deterministic given a seed, so a site agent and the
in-process simulator compute exactly the same updates and statistics. Nothing in this
package sends data anywhere; callers decide what leaves a site, and the evaluation helpers
only ever return aggregate counts and sums.
"""
from .model import FAMILIES, TASKS, init_params, loss_and_grads, predict
from .preprocess import finalize_moments, merge_moments, moments, standardize, target_moments
from .stats import eval_stats, finalize, merge_stats
from .train import clip, l2_norm, local_update

__all__ = [
    "FAMILIES", "TASKS", "init_params", "loss_and_grads", "predict",
    "moments", "merge_moments", "finalize_moments", "standardize", "target_moments",
    "eval_stats", "merge_stats", "finalize",
    "local_update", "clip", "l2_norm",
]

PROTOCOL_VERSION = 1
