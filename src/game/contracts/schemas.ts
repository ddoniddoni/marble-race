import { z } from "zod";
import { inspectGeometry } from "./geometry";

export const LIMITS = {
  jsonBytes: 256 * 1024,
  depth: 12,
  objects: 220,
  static: 200,
  moving: 20,
  participants: 10000,
} as const;
const finite = z.number().finite();
const uuid = z.uuid().transform((value) => value.toLowerCase());
const color = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "#RRGGBB 색상을 입력해 주세요.")
  .transform((value) => value.toUpperCase());
const point = z.strictObject({ x: finite, y: finite });
export const TransformSchema = z.strictObject({
  x: finite,
  y: finite,
  rotation: finite,
});
const base = { id: uuid, transform: TransformSchema, color };
const rectangle = {
  width: finite.min(0.15).max(40),
  height: finite.min(0.15).max(150),
};
export const MapObjectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...base, kind: z.literal("wall"), ...rectangle }),
  z.strictObject({
    ...base,
    kind: z.literal("circle"),
    radius: finite.min(0.1).max(5),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("bumper"),
    radius: finite.min(0.1).max(5),
    strength: z.enum(["soft", "normal", "strong"]),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("rotor"),
    ...rectangle,
    angularVelocity: finite.min(-3).max(3),
    // Omitted means the legacy center pivot; transform is the right hinge otherwise.
    pivot: z.literal("right").optional(),
  }),
  z.strictObject({
    ...base,
    kind: z.literal("moving-platform"),
    ...rectangle,
    end: point,
    periodTicks: z.int().min(60).max(3600),
    phaseTicks: z.int().min(0).max(3599),
  }),
]);
const MapShape = z.strictObject({
  schemaVersion: z.literal(1),
  physicsProfile: z.enum(["classic-v1", "arcade-flow-v1"]),
  finishPace: z.literal("dramatic-v1").optional(),
  finishAir: z.union([z.enum(["pulse-v1", "pulse-v2"]), z.literal(false)]).optional(),
  collisionPop: z.strictObject({ version: z.literal("random-v1"), startY: finite }).optional(),
  world: z.strictObject({
    width: finite.min(8).max(40),
    height: finite.min(10).max(150),
  }),
  theme: z.enum(["neutral", "night", "pastel"]),
  spawn: z.strictObject({
    x: finite,
    y: finite,
    width: finite.positive().max(40),
    height: finite.positive().max(150),
  }),
  finish: z.strictObject({ left: finite, right: finite, y: finite }),
  objects: z.array(MapObjectSchema).max(LIMITS.objects),
});
export type MapObject = z.infer<typeof MapObjectSchema>;
export type MapDocument = z.infer<typeof MapShape>;
export const MapDocumentSchema = MapShape.superRefine((map, ctx) => {
  if (map.finishPace && map.physicsProfile !== "arcade-flow-v1")
    ctx.addIssue({ code: "custom", path: ["finishPace"],
      message: "결승 감속은 arcade-flow-v1 코스에서만 사용할 수 있습니다.",
      params: { reason: "finish_pace_profile" } });
  if (map.finishAir && map.physicsProfile !== "arcade-flow-v1")
    ctx.addIssue({ code: "custom", path: ["finishAir"],
      message: "결승 에어 팝은 arcade-flow-v1 코스에서만 사용할 수 있습니다.",
      params: { reason: "finish_air_profile" } });
  if (map.collisionPop) {
    if (map.physicsProfile !== "arcade-flow-v1")
      ctx.addIssue({ code: "custom", path: ["collisionPop"], message: "충돌 팝은 arcade-flow-v1 코스에서만 사용할 수 있습니다." });
    if (map.collisionPop.startY <= map.spawn.y + map.spawn.height || map.collisionPop.startY >= map.finish.y)
      ctx.addIssue({ code: "custom", path: ["collisionPop", "startY"], message: "충돌 팝 시작은 출발 구역 아래, 결승선 위여야 합니다." });
  }
  const ids = new Set<string>();
  let moving = 0;
  map.objects.forEach((object, index) => {
    if (ids.has(object.id))
      ctx.addIssue({
        code: "custom",
        path: ["objects", index, "id"],
        message: "같은 UUID를 가진 객체가 있습니다.",
        params: { reason: "duplicate_id" },
      });
    ids.add(object.id);
    if (object.kind === "rotor" || object.kind === "moving-platform") moving++;
    if (
      object.kind === "moving-platform" &&
      object.phaseTicks >= object.periodTicks
    )
      ctx.addIssue({
        code: "custom",
        path: ["objects", index, "phaseTicks"],
        message: "phaseTicks는 periodTicks보다 작아야 합니다.",
        params: { reason: "phase_range" },
      });
  });
  if (moving > LIMITS.moving || map.objects.length - moving > LIMITS.static)
    ctx.addIssue({
      code: "custom",
      path: ["objects"],
      message: "정적 객체는 200개, 움직이는 객체는 20개까지 허용합니다.",
      params: { reason: "object_budget" },
    });
  for (const issue of inspectGeometry(map))
    ctx.addIssue({
      code: "custom",
      path: issue.path,
      message: issue.message,
      params: { reason: issue.code },
    });
});

// Plain text only. No implicit coercion, markup, URL, code or bidi control channels.
const safeText = z
  .string()
  .refine(
    (value) =>
      !/[\p{Cc}\p{Cf}<>]|(?:[a-z][a-z\d+.-]*:|\/\/|=>|\bfunction\b|\bimport\s*\(|\beval\s*\()/iu.test(
        value,
      ),
    "제어 문자, 마크업, URL과 코드 문자열은 사용할 수 없습니다.",
  );
export const MarbleAppearanceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("solid"), color }),
  z.strictObject({
    kind: z.literal("pattern"),
    patternId: z.enum(["stripe", "dot"]),
    color,
  }),
  z.strictObject({ kind: z.literal("emoji"), emoji: z.emoji().max(16), color }),
  z.strictObject({
    kind: z.literal("image"),
    assetId: uuid,
    fallbackColor: color,
  }),
]);
export const ParticipantSchema = z.strictObject({
  id: uuid,
  name: safeText
    .transform((value) => value.trim().normalize("NFC"))
    .pipe(z.string().min(1).max(24)),
  appearance: MarbleAppearanceSchema,
});
export const ParticipantsSchema = z
  .array(ParticipantSchema)
  .min(2)
  .max(LIMITS.participants)
  .superRefine((participants, ctx) => {
    const ids = new Set<string>();
    participants.forEach((participant, index) => {
      if (ids.has(participant.id))
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "참가자 UUID는 중복될 수 없습니다.",
        });
      ids.add(participant.id);
    });
  });
export const RaceRuleSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("first") }),
  z.strictObject({
    kind: z.literal("rank"),
    targetRank: z.int().min(1).max(LIMITS.participants),
  }),
  z.strictObject({ kind: z.literal("last-finisher") }),
]);
export const RaceConfigSchema = z
  .strictObject({
    seed: z.int().min(0).max(0xffffffff),
    prngVersion: z.literal("mulberry32-v1"),
    simulationVersion: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    participants: ParticipantsSchema,
    rule: RaceRuleSchema,
    timeoutTicks: z.literal(7200),
  })
  .superRefine((config, ctx) => {
    if (
      config.rule.kind === "rank" &&
      config.rule.targetRank > config.participants.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["rule", "targetRank"],
        message: "지정 순위가 참가자 수를 초과합니다.",
      });
  });
export type MarbleAppearance = z.infer<typeof MarbleAppearanceSchema>;
export type Participant = z.infer<typeof ParticipantSchema>;
export type RaceConfig = z.infer<typeof RaceConfigSchema>;
export type RaceRule = z.infer<typeof RaceRuleSchema>;
