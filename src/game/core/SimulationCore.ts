import { FixedStepper } from "./FixedStepper";
import type { PhysicsAdapter, Phase, Pose } from "./types";

export class SimulationCore {
  readonly clock = new FixedStepper();
  phase: Phase = "ready";
  tick = 0;
  private physics: PhysicsAdapter;
  constructor(
    private readonly createPhysics: () => PhysicsAdapter,
    private readonly afterTick?: (tick: number, previous: readonly Pose[], poses: readonly Pose[]) => boolean,
  ) {
    this.physics = createPhysics();
  }
  get marbleStates() { return this.physics.marbleStates; }
  retireMarbles(indices: readonly number[]) { this.physics.retireMarbles?.(indices); }
  get flowStats() { return this.physics.flowStats ?? null; }
  get collisionBursts() { return this.physics.collisionBursts; }
  get airBurst() { return this.physics.airBurst; }
  get impacts() {
    return this.physics.impacts;
  }
  get poses() {
    return this.physics.poses;
  }
  get previous() {
    return this.physics.previous;
  }
  get marbleCount() {
    return this.physics.marbleCount;
  }
  counts() {
    return this.physics.counts();
  }
  start() {
    if (this.phase !== "disposed" && this.phase !== "finished") this.phase = "running";
  }
  pause() {
    if (this.phase === "running" || this.phase === "countdown") this.phase = "paused";
    this.clock.clear();
  }
  advance(delta: number) {
    if (this.phase !== "running") return { steps: 0, alpha: 1 };
    return this.clock.advance(delta, () => {
      if (this.phase !== "running") return;
      this.physics.step(this.tick + 1);
      this.tick++;
      if (this.afterTick?.(this.tick, this.previous, this.poses) === false)
        this.phase = "finished";
    });
  }
  reset() {
    if (this.phase === "disposed") return;
    // Construct first so a failed allocation leaves the existing world disposable.
    const next = this.createPhysics();
    this.physics.dispose();
    this.physics = next;
    this.tick = 0;
    this.clock.reset();
    this.phase = "ready";
  }
  dispose() {
    if (this.phase === "disposed") return;
    this.physics.dispose();
    this.clock.reset();
    this.phase = "disposed";
  }
}
