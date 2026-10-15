import type { MapDocument, MapObject } from "../contracts/schemas";
import { canonicalizeMap } from "../contracts/canonical";

export type Template = {
  stages?: readonly { y: number; title: string }[];
  id: string;
  title: string;
  subtitle: string;
  description: string;
  difficulty: "쉬움" | "보통" | "도전";
  supportedParticipants: { min: number; max: number };
  map: MapDocument;
};
// Hand-designed here; no copied course or external artwork.
function design(
  style: "zigzag" | "bumper" | "rotor",
  namespace: number,
): MapDocument {
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
  const bumper = (x: number, y: number, radius: number) =>
    objects.push({
      ...base(x, y, 0, "#FF527E"),
      kind: "bumper",
      radius,
      strength: "normal",
    });
  wall(0.25, 14, 0.5, 28);
  wall(23.75, 14, 0.5, 28);
  wall(12, 27.75, 23, 0.5);
  wall(12, 0.25, 23, 0.5);
  if (style === "zigzag") {
    for (let i = 0; i < 4; i++)
      wall(i % 2 ? 15.4 : 8.6, 8 + i * 4.3, 15.4, 0.28, i % 2 ? -0.16 : 0.16);
    bumper(20.5, 9.5, 0.6);
    bumper(3.5, 14, 0.6);
    bumper(20.5, 18, 0.6);
  } else if (style === "bumper") {
    wall(4.4, 7.3, 7.5, 0.3, 0.25);
    wall(19.6, 7.3, 7.5, 0.3, -0.25);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 5; col++)
        bumper(
          3.3 + col * 4.1 + (row % 2 ? 0.9 : 0),
          10 + row * 3,
          row % 2 ? 0.55 : 0.75,
        );
    wall(4, 24.7, 6.4, 0.3, 0.24);
    wall(20, 24.7, 6.4, 0.3, -0.24);
  } else {
    wall(4.1, 7.4, 6.5, 0.3, 0.25);
    wall(19.9, 7.4, 6.5, 0.3, -0.25);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 3; col++) {
        objects.push({
          ...base(
            4.5 + col * 7.5,
            10 + row * 6,
            row % 2 ? 0.4 : -0.4,
            "#63D6FF",
          ),
          kind: "rotor",
          width: 5,
          height: 0.25,
          angularVelocity: (col % 2 ? -1 : 1) * (0.7 + row * 0.2),
        });
      }
    bumper(8.3, 13, 0.6);
    bumper(15.7, 19, 0.6);
  }
  return canonicalizeMap(
    {
      schemaVersion: 1,
      physicsProfile: "classic-v1",
      world: { width: 24, height: 28 },
      theme: "night",
      spawn: { x: 1.78, y: 1.28, width: 20.39, height: 3.64 },
      finish: { left: 0.75, right: 23.25, y: 26.5 },
      objects,
    },
    100,
  );
}
export const TEMPLATES: readonly Template[] = [
  {
    id: "silk-zigzag-v1",
    title: "황금 지그재그",
    subtitle: "GOLDEN ZIGZAG",
    description: "긴 금빛 경사를 따라 부드럽게 방향을 바꾸는 코스",
    difficulty: "쉬움",
    supportedParticipants: { min: 2, max: 100 },
    map: design("zigzag", 1),
  },
  {
    id: "bloom-bumper-v1",
    title: "홍련 범퍼",
    subtitle: "CRIMSON BLOOM",
    description: "엇갈린 범퍼 사이로 은빛 구슬이 퍼져 나가는 코스",
    difficulty: "보통",
    supportedParticipants: { min: 2, max: 100 },
    map: design("bumper", 2),
  },
  {
    id: "orbit-rotor-v1",
    title: "청룡 회전봉",
    subtitle: "BLUE DRAGON",
    description: "서로 다른 방향의 회전봉 아홉 개가 길을 바꾸는 코스",
    difficulty: "도전",
    supportedParticipants: { min: 2, max: 100 },
    map: design("rotor", 3),
  },
];
