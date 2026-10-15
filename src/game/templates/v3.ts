import { canonicalizeMap } from "../contracts/canonical";
import type { MapObject } from "../contracts/schemas";
import type { Template } from "./v1";
export type { Template } from "./v1";

// v3: dense obstacle courses ending in a shared physical funnel.
// Historical v1/v2 documents remain available without changing their hashes.
function funnelCourse(style: "zigzag" | "bumper" | "rotor", namespace: number) {
  const objects: MapObject[] = [];
  const base = (x: number, y: number, rotation = 0, color = "#F4C76B") => ({
    id: `0000000${namespace}-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`,
    transform: { x, y, rotation },
    color,
  });
  const wall = (x: number, y: number, width: number, height: number, rotation = 0) =>
    objects.push({ ...base(x, y, rotation), kind: "wall", width, height });
  const bumper = (x: number, y: number, radius = 0.38) =>
    objects.push({ ...base(x, y, 0, "#FF527E"), kind: "bumper", radius, strength: "normal" });
  const rotor = (x: number, y: number, width: number, speed: number, angle = 0) =>
    objects.push({ ...base(x, y, angle, "#63D6FF"), kind: "rotor", width, height: 0.22, angularVelocity: speed });
  const rail = (x1: number, y1: number, x2: number, y2: number) =>
    wall((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1), 0.32, Math.atan2(y2 - y1, x2 - x1));

  wall(0.25, 36, 0.5, 72);
  wall(23.75, 36, 0.5, 72);
  wall(12, 71.75, 23, 0.5);
  wall(12, 0.25, 23, 0.5);

  if (style === "zigzag") {
    for (let row = 0; row < 10; row++) {
      const mirrored = row % 2 !== 0;
      const x = mirrored ? 15.4 : 8.6;
      const y = 8 + row * 5.2;
      const angle = mirrored ? -0.16 : 0.16;
      wall(x, y, 15.4, 0.28, angle);
      // Pins follow the ramps with room below for a marble to roll through.
      for (let col = 0; col < 6; col++) {
        const localX = -6.4 + col * 2.55;
        bumper(x + localX * Math.cos(angle), y + localX * Math.sin(angle) - 1.15, 0.34);
      }
      if (row > 0)
        for (let col = 0; col < 5; col++) {
          const localX = -5.1 + col * 2.55;
          bumper(x + localX * Math.cos(angle), y + localX * Math.sin(angle) - 2.55, 0.3);
        }
      rotor(mirrored ? 4 : 20, y + 1.8, 2.4, mirrored ? -1.1 : 1.1);
      bumper(mirrored ? 2 : 22, y + 2.2, 0.4);
    }
    for (let col = 0; col < 7; col++) bumper(3 + col * 3, 59.3, 0.38);
  } else if (style === "bumper") {
    for (let row = 0; row < 16; row++) {
      for (let col = 0; col < 5; col++)
        bumper(3.2 + col * 4.1 + (row % 2 ? 0.8 : 0), 8.2 + row * 3.2, row % 2 ? 0.42 : 0.55);
      if (row < 15)
        for (let col = 0; col < 5; col++)
          bumper(5.25 + col * 4.1 - (row % 2 ? 0.8 : 0), 9.8 + row * 3.2, 0.32);
    }
    for (let col = 0; col < 7; col++) bumper(3 + col * 3, 59.3, 0.38);
  } else {
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++)
        rotor(4.5 + col * 7.5, 10 + row * 9, 5, (col % 2 ? -1 : 1) * (0.7 + (row % 3) * 0.2), row % 2 ? 0.4 : -0.4);
      bumper(8.25, 10 + row * 9, 0.38);
      bumper(15.75, 10 + row * 9, 0.38);
      for (let col = 0; col < 9; col++) bumper(2 + col * 2.5, 14.5 + row * 9, 0.34);
      if (row < 5)
        for (let col = 0; col < 8; col++) bumper(3.1 + col * 2.55, 16.4 + row * 9, 0.3);
    }
  }

  // Wide mouth meets the side walls; sloped rails feed a 1.2-unit clear throat.
  // Their lower ends overlap the vertical rails, so there is no shortcut around the gate.
  rail(0.5, 61.5, 11.24, 69);
  rail(23.5, 61.5, 12.76, 69);
  wall(11.24, 70.05, 0.32, 2.6);
  wall(12.76, 70.05, 0.32, 2.6);
  for (const x of [3, 5.5, 12, 18.5, 21]) bumper(x, 62, 0.32);
  rotor(8, 62.2, 2.6, 1.2);
  rotor(16, 62.2, 2.6, -1.2);
  for (const x of [6, 9, 12, 15, 18]) bumper(x, 64.4, 0.3);
  for (const x of [9, 12, 15]) bumper(x, 66, 0.28);
  for (const x of [10.8, 13.2]) bumper(x, 67.5, 0.28);
  bumper(12, 68.4, 0.25);

  return canonicalizeMap({
    schemaVersion: 1,
    physicsProfile: "classic-v1",
    world: { width: 24, height: 72 },
    theme: "night",
    spawn: { x: 1.78, y: 1.28, width: 20.39, height: 3.64 },
    finish: { left: 11.4, right: 12.6, y: 70.5 },
    objects,
  }, 100);
}

export const TEMPLATES: readonly Template[] = [
  {
    id: "silk-zigzag-v3",
    title: "황금 지그재그",
    subtitle: "GOLDEN ZIGZAG",
    description: "핀과 회전봉이 가득한 열 겹의 경사, 마지막은 좁은 깔때기 결승",
    difficulty: "보통",
    supportedParticipants: { min: 2, max: 100 },
    map: funnelCourse("zigzag", 7),
  },
  {
    id: "bloom-bumper-v3",
    title: "홍련 범퍼",
    subtitle: "CRIMSON BLOOM",
    description: "178개 범퍼를 튕겨 내려와 하나의 좁은 결승 입구로",
    difficulty: "도전",
    supportedParticipants: { min: 2, max: 100 },
    map: funnelCourse("bumper", 8),
  },
  {
    id: "orbit-rotor-v3",
    title: "청룡 회전봉",
    subtitle: "BLUE DRAGON",
    description: "20개 회전봉과 122개 범퍼, 결승 직전까지 이어지는 경쟁",
    difficulty: "도전",
    supportedParticipants: { min: 2, max: 100 },
    map: funnelCourse("rotor", 9),
  },
];
