import type { MarbleCount, Obstacle } from "../core/types";
import type { MapDocument } from "../contracts/schemas";
import { loadMapScene } from "../contracts/loadScene";

export function createBenchmarkMap(count: MarbleCount): MapDocument {
  const obstacles: Obstacle[] = [];
  const add = (
    kind: Obstacle["kind"],
    x: number,
    y: number,
    width: number,
    height: number,
    rotation = 0,
    speed = 0,
  ) => {
    obstacles.push({
      id: `obstacle-${String(obstacles.length).padStart(3, "0")}`,
      kind,
      x,
      y,
      width,
      height,
      rotation,
      speed,
    });
  };
  add("wall", 0.25, 14, 0.5, 28);
  add("wall", 23.75, 14, 0.5, 28);
  add("wall", 12, 27.75, 23, 0.5);
  add("wall", 12, 0.25, 23, 0.5);
  add("wall", 5.2, 7.6, 8.8, 0.3, 0.25);
  add("wall", 18.8, 7.6, 8.8, 0.3, -0.25);
  add("wall", 4.6, 17.3, 7.4, 0.3, 0.35);
  add("wall", 19.4, 17.3, 7.4, 0.3, -0.35);
  if (count === 20) {
    for (const [x, y] of [
      [5, 12],
      [12, 12],
      [19, 12],
      [6, 21],
      [12, 23],
      [18, 21],
    ])
      add("bumper", x!, y!, 1.25, 1.25);
    add("rotor", 12, 9.2, 5.2, 0.3, 0, 1.4);
    add("rotor", 9, 18.8, 4, 0.3, 0, -1.2);
    add("rotor", 16, 25, 5, 0.3, 0.3, 1.5);
  } else {
    for (let row = 0; row < 12; row++)
      for (let col = 0; col < 16; col++) {
        add("bumper", 1.4 + col * 1.4, 9 + row * 1.5, 0.24, 0.24);
      }
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 5; col++) {
        add(
          "rotor",
          3 + col * 4.4,
          row === 3 ? 25.7 : 10 + row * 5.1,
          row === 3 ? 4.2 : 2.3,
          0.18,
          0,
          (col % 2 ? -1 : 1) * 1.4,
        );
      }
  }
  return {
    schemaVersion: 1,
    physicsProfile: "classic-v1",
    world: { width: 24, height: 28 },
    theme: "night",
    spawn: { x: 1.78, y: 1.28, width: 20.39, height: 3.64 },
    finish: { left: 0.75, right: 23.25, y: 26.5 },
    objects: obstacles.map((object, index) => {
      const base = {
        id: `00000009-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        transform: { x: object.x, y: object.y, rotation: object.rotation },
        color:
          object.kind === "wall"
            ? "#F4C76B"
            : object.kind === "rotor"
              ? "#63D6FF"
              : "#FF527E",
      };
      if (object.kind === "bumper")
        return {
          ...base,
          kind: "bumper",
          radius: object.width / 2,
          strength: "strong",
        };
      if (object.kind === "rotor")
        return {
          ...base,
          kind: "rotor",
          width: object.width,
          height: object.height,
          angularVelocity: object.speed,
        };
      return {
        ...base,
        kind: "wall",
        width: object.width,
        height: object.height,
      };
    }),
  };
}
export function createScene(count: MarbleCount) {
  return loadMapScene(
    createBenchmarkMap(count),
    count,
    count === 20 ? "p0-slope-20-contract-v1" : "p0-stress-100-contract-v1",
  ).scene;
}
