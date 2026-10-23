/** Fixed-tick, seed-derived charges; never depends on rendering or wall-clock time. */
export const COLLISION_POP = {
  version: "random-v1",
  firstMinTicks: 18,
  firstMaxTicks: 90,
  cooldownMinTicks: 48,
  cooldownMaxTicks: 144,
  minImpulse: 3.8,
  maxImpulse: 6.2,
  effectTicks: 27,
  maxVisibleBursts: 32,
} as const;

export function popRandom(seed: number, index: number, cycle: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(cycle + 1, 0x85ebca6b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 0x100000000;
}

export function popDelay(seed: number, index: number, cycle: number): number {
  const min = cycle === 0 ? COLLISION_POP.firstMinTicks : COLLISION_POP.cooldownMinTicks;
  const max = cycle === 0 ? COLLISION_POP.firstMaxTicks : COLLISION_POP.cooldownMaxTicks;
  return min + Math.floor(popRandom(seed, index, cycle) * (max - min + 1));
}
