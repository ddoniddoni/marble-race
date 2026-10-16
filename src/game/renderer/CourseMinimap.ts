import { Container, Graphics, Text } from "pixi.js";
import type { Scene } from "../core/types";
import type { cameraFrame } from "./camera";
// Shares the existing Pixi stage and RAF; never creates a second canvas or world.
export class CourseMinimap {
  readonly root = new Container();
  private readonly panel = new Graphics();
  private readonly map = new Container();
  private readonly dots = new Graphics();
  private readonly window = new Graphics();
  private readonly mechanisms: Graphics[] = [];
  private readonly title = new Text({
    text: "COURSE MAP",
    style: {
      fontFamily: "monospace",
      fontSize: 9,
      letterSpacing: 2,
      fill: 0x9dafbf,
    },
  });
  constructor(private readonly scene: Scene) {
    this.root.addChild(this.panel, this.title, this.map);
    this.title.position.set(10, 9);
    const terrain = new Graphics();
    for (const obstacle of scene.obstacles) {
      const moving = obstacle.kind === "rotor" || obstacle.kind === "moving-platform";
      const shape = moving ? new Graphics() : terrain;
      const tint = moving ? 0x7ce6cb : 0x7896a6;
      if (obstacle.kind === "bumper" || obstacle.kind === "circle") {
        shape.circle(obstacle.x, obstacle.y, obstacle.width / 2).fill(0x8c6883);
      } else if (moving) {
        shape
          .rect(
            obstacle.kind === "rotor" && obstacle.pivot === "right" ? -obstacle.width : -obstacle.width / 2,
            -obstacle.height / 2,
            obstacle.width,
            obstacle.height,
          )
          .fill(tint);
        shape.position.set(obstacle.x, obstacle.y);
        shape.rotation = obstacle.rotation;
        this.mechanisms.push(shape);
      } else {
        const c = Math.cos(obstacle.rotation),
          s = Math.sin(obstacle.rotation);
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].flatMap(([x, y]) => {
          const dx = (x! * obstacle.width) / 2,
            dy = (y! * obstacle.height) / 2;
          return [obstacle.x + c * dx - s * dy, obstacle.y + s * dx + c * dy];
        });
        shape.poly(corners).fill(tint);
      }
    }
    if (scene.finish) {
      const { left, right, y } = scene.finish;
      terrain.rect(left, y, right - left, 0.45).fill(0xffbd69);
    }
    this.map.addChild(terrain, ...this.mechanisms, this.window, this.dots);
  }
  resize(width: number, height: number) {
    const scale = Math.min(
      width < 600 ? 2.4 : 7,
      (width < 600 ? 68 : 126) / this.scene.width,
      Math.max(0.1, (height - 100) / this.scene.height),
    );
    const panelWidth = this.scene.width * scale + 20;
    const panelHeight = this.scene.height * scale + 38;
    this.root.position.set(width < 600 ? 8 : 18, width < 600 ? 64 : 62);
    this.map.position.set(10, 28);
    this.map.scale.set(scale);
    this.panel
      .clear()
      .roundRect(0, 0, panelWidth, panelHeight, 3)
      .fill({ color: 0x121719, alpha: 0.66 })
      .stroke({ color: 0x66f1eb, width: 1, alpha: 0.25 });
  }
  worldPointAt(point: { x: number; y: number }) {
    if (!this.root.visible || this.map.scale.x <= 0) return null;
    const x = (point.x - this.root.x - this.map.x) / this.map.scale.x;
    const y = (point.y - this.root.y - this.map.y) / this.map.scale.y;
    return x >= 0 && x <= this.scene.width && y >= 0 && y <= this.scene.height ? { x, y } : null;
  }
  render(
    marbles: readonly Container[],
    count: number,
    colors: readonly number[],
    frame: ReturnType<typeof cameraFrame>,
    states?: Uint8Array,
  ) {
    this.dots.clear();
    for (let i = 0; i < count; i++) {
      if (states && states[i] !== 1) continue;
      const marble = marbles[i]!;
      this.dots
        .circle(marble.x, marble.y, 0.32)
        .fill(colors[i % colors.length]!);
    }
    for (let i = 0; i < this.mechanisms.length; i++) {
      const pose = marbles[count + i]!;
      this.mechanisms[i]!.position.set(pose.x, pose.y);
      this.mechanisms[i]!.rotation = pose.rotation;
    }
    this.window
      .clear()
      .rect(frame.left, frame.top, frame.visibleWidth, frame.visibleHeight)
      .fill({ color: 0x7ce6cb, alpha: 0.09 })
      .stroke({ color: 0x7ce6cb, width: 0.2 });
  }
}
