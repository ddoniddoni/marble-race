import { z } from "zod";
import { LIMITS, MapDocumentSchema, type MapDocument } from "./schemas";
import { createSpawnSlots } from "./geometry";
export type ContractError = {
  objectId: string | null;
  field: string;
  code: string;
  message: string;
};
export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ContractError[] };
function failure(
  code: string,
  message: string,
  field = "$",
  objectId: string | null = null,
): Validation<never> {
  return { ok: false, errors: [{ objectId, field, code, message }] };
}
export function validateMap(
  input: unknown,
  participantCount = 2,
): Validation<MapDocument> {
  const parsed = MapDocumentSchema.safeParse(input);
  if (!parsed.success) {
    const objects =
      input &&
      typeof input === "object" &&
      "objects" in input &&
      Array.isArray(input.objects)
        ? input.objects
        : [];
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => {
        const object =
          issue.path[0] === "objects" && typeof issue.path[1] === "number"
            ? (objects[issue.path[1]] as unknown)
            : null;
        const objectId =
          object &&
          typeof object === "object" &&
          "id" in object &&
          typeof object.id === "string"
            ? object.id
            : null;
        const version = issue.path[0] === "schemaVersion";
        const custom = issue.code === "custom";
        return {
          objectId,
          field: issue.path.map(String).join(".") || "$",
          code: version
            ? "unsupported_version"
            : custom
              ? String(issue.params?.reason ?? "invalid_value")
              : issue.code,
          message: version
            ? "지원하지 않는 맵 버전입니다. schemaVersion 1만 읽을 수 있습니다."
            : custom || /[가-힣]/.test(issue.message)
              ? issue.message
              : issue.code === "unrecognized_keys"
                ? `허용하지 않는 필드: ${issue.keys.join(", ")}`
                : "필드의 종류, 형식 또는 허용 범위를 확인해 주세요.",
        };
      }),
    };
  }
  if (!z.int().min(2).max(LIMITS.participants).safeParse(participantCount).success)
    return failure(
      "participant_count",
      "참가자는 2~10,000명의 정수여야 합니다.",
      "participants",
    );
  if (parsed.data.physicsProfile !== "arcade-flow-v1" && createSpawnSlots(parsed.data.spawn).length < participantCount)
    return failure(
      "spawn_capacity",
      `${participantCount}명이 출발할 슬롯이 부족합니다.`,
      "spawn",
    );
  return { ok: true, value: parsed.data };
}
export class MapContractError extends Error {
  constructor(readonly errors: ContractError[]) {
    super(errors.map((e) => `${e.field}: ${e.message}`).join("\n"));
    this.name = "MapContractError";
  }
}
export function requireMap(input: unknown, count = 2): MapDocument {
  const result = validateMap(input, count);
  if (!result.ok) throw new MapContractError(result.errors);
  return result.value;
}
export function parseMapJson(text: string, count = 2): Validation<MapDocument> {
  // The cheap code-unit guard prevents a huge UTF-8 allocation for oversized input.
  if (
    text.length > LIMITS.jsonBytes ||
    new TextEncoder().encode(text).byteLength > LIMITS.jsonBytes
  )
    return failure("json_size", "JSON은 UTF-8 256 KiB 이하여야 합니다.");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const char of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{" || char === "[") {
      if (++depth > LIMITS.depth)
        return failure("json_depth", "JSON 중첩은 12단계 이하여야 합니다.");
    } else if (char === "}" || char === "]") depth--;
  }
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    return failure("invalid_json", "올바른 JSON 형식이 아닙니다.");
  }
  return validateMap(input, count);
}
