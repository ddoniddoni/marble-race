import { afterEach, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { AllFinishRace } from "../../src/game/core/race";
import { TEMPLATES } from "../../src/game/templates";
import {
  canonicalizeMap,
  hashMap,
  serializeMap,
} from "../../src/game/contracts/canonical";
import { loadMapScene } from "../../src/game/contracts/loadScene";
import { validateMap } from "../../src/game/contracts/validation";
import {
  initPhysics,
  physicsResources,
  RapierPhysics,
} from "../../src/game/physics/RapierPhysics";
const worlds: RapierPhysics[] = [];
beforeAll(initPhysics);
afterEach(() => {
  worlds.splice(0).forEach((world) => world.dispose());
  expect(physicsResources.worlds).toBe(0);
});
function physics(map: unknown, count: 20 | 100) {
  const world = new RapierPhysics(
    count,
    loadMapScene(map, count, "test").scene,
  );
  worlds.push(world);
  return world;
}
it.each(
  TEMPLATES.flatMap((template) =>
    ([20, 100] as const).map((count) => ({ template, count })),
  ),
)(
  "$template.id / $count marbles: 3,600 actual Rapier ticks retire finishers and stay inside the cabinet",
  ({ template, count }) => {
    const world = physics(template.map, count);
    const initial = structuredClone(world.poses);
    const race = new AllFinishRace(count, world.scene.finish!, world.scene);
    for (let tick = 1; tick <= 3600; tick++) {
      world.step(tick);
      race.step(tick, world.previous, world.poses, world.marbleStates);
      world.retireMarbles(race.newlySettled);
      if (tick % 60 === 0) {
        expect(race.dnf, `${template.id} / ${count} / tick ${tick}: active marble escaped`).toBe(0);
        for (const [index, pose] of world.poses.slice(0, count).entries()) {
          expect(Number.isFinite(pose.x) && Number.isFinite(pose.y)).toBe(true);
          expect(pose.x).toBeGreaterThan(0.5);
          expect(pose.x, JSON.stringify({ template: template.id, tick, index, pose,
            previous: world.previous[index], finish: template.map.finish,
            result: race.entries.find((entry) => entry.index === index) })).toBeLessThan(23.5);
          expect(pose.y).toBeGreaterThan(0.5);
          expect(pose.y).toBeLessThan(template.map.world.height - 0.4);
        }
      }
    }
    expect(world.poses).not.toEqual(initial);
    const inLowerArea = world.poses
      .slice(0, count)
      .filter((pose) => pose.y >= template.map.finish.y).length;
    console.log(
      JSON.stringify({
        template: template.id,
        count,
        simulatedTicks: 3600,
        inLowerArea,
        completed: race.completed,
        dnf: race.dnf,
        awake: world.counts().awake,
      }),
    );
  },
);
it.each([false, undefined, "pulse-v1", "pulse-v2"] as const)(
  "finish air %s: explicit off falls through while legacy pulses still lift",
  (finishAir) => {
    const scene = loadMapScene(TEMPLATES[0]!.map, 2, "finish-air-regression").scene;
    const world = new RapierPhysics(2, {
      ...scene,
      finishAir,
      obstacles: [],
      spawnSlots: [{ x: 11.6, y: scene.finish!.y - 4 }, { x: 12.4, y: scene.finish!.y - 4 }],
    });
    worlds.push(world);
    const race = new AllFinishRace(2, world.scene.finish!, world.scene);
    let rose = false;
    for (let tick = 1; tick <= 300; tick++) {
      world.step(tick);
      rose ||= world.poses.some((pose, index) => pose.y < world.previous[index]!.y - 0.00001);
      race.step(tick, world.previous, world.poses, world.marbleStates);
      world.retireMarbles(race.newlySettled);
    }
    if (finishAir) {
      expect(rose).toBe(true);
      expect(world.flowStats?.airLifts).toBe(2);
    } else {
      expect(rose).toBe(false);
      expect(world.airBurst).toBeUndefined();
      expect(race.completed).toBe(2);
      expect(race.dnf).toBe(0);
    }
  },
);
it("object input order produces identical body order and physics; source is not mutated", () => {
  const map = structuredClone(TEMPLATES[2]!.map);
  const original = structuredClone(map);
  const a = physics(map, 20);
  const b = physics({ ...map, objects: [...map.objects].reverse() }, 20);
  for (let tick = 1; tick <= 600; tick++) {
    a.step(tick);
    b.step(tick);
  }
  expect(a.poses).toEqual(b.poses);
  expect(map).toEqual(original);
});
it("fixed canonical byte vector agrees with an independent Node SHA-256 implementation", async () => {
  const map = {
    schemaVersion: 1,
    physicsProfile: "classic-v1",
    world: { width: 8, height: 10 },
    theme: "neutral",
    spawn: { x: 1, y: 1, width: 3, height: 1 },
    finish: { left: 1, right: 7, y: 9 },
    objects: [],
  };
  const text =
    '{"finish":{"left":1,"right":7,"y":9},"objects":[],"physicsProfile":"classic-v1","schemaVersion":1,"spawn":{"height":1,"width":3,"x":1,"y":1},"theme":"neutral","world":{"height":10,"width":8}}';
  expect(serializeMap(map)).toBe(text);
  expect(await hashMap(map)).toBe(
    createHash("sha256").update(text, "utf8").digest("hex"),
  );
  for (const template of TEMPLATES)
    expect(await hashMap(template.map)).toBe(
      createHash("sha256").update(serializeMap(template.map)).digest("hex"),
    );
});
it.each([3.14159, 3.1416, -3.1416, 6.28317, 6.2832, -6.2832, 1e30])(
  "rotation %f canonicalizes idempotently",
  (rotation) => {
    const map = structuredClone(TEMPLATES[0]!.map);
    map.objects = [
      {
        id: "10000000-0000-4000-8000-000000000001",
        kind: "wall",
        transform: { x: 12, y: 15, rotation },
        color: "#abcdef",
        width: 2,
        height: 0.3,
      },
    ];
    const once = canonicalizeMap(map);
    expect(canonicalizeMap(once)).toEqual(once);
    expect(serializeMap(JSON.parse(serializeMap(map)))).toBe(serializeMap(map));
  },
);
it("revalidates geometry after four-decimal rounding", () => {
  const map = structuredClone(TEMPLATES[0]!.map);
  map.objects = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      kind: "wall",
      transform: { x: 0.224826, y: 15, rotation: 0 },
      color: "#FFFFFF",
      width: 0.449651,
      height: 0.3,
    },
  ];
  expect(validateMap(map).ok).toBe(true);
  expect(() => canonicalizeMap(map)).toThrow();
});
it("maps circles to fixed balls and runs moving platforms on fixed-tick paths", () => {
  const map = structuredClone(TEMPLATES[0]!.map);
  map.objects = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      kind: "circle",
      transform: { x: 12, y: 15, rotation: 0 },
      color: "#FFFFFF",
      radius: 1,
    },
  ];
  const world = physics(map, 20);
  expect(world.counts().bodies).toBe(21);
  map.objects = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      kind: "moving-platform",
      transform: { x: 12, y: 15, rotation: 0 },
      color: "#FFFFFF",
      width: 2,
      height: 0.3,
      end: { x: 14, y: 15 },
      periodTicks: 120,
      phaseTicks: 0,
    },
  ];
  expect(validateMap(map).ok).toBe(true);
  const platform = physics(map, 20);
  expect(platform.counts().bodies).toBe(21);
  const positions = new Map([[30, 13], [60, 14], [90, 13], [120, 12]]);
  for (let tick = 1; tick <= 120; tick++) {
    platform.step(tick);
    if (positions.has(tick)) {
      expect(platform.poses[20]!.x).toBeCloseTo(positions.get(tick)!);
      expect(platform.poses[20]!.y).toBeCloseTo(15);
    }
  }
  expect(physicsResources.worlds).toBe(2);
});
