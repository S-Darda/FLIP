// Mirror of backend/app/privacy.py so the training dialog can preview the budget before a run.
const ORDERS = [
  ...Array.from({ length: 99 }, (_, i) => 1 + (i + 1) / 10),
  ...Array.from({ length: 52 }, (_, i) => 12 + i),
  80, 96, 128, 192, 256, 512,
]

export const DEFAULT_DELTA = 1e-5

/** (epsilon, delta) after composing runs given as [noiseMultiplier, rounds]; null if any run had no noise. */
export function epsilonForReleases(releases, delta = DEFAULT_DELTA) {
  const rel = releases.filter(([, r]) => r > 0)
  if (!rel.length) return 0
  if (rel.some(([z]) => !(z > 0))) return null
  let best = Infinity
  for (const a of ORDERS) {
    const rdp = rel.reduce((s, [z, r]) => s + (r * a) / (2 * z * z), 0)
    const eps = rdp + Math.log((a - 1) / a) - (Math.log(delta) + Math.log(a)) / (a - 1)
    if (eps < best) best = eps
  }
  return Math.max(0, best)
}

/** Client-level (epsilon, delta) for `rounds` Gaussian releases with noise multiplier z. */
export function gaussianEpsilon(z, rounds, delta = DEFAULT_DELTA) {
  if (!(z > 0) || !(rounds > 0)) return null
  return epsilonForReleases([[z, rounds]], delta)
}

/** Releases already spent by a study's DP runs (mirrors backend policy.released). */
export function studyReleases(trainings = []) {
  const active = ['Queued', 'In Progress']
  return trainings.filter(t => t.dp_enabled && (t.status === 'Completed' || active.includes(t.status) || t.current_round))
    .map(t => [t.noise_multiplier, active.includes(t.status) ? t.rounds : t.current_round])
}
