import type { Scene } from "./types";

export const FINISH_AIR = {
  version: "pulse-v1",
  topDistance: 5,
  bottomDistance: 1.7,
  sidePadding: 0.8,
  cooldownTicks: 72,
  liftSpeed: 6.8,
  maxLiftImpulse: 30,
  sideImpulse: 1.4,
  holdTicks: 24,
  recoverTicks: 18,
} as const;

// Preserve the original pulse preset for older serialized maps.
export const FINISH_AIR_STRONG = {
  ...FINISH_AIR,
  version: "pulse-v2",
  liftSpeed: 10.5,
  maxLiftImpulse: 34,
  sideImpulse: 1.8,
  holdTicks: 36,
  recoverTicks: 24,
} as const;
export type FinishAirProfile = typeof FINISH_AIR | typeof FINISH_AIR_STRONG;
export function finishAirProfile(version: NonNullable<Scene["finishAir"]> = "pulse-v1"): FinishAirProfile {
  return version === "pulse-v2" ? FINISH_AIR_STRONG : FINISH_AIR;
}

export function finishAirZone(finish: NonNullable<Scene["finish"]>, profile: FinishAirProfile = FINISH_AIR) {
  return { x: (finish.left + finish.right) / 2, y: finish.y - profile.bottomDistance,
    left: finish.left - profile.sidePadding, right: finish.right + profile.sidePadding,
    top: finish.y - profile.topDistance, bottom: finish.y - profile.bottomDistance };
}

/** Give the gust time to lift a marble, then smoothly restore its usual finish drag. */
export function airDamping(base: number, age: number, profile: FinishAirProfile = FINISH_AIR) {
  if (age < profile.holdTicks) return 0;
  if (age >= profile.holdTicks + profile.recoverTicks) return base;
  const t = (age - profile.holdTicks) / profile.recoverTicks;
  return base * t * t * (3 - 2 * t);
}
