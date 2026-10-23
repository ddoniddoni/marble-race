import { Container, Graphics, Text } from "pixi.js";
import { COLLISION_POP } from "../core/collisionPop";
import type { CollisionBurst } from "../core/types";

/** One bounded graphics layer and a small label pool, driven by simulation ticks. */
export class CollisionPopEffects {
  readonly root = new Container();
  private readonly ink = new Graphics();
  private readonly labels: Text[] = [];
  private lastTick = -1;
  private lastId = -1;
  private lastReducedMotion = false;
  constructor() {
    this.root.scale.set(0.01);
    this.root.addChild(this.ink);
    for (let i = 0; i < 6; i++) {
      const label = new Text({ text: "펑!", style: { fontFamily: '"Apple SD Gothic Neo", sans-serif',
        fontSize: 32, fontWeight: "900", fill: 0xfff4d5, stroke: { color: 0x572148, width: 6 } } });
      label.anchor.set(0.5);
      label.visible = false;
      this.labels.push(label);
      this.root.addChild(label);
    }
  }
  render(bursts: readonly CollisionBurst[], tick: number, reducedMotion: boolean) {
    const id = bursts.at(-1)?.id ?? -1;
    if (tick === this.lastTick && id === this.lastId && reducedMotion === this.lastReducedMotion) return;
    this.lastTick = tick;
    this.lastId = id;
    this.lastReducedMotion = reducedMotion;
    this.ink.clear();
    for (const label of this.labels) label.visible = false;
    let labelIndex = 0;
    for (const burst of bursts) {
      const age = tick - burst.tick;
      if (age < 0 || age >= COLLISION_POP.effectTicks) continue;
      const t = age / COLLISION_POP.effectTicks, fade = 1 - t;
      const x = burst.x * 100, y = burst.y * 100;
      const radius = reducedMotion ? 43 : 22 + t * 100;
      this.ink.circle(x, y, radius).stroke({ color: 0xffd45e, width: 5 * fade + 1, alpha: fade });
      this.ink.circle(x, y, radius * 0.68).stroke({ color: 0xff78c7, width: 3, alpha: fade * 0.75 });
      if (!reducedMotion) {
        for (let ray = 0; ray < 8; ray++) {
          const angle = ray * Math.PI / 4;
          const c = Math.cos(angle), s = Math.sin(angle);
          this.ink.moveTo(x + c * radius, y + s * radius)
            .lineTo(x + c * (radius + 15 * fade), y + s * (radius + 15 * fade))
            .stroke({ color: ray % 2 ? 0xffffff : 0xffd45e, width: 4 * fade + 1, alpha: fade });
        }
      }
      const label = this.labels[labelIndex++];
      if (label) {
        label.visible = true;
        label.alpha = fade;
        label.position.set(x, y - (reducedMotion ? 48 : 40 + t * 35));
      }
    }
  }
}
