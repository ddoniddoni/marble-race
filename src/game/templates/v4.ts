import { canonicalizeMap } from "../contracts/canonical";
import type { MapObject } from "../contracts/schemas";
import type { Template } from "./v1";
export type { Template } from "./v1";

type Pattern = "scatter" | "diamonds" | "sweep";
const palette = { scatter: "#FF83AA", diamonds: "#FFBD69", sweep: "#79DEF2" };
function flowCourse(variant: number) {
  const objects: MapObject[] = [];
  const base = (x: number, y: number, rotation = 0, color = "#F4C76B") => ({
    id: `${String(10 + variant).padStart(8, "0")}-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`,
    transform: { x, y, rotation }, color,
  });
  const wall = (x: number, y: number, width: number, height: number, rotation = 0) =>
    objects.push({ ...base(x, y, rotation), kind: "wall", width, height });
  const bumper = (x: number, y: number, radius = 0.4, color = "#FF83AA") =>
    objects.push({ ...base(x, y, 0, color), kind: "bumper", radius, strength: "strong" });
  const rotor = (x: number, y: number, width: number, speed: number, angle = 0) =>
    objects.push({ ...base(x, y, angle, "#79DEF2"), kind: "rotor", width, height: 0.22, angularVelocity: speed });
  const rail = (x1: number, y1: number, x2: number, y2: number) =>
    wall((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), 0.32, Math.atan2(y2 - y1, x2 - x1));

  wall(0.25, 36, 0.5, 72);
  wall(23.75, 36, 0.5, 72);
  wall(12, 71.75, 23, 0.5);
  wall(12, 0.25, 23, 0.5);

  // Every stage changes structure. No long shelves or enclosed pin pockets.
  const patterns: readonly (readonly Pattern[])[] = [
    ["sweep", "diamonds", "scatter"],
    ["diamonds", "scatter", "sweep"],
    ["scatter", "sweep", "diamonds"],
  ];
  patterns[variant]!.forEach((pattern, stage) => {
    const y = 8 + stage * 16;
    const color = palette[pattern];
    if (pattern === "scatter") {
      for (let row = 0; row < 5; row++)
        for (let col = 0; col < 7; col++)
          bumper(2.2 + col * 3.1 + (row % 2 ? 0.8 : 0), y + row * 2.4, 0.36, color);
    } else if (pattern === "diamonds") {
      for (const offset of [2, 8])
        for (const x of [3, 7.5, 12, 16.5, 21]) {
          bumper(x, y + offset - 1.6, 0.34, color);
          bumper(x - 1.2, y + offset, 0.34, color);
          bumper(x + 1.2, y + offset, 0.34, color);
          bumper(x, y + offset + 1.6, 0.34, color);
        }
    } else {
      for (const offset of [2, 9]) {
        for (let col = 0; col < 3; col++)
          rotor(4.5 + col * 7.5, y + offset, 4, (col % 2 ? -1 : 1) * (1.3 + variant * 0.2), col % 2 ? -0.4 : 0.4);
        for (const x of [8.25, 15.75]) bumper(x, y + offset, 0.38, color);
      }
      for (let col = 0; col < 7; col++) bumper(3 + col * 3, y + 5.5, 0.38, color);
    }
  });

  // Distinct final stage per course; rotors' swept disks leave open side passages.
  if (variant === 0) {
    for (const x of [5, 12, 19]) rotor(x, 56.5, 2.8, x === 12 ? -1.8 : 1.8);
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 7; col++) bumper(2.6 + col * 3.1 + row * 0.5, 59 + row * 2, 0.32, "#FFBD69");
  } else if (variant === 1) {
    for (let col = 0; col < 5; col++) {
      const x = 3 + col * 4.5;
      bumper(x, 55.2, 0.42);
      bumper(x - 0.8, 57, 0.32);
      bumper(x + 0.8, 57, 0.32);
    }
    rotor(8, 60, 2.8, 1.9);
    rotor(16, 60, 2.8, -1.9);
  } else {
    for (const x of [6, 12, 18]) rotor(x, 55.8, 3, x === 12 ? -1.7 : 1.7);
    for (let col = 0; col < 7; col++) bumper(3 + col * 3, 58.2, 0.34, "#79DEF2");
    rotor(8, 60.5, 3, -1.8);
    rotor(16, 60.5, 3, 1.8);
  }

  // Preserve the funnel silhouette, widen the clear throat from 1.2 to 3.6.
  rail(0.5, 62, 10.04, 69);
  rail(23.5, 62, 13.96, 69);
  wall(10.04, 70.05, 0.32, 2.6);
  wall(13.96, 70.05, 0.32, 2.6);
  for (const x of [5, 10, 14, 19]) bumper(x, 63.5, 0.35, "#7CE6CB");
  for (const x of [9, 15]) bumper(x, 65.5, 0.35, "#7CE6CB");
  for (const x of [11, 13]) bumper(x, 67, 0.3, "#7CE6CB");

  return canonicalizeMap({
    schemaVersion: 1, physicsProfile: "arcade-flow-v1",
    world: { width: 24, height: 72 }, theme: "night",
    spawn: { x: 1.78, y: 1.28, width: 20.39, height: 3.64 },
    finish: { left: 10.2, right: 13.8, y: 70.5 }, objects,
  }, 100);
}
const stageLabels = (names: readonly string[]) => names.map((title, i) => ({ y: 6 + i * 16, title }));
export const TEMPLATES: readonly Template[] = [
  { id: "silk-zigzag-v4", stages: stageLabels(["회전 스위퍼", "다이아몬드 킥", "엇갈린 팝핀", "삼중 회전 결승"]), title: "황금 지그재그", subtitle: "GOLDEN ZIGZAG",
    description: "회전 스위퍼 → 다이아몬드 킥 → 엇갈린 팝핀 → 삼중 회전 결승",
    difficulty: "보통", supportedParticipants: { min: 2, max: 100 }, map: flowCourse(0) },
  { id: "bloom-bumper-v4", stages: stageLabels(["다이아몬드 킥", "엇갈린 팝핀", "회전 스위퍼", "킥 게이트"]), title: "홍련 범퍼", subtitle: "CRIMSON BLOOM",
    description: "다이아몬드 킥 → 엇갈린 팝핀 → 회전 스위퍼 → 갈라지는 킥 게이트",
    difficulty: "도전", supportedParticipants: { min: 2, max: 100 }, map: flowCourse(1) },
  { id: "orbit-rotor-v4", stages: stageLabels(["엇갈린 팝핀", "회전 스위퍼", "다이아몬드 킥", "이중 터빈 결승"]), title: "청룡 회전봉", subtitle: "BLUE DRAGON",
    description: "엇갈린 팝핀 → 회전 스위퍼 → 다이아몬드 킥 → 이중 터빈 결승",
    difficulty: "도전", supportedParticipants: { min: 2, max: 100 }, map: flowCourse(2) },
];
