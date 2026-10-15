/** A versioned, position-only modifier. Every marble uses the same finish band. */
export const FINISH_PACE = {
  version: "dramatic-v1",
  approachDistance: 12,
  fullDistance: 5,
  maxLinearDamping: 6,
} as const;

/** Smooth drag ramp; zero outside the approach and after the finish line. */
export function finishDamping(y: number, finishY: number): number {
  const distance = finishY - y;
  if (distance <= 0 || distance >= FINISH_PACE.approachDistance) return 0;
  const progress = Math.min(1, (FINISH_PACE.approachDistance - distance) /
    (FINISH_PACE.approachDistance - FINISH_PACE.fullDistance));
  const smooth = progress * progress * (3 - 2 * progress);
  return FINISH_PACE.maxLinearDamping * smooth;
}
