import { canonicalizeMap } from "../contracts/canonical";
import type { MapObject } from "../contracts/schemas";
import type { Template } from "./v1";
export type { Template } from "./v1";

type Edge = { y: number; left: number; right: number };
function neonCourse(variant: number) {
  const objects: MapObject[] = [];
  const base = (x: number, y: number, rotation = 0, color = "#E8FFFF") => ({
    id: `${String(16 + variant).padStart(8, "0")}-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`,
    transform: { x, y, rotation }, color,
  });
  const wall = (x: number, y: number, width: number, height: number, rotation = 0) =>
    objects.push({ ...base(x, y, rotation), kind: "wall", width, height });
  const rail = (x1: number, y1: number, x2: number, y2: number) =>
    wall((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), 0.32, Math.atan2(y2 - y1, x2 - x1));
  const bumper = (x: number, y: number, radius = 0.42, color = "#66F1EB") =>
    objects.push({ ...base(x, y, 0, color), kind: "bumper", radius, strength: "strong" });
  const rotor = (x: number, y: number, width: number, speed: number, angle = 0, color = "#66F1EB") =>
    objects.push({ ...base(x, y, angle, color), kind: "rotor", width, height: 0.22, angularVelocity: speed });
  // Original broad, connected corridors: each course has a different silhouette.
  const paths: Edge[][] = [
    [{y:0.3,left:0.5,right:23.5},{y:6,left:0.5,right:23.5},{y:14,left:4,right:20},{y:26,left:4,right:20},{y:34,left:1,right:17},{y:46,left:1,right:17},{y:54,left:7,right:23},{y:66,left:7,right:23},{y:74,left:3,right:21},{y:84,left:3,right:21}],
    [{y:0.3,left:0.5,right:23.5},{y:6,left:0.5,right:23.5},{y:14,left:2,right:22},{y:26,left:2,right:22},{y:34,left:5,right:19},{y:46,left:5,right:19},{y:54,left:1,right:23},{y:66,left:1,right:23},{y:74,left:4,right:20},{y:84,left:4,right:20}],
    [{y:0.3,left:0.5,right:23.5},{y:6,left:0.5,right:23.5},{y:14,left:1,right:17},{y:26,left:1,right:17},{y:34,left:7,right:23},{y:46,left:7,right:23},{y:54,left:2,right:18},{y:66,left:2,right:18},{y:74,left:4,right:20},{y:84,left:4,right:20}],
  ];
  const edges = [...paths[variant]!, {y:92,left:10.04,right:13.96}, {y:95.35,left:10.04,right:13.96}];
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1]!, b = edges[i]!;
    rail(a.left, a.y, b.left, b.y);
    rail(a.right, a.y, b.right, b.y);
  }
  wall(12, 0.25, 23, 0.5);
  wall(12, 95.75, 23, 0.5);
  // The opening is a map-specific action sequence. All rotating envelopes
  // start below the spawn, with several open routes around each obstacle.
  if (variant === 0) {
    // Split immediately, ricochet through pins, then cross a second sweep.
    for (const [index, x] of [5, 12, 19].entries())
      rotor(x, 7, 3, index % 2 ? -2.6 : 2.6, index % 2 ? -0.45 : 0.45, "#FF687B");
    for (const x of [3.6, 7.8, 12, 16.2, 20.4]) bumper(x, 9.5, 0.38, "#FFD45E");
    rotor(8, 12, 3.2, -2.4, 0.6);
    rotor(16, 12, 3.2, 2.4, -0.6);
    for (const x of [5.5, 12, 18.5]) bumper(x, 13.6, 0.34, "#FF687B");
  } else if (variant === 1) {
    // Staggered bubbles interrupt straight falls without forming a gate.
    for (let row = 0; row < 3; row++) {
      const count = row % 2 ? 6 : 7;
      for (let col = 0; col < count; col++)
        bumper(3.5 + (row % 2 ? 1.4 : 0) + col * 2.8, 5.9 + row * 2.1,
          0.5 - row * 0.06, row % 2 ? "#FC78C7" : "#FFD45E");
    }
    rotor(8, 12.5, 2.8, 2.8, 0.4, "#FC78C7");
    rotor(16, 12.5, 2.8, -2.8, -0.4, "#FC78C7");
    bumper(12, 13.5, 0.44);
  } else {
    // Two offset banks of counter-rotating turbines, with kickers between.
    for (const [index, x] of [5, 12, 19].entries())
      rotor(x, 7, 3, index % 2 ? 2.8 : -2.8, index * 0.65, "#A78BFA");
    for (const x of [3.5, 7.5, 11.5, 15.5, 19.5]) bumper(x, 9.2, 0.34);
    for (const [index, x] of [6, 10.5, 15].entries())
      rotor(x, 11.3, 2.4, index % 2 ? -2.7 : 2.7, 0.7, "#FC78C7");
    for (const x of [3.5, 7, 10.5, 14]) bumper(x, 13.6, 0.38, "#A78BFA");
  }
  // Keep the later connecting bends active, with broad gaps between kickers.
  for (const y of [29, 31.5, 49, 51.5, 69, 71.5]) {
    const next = edges.findIndex((edge) => edge.y >= y);
    const a = edges[next - 1]!, b = edges[next]!;
    const t = (y - a.y) / (b.y - a.y);
    const left = a.left + (b.left - a.left) * t + 2;
    const right = a.right + (b.right - a.right) * t - 2;
    for (let col = 0; col < 5; col++) bumper(left + (right - left) * col / 4, y, 0.28);
  }
  const patterns = [["sweep","pins","diamonds"],["pins","diamonds","sweep"],["diamonds","sweep","pins"]] as const;
  patterns[variant]!.forEach((pattern, stage) => {
    const edge = edges[2 + stage * 2]!;
    const center = (edge.left + edge.right) / 2;
    const inner = edge.right - edge.left - 5;
    const xAt = (fraction: number) => center + (fraction - 0.5) * inner;
    const y = 16 + stage * 20;
    if (pattern === "sweep") {
      for (const row of [0, 6]) {
        rotor(xAt(0.2), y + row, 3.6, 1.5 + variant * 0.15, 0.5);
        rotor(xAt(0.8), y + row, 3.6, -1.5 - variant * 0.15, -0.5);
      }
      for (let col = 0; col < 5; col++) bumper(xAt(col / 4), y + 3, 0.34);
    } else if (pattern === "pins") {
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 5; col++)
          bumper(xAt((col + (row % 2 ? 0.35 : 0)) / 4.35), y + row * 2.4, 0.4, "#FFD45E");
    } else {
      for (const row of [0, 5])
        for (let col = 0; col < 3; col++) {
          const x = xAt(col / 2);
          bumper(x, y + row, 0.36, "#FC78C7");
          bumper(x - 0.8, y + row + 1.4, 0.3, "#FC78C7");
          bumper(x + 0.8, y + row + 1.4, 0.3, "#FC78C7");
        }
    }
  });
  const final = edges[8]!;
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
  // Active obstacles before the neck, with an open 3.6-unit exit after them.
  bumper(10, 87, 0.4);
  bumper(14, 87, 0.4);
  bumper(11, 90, 0.3);
  bumper(13, 90, 0.3);
  return canonicalizeMap({
    schemaVersion: 1, physicsProfile: "arcade-flow-v1",
    world: {width:24,height:96}, theme:"night",
    spawn:{x:1.78,y:1.28,width:20.39,height:3.64},
    finish:{left:10.2,right:13.8,y:94}, objects,
  },100);
}
const stages = (titles: readonly string[]) => titles.map((title, index) => ({y:12 + index * 20,title}));
export const TEMPLATES: readonly Template[] = [
  {id:"silk-zigzag-v6",title:"네온 드리프트",subtitle:"NEON DRIFT",description:"교차 스위퍼로 출발 · 좌우 네온 레일과 삼중 회전 결승",difficulty:"보통",supportedParticipants:{min:2,max:100},stages:stages(["회전 스위퍼","팝핀 낙하","다이아몬드 킥","삼중 회전 결승"]),map:neonCourse(0)},
  {id:"bloom-bumper-v6",title:"버블 캐스케이드",subtitle:"BUBBLE CASCADE",description:"3단 버블 샤워로 출발 · 넓어졌다 좁아지는 연속 킥 챔버",difficulty:"도전",supportedParticipants:{min:2,max:100},stages:stages(["버블 챔버","다이아몬드 킥","회전 스위퍼","마지막 팝핀"]),map:neonCourse(1)},
  {id:"orbit-rotor-v6",title:"오비트 러시",subtitle:"ORBIT RUSH",description:"6개 역회전 터빈으로 출발 · 엇갈리는 통로와 더블 오비트",difficulty:"도전",supportedParticipants:{min:2,max:100},stages:stages(["다이아몬드 킥","반전 터빈","팝핀 낙하","더블 오비트"]),map:neonCourse(2)},
];
