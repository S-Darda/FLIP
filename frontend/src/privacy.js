// Mirror of backend/app/privacy.py so the training dialog can preview the budget before a run.
const ORDERS = [
  ...Array.from({ length: 99 }, (_, i) => 1 + (i + 1) / 10),
  ...Array.from({ length: 52 }, (_, i) => 12 + i),
  80, 96, 128, 192, 256, 512,
]

export const DEFAULT_DELTA = 1e-5

/** Client-level (epsilon, delta) for `rounds` Gaussian releases with noise multiplier z. */
export function gaussianEpsilon(z, rounds, delta = DEFAULT_DELTA) {
  if (!(z > 0) || !(rounds > 0)) return null
  let best = Infinity
  for (const a of ORDERS) {
    const rdp = (rounds * a) / (2 * z * z)
    const eps = rdp + Math.log((a - 1) / a) - (Math.log(delta) + Math.log(a)) / (a - 1)
    if (eps < best) best = eps
  }
  return Math.max(0, best)
}
