import { canonicalizeMap } from "../contracts/canonical";
import { LIMITS, type MapObject } from "../contracts/schemas";
import type { Template } from "./v1";
export type { Template } from "./v1";

type Edge = { y: number; left: number; right: number };
// Lengthen the actual course below launch, not the result overlay or clock.
const stretchY = (y: number) => y <= 14 ? y : 14 + (y - 14) * 1.6;
function neonCourse(variant: number) {
  const objects: MapObject[] = [];
  const pendingPins: { x: number; y: number; radius: number; color: string }[] = [];
  const base = (x: number, y: number, rotation = 0, color = "#E8FFFF") => ({
    id: `${String(31 + variant).padStart(8, "0")}-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`,
    transform: { x, y, rotation }, color,
  });
  const wall = (x: number, y: number, width: number, height: number, rotation = 0) =>
    objects.push({ ...base(x, y, rotation), kind: "wall", width, height });
  const rail = (x1: number, y1: number, x2: number, y2: number) =>
    wall((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), 0.32, Math.atan2(y2 - y1, x2 - x1));
  const corridorAt = (rawY: number) => {
    const y = stretchY(rawY);
    const next = edges.findIndex((edge) => edge.y >= y);
    const a = edges[Math.max(0, next - 1)]!, b = edges[Math.max(0, next)]!;
    const t = b.y === a.y ? 0 : (y - a.y) / (b.y - a.y);
    return { left: a.left + (b.left - a.left) * t, right: a.right + (b.right - a.right) * t };
  };
  const bumper = (x: number, y: number, radius = 0.42, color = "#66F1EB") => {
    pendingPins.push({ x, y: stretchY(y), radius, color });
  };
  const placePin = ({ x, y, radius, color }: typeof pendingPins[number]) => {
    // Use shortest distance to the complete rotated wall, not horizontal width.
    // Static pins may never create a sub-diameter pocket against a rail.
    const next = edges.findIndex((edge) => edge.y >= y);
    if (next < 1) return;
    const a = edges[next - 1]!, b = edges[next]!;
    const t = (y - a.y) / (b.y - a.y);
    const left = a.left + (b.left - a.left) * t;
    const right = a.right + (b.right - a.right) * t;
    if (x <= left || x >= right) return;
    for (const object of objects) {
      if (object.kind === "bumper" || object.kind === "circle") {
        if (Math.hypot(x - object.transform.x, y - object.transform.y) - radius - object.radius < 0.65) return;
        continue;
      }
      if (object.kind === "rotor") {
        const sweptRadius = Math.hypot(object.width, object.height) / 2;
        if (Math.hypot(x - object.transform.x, y - object.transform.y) - radius - sweptRadius < 0.65) return;
        continue;
      }
      if (object.kind === "moving-platform") {
        // Conservative bounds of the complete translating rectangle sweep.
        const c = Math.abs(Math.cos(object.transform.rotation));
        const sn = Math.abs(Math.sin(object.transform.rotation));
        const halfW = (object.width * c + object.height * sn) / 2;
        const halfH = (object.width * sn + object.height * c) / 2;
        const left = Math.min(object.transform.x, object.end.x) - halfW;
        const right = Math.max(object.transform.x, object.end.x) + halfW;
        const top = Math.min(object.transform.y, object.end.y) - halfH;
        const bottom = Math.max(object.transform.y, object.end.y) + halfH;
        const outsideX = Math.max(left - x, 0, x - right);
        const outsideY = Math.max(top - y, 0, y - bottom);
        if (Math.hypot(outsideX, outsideY) - radius < 0.65) return;
        continue;
      }
      if (object.kind !== "wall") continue;
      const dx = x - object.transform.x, dy = y - object.transform.y;
      const c = Math.cos(object.transform.rotation), sn = Math.sin(object.transform.rotation);
      const outsideX = Math.max(0, Math.abs(dx * c + dy * sn) - object.width / 2);
      const outsideY = Math.max(0, Math.abs(-dx * sn + dy * c) - object.height / 2);
      if (Math.hypot(outsideX, outsideY) - radius < 0.65) return;
    }
    objects.push({ ...base(x, y, 0, color), kind: "bumper", radius, strength: "strong" });
  };
  const rotor = (x: number, y: number, width: number, speed: number, angle = 0, color = "#66F1EB", height = 0.22) =>
    objects.push({ ...base(x, stretchY(y), angle, color), kind: "rotor", width, height, angularVelocity: speed });
  const shuttle = (x: number, y: number, dx: number, dy: number, width: number,
    height: number, angle: number, phaseTicks = 0) => objects.push({
      ...base(x, stretchY(y), angle, "#FFD45E"), kind: "moving-platform", width, height,
      end: { x: x + dx, y: stretchY(y + dy) }, periodTicks: 180, phaseTicks,
    });
  // Original broad, connected corridors: each course has a different silhouette.
  const paths: Edge[][] = [
    [{y:0.3,left:0.5,right:23.5},{y:6,left:0.5,right:23.5},{y:14,left:4,right:20},{y:26,left:4,right:20},{y:34,left:1,right:17},{y:46,left:1,right:17},{y:54,left:7,right:23},{y:66,left:7,right:23},{y:74,left:3,right:21},{y:84,left:3,right:21}],
    [{y:0.3,left:0.5,right:23.5},{y:6,left:0.5,right:23.5},{y:14,left:2,right:22},{y:26,left:2,right:22},{y:34,left:5,right:19},{y:46,left:5,right:19},{y:54,left:1,right:23},{y:66,left:1,right:23},{y:74,left:4,right:20},{y:84,left:4,right:20}],
    [{y:0.3,left:0.5,right:23.5},{y:6,left:0.5,right:23.5},{y:14,left:1,right:17},{y:26,left:1,right:17},{y:34,left:7,right:23},{y:46,left:7,right:23},{y:54,left:2,right:18},{y:66,left:2,right:18},{y:74,left:4,right:20},{y:84,left:4,right:20}],
  ];
  const exitCenters = [[10, 7, 17], [14, 10, 13], [7, 18, 8]][variant]!;
  const path = paths[variant]!.map((edge, index) => {
    const stage = (index - 3) / 2;
    return Number.isInteger(stage) && stage >= 0 && stage < 3
      ? { ...edge, left: exitCenters[stage]! - 2.2, right: exitCenters[stage]! + 2.2 }
      : edge;
  });
  // Each stage must pass an offset rotating gate before the next chamber.
  const stageEdges = path.slice(2).flatMap((edge, index) => index < 6 && index % 2 === 1
    ? [edge, { ...edge, y: edge.y + 2.4 }] : [edge]);
  const mouth = variant === 2 ? 10.5 : 12;
  // A short narrow neck gathers the field before opening back into stage one.
  // Spawn remains full width; the neck begins below every starting slot.
  const edges = [path[0]!, path[1]!,
    {y:10.8,left:mouth - 1.8,right:mouth + 1.8},
    {y:12.6,left:mouth - 1.8,right:mouth + 1.8},
    ...stageEdges, {y:92,left:11.04,right:12.96}, {y:95.35,left:11.04,right:12.96}]
    .map((edge) => ({ ...edge, y: stretchY(edge.y) }));
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1]!, b = edges[i]!;
    rail(a.left, a.y, b.left, b.y);
    rail(a.right, a.y, b.right, b.y);
  }
  wall(12, 0.25, 23, 0.5);
  wall(12, stretchY(95.75), 23, 0.5);
  // Active kickers above, inside and below the throat; every bar keeps turning.
  for (let col = 0; col < 10; col++) bumper(2.7 + col * 18.6 / 9, 5.8, 0.32, "#FFD45E");
  if (variant === 0) {
    rotor(mouth - 3, 8, 2.4, 2.8, 0.5, "#FF687B");
    rotor(mouth + 3, 8, 2.4, -2.8, -0.5, "#FF687B");
    for (const x of [mouth - 0.8, mouth + 0.8]) bumper(x, 8.6, 0.3, "#FFD45E");
  } else if (variant === 1) {
    for (const offset of [-5, -2.5, 0, 2.5, 5]) bumper(mouth + offset, 7.2, 0.4, "#FC78C7");
    for (const offset of [-3.75, -1.25, 1.25, 3.75]) bumper(mouth + offset, 8.8, 0.35, "#FFD45E");
  } else {
    for (const [index, offset] of [-3, 0, 3].entries())
      rotor(mouth + offset, 7.7, 1.8, index % 2 ? 2.9 : -2.9, index * 0.7, "#A78BFA");
    for (const offset of [-3, 0, 3]) bumper(mouth + offset, 9.1, 0.26, "#FC78C7");
  }
  for (const offset of [-1.3, 1.3]) bumper(mouth + offset, 9.6, 0.3);
  for (const offset of [-2.85, 2.85]) bumper(mouth + offset, 9.9, 0.28, "#FF687B");
  for (const offset of [-0.85, 0.85]) bumper(mouth + offset, 10.2, 0.22, "#FFD45E");
  // A single thin bar spans the throat horizontally, then opens two clear
  // side paths as it turns upright. Its full rotation never reaches a wall.
  rotor(mouth, 11.65, 2.7, variant === 1 ? -2 : 1.8 + variant * 0.15,
    0, "#FF687B", 0.2);
  for (const offset of [-1.3, 1.3]) bumper(mouth + offset, 12.95, 0.25, "#FF687B");
  for (const offset of [-2.65, -0.95, 0.95, 2.65])
    bumper(mouth + offset, 13.35, 0.28, "#FFD45E");
  bumper(mouth, 14.5, 0.38, "#FC78C7");
  // Keep the later connecting bends active, with broad gaps between kickers.
  for (const y of [29, 31.5, 49, 51.5, 69, 71.5]) {
    const corridor = corridorAt(y);
    const left = corridor.left + 1.4, right = corridor.right - 1.4;
    for (let col = 0; col < 7; col++) bumper(left + (right - left) * col / 6, y, 0.28);
  }
  const patterns = [["sweep", "shuttles", "diamonds"], ["diamonds", "sweep", "shuttles"], ["shuttles", "diamonds", "sweep"]] as const;
  patterns[variant]!.forEach((pattern, stage) => {
    const y = 16 + stage * 20;
    const xAt = (fraction: number, rowY = y) => {
      const corridor = corridorAt(rowY);
      // Quarter-lane centers leave room for full rotor and shuttle sweeps.
      return corridor.left + 2.5 + fraction * (corridor.right - corridor.left - 5);
    };
    if (pattern === "sweep") {
      rotor(xAt(0.25), y, 3.4, 2.1, 0.5, "#66F1EB", 0.38);
      rotor(xAt(0.75), y, 3.4, -2.1, -0.5, "#FF687B", 0.38);
    } else if (pattern === "shuttles") {
      shuttle(xAt(0.25) - 0.65, y, 1.3, 0, 2.8, 0.5, 0.55, 0);
      shuttle(xAt(0.75) - 0.65, y, 1.3, 0, 2.8, 0.5, -0.55, 90);
    } else {
      // Actual square colliders, not round pins with square artwork.
      rotor(xAt(0.25), y, 1.6, 1.7, Math.PI / 4, "#FC78C7", 1.6);
      rotor(xAt(0.75), y, 1.6, -1.7, -Math.PI / 4, "#A78BFA", 1.6);
    }
    // A horizontal gate nearly closes; upright opens two wide side paths.
    // Different phases/directions avoid every stage opening in lockstep.
    const speed = (stage % 2 ? -1 : 1) * (0.9 + variant * 0.08 + stage * 0.12);
    rotor(exitCenters[stage]!, y + 11.2, 3.65, speed,
      (variant + stage) * 0.6, "#FFD45E", 0.22);
    for (const [row, offset] of [2.9, 6.8, 8.3].entries())
      for (let col = 0; col < 7; col++) {
        const rowY = y + offset;
        const corridor = corridorAt(rowY);
        const inset = 1.4;
        const x = corridor.left + inset + (corridor.right - corridor.left - inset * 2) *
          (col + (row % 2 ? 0.3 : 0)) / 6.3;
        bumper(x, rowY, row === 1 ? 0.34 : 0.28, row % 2 ? "#FC78C7" : "#66F1EB");
      }
    bumper(xAt(0, y + 5), y + 5, 0.34);
    bumper(xAt(1, y + 5), y + 5, 0.34);
  });
  const final = path[8]!;
  const mid = (final.left + final.right) / 2;
  if (variant === 0) {
    for (const x of [mid - 4, mid, mid + 4]) rotor(x, 77, 2.6, x === mid ? -2 : 2);
    for (let col = 0; col < 5; col++) bumper(mid - 5 + col * 2.5, 81, 0.42);
  } else if (variant === 1) {
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++) bumper(mid - 4.5 + col * 3 + (row % 2 ? 0.5 : 0), 75 + row * 2.8, 0.46, "#FFD45E");
    rotor(mid, 83, 3, 1.8);
  } else {
    rotor(mid - 3.5, 76, 3.4, 1.8);
    rotor(mid + 3.5, 76, 3.4, -1.8);
    rotor(mid, 82, 3.4, -2);
    for (const x of [mid - 4, mid, mid + 4]) bumper(x, 79.2, 0.4);
  }
  // Dense approach into a 1.6-unit final neck; finishers are retired by the race core.
  bumper(10, 87, 0.4);
  bumper(14, 87, 0.4);
  for (let col = 0; col < 8; col++) bumper(8 + col * 8 / 7, 85.6, 0.28, "#FFD45E");
  for (const x of [8, 16]) bumper(x, 86.9, 0.24, "#FC78C7");
  rotor(10.85, 88.8, 1.2, 1.8, 0.5, "#FF687B");
  rotor(13.15, 88.8, 1.2, -1.8, -0.5, "#66F1EB");
  for (const x of [9.8, 14.2]) bumper(x, 89.8, 0.22, "#FFD45E");
  // Keep the sloped approach and neck free of fixed center/side plugs.
  // The full rotating envelope stays inside the funnel. Horizontal nearly
  // closes the approach; vertical opens two 0.71-unit routes into the neck.
  rotor(12, 91.3, 2.4, variant === 1 ? -1.1 : 1.1,
    0, "#FFD45E", 0.18);
  // Evaluate pins only after all walls and moving envelopes are known.
  for (const pin of pendingPins) placePin(pin);
  return canonicalizeMap({
    schemaVersion: 1, physicsProfile: "arcade-flow-v1",
    world: {width:24,height:146}, theme:"night",
    spawn:{x:1.78,y:1.28,width:20.39,height:3.64},
    finish:{left:11.2,right:12.8,y:stretchY(94)}, objects,
  },100);
}
const stages = (titles: readonly string[]) => titles.map((title, index) => ({y:stretchY(12 + index * 20),title}));
export const TEMPLATES: readonly Template[] = [
  {id:"silk-zigzag-v11",title:"네온 드리프트",subtitle:"NEON DRIFT",description:"교차 스위퍼 → 왕복 빗장 → 사각 회전체 · 엇갈린 3단 게이트 · 긴 결승 접근",difficulty:"보통",supportedParticipants:{min:2,max:LIMITS.participants},stages:stages(["교차 스위퍼","왕복 빗장","사각 회전체","삼중 회전 결승"]),map:neonCourse(0)},
  {id:"bloom-bumper-v11",title:"버블 캐스케이드",subtitle:"BUBBLE CASCADE",description:"사각 회전체 → 교차 스위퍼 → 왕복 빗장 · 연속 충돌 · 3단 회전 게이트",difficulty:"도전",supportedParticipants:{min:2,max:LIMITS.participants},stages:stages(["사각 회전체","교차 스위퍼","왕복 빗장","마지막 팝핀"]),map:neonCourse(1)},
  {id:"orbit-rotor-v11",title:"오비트 러시",subtitle:"ORBIT RUSH",description:"왕복 빗장 → 사각 회전체 → 교차 스위퍼 · 좌우 교차 출구 · 3단 회전 게이트",difficulty:"도전",supportedParticipants:{min:2,max:LIMITS.participants},stages:stages(["왕복 빗장","사각 회전체","교차 스위퍼","더블 오비트"]),map:neonCourse(2)},
];
