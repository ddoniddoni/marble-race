import type { Collider, RigidBody, World } from "@dimforge/rapier2d-compat";
import { COLLISION_POP, popDelay, popRandom } from "../core/collisionPop";
import type { CollisionBurst } from "../core/types";

/** Uses Rapier's actual contacts, including contacts between internal substeps. */
export class CollisionPop {
  readonly bursts: CollisionBurst[] = [];
  total = 0;
  private readonly readyAt: Float64Array;
  private readonly cycles: Uint32Array;
  private readonly indices = new Map<number, number>();
  constructor(count: number, private readonly startY: number, private readonly finishY: number,
    private readonly seed: number, colliders: readonly Collider[]) {
    this.readyAt = new Float64Array(count).fill(-1);
    this.cycles = new Uint32Array(count);
    colliders.forEach((collider, index) => this.indices.set(collider.handle, index));
  }
  step(world: World, marbles: readonly RigidBody[], colliders: readonly Collider[], states: Uint8Array,
    tick: number, onPop: (index: number, y: number) => void) {
    while (this.bursts.length && tick - this.bursts[0]!.tick >= COLLISION_POP.effectTicks) this.bursts.shift();
    const inStage = (index: number) => {
      if (states[index] !== 1) return false;
      const y = marbles[index]!.translation().y;
      return y >= this.startY && y < this.finishY;
    };
    // Initialize every entrant before considering pairs, independent of contact enumeration order.
    for (let index = 0; index < marbles.length; index++) {
      if (inStage(index) && this.readyAt[index] === -1)
        this.readyAt[index] = tick + popDelay(this.seed, index, 0);
    }
    for (let a = 0; a < marbles.length; a++) {
      if (!inStage(a) || tick < this.readyAt[a]!) continue;
      const candidates: number[] = [];
      world.contactPairsWith(colliders[a]!, (other) => {
        const b = this.indices.get(other.handle);
        if (b !== undefined && b > a && inStage(b) && tick >= this.readyAt[b]!) candidates.push(b);
      });
      candidates.sort((a, b) => a - b);
      for (const b of candidates) {
        let touching = false;
        world.contactPair(colliders[a]!, colliders[b]!, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            if (manifold.contactDist(i) <= 0.01) touching = true;
        });
        if (!touching) continue;
        const left = marbles[a]!, right = marbles[b]!;
        const pa = left.translation(), pb = right.translation();
        const dx = pb.x - pa.x, dy = pb.y - pa.y, distance = Math.hypot(dx, dy);
        const angle = popRandom(this.seed, a, b) * Math.PI * 2;
        const nx = distance > 0.00001 ? dx / distance : Math.cos(angle);
        const ny = distance > 0.00001 ? dy / distance : Math.sin(angle);
        const impulse = COLLISION_POP.minImpulse + popRandom(this.seed, a + b, this.total + 1) *
          (COLLISION_POP.maxImpulse - COLLISION_POP.minImpulse);
        left.applyImpulse({ x: -nx * impulse, y: -ny * impulse }, true);
        right.applyImpulse({ x: nx * impulse, y: ny * impulse }, true);
        for (const index of [a, b]) {
          this.cycles[index] = this.cycles[index]! + 1;
          this.readyAt[index] = tick + popDelay(this.seed, index, this.cycles[index]!);
          onPop(index, marbles[index]!.translation().y);
        }
        this.total++;
        this.bursts.push({ id: this.total, tick, x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2,
          a, b, impulse, nx, ny });
        if (this.bursts.length > COLLISION_POP.maxVisibleBursts) this.bursts.shift();
        // At most one impulse per marble per cooldown, even in a dense contact cluster.
        break;
      }
    }
  }
  dispose() {
    this.bursts.length = 0;
    this.indices.clear();
  }
}
