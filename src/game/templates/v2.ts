import { canonicalizeMap } from "../contracts/canonical";
import type { MapObject } from "../contracts/schemas";
import type { Template } from "./v1";
export type { Template } from "./v1";
// Long-course revision. v1 documents and their historical hashes remain in v1.ts.
function longCourse(style: "zigzag" | "bumper" | "rotor", namespace: number) {
  const objects: MapObject[] = [];
  const base = (x: number, y: number, rotation = 0, color = "#F4C76B") => ({
    id: `0000000${namespace}-0000-4000-8000-${String(objects.length + 1).padStart(12, "0")}`,
    transform: { x, y, rotation },
    color,
  });
  const wall = (
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
  ) => objects.push({ ...base(x, y, rotation), kind: "wall", width, height });
  const bumper = (x: number, y: number, radius = 0.65) =>
    objects.push({
      ...base(x, y, 0, "#FF527E"),
      kind: "bumper",
      radius,
      strength: "normal",
    });
  wall(0.25, 36, 0.5, 72);
  wall(23.75, 36, 0.5, 72);
  wall(12, 71.75, 23, 0.5);
  wall(12, 0.25, 23, 0.5);
  if (style === "zigzag") {
    for (let row = 0; row < 11; row++) {
      wall(
        row % 2 ? 15.4 : 8.6,
        8 + row * 5.6,
        15.4,
        0.28,
        row % 2 ? -0.16 : 0.16,
      );
      if (row % 2 === 0) bumper(20.7, 10 + row * 5.6, 0.6);
    }
  } else if (style === "bumper") {
    wall(4.4, 7.3, 7.5, 0.3, 0.25);
    wall(19.6, 7.3, 7.5, 0.3, -0.25);
    for (let row = 0; row < 14; row++)
      for (let col = 0; col < 5; col++)
        bumper(
          3.3 + col * 4.1 + (row % 2 ? 0.9 : 0),
          10 + row * 4,
          row % 2 ? 0.55 : 0.75,
        );
    wall(4, 67.5, 6.4, 0.3, 0.24);
    wall(20, 67.5, 6.4, 0.3, -0.24);
  } else {
    wall(4.1, 7.4, 6.5, 0.3, 0.25);
    wall(19.9, 7.4, 6.5, 0.3, -0.25);
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++)
        objects.push({
          ...base(
            4.5 + col * 7.5,
            11 + row * 10,
            row % 2 ? 0.4 : -0.4,
            "#63D6FF",
          ),
          kind: "rotor",
          width: 5,
          height: 0.25,
          angularVelocity: (col % 2 ? -1 : 1) * (0.7 + (row % 3) * 0.2),
        });
      bumper(row % 2 ? 8.3 : 15.7, 15 + row * 10, 0.6);
    }
  }
  return canonicalizeMap(
    {
      schemaVersion: 1,
      physicsProfile: "classic-v1",
      world: { width: 24, height: 72 },
      theme: "night",
      spawn: { x: 1.78, y: 1.28, width: 20.39, height: 3.64 },
      finish: { left: 0.75, right: 23.25, y: 70.5 },
      objects,
    },
    100,
  );
}
export const TEMPLATES: readonly Template[] = [
  {
    id: "silk-zigzag-v2",
    title: "황금 지그재그",
    subtitle: "GOLDEN ZIGZAG",
    description: "열한 번 굽이치는 금빛 경사. 길게 이어지는 구슬의 여정",
    difficulty: "쉬움",
    supportedParticipants: { min: 2, max: 100 },
    map: longCourse("zigzag", 4),
  },
  {
    id: "bloom-bumper-v2",
    title: "홍련 범퍼",
    subtitle: "CRIMSON BLOOM",
    description: "70개의 범퍼 사이로 펼쳐지는 길고 화려한 낙하",
    difficulty: "보통",
    supportedParticipants: { min: 2, max: 100 },
    map: longCourse("bumper", 5),
  },
  {
    id: "orbit-rotor-v2",
    title: "청룡 회전봉",
    subtitle: "BLUE DRAGON",
    description: "여섯 층의 회전봉을 지나 끝까지 내려가는 코스",
    difficulty: "도전",
    supportedParticipants: { min: 2, max: 100 },
    map: longCourse("rotor", 6),
  },
];
