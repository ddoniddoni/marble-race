import { afterEach, beforeAll, expect, it } from "vitest";
import RAPIER from "@dimforge/rapier2d-compat";
import { COLLISION_POP } from "../../src/game/core/collisionPop";
import { FIXED_DT, PROFILE, type CollisionBurst } from "../../src/game/core/types";
import { CollisionPop } from "../../src/game/physics/CollisionPop";
import { initPhysics, RapierPhysics } from "../../src/game/physics/RapierPhysics";
import { TEMPLATES } from "../../src/game/templates";
import { TEMPLATES as PREVIOUS } from "../../src/game/templates/v16";
import { loadMapScene } from "../../src/game/contracts/loadScene";
import { hashMap, serializeMap } from "../../src/game/contracts/canonical";
import { validateMap } from "../../src/game/contracts/validation";
import { expandedStart } from "../../src/game/core/startLayout";
import { shuffledStart } from "../../src/game/core/race";

const cleanups: (() => void)[] = [];
beforeAll(initPhysics);
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function fixture(seed = 123, y = 12, separation = PROFILE.radius * 2) {
  const world = new RAPIER.World({ x: 0, y: 0 });
  world.timestep = FIXED_DT;
  const bodies = [0, 1].map((index) => world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(10 + index * separation, y)));
  const colliders = bodies.map((body) => world.createCollider(
    RAPIER.ColliderDesc.ball(PROFILE.radius).setMass(1), body));
  const pop = new CollisionPop(2, 10, 20, seed, colliders);
  const states = new Uint8Array([1, 1]);
  cleanups.push(() => { pop.dispose(); world.free(); });
  const events: CollisionBurst[] = [];
  const restarted: number[] = [];
  function step(tick: number, touching = true) {
    // Controlled repeat contacts isolate charge timing from the course's geometry.
    bodies.forEach((body, index) => {
      body.setTranslation({ x: 10 + index * (touching ? separation : 2), y }, true);
      body.setLinvel({ x: 0, y: 0 }, true);
    });
    world.step();
    const previousTotal = pop.total;
    pop.step(world, bodies, colliders, states, tick, (index) => restarted.push(index));
    if (pop.total > previousTotal) events.push({ ...pop.bursts.at(-1)! });
  }
  return { world, bodies, colliders, pop, states, events, restarted, step };
}

it("pushes actual touching marbles equally apart and restarts both progress windows", () => {
  const f = fixture();
  for (let tick = 1; tick <= 100 && f.pop.total === 0; tick++) f.step(tick);
  expect(f.pop.total).toBe(1);
  const [a, b] = f.bodies.map((body) => body.linvel());
  expect(a!.x).toBeLessThan(-3);
  expect(b!.x).toBeGreaterThan(3);
  expect(a!.x + b!.x).toBeCloseTo(0, 5);
  expect(a!.y).toBeCloseTo(0);
  expect(b!.y).toBeCloseTo(0);
  expect(f.restarted).toEqual([0, 1]);
  const event = f.events[0]!;
  expect(event.impulse).toBeGreaterThanOrEqual(COLLISION_POP.minImpulse);
  expect(event.impulse).toBeLessThanOrEqual(COLLISION_POP.maxImpulse);
});

it("keeps charges seed-dependent, repeatable, and separated by random cooldowns", () => {
  const a = fixture(123), repeat = fixture(123), different = fixture(456);
  for (let tick = 1; tick <= 900; tick++) {
    a.step(tick); repeat.step(tick); different.step(tick);
  }
  expect(a.events.length).toBeGreaterThan(3);
  expect(repeat.events).toEqual(a.events);
  expect(different.events.map((event) => event.tick)).not.toEqual(a.events.map((event) => event.tick));
  for (let i = 1; i < a.events.length; i++) {
    const gap = a.events[i]!.tick - a.events[i - 1]!.tick;
    expect(gap).toBeGreaterThanOrEqual(COLLISION_POP.cooldownMinTicks);
    expect(gap).toBeLessThanOrEqual(COLLISION_POP.cooldownMaxTicks);
  }
});

it.each([5, 9.9, 20, 21])("does not pop before the last stage or past the finish at y=%s", (y) => {
  const f = fixture(123, y);
  for (let tick = 1; tick <= 180; tick++) f.step(tick);
  expect(f.pop.total).toBe(0);
});

it("requires both marbles inside the last stage and ignores retired marbles", () => {
  const f = fixture();
  for (let tick = 1; tick <= 100; tick++) f.step(tick, false);
  f.bodies[0]!.setTranslation({ x: 10, y: 9.8 }, true);
  f.bodies[1]!.setTranslation({ x: 10, y: 10.24 }, true);
  f.world.step();
  f.pop.step(f.world, f.bodies, f.colliders, f.states, 101, () => {});
  expect(f.pop.total).toBe(0);
  f.states[1] = 2;
  for (let tick = 102; tick <= 180; tick++) f.step(tick);
  expect(f.pop.total).toBe(0);
});

it("does not fire on proximity or when a charged marble has no partner", () => {
  const f = fixture(123, 12, 0.55);
  for (let tick = 1; tick <= 180; tick++) f.step(tick);
  expect(f.pop.total).toBe(0);
  const separate = fixture();
  for (let tick = 1; tick <= 180; tick++) separate.step(tick, false);
  expect(separate.pop.total).toBe(0);
  separate.step(181);
  expect(separate.pop.total).toBe(1);
});

it("expires visual events and clears them on disposal", () => {
  const f = fixture();
  let tick = 1;
  while (f.pop.total === 0 && tick < 100) f.step(tick++);
  expect(f.pop.bursts).toHaveLength(1);
  for (let end = tick + COLLISION_POP.effectTicks; tick <= end; tick++) f.step(tick, false);
  expect(f.pop.bursts).toHaveLength(0);
  f.pop.dispose();
  expect(f.pop.bursts).toHaveLength(0);
});

it("versions the new maps, validates their zone, and translates it with an expanded start", async () => {
  for (const [index, template] of TEMPLATES.entries()) {
    expect(template.id).toMatch(/v17$/);
    expect(template.map.collisionPop?.startY).toBeCloseTo(template.stages!.at(-1)!.y, 8);
    expect(template.map.finishAir).toBe(false);
    expect(PREVIOUS[index]!.map.collisionPop).toBeUndefined();
    expect(await hashMap(template.map)).not.toBe(await hashMap(PREVIOUS[index]!.map));
    expect(JSON.parse(serializeMap(template.map)).collisionPop).toEqual(template.map.collisionPop);
  }
  const map = TEMPLATES[0]!.map;
  for (const collisionPop of [
    { version: "random-v1", startY: -1 }, { version: "random-v1", startY: map.finish.y },
    { version: "random-v1", startY: Infinity }, { version: "other", startY: 100 },
  ]) expect(validateMap({ ...map, collisionPop }).ok).toBe(false);
  expect(validateMap({ ...map, finishPace: undefined, physicsProfile: "classic-v1" }).ok).toBe(false);
  const { scene } = loadMapScene(map, 20, "expanded-pop");
  const expanded = expandedStart(scene, 1000);
  expect(expanded.collisionPop!.startY).toBeCloseTo(scene.collisionPop!.startY + expanded.startLayout!.courseOffset.y);
  const seeded = shuffledStart(scene, 321, 20, scene.spawnSlots!);
  expect(seeded.raceSeed).toBe(321);
  const physics = new RapierPhysics(20, seeded);
  cleanups.push(() => physics.dispose());
  expect(physics.flowStats?.collisionPops).toBe(0);
});
