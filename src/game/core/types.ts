export type MarbleCount = 20 | 100;
export type Phase = "ready" | "countdown" | "running" | "paused" | "finished" | "disposed";
export type Obstacle = {
  id: string;
  kind: "wall" | "circle" | "bumper" | "rotor" | "moving-platform";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  speed: number;
  /** Right-edge rotor origin; the rectangle extends along local negative x. */
  pivot?: "right";
  motion?: { end: { x: number; y: number }; periodTicks: number; phaseTicks: number };
  color?: string;
  restitution?: number;
};
export type Scene = {
  physicsProfile?: "classic-v1" | "arcade-flow-v1";
  finishPace?: "dramatic-v1";
  finishAir?: "pulse-v1" | "pulse-v2";
  stages?: readonly { y: number; title: string }[];
  id: string;
  width: number;
  height: number;
  obstacles: readonly Obstacle[];
  startLayout?: {
    version: "expanded-start-v1";
    columns: number; rows: number; spacing: number;
    bounds: { x: number; y: number; width: number; height: number };
    courseOffset: { x: number; y: number };
  };
  initialVelocities?: readonly { x: number; y: number }[];
  spawnSlots?: readonly { x: number; y: number }[];
  theme?: "neutral" | "night" | "pastel";
  finish?: { left: number; right: number; y: number };
};
export type Pose = { x: number; y: number; rotation: number };
export type AirBurst = { tick: number; x: number; y: number; count: number };
export interface PhysicsAdapter {
  readonly airBurst?: AirBurst;
  readonly impacts?: ReadonlyMap<string, number>;
  readonly flowStats?: { kicks: number; assists: number; airBursts?: number; airLifts?: number } | null;
  readonly marbleCount: number;
  readonly marbleStates?: Uint8Array;
  retireMarbles?(indices: readonly number[]): void;
  readonly poses: readonly Pose[];
  readonly previous: readonly Pose[];
  step(tick: number): void;
  counts(): { bodies: number; colliders: number; awake: number };
  dispose(): void;
}
export const FIXED_DT = 1 / 60;
export const PROFILE = {
  id: "classic-v1-p0",
  radius: 0.22,
  mass: 1,
  friction: 0.35,
  restitution: 0.25,
  bumperRestitution: 0.9,
  solverIterations: 4,
  ccd: true,
} as const;
