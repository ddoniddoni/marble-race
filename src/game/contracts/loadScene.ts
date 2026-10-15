import type { Scene } from "../core/types";
import { canonicalizeMap } from "./canonical";
import { createSpawnSlots } from "./geometry";

/** Validated map adapter, including tick-driven kinematic obstacles. */
export function loadMapScene(input: unknown, count: number, id: string) {
  const map = canonicalizeMap(input, count);
  const scene: Scene = {
    id,
    physicsProfile: map.physicsProfile,
    finishPace: map.finishPace,
    finishAir: map.finishAir,
    width: map.world.width,
    height: map.world.height,
    theme: map.theme,
    spawnSlots: createSpawnSlots(map.spawn).slice(0, count),
    finish: map.finish,
    obstacles: map.objects.map((object) => {
      const circular = object.kind === "circle" || object.kind === "bumper";
      return {
        id: object.id,
        kind: object.kind,
        x: object.transform.x,
        y: object.transform.y,
        rotation: object.transform.rotation,
        width: circular ? object.radius * 2 : object.width,
        height: circular ? object.radius * 2 : object.height,
        speed: object.kind === "rotor" ? object.angularVelocity : 0,
        pivot: object.kind === "rotor" ? object.pivot : undefined,
        motion: object.kind === "moving-platform" ? {
          end: object.end, periodTicks: object.periodTicks, phaseTicks: object.phaseTicks,
        } : undefined,
        color: object.color,
        restitution:
          object.kind === "bumper"
            ? { soft: 0.4, normal: 0.65, strong: 0.9 }[object.strength]
            : undefined,
      };
    }),
  };
  return { map, scene };
}
