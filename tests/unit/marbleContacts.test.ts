import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { FIXED_DT, PROFILE, type Scene } from "../../src/game/core/types";
import { initPhysics, physicsResources, RapierPhysics } from "../../src/game/physics/RapierPhysics";

const worlds: RapierPhysics[] = [];
beforeAll(initPhysics);
afterEach(() => {
  worlds.splice(0).forEach((world) => world.dispose());
  expect(physicsResources).toEqual({ worlds: 0, bodies: 0, colliders: 0 });
});
function create(count: number, scene: Scene) {
  const physics = new RapierPhysics(count, scene);
  worlds.push(physics);
  return physics;
}

describe("solid arcade marbles", () => {
  it.each([6, 18])("head-on marbles at speed %i rebound without passing through each other", (speed) => {
    const physics = create(2, {
      id: "marble-contact", physicsProfile: "arcade-flow-v1", width: 24, height: 28,
      obstacles: [], spawnSlots: [{ x: 10, y: 2 }, { x: 12, y: 2 }],
      initialVelocities: [{ x: speed, y: 0 }, { x: -speed, y: 0 }],
    });
    let rebound = false;
    let minimumDistance = Infinity;
    for (let tick = 1; tick <= 60; tick++) {
      const previousX = physics.poses[0]!.x;
      physics.step(tick);
      const left = physics.poses[0]!, right = physics.poses[1]!;
      expect(left.x).toBeLessThan(right.x);
      minimumDistance = Math.min(minimumDistance, Math.hypot(left.x - right.x, left.y - right.y));
      if (left.x < previousX) rebound = true;
    }
    expect(rebound).toBe(true);
    expect(minimumDistance).toBeGreaterThanOrEqual(PROFILE.radius * 2 - 0.001);
    // Samples are one full fixed tick apart; a rebound may occur between them.
    expect(minimumDistance).toBeLessThan(PROFILE.radius * 2 + 2 * speed * FIXED_DT);
  });

  it("keeps a falling pile of 20 marbles apart on a solid floor", () => {
    const count = 20;
    const physics = create(count, {
      id: "marble-pile", physicsProfile: "arcade-flow-v1", width: 24, height: 28,
      obstacles: [{ id: "floor", kind: "wall", x: 12, y: 9, width: 20, height: 0.5,
        rotation: 0, speed: 0 }],
      spawnSlots: Array.from({ length: count }, (_, index) => ({
        x: 10 + (index % 5) * 0.56, y: 2 + Math.floor(index / 5) * 0.56,
      })),
    });
    let minimumDistance = Infinity;
    let closest = {};
    for (let tick = 1; tick <= 240; tick++) {
      physics.step(tick);
      for (let left = 0; left < count; left++) {
        const a = physics.poses[left]!;
        expect(a.y + PROFILE.radius).toBeLessThanOrEqual(8.76);
        for (let right = left + 1; right < count; right++) {
          const b = physics.poses[right]!;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance < minimumDistance) {
            minimumDistance = distance;
            closest = { tick, left, right, a: { ...a }, b: { ...b } };
          }
        }
      }
    }
    expect(minimumDistance, JSON.stringify(closest)).toBeGreaterThanOrEqual(PROFILE.radius * 2 - 0.001);
    expect(minimumDistance).toBeLessThan(PROFILE.radius * 2 + 0.04);
  });
});
