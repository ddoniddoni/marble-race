import type { MapDocument } from "./schemas";
import { requireMap } from "./validation";
export const CANONICAL_VERSION = "map-c14n-v1";
function ordered(value: unknown): unknown {
  if (typeof value === "number") {
    const rounded = Number(value.toFixed(4));
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(ordered);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, ordered(item)]),
    );
  return value;
}
export function canonicalizeMap(input: unknown, count = 2): MapDocument {
  const valid = requireMap(input, count);
  const objects = valid.objects.map((object) => ({
    ...object,
    transform: {
      ...object.transform,
      rotation:
        Math.abs(object.transform.rotation) > 3.1416
          ? (((object.transform.rotation % (Math.PI * 2)) + Math.PI * 3) %
              (Math.PI * 2)) -
            Math.PI
          : object.transform.rotation,
    },
  }));
  const normalized = ordered({
    ...valid,
    objects: objects.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  });
  // Rounding can move an edge outside the world or collapse a valid thin gap.
  return requireMap(normalized, count);
}
export function serializeMap(input: unknown): string {
  return JSON.stringify(ordered(canonicalizeMap(input)));
}
export async function hashMap(input: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(serializeMap(input)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
