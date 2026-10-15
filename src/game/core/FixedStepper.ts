import { FIXED_DT } from "./types";

export class FixedStepper {
  private accumulator = 0;
  droppedSeconds = 0;
  advance(deltaSeconds: number, step: () => void) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("Invalid frame delta");
    const accepted = Math.min(deltaSeconds, 0.1);
    this.droppedSeconds += deltaSeconds - accepted;
    this.accumulator += accepted;
    let steps = 0;
    while (this.accumulator + 1e-10 >= FIXED_DT && steps < 8) {
      step();
      this.accumulator = Math.max(0, this.accumulator - FIXED_DT);
      steps++;
    }
    if (this.accumulator >= FIXED_DT) {
      const dropped = Math.floor(this.accumulator / FIXED_DT) * FIXED_DT;
      this.droppedSeconds += dropped;
      this.accumulator -= dropped;
    }
    return { steps, alpha: this.accumulator / FIXED_DT };
  }
  clear() {
    this.accumulator = 0;
  }
  reset() {
    this.clear();
    this.droppedSeconds = 0;
  }
}
