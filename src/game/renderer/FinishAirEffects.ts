import { Container, Graphics, Text } from "pixi.js";
import { finishAirProfile, finishAirZone } from "../core/finishAir";
import type { AirBurst, Scene } from "../core/types";

/** One shared, bounded burst layer; no per-marble particles or animation timers. */
export class FinishAirEffects {
  readonly root = new Container();
  private readonly ports = new Graphics();
  private readonly gust = new Graphics();
  private readonly caption = new Text({ text: "펑!", style: {
    fontFamily: '"Apple SD Gothic Neo", sans-serif', fontSize: 48, fontWeight: "900",
    fill: 0xffffff, stroke: { color: 0x20d6e8, width: 6 },
  } });
  private readonly strong: boolean;
  private lastTick = -1;
  private lastBurstTick = -1;
  constructor(finish: NonNullable<Scene["finish"]>, version: Exclude<Scene["finishAir"], false | undefined> = "pulse-v1") {
    this.strong = version === "pulse-v2";
    if (this.strong) {
      this.caption.style.fontSize = 60;
      this.caption.style.stroke = { color: 0x20d6e8, width: 8 };
    }
    const zone = finishAirZone(finish, finishAirProfile(version));
    this.root.position.set(zone.x, zone.y);
    this.root.scale.set(0.01);
    const sideX = ((finish.right - finish.left) / 2 + 0.16) * 100;
    for (const side of [-1, 1]) {
      const x = side * sideX;
      this.ports.roundRect(x - 9, -20, 18, 40, 5).fill(0x162c37)
        .stroke({ color: 0x82f7ff, width: 3 });
      for (let i = 0; i < 3; i++) this.ports.moveTo(x - side * 2, 9 - i * 9)
        .lineTo(x - side * 10, 2 - i * 9).stroke({ color: 0xf4d06c, width: 3 });
    }
    this.caption.anchor.set(0.5);
    this.caption.visible = false;
    this.root.addChild(this.ports, this.gust, this.caption);
  }
  render(burst: AirBurst | undefined, tick: number, reducedMotion: boolean) {
    const burstTick = burst?.tick ?? -1;
    if (this.lastTick === tick && this.lastBurstTick === burstTick) return;
    this.lastTick = tick;
    this.lastBurstTick = burstTick;
    this.gust.clear();
    const age = burst ? tick - burst.tick : Infinity;
    const duration = this.strong ? 48 : 36;
    const live = age >= 0 && age < duration;
    this.caption.visible = live;
    this.ports.alpha = live ? 1 : 0.62;
    if (!live) return;
    const t = age / duration, fade = 1 - t;
    const power = this.strong ? 1.45 : 1;
    this.caption.alpha = fade;
    this.caption.position.set(0, reducedMotion ? -180 : (-160 - t * 65) * power);
    this.caption.scale.set(reducedMotion ? 1 : (this.strong ? 1.2 : 1.05) + Math.sin(t * Math.PI) * (this.strong ? 0.25 : 0.15));
    if (reducedMotion) {
      this.gust.ellipse(0, -165, 95 * power, 150 * power).fill({ color: 0x73eaff, alpha: 0.08 * fade * power });
      return;
    }
    // White/cyan jets, a pressure ring and rising droplets share the physics tick.
    this.gust.poly([-92, -12, -140 * power, -260 * power, 0, -390 * power, 140 * power, -260 * power, 92, -12])
      .fill({ color: 0x79f5ff, alpha: (this.strong ? 0.15 : 0.09) * fade });
    this.gust.ellipse(0, -30 - t * 170 * power, (40 + t * 145) * power, (12 + t * 35) * power)
      .stroke({ color: 0xecffff, width: 8 * power * fade + 1, alpha: 0.65 * power * fade });
    if (this.strong) this.gust.ellipse(0, -18 - t * 210, 70 + t * 220, 18 + t * 50)
      .stroke({ color: 0x68ecff, width: 4, alpha: 0.45 * fade });
    const rays = this.strong ? 5 : 3;
    for (let ray = -rays; ray <= rays; ray++) {
      const x = ray * 24, rise = t * (210 + Math.abs(ray) * 16) * power;
      this.gust.moveTo(x, -22 - rise).lineTo(x * 1.5, -90 - rise)
        .stroke({ color: ray % 2 ? 0xffffff : 0x68ecff, width: this.strong ? 8 : 6, alpha: 0.8 * fade });
      this.gust.circle(x * (1 + t * 0.6), -140 - rise, 5 + (rays - Math.abs(ray)))
        .fill({ color: 0xb8fbff, alpha: 0.7 * fade });
    }
  }
}
