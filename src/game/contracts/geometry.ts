import type { MapDocument, MapObject } from "./schemas";

export const SPAWN = {
  radius: 0.22,
  stepX: 1.05,
  stepY: 0.8,
  maxSlots: 100,
} as const;
const EPSILON = 1e-9;
export type Point = { x: number; y: number };
type GeometryIssue = {
  path: (string | number)[];
  code: string;
  message: string;
};
export function createSpawnSlots(spawn: MapDocument["spawn"]): Point[] {
  const columns = Math.max(
    0,
    Math.floor((spawn.width - SPAWN.radius * 2 + EPSILON) / SPAWN.stepX) + 1,
  );
  const rows = Math.max(
    0,
    Math.floor((spawn.height - SPAWN.radius * 2 + EPSILON) / SPAWN.stepY) + 1,
  );
  const slots: Point[] = [];
  for (let row = 0; row < rows && slots.length < SPAWN.maxSlots; row++)
    for (let col = 0; col < columns && slots.length < SPAWN.maxSlots; col++)
      slots.push({
        x: spawn.x + SPAWN.radius + col * SPAWN.stepX,
        y: spawn.y + SPAWN.radius + row * SPAWN.stepY,
      });
  return slots;
}
function initialCenter(object: MapObject): Point {
  if (object.kind === "rotor" && object.pivot === "right") {
    const offset = -object.width / 2;
    return { x: object.transform.x + Math.cos(object.transform.rotation) * offset,
      y: object.transform.y + Math.sin(object.transform.rotation) * offset };
  }
  if (object.kind !== "moving-platform") return object.transform;
  const phase = object.phaseTicks / object.periodTicks;
  const fraction = 1 - Math.abs(2 * phase - 1);
  return {
    x: object.transform.x + (object.end.x - object.transform.x) * fraction,
    y: object.transform.y + (object.end.y - object.transform.y) * fraction,
  };
}
function overlapsSlot(slot: Point, object: MapObject) {
  const center = initialCenter(object);
  const dx = slot.x - center.x,
    dy = slot.y - center.y;
  if (object.kind === "circle" || object.kind === "bumper")
    return dx * dx + dy * dy < (object.radius + SPAWN.radius) ** 2 - EPSILON;
  const cos = Math.cos(object.transform.rotation),
    sin = Math.sin(object.transform.rotation);
  const localX = Math.abs(dx * cos + dy * sin),
    localY = Math.abs(-dx * sin + dy * cos);
  const nearX = Math.max(0, localX - object.width / 2),
    nearY = Math.max(0, localY - object.height / 2);
  return nearX * nearX + nearY * nearY < SPAWN.radius ** 2 - EPSILON;
}
export function inspectGeometry(map: MapDocument): GeometryIssue[] {
  const issues: GeometryIssue[] = [];
  const add = (path: GeometryIssue["path"], code: string, message: string) =>
    issues.push({ path, code, message });
  const fits = (x: number, y: number, halfX: number, halfY: number) =>
    x - halfX >= -EPSILON &&
    y - halfY >= -EPSILON &&
    x + halfX <= map.world.width + EPSILON &&
    y + halfY <= map.world.height + EPSILON;
  const spawn = map.spawn;
  if (
    !fits(
      spawn.x + spawn.width / 2,
      spawn.y + spawn.height / 2,
      spawn.width / 2,
      spawn.height / 2,
    )
  )
    add(["spawn"], "spawn_bounds", "출발 구역 전체가 월드 안에 있어야 합니다.");
  const slots = createSpawnSlots(spawn);
  if (slots.length < 2)
    add(
      ["spawn"],
      "spawn_capacity",
      "출발 구역에는 최소 2개의 겹치지 않는 슬롯이 필요합니다.",
    );
  const finish = map.finish;
  if (
    finish.left < 0 ||
    finish.right > map.world.width ||
    finish.right - finish.left < 0.6 - EPSILON ||
    finish.y <= spawn.y + spawn.height ||
    finish.y > map.world.height
  )
    add(
      ["finish"],
      "finish_bounds",
      "결승선은 월드 안, 출발 구역 아래에 너비 0.6 이상이어야 합니다.",
    );
  map.objects.forEach((object, index) => {
    let halfX: number, halfY: number;
    let center = object.transform;
    if (object.kind === "circle" || object.kind === "bumper")
      halfX = halfY = object.radius;
    else if (object.kind === "rotor" && object.angularVelocity !== 0)
      halfX = halfY = object.pivot === "right"
        ? Math.hypot(object.width, object.height / 2)
        : Math.hypot(object.width, object.height) / 2;
    else {
      const cos = Math.abs(Math.cos(object.transform.rotation)),
        sin = Math.abs(Math.sin(object.transform.rotation));
      halfX = (object.width * cos + object.height * sin) / 2;
      halfY = (object.width * sin + object.height * cos) / 2;
      if (object.kind === "rotor" && object.pivot === "right")
        center = { ...object.transform, ...initialCenter(object) };
    }
    if (
      "width" in object &&
      (object.width > map.world.width || object.height > map.world.height)
    )
      add(
        ["objects", index, "width"],
        "dimension_bounds",
        "직사각형의 너비와 높이는 월드 크기 이하여야 합니다.",
      );
    if (!fits(center.x, center.y, halfX, halfY))
      add(
        ["objects", index, "transform"],
        "shape_bounds",
        "도형 전체와 회전 범위가 월드 안에 있어야 합니다.",
      );
    if (
      object.kind === "moving-platform" &&
      !fits(object.end.x, object.end.y, halfX, halfY)
    )
      add(
        ["objects", index, "end"],
        "motion_bounds",
        "왕복 발판의 전체 이동 경로가 월드 안에 있어야 합니다.",
      );
    if (slots.some((slot) => overlapsSlot(slot, object)))
      add(
        ["objects", index, "spawn"],
        "spawn_overlap",
        "이 객체의 초기 도형이 출발 슬롯과 겹칩니다.",
      );
  });
  return issues;
}
