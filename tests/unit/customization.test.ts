import { describe, expect, it } from "vitest";
import {
  numberedNames,
  parseParticipantNames,
} from "../../src/game/contracts/participants";
import { cameraFrame } from "../../src/game/renderer/camera";
import { TEMPLATES } from "../../src/game/templates";
import { TEMPLATES as LEGACY } from "../../src/game/templates/v1";
import { hashMap } from "../../src/game/contracts/canonical";
it("accepts mixed labels, separators and repeated names with independent IDs", () => {
  const result = parseParticipantNames("  민수,001\r\n행운 7\n민수\n");
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.participants.map((p) => p.name)).toEqual([
      "민수",
      "001",
      "행운 7",
      "민수",
    ]);
    expect(new Set(result.participants.map((p) => p.id)).size).toBe(4);
  }
});
it.each([
  "",
  "혼자",
  "a,b," + "가".repeat(25),
  "a,<script>x</script>",
  "a,b\u202e",
  Array.from({ length: 10001 }, () => "구슬").join("\n"),
  "x".repeat(8193),
])("rejects invalid participant input", (text) => {
  expect(parseParticipantNames(text).ok).toBe(false);
});
it("supports 2 through 10000 participants and generates numeric labels", () => {
  expect(numberedNames(-1, 4)).toBe("-1\n0\n1\n2");
  for (const count of [2, 100, 1000, 10000]) {
    const result = parseParticipantNames(numberedNames(10, count));
    expect(result.ok && result.participants.length).toBe(count);
  }
  for (const [start, count] of [
    [NaN, 2],
    [Infinity, 2],
    [1.2, 2],
    [1, 1],
    [1, 10001],
    [1, 2.5],
  ])
    expect(() => numberedNames(start!, count!)).toThrow();
});
it("preserves all v1 map hash vectors and exposes the current v17 courses", async () => {
  expect(await Promise.all(LEGACY.map((t) => hashMap(t.map)))).toEqual([
    "4534b56ecea4d42e3b764b40ef43d288aabcf0fa6cad1c0ffcfd0a61d06403ce",
    "92cd5d9f5d7e91693a734dd9af22442ef591a0f85b602d75b00f74b249e38786",
    "17d826294d4fb0f5aa9a4a327c32ccd574d7384db332a6b1be8d47bfc28b9d72",
  ]);
  expect(
    TEMPLATES.every((t) => t.id.endsWith("v17") && t.map.world.height === 146 && t.map.finishAir === false),
  ).toBe(true);
});
describe("presentation camera", () => {
  const world = { width: 24, height: 72 },
    viewport = { width: 680, height: 900 };
  it("follows the front marble, clamps to the floor and resets to the top", () => {
    expect(cameraFrame(world, viewport, 1.5, "follow").top).toBe(0);
    expect(cameraFrame(world, viewport, 40, "follow").top).toBeGreaterThan(0);
    const end = cameraFrame(world, viewport, 1000, "follow");
    expect(end.top + end.visibleHeight).toBeCloseTo(72);
    expect(cameraFrame(world, viewport, 1.5, "follow").top).toBe(0);
  });
  it("overview covers the complete course across desktop and mobile sizes", () => {
    for (const size of [viewport, { width: 288, height: 455 }]) {
      const frame = cameraFrame(world, size, 50, "overview");
      expect(frame.top).toBe(0);
      expect(frame.visibleHeight).toBe(72);
      expect(frame.scale * world.height).toBeLessThanOrEqual(size.height);
    }
  });
});
it("zoomed follow camera tracks horizontally on mobile and stays within world bounds", () => {
  const world = { width: 24, height: 72 },
    viewport = { width: 390, height: 600 };
  const left = cameraFrame(world, viewport, 40, "follow", -100, 1.5);
  const right = cameraFrame(world, viewport, 40, "follow", 100, 1.5);
  expect(left.left).toBe(0);
  expect(right.left + right.visibleWidth).toBeCloseTo(24);
  expect(right.top + right.visibleHeight).toBeLessThanOrEqual(72);
  expect(right.visibleWidth).toBeLessThan(
    cameraFrame(world, viewport, 40, "follow", 12, 1).visibleWidth,
  );
});
