import { PROFILE, type Obstacle, type Scene } from "./types";

/** An execution layout: immutable source course plus a count-sized launch bay. */
export function expandedStart(scene: Scene, count: number): Scene {
  if (!Number.isInteger(count) || count < 2 || count > 10000) throw new Error("구슬 수는 2~10,000의 정수여야 합니다.");
  if (!scene.spawnSlots?.length) throw new Error("검증된 출발 슬롯이 필요합니다.");
  if (count <= (scene.spawnSlots?.length ?? 0)) return scene;
  if (scene.physicsProfile !== "arcade-flow-v1") throw new Error("이 코스에는 전체 구슬이 출발할 공간이 부족합니다.");
  const spacing = 0.56;
  const columns = Math.ceil(Math.sqrt(count * 2));
  const rows = Math.ceil(count / columns);
  const width = PROFILE.radius * 2 + (columns - 1) * spacing;
  const height = PROFILE.radius * 2 + (rows - 1) * spacing;
  const worldWidth = Math.max(scene.width, width + 3);
  const bounds = { x: (worldWidth - width) / 2, y: 1.28, width, height };
  const bayBottom = bounds.y + height + 0.8;
  const offset = { x: (worldWidth - scene.width) / 2,
    y: bayBottom + Math.max(8, (worldWidth - scene.width) * 0.4) - 0.3 };
  const originalTop = Math.min(...scene.spawnSlots!.map((p) => p.y)) - PROFILE.radius;
  const obstacles: Obstacle[] = scene.obstacles.filter((o) => {
    if (o.kind !== "wall") return true;
    const c = Math.abs(Math.cos(o.rotation)), s = Math.abs(Math.sin(o.rotation));
    const halfY = (o.width * s + o.height * c) / 2;
    // Open the old roof so the enlarged bay connects to the course below.
    return !(c > 0.99 && o.y + halfY < originalTop);
  }).map((o) => ({ ...o, x: o.x + offset.x, y: o.y + offset.y,
    motion: o.motion ? { ...o.motion, end: { x: o.motion.end.x + offset.x, y: o.motion.end.y + offset.y } } : undefined,
  }));
  let serial = 1;
  const existingIds = new Set(obstacles.map((o) => o.id));
  const addWall = (x1: number, y1: number, x2: number, y2: number, thickness = 0.32) => {
    let id: string;
    do { id = `99990001-0000-4000-8000-${String(serial++).padStart(12, "0")}`; } while (existingIds.has(id));
    existingIds.add(id);
    obstacles.push({ id, kind: "wall", x: (x1 + x2) / 2, y: (y1 + y2) / 2,
      width: Math.hypot(x2 - x1, y2 - y1), height: thickness,
      rotation: Math.atan2(y2 - y1, x2 - x1), speed: 0, color: "#E8FFFF" });
  };
  addWall(0.5, 0.25, worldWidth - 0.5, 0.25, 0.5);
  addWall(0.5, 0.3, 0.5, bayBottom);
  addWall(worldWidth - 0.5, 0.3, worldWidth - 0.5, bayBottom);
  addWall(0.5, bayBottom, offset.x + 0.5, offset.y + 0.3);
  addWall(worldWidth - 0.5, bayBottom, offset.x + scene.width - 0.5, offset.y + 0.3);
  obstacles.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const slots = Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / columns), col = index % columns;
    const rowCount = Math.min(columns, count - row * columns);
    return { x: bounds.x + PROFILE.radius + (columns - rowCount) * spacing / 2 + col * spacing,
      y: bounds.y + PROFILE.radius + row * spacing };
  });
  return { ...scene, width: worldWidth, height: scene.height + offset.y, obstacles,
    spawnSlots: slots, finish: scene.finish ? { left: scene.finish.left + offset.x,
      right: scene.finish.right + offset.x, y: scene.finish.y + offset.y } : undefined,
    collisionPop: scene.collisionPop ? { ...scene.collisionPop, startY: scene.collisionPop.startY + offset.y } : undefined,
    stages: scene.stages?.map((stage) => ({ ...stage, y: stage.y + offset.y })),
    startLayout: { version: "expanded-start-v1", columns, rows, spacing, bounds, courseOffset: offset },
  };
}
