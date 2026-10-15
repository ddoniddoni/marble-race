import type { Obstacle } from "./types";

/** Integer-tick triangular motion; shared by initial placement and every step. */
export function platformPosition(object: Obstacle, tick: number) {
  const motion = object.motion;
  if (!motion) throw new Error("왕복 장애물의 이동 정보가 없습니다.");
  const phase = ((tick + motion.phaseTicks) % motion.periodTicks) / motion.periodTicks;
  const fraction = 1 - Math.abs(2 * phase - 1);
  return {
    x: object.x + (motion.end.x - object.x) * fraction,
    y: object.y + (motion.end.y - object.y) * fraction,
  };
}
