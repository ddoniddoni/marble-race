import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { SimulationCore } from "../../src/game/core/SimulationCore";
import { FixedStepper } from "../../src/game/core/FixedStepper";
import { summarize } from "../../src/game/core/metrics";
import { FIXED_DT, PROFILE, type Scene } from "../../src/game/core/types";
import { createScene } from "../../src/game/fixtures/scenes";
import {
  initPhysics,
  physicsResources,
  RapierPhysics,
} from "../../src/game/physics/RapierPhysics";
const cleanup: (() => void)[] = [];
beforeAll(initPhysics);
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  expect(physicsResources).toEqual({ worlds: 0, bodies: 0, colliders: 0 });
});
function simulation(count: 20 | 100 = 20, scene = createScene(count)) {
  const core = new SimulationCore(() => new RapierPhysics(count, scene));
  cleanup.push(() => core.dispose());
  return core;
}
describe("fixed timestep", () => {
  it.each([30, 60, 120])(
    "%i Hz render cadence reaches the identical 300-tick physics state",
    (fps) => {
      const reference = simulation();
      reference.start();
      for (let i = 0; i < 300; i++) reference.advance(FIXED_DT);
      const core = simulation();
      core.start();
      for (let i = 0; i < fps * 5; i++) core.advance(1 / fps);
      expect(core.tick).toBe(300);
      expect(core.poses).toEqual(reference.poses);
    },
  );
  it("drops wall-time backlog, never skips simulation ticks", () => {
    const stepper = new FixedStepper();
    let ticks = 0;
    expect(stepper.advance(10, () => ticks++).steps).toBe(6);
    expect(ticks).toBe(6);
    expect(stepper.droppedSeconds).toBeCloseTo(9.9);
    expect(() => stepper.advance(NaN, () => {})).toThrow();
    expect(() => stepper.advance(-1, () => {})).toThrow();
  });
});
describe("Rapier physics and lifecycle", () => {
  it.each([20, 100] as const)(
    "%i-marble scene has bounded actual body/collider counts",
    (count) => {
      const core = simulation(count);
      const scene = createScene(count);
      expect(scene.obstacles.filter((o) => o.kind !== "rotor")).toHaveLength(
        count === 20 ? 14 : 200,
      );
      expect(scene.obstacles.filter((o) => o.kind === "rotor")).toHaveLength(
        count === 20 ? 3 : 20,
      );
      expect(core.counts().bodies).toBe(count === 20 ? 37 : 320);
      expect(core.counts().colliders).toBe(core.counts().bodies);
      core.start();
      for (let i = 0; i < 900; i++) core.advance(FIXED_DT);
      for (const p of core.poses.slice(0, count)) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        expect(p.x).toBeGreaterThan(0.5);
        expect(p.x).toBeLessThan(23.5);
        expect(p.y).toBeLessThan(27.6);
      }
      const marbles = core.poses.slice(0, count);
      for (let i = 0; i < marbles.length; i++)
        for (let j = i + 1; j < marbles.length; j++) {
          expect(
            Math.hypot(
              marbles[i]!.x - marbles[j]!.x,
              marbles[i]!.y - marbles[j]!.y,
            ),
          ).toBeGreaterThan(PROFILE.radius * 1.7);
        }
    },
  );
  it("falls, collides with a bumper, and reverses vertical motion", () => {
    const scene: Scene = {
      id: "bounce",
      width: 24,
      height: 28,
      obstacles: [
        {
          id: "bumper",
          kind: "bumper",
          x: 2,
          y: 5,
          width: 2,
          height: 2,
          rotation: 0,
          speed: 0,
        },
      ],
    };
    const core = simulation(20, scene);
    core.start();
    let fell = false;
    let bounced = false;
    for (let i = 0; i < 120; i++) {
      const before = core.poses[0]!.y;
      core.advance(FIXED_DT);
      const after = core.poses[0]!.y;
      if (after > before + 0.02) fell = true;
      if (fell && after < before - 0.02) bounced = true;
    }
    expect(fell).toBe(true);
    expect(bounced).toBe(true);
  });
  it("a kinematic rotor affects marble trajectories", () => {
    const scene: Scene = {
      id: "rotor",
      width: 24,
      height: 28,
      obstacles: [
        {
          id: "rotor",
          kind: "rotor",
          x: 3,
          y: 4,
          width: 5,
          height: 0.3,
          rotation: 0,
          speed: 1.4,
        },
      ],
    };
    const rotor = simulation(20, scene);
    const empty = simulation(20, { ...scene, obstacles: [] });
    rotor.start();
    empty.start();
    for (let i = 0; i < 90; i++) {
      rotor.advance(FIXED_DT);
      empty.advance(FIXED_DT);
    }
    expect(rotor.poses[0]).not.toEqual(empty.poses[0]);
    expect(rotor.poses.at(-1)!.rotation).toBeCloseTo(2.1, 3);
  });
  it("pause freezes state and resume has no accumulated pause time", () => {
    const core = simulation();
    core.start();
    core.advance(0.1);
    core.pause();
    const before = structuredClone(core.poses);
    const tick = core.tick;
    core.advance(500);
    expect(core.poses).toEqual(before);
    expect(core.tick).toBe(tick);
    core.start();
    core.advance(FIXED_DT);
    expect(core.tick).toBe(tick + 1);
  });
  it("20 resets create fresh worlds with identical starting and simulated states", () => {
    const core = simulation(100);
    const initial = structuredClone(core.poses);
    core.start();
    for (let i = 0; i < 120; i++) core.advance(FIXED_DT);
    const expected = structuredClone(core.poses);
    for (let run = 0; run < 20; run++) {
      core.reset();
      expect(core.tick).toBe(0);
      expect(core.phase).toBe("ready");
      expect(core.poses).toEqual(initial);
      expect(physicsResources).toEqual({
        worlds: 1,
        bodies: 320,
        colliders: 320,
      });
      core.start();
      for (let i = 0; i < 120; i++) core.advance(FIXED_DT);
      expect(core.poses).toEqual(expected);
    }
    core.dispose();
    core.dispose();
    core.start();
    core.reset();
    expect(core.phase).toBe("disposed");
    expect(core.counts().bodies).toBe(0);
  });
});
it("computes interval-weighted FPS, nearest-rank p95, and long frames", () => {
  const stats = summarize([10, 10, 10, 70], [2, 2, 2, 2], [1, 1, 1, 1]);
  expect(stats).toEqual({
    frames: 4,
    elapsedMs: 100,
    fps: 40,
    meanFrameMs: 25,
    p95FrameMs: 70,
    maxFrameMs: 70,
    longFrames: 1,
    meanCpuMs: 2,
    meanPhysicsMs: 1,
  });
});

it("stress fixture keeps meaningful contact load after 60 simulated seconds", () => {
  const core = simulation(100);
  core.start();
  for (let i = 0; i < 3600; i++) core.advance(FIXED_DT);
  for (const p of core.poses.slice(0, 100)) {
    expect(p.y).toBeLessThan(27.6);
    expect(p.x).toBeGreaterThan(0.5);
    expect(p.x).toBeLessThan(23.5);
  }
  expect(core.counts().awake).toBeGreaterThan(50);
});
