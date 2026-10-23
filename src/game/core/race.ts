import { FIXED_DT, type Pose, type Scene } from "./types";

// mulberry32-v1 for start assignment. Collision charges use a separate seed-derived stream.
export function shuffledStart(scene: Scene, seed: number, count: number, slots: readonly { x: number; y: number }[], compact = false): Scene {
  let state = seed >>> 0;
  const uint32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = Math.imul(state ^ (state >>> 15), state | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return (n ^ (n >>> 14)) >>> 0;
  };
  const bounded = (bound: number) => {
    const limit = Math.floor(0x100000000 / bound) * bound;
    let n: number;
    do { n = uint32(); } while (n >= limit);
    return n % bound;
  };
  const available = slots.map((slot) => ({ ...slot }));
  if (compact) {
    const centerX = available.reduce((sum, p) => sum + p.x, 0) / available.length;
    const centerY = available.reduce((sum, p) => sum + p.y, 0) / available.length;
    const score = (p: { x: number; y: number }) => Math.abs(p.y - centerY) * 100 + Math.abs(p.x - centerX);
    available.sort((a, b) => score(a) - score(b) || a.x - b.x || a.y - b.y);
  }
  const shuffled = compact ? available.slice(0, count) : available;
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = bounded(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  if (available.length < count) throw new Error("모든 구슬이 함께 출발할 슬롯이 부족합니다.");
  return {
    ...scene,
    raceSeed: seed >>> 0,
    spawnSlots: shuffled.slice(0, count),
    initialVelocities: Array.from({ length: count }, () => ({
      x: (uint32() / 0x100000000 - 0.5) * 2.6,
      y: uint32() / 0x100000000 * 0.5,
    })),
  };
}

// First-finisher mode: stop the entire world on the first crossing tick.
// No finisher remains active to block subsequent competitors.
export class FirstFinishRace {
  winners: number[] = [];
  finishSeconds: number | null = null;
  timedOut = false;
  constructor(private readonly count: number, private readonly finish: NonNullable<Scene["finish"]>) {}
  step(tick: number, previous: readonly Pose[], poses: readonly Pose[]) {
    const crossings: { index: number; key: number; fraction: number }[] = [];
    for (let i = 0; i < this.count; i++) {
      const before = previous[i]!, after = poses[i]!;
      if (before.y < this.finish.y && after.y >= this.finish.y) {
        const fraction = (this.finish.y - before.y) / (after.y - before.y);
        const x = before.x + (after.x - before.x) * fraction;
        if (x >= this.finish.left && x <= this.finish.right)
          crossings.push({ index: i, key: Math.round(fraction * 1_000_000), fraction });
      }
    }
    crossings.sort((a, b) => a.key - b.key || a.index - b.index);
    if (crossings.length) {
      const first = crossings[0]!;
      this.winners = crossings.filter((c) => c.key === first.key).map((c) => c.index);
      this.finishSeconds = (tick - 1 + first.fraction) * FIXED_DT;
      return false;
    }
    if (tick >= 7200) { this.timedOut = true; return false; }
    return true;
  }
}


export type FinishEntry = {
  index: number; rank: number | null; seconds: number | null; status: "finished" | "dnf";
};
/** Accumulate every finish; keep stepping until all entrants have a terminal result. */
export class AllFinishRace {
  readonly entries: FinishEntry[] = [];
  readonly settled: Uint8Array;
  newlySettled: number[] = [];
  winners: number[] = [];
  finishSeconds: number | null = null;
  completed = 0;
  dnf = 0;
  readonly timedOut = false;
  constructor(private readonly count: number, private readonly finish: NonNullable<Scene["finish"]>,
    private readonly bounds: { width: number; height: number }) {
    this.settled = new Uint8Array(count);
  }
  step(tick: number, previous: readonly Pose[], poses: readonly Pose[], states?: Uint8Array) {
    this.newlySettled = [];
    const crossings: { index: number; key: number; fraction: number }[] = [];
    const escaped: number[] = [];
    for (let i = 0; i < this.count; i++) {
      if (this.settled[i] || (states && states[i] !== 1)) continue;
      const before = previous[i]!, after = poses[i]!;
      if (before.y < this.finish.y && after.y >= this.finish.y) {
        const fraction = (this.finish.y - before.y) / (after.y - before.y);
        const x = before.x + (after.x - before.x) * fraction;
        if (x >= this.finish.left && x <= this.finish.right) {
          crossings.push({ index: i, key: Math.round(fraction * 1_000_000), fraction });
          continue;
        }
      }
      if (after.x < -1 || after.x > this.bounds.width + 1 || after.y > this.bounds.height + 1)
        escaped.push(i);
    }
    crossings.sort((a, b) => a.key - b.key || a.index - b.index);
    let rank = this.completed + 1, lastKey = -1;
    for (const crossing of crossings) {
      if (lastKey !== -1 && crossing.key !== lastKey) rank = this.completed + 1;
      const seconds = (tick - 1 + crossing.fraction) * FIXED_DT;
      this.entries.push({ index: crossing.index, rank, seconds, status: "finished" });
      if (rank === 1) this.winners.push(crossing.index);
      this.completed++;
      this.settled[crossing.index] = 1;
      this.newlySettled.push(crossing.index);
      this.finishSeconds = seconds;
      lastKey = crossing.key;
    }
    for (const index of escaped) {
      this.entries.push({ index, rank: null, seconds: null, status: "dnf" });
      this.settled[index] = 1;
      this.newlySettled.push(index);
      this.dnf++;
    }
    // No first-finish or global timeout stop. Waiting/unfinished balls remain in the race.
    return this.completed + this.dnf < this.count;
  }
}
