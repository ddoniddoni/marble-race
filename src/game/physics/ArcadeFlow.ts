import type { Collider, RigidBody, World } from "@dimforge/rapier2d-compat";
import type { AirBurst, Obstacle, Pose, Scene } from "../core/types";
import { airDamping, finishAirProfile, finishAirZone } from "../core/finishAir";
import { finishDamping } from "../core/finishPace";

type Kicker = { object: Obstacle; collider: Collider; order: number };
const clamp = (n: number, limit: number) => Math.max(-limit, Math.min(limit, n));

/** arcade-flow-v1 rules. Fixed ticks, stable contact order, no random rescue/teleport. */
export class ArcadeFlow {
  readonly impacts = new Map<string, number>();
  private readonly kickers = new Map<number, Kicker>();
  private readonly lastKick: number[];
  private readonly progress: { y: number; tick: number }[];
  private readonly damping: Float64Array;
  private readonly airLiftTicks: Int32Array;
  private readonly airZone: ReturnType<typeof finishAirZone> | undefined;
  private readonly airProfile: ReturnType<typeof finishAirProfile>;
  private lastAirTick: number;
  airBurst: AirBurst | undefined;
  airBursts = 0;
  airLifts = 0;
  kicks = 0;
  assists = 0;
  constructor(count: number, private readonly width: number, private readonly finishY?: number,
    airFinish?: NonNullable<Scene["finish"]>, airVersion?: Scene["finishAir"]) {
    this.airProfile = finishAirProfile(airVersion || undefined);
    this.lastAirTick = -this.airProfile.cooldownTicks;
    this.airZone = airFinish ? finishAirZone(airFinish, this.airProfile) : undefined;
    this.airLiftTicks = new Int32Array(airFinish ? count : 0).fill(-1);
    this.damping = new Float64Array(count);
    this.lastKick = Array<number>(count).fill(-12);
    this.progress = Array.from({ length: count }, () => ({ y: 0, tick: 0 }));
  }
  prepareStep(marbles: readonly RigidBody[], poses: readonly Pose[], states: Uint8Array | undefined, tick: number) {
    if (this.finishY === undefined) return;
    for (let index = 0; index < marbles.length; index++) {
      if (states && states[index] !== 1) continue;
      const baseDamping = finishDamping(poses[index]!.y, this.finishY);
      const liftTick = this.airLiftTicks[index] ?? -1;
      const damping = liftTick < 0 ? baseDamping : airDamping(baseDamping, tick - liftTick, this.airProfile);
      if (this.damping[index] === damping) continue;
      // Let Rapier integrate real drag. Collision kicks and gravity keep acting.
      marbles[index]!.setLinearDamping(damping);
      this.damping[index] = damping;
    }
  }
  restartProgress(index: number, y: number, tick: number) {
    this.progress[index] = { y, tick };
  }
  register(object: Obstacle, collider: Collider, order: number) {
    if (object.kind !== "wall") this.kickers.set(collider.handle, { object, collider, order });
  }
  private normal(kicker: Kicker, x: number, y: number) {
    const center = kicker.collider.translation();
    let dx = x - center.x, dy = y - center.y;
    if (kicker.object.kind === "rotor" || kicker.object.kind === "moving-platform") {
      const angle = kicker.collider.rotation();
      const c = Math.cos(angle), s = Math.sin(angle);
      const localX = dx * c + dy * s, localY = -dx * s + dy * c;
      const nearX = clamp(localX, kicker.object.width / 2);
      const nearY = clamp(localY, kicker.object.height / 2);
      dx = (localX - nearX) * c - (localY - nearY) * s;
      dy = (localX - nearX) * s + (localY - nearY) * c;
    }
    const length = Math.hypot(dx, dy);
    return length > 0.00001 ? { x: dx / length, y: dy / length } : { x: 0, y: -1 };
  }
  step(world: World, marbles: readonly RigidBody[], colliders: readonly Collider[], tick: number, states?: Uint8Array) {
    const zone = this.airZone;
    const ready = zone && tick - this.lastAirTick >= this.airProfile.cooldownTicks;
    let lifted = 0;
    for (let index = 0; index < marbles.length; index++) {
      if (states && states[index] !== 1) continue;
      const body = marbles[index]!, collider = colliders[index]!;
      const point = body.translation();
      const candidates: Kicker[] = [];
      world.contactPairsWith(collider, (other) => {
        const kicker = this.kickers.get(other.handle);
        if (kicker) candidates.push(kicker);
      });
      candidates.sort((a, b) => a.order - b.order);
      // Broad-phase proximity alone must never trigger a kick.
      const contact = candidates.find((candidate) => {
        let touching = false;
        world.contactPair(collider, candidate.collider, (manifold) => {
          for (let i = 0; i < manifold.numContacts(); i++)
            if (manifold.contactDist(i) <= 0.01) touching = true;
        });
        return touching;
      });
      if (contact && tick - this.lastKick[index]! >= 12) {
        const normal = this.normal(contact, point.x, point.y);
        const velocity = body.linvel();
        const outwardSpeed = velocity.x * normal.x + velocity.y * normal.y;
        const targetSpeed = normal.y < -0.4 ? 2.4 : 4;
        const impulse = Math.max(0, Math.min(6, targetSpeed - outwardSpeed));
        // A marble balanced on a round bumper gets a sideways release as well.
        const side = Math.sign(normal.x) || Math.sign(velocity.x) || (contact.order % 2 ? -1 : 1);
        const tangent = normal.y < -0.7 ? clamp(side * 3.8 - velocity.x, 3.8) : 0;
        body.applyImpulse({ x: normal.x * impulse + tangent, y: normal.y * impulse }, true);
        this.lastKick[index] = tick;
        this.impacts.set(contact.object.id, tick);
        this.kicks++;
      }
      const progress = this.progress[index]!;
      if (point.y >= progress.y + 0.5) {
        progress.y = point.y;
        progress.tick = tick;
      } else if (tick - progress.tick >= 120) {
        // Identical, visible arcade rule for every marble: release after two
        // simulation seconds without descending 0.5 units. No position changes.
        const velocity = body.linvel();
        const direction = point.x < 2 ? 1 : point.x > this.width - 2 ? -1
          : contact ? (Math.sign(point.x - contact.collider.translation().x) || (contact.order % 2 ? -1 : 1))
          : (point.x < this.width / 2 ? 1 : -1);
        const aboveObstacle = contact && point.y < contact.collider.translation().y;
        body.applyImpulse({ x: clamp(direction * 5 - velocity.x, 6), y: clamp((aboveObstacle ? -2.5 : 4) - velocity.y, 6) }, true);
        progress.y = point.y;
        progress.tick = tick;
        this.assists++;
        if (contact) this.impacts.set(contact.object.id, tick);
      }
      if (ready && zone && this.airLiftTicks[index] === -1 &&
        point.x >= zone.left && point.x <= zone.right && point.y >= zone.top && point.y <= zone.bottom) {
        const velocity = body.linvel();
        // Arriving/resting marbles only. Already airborne marbles may catch a later pulse.
        if (velocity.y >= -1) {
          const side = Math.sign(point.x - zone.x) || Math.sign(velocity.x);
          body.applyImpulse({ x: side * this.airProfile.sideImpulse,
            y: -Math.min(this.airProfile.maxLiftImpulse, velocity.y + this.airProfile.liftSpeed) }, true);
          this.airLiftTicks[index] = tick;
          // Restart the progress window after a deliberate lift, avoiding an immediate assist.
          progress.y = point.y;
          progress.tick = tick;
          lifted++;
        }
      }
      const velocity = body.linvel();
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 18) body.setLinvel({ x: velocity.x / speed * 18, y: velocity.y / speed * 18 }, true);
    }
    if (lifted && zone) {
      this.lastAirTick = tick;
      this.airBursts++;
      this.airLifts += lifted;
      this.airBurst = { tick, x: zone.x, y: zone.y, count: lifted };
    }
  }
  dispose() {
    this.kickers.clear();
    this.impacts.clear();
    this.progress.length = 0;
    this.lastKick.length = 0;
    this.damping.fill(0);
    this.airLiftTicks.fill(-1);
    this.airBurst = undefined;
  }
}
