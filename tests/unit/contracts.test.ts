import { describe, expect, it } from "vitest";
import {
  MapDocumentSchema,
  ParticipantSchema,
  RaceConfigSchema,
} from "../../src/game/contracts/schemas";
import { validateMap, parseMapJson } from "../../src/game/contracts/validation";
import {
  canonicalizeMap,
  serializeMap,
  hashMap,
} from "../../src/game/contracts/canonical";
// Pin canonical vectors/geometry fixtures to v2; current maps are covered in templates.test.ts.
import { TEMPLATES } from "../../src/game/templates/v2";
import {
  createBenchmarkMap,
  createScene,
} from "../../src/game/fixtures/scenes";
import { createSpawnSlots } from "../../src/game/contracts/geometry";
const valid = () => structuredClone(TEMPLATES[0]!.map);
const uuid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const participant = (n: number) => ({
  id: uuid(n),
  name: `구슬 ${n}`,
  appearance: { kind: "solid", color: "#FF3355" },
});
function expectInvalid(input: unknown, field?: string) {
  const result = validateMap(input);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(
      result.errors.every(
        (e) => "objectId" in e && e.field && e.code && e.message,
      ),
    ).toBe(true);
    if (field)
      expect(result.errors.some((e) => e.field.includes(field))).toBe(true);
    return result.errors;
  }
  throw new Error("Expected invalid map");
}
describe("strict map contracts", () => {
  it.each(TEMPLATES)(
    "$id round-trips and has 100 clear, distinct spawn slots",
    async ({ map }) => {
      expect(MapDocumentSchema.safeParse(map).success).toBe(true);
      expect(validateMap(map, 100).ok).toBe(true);
      expect(createSpawnSlots(map.spawn)).toHaveLength(100);
      const text = serializeMap(map);
      const parsed = parseMapJson(text, 100);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(serializeMap(parsed.value)).toBe(text);
        expect(await hashMap(parsed.value)).toBe(await hashMap(map));
      }
    },
  );
  it.each([20, 100] as const)(
    "P0 %i uses the same contract loader",
    (count) => {
      expect(validateMap(createBenchmarkMap(count), count).ok).toBe(true);
      expect(createScene(count).obstacles.length + count).toBe(
        count === 20 ? 37 : 320,
      );
    },
  );
  it.each([
    [
      "future schema",
      (m: ReturnType<typeof valid>) => ({ ...m, schemaVersion: 2 }),
    ],
    [
      "unknown fields",
      (m: ReturnType<typeof valid>) => ({ ...m, participants: [] }),
    ],
    [
      "URL",
      (m: ReturnType<typeof valid>) => ({
        ...m,
        background: "https://example.com/a.svg",
      }),
    ],
    [
      "unknown kind",
      (m: ReturnType<typeof valid>) => ({
        ...m,
        objects: [{ ...m.objects[0], kind: "script" }],
      }),
    ],
    [
      "wrong union fields",
      (m: ReturnType<typeof valid>) => ({
        ...m,
        objects: [{ ...m.objects[0], radius: 2 }],
      }),
    ],
    [
      "NaN",
      (m: ReturnType<typeof valid>) => ({
        ...m,
        world: { ...m.world, width: NaN },
      }),
    ],
    [
      "Infinity",
      (m: ReturnType<typeof valid>) => ({
        ...m,
        world: { ...m.world, width: Infinity },
      }),
    ],
  ])("rejects %s", (_, mutate) => {
    expectInvalid(mutate(valid()));
  });
  it("duplicate UUIDs are case insensitive and errors point to the object", () => {
    const map = valid();
    const first = {
      ...map.objects[0]!,
      id: "abcdefab-0000-4000-8000-000000000001",
    };
    map.objects = [first, { ...first, id: first.id.toUpperCase() }];
    const errors = expectInvalid(map, "id");
    expect(errors.some((e) => e.objectId?.toLowerCase() === first.id)).toBe(
      true,
    );
  });
  it("enforces static, moving and total object budgets at boundaries", () => {
    const map = createBenchmarkMap(100);
    expect(validateMap(map).ok).toBe(true);
    expectInvalid({
      ...map,
      objects: [...map.objects, { ...map.objects[0], id: uuid(990) }],
    });
    const wall = valid().objects[0]!;
    expectInvalid({
      ...valid(),
      objects: Array.from({ length: 201 }, (_, n) => ({
        ...wall,
        id: uuid(n),
      })),
    });
    const rotor = TEMPLATES[2]!.map.objects.find((o) => o.kind === "rotor")!;
    expectInvalid({
      ...valid(),
      objects: Array.from({ length: 21 }, (_, n) => ({
        ...rotor,
        id: uuid(n),
      })),
    });
  });
  it("checks rotated rectangle corners, circle edges and full rotor sweep", () => {
    const map = valid();
    const base = {
      id: uuid(1),
      color: "#FFFFFF",
      transform: { x: 1, y: 12, rotation: Math.PI / 4 },
    };
    expectInvalid(
      { ...map, objects: [{ ...base, kind: "wall", width: 4, height: 0.3 }] },
      "transform",
    );
    expectInvalid(
      { ...map, objects: [{ ...base, kind: "circle", radius: 2 }] },
      "transform",
    );
    expectInvalid(
      {
        ...map,
        objects: [
          {
            ...base,
            kind: "rotor",
            width: 4,
            height: 0.3,
            transform: { x: 1, y: 12, rotation: Math.PI / 2 },
            angularVelocity: 1,
          },
        ],
      },
      "transform",
    );
  });
  it("checks moving-platform swept endpoints, phase and initial spawn overlap", () => {
    const map = valid();
    const platform = {
      id: uuid(1),
      color: "#FFFFFF",
      kind: "moving-platform",
      transform: { x: 12, y: 12, rotation: 0 },
      width: 3,
      height: 0.3,
      end: { x: 13, y: 13 },
      periodTicks: 60,
      phaseTicks: 0,
    };
    expect(validateMap({ ...map, objects: [platform] }).ok).toBe(true);
    expectInvalid(
      { ...map, objects: [{ ...platform, end: { x: 24, y: 12 } }] },
      "end",
    );
    expectInvalid(
      { ...map, objects: [{ ...platform, phaseTicks: 60 }] },
      "phaseTicks",
    );
    expectInvalid(
      {
        ...map,
        objects: [{ ...platform, end: { x: 3, y: 1.5 }, phaseTicks: 30 }],
      },
      "spawn",
    );
  });
  it("rejects insufficient/blocked spawn and malformed finish, allows wall intersections", () => {
    const map = valid();
    expectInvalid(
      { ...map, spawn: { x: 2, y: 1, width: 0.44, height: 0.44 } },
      "spawn",
    );
    expect(
      validateMap({ ...map, spawn: { x: 2, y: 1, width: 2, height: 0.44 } }, 20)
        .ok,
    ).toBe(false);
    expectInvalid(
      {
        ...map,
        objects: [
          { ...map.objects[0], transform: { x: 2, y: 1.5, rotation: 0 } },
        ],
      },
      "spawn",
    );
    expectInvalid({ ...map, finish: { left: 4, right: 4.5, y: 26 } }, "finish");
    expectInvalid({ ...map, finish: { left: 1, right: 23, y: 3 } }, "finish");
    expect(
      validateMap({
        ...map,
        objects: [map.objects[0], { ...map.objects[0], id: uuid(2) }],
      }).ok,
    ).toBe(true);
  });
  it("bounds UTF-8 bytes and nesting before JSON.parse, including quoted braces", () => {
    expect(parseMapJson(" ".repeat(262145)).ok).toBe(false);
    expect(parseMapJson('"' + "구".repeat(90000) + '"').ok).toBe(false);
    const deep = parseMapJson("[".repeat(20) + "0" + "]".repeat(20));
    expect(!deep.ok && deep.errors[0]!.code).toBe("json_depth");
    expect(parseMapJson('{"bad":"[{\\\"}"}').ok).toBe(false);
    expect(parseMapJson("{bad").ok).toBe(false);
  });
});
describe("canonical map v1", () => {
  it("sorts keys and object IDs without mutating input; quantizes and collapses -0", async () => {
    const map = valid();
    const before = structuredClone(map);
    const reversed = { ...map, objects: [...map.objects].reverse() };
    expect(serializeMap(reversed)).toBe(serializeMap(map));
    expect(await hashMap(reversed)).toBe(await hashMap(map));
    map.objects[0]!.transform.rotation = -0;
    expect(canonicalizeMap(map).objects[0]!.transform.rotation).toBe(0);
    expect(
      Object.is(canonicalizeMap(map).objects[0]!.transform.rotation, -0),
    ).toBe(false);
    map.objects[0]!.transform.rotation = before.objects[0]!.transform.rotation;
    expect(map).toEqual(before);
  });
  it("has fixed SHA-256 vectors and changes hash when content changes", async () => {
    // Fixed map-c14n-v1 vectors; intentionally not derived from the implementation.
    const hashes = await Promise.all(TEMPLATES.map((t) => hashMap(t.map)));
    expect(hashes).toEqual([
      "fe94d9ff058dac31627ac9ca5f3360558142264c6495162f228fe4145c0380f9",
      "988891e73f91d78d1b1aeec478200554d001cbaec2fa3eecfc0a52a6b12aa53f",
      "634a4878ab7c12c01a255818bd38c518437a6c6e1c92e203154c85e79a43b825",
    ]);
    const map = valid();
    map.theme = "pastel";
    expect(await hashMap(map)).not.toBe(hashes[0]);
  });
});
describe("separate participants, appearance and race config", () => {
  it("trims names, accepts 10000 participants and validates rank/versions/seed", () => {
    expect(
      ParticipantSchema.parse({ ...participant(1), name: "  구슬  " }).name,
    ).toBe("구슬");
    const race = {
      seed: 0xffffffff,
      prngVersion: "mulberry32-v1",
      simulationVersion: "p2-v1",
      participants: Array.from({ length: 10000 }, (_, n) => participant(n)),
      rule: { kind: "rank", targetRank: 10000 },
      timeoutTicks: 7200,
    };
    expect(RaceConfigSchema.safeParse(race).success).toBe(true);
    for (const patch of [
      { seed: -1 },
      { seed: 0x100000000 },
      { seed: 1.2 },
      { timeoutTicks: 60 },
      { prngVersion: "unknown" },
      { participants: [participant(1), participant(1)] },
      { rule: { kind: "rank", targetRank: 10001 } },
      { participants: [...race.participants, participant(10000)] },
    ])
      expect(RaceConfigSchema.safeParse({ ...race, ...patch }).success).toBe(
        false,
      );
  });
  it.each([
    "",
    "a".repeat(25),
    "hello\u202E",
    "hello\u0000",
    "<script>x</script>",
    "https://example.com",
    "() => 1",
    "data:image/png;base64,abc",
  ])("rejects unsafe name %s", (name) => {
    expect(
      ParticipantSchema.safeParse({ ...participant(1), name }).success,
    ).toBe(false);
  });
  it("appearance accepts only known preset fields and asset IDs", () => {
    for (const appearance of [
      { kind: "pattern", patternId: "stripe", color: "#AABBCC" },
      { kind: "emoji", emoji: "🎯", color: "#AABBCC" },
      { kind: "image", assetId: uuid(99), fallbackColor: "#AABBCC" },
    ])
      expect(
        ParticipantSchema.safeParse({ ...participant(1), appearance }).success,
      ).toBe(true);
    for (const appearance of [
      {
        kind: "image",
        assetId: "https://evil/a.png",
        fallbackColor: "#AABBCC",
      },
      { kind: "solid", color: "red", mass: 2 },
      { kind: "emoji", emoji: "<svg>", color: "#AABBCC" },
    ])
      expect(
        ParticipantSchema.safeParse({ ...participant(1), appearance }).success,
      ).toBe(false);
  });
});
