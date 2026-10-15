import { Application, Container, Graphics, Sprite, Text } from "pixi.js";
import { PROFILE, type AirBurst, type Pose, type Scene } from "../core/types";

import { cameraFrame, cameraFromTransform, startCameraFrame, type ViewMode } from "./camera";
import { CourseMinimap } from "./CourseMinimap";
import { MarbleArt } from "./MarbleArt";
import { FinishAirEffects } from "./FinishAirEffects";

const COLORS = [0xff687b, 0xffd45e, 0x8ff07a, 0x66e8f1, 0xa78bfa, 0xf67cde];
export const rendererResources = { renderers: 0, observers: 0 };
export class PixiRenderer {
  private readonly app = new Application();
  private readonly root = new Container();
  private readonly moving: Container[] = [];
  private readonly raceEffects = new Graphics();
  private finishAirEffects: FinishAirEffects | null = null;
  private airBurst: AirBurst | undefined;
  setAirBurst(burst: AirBurst | undefined) { this.airBurst = burst; }
  private leaderIndex: number | null = null;
  private winnerIndices: readonly number[] = [];
  private racing = false;
  private reducedMotion = false;
  setRaceFocus(leader: number | null, winners: readonly number[], racing: boolean) {
    this.leaderIndex = leader;
    this.winnerIndices = winners;
    this.racing = racing;
  }
  private readonly labels: Text[] = [];
  private participantNames: readonly string[] = [];
  private marbleStates: Uint8Array | undefined;
  private marbleArt: MarbleArt | null = null;
  private readonly engravings: Sprite[] = [];
  setMarbleStates(states: Uint8Array | undefined) { this.marbleStates = states; }
  private readonly kickerLights: { id: string; halo: Graphics; baseScale: number }[] = [];
  private impactTicks: ReadonlyMap<string, number> | undefined;
  private simulationTick = 0;
  setImpacts(impacts: ReadonlyMap<string, number> | undefined, tick: number) {
    this.impactTicks = impacts;
    this.simulationTick = tick;
  }
  private viewMode: ViewMode = "follow";
  private namesVisible = true;
  private count = 0;
  private world = { width: 24, height: 28 };
  private viewport = { width: 600, height: 700 };
  private frontY = 0;
  private frontX = 12;
  private zoom = 1;
  private cinematicZoom = 1;
  private startBounds: { x: number; y: number; width: number; height: number } | undefined;
  private setupExpanded = true;
  private startFrame: ReturnType<typeof cameraFrame> | null = null;
  private followBlend = 0;
  setSetupExpanded(expanded: boolean) { this.setupExpanded = expanded; }
  private narrowGates: { y: number; left: number; right: number; length: number }[] = [];
  private snapCamera = true;
  resetCamera() { this.snapCamera = true; this.followBlend = 0; }
  private minimap: CourseMinimap | null = null;
  get camera() {
    if (this.startBounds && this.viewMode === "follow" && this.simulationTick === 0)
      return startCameraFrame(this.world, this.viewport, this.startBounds, this.setupExpanded, this.zoom);
    const frame = cameraFrame(
      this.world,
      this.viewport,
      this.frontY,
      this.viewMode,
      this.frontX,
      this.zoom * this.cinematicZoom,
    );
    if (this.startBounds && this.viewMode === "follow" && this.startFrame && this.followBlend < 1) {
      const t = this.followBlend;
      return cameraFromTransform(this.world, this.viewport,
        this.startFrame.x + (frame.x - this.startFrame.x) * t,
        this.startFrame.y + (frame.y - this.startFrame.y) * t,
        this.startFrame.scale + (frame.scale - this.startFrame.scale) * t, this.zoom);
    }
    return { ...frame, zoom: this.zoom };
  }
  setZoom(zoom: number) {
    if (Number.isFinite(zoom)) this.zoom = Math.max(0.75, Math.min(2, zoom));
  }
  get labelsVisible() {
    return this.namesVisible;
  }
  setView(mode: ViewMode) {
    this.viewMode = mode;
  }
  setParticipantNames(names: readonly string[]) {
    this.participantNames = names;
    if (this.marbleArt) {
      const textures = this.marbleArt.prepareNames(Array.from({ length: this.count },
        (_, index) => names[index] ?? String(index + 1)));
      for (let i = 0; i < this.engravings.length; i++) this.engravings[i]!.texture = textures[i]!;
    }
  }
  setNamesVisible(visible: boolean) {
    this.namesVisible = visible;
  }
  private observer: ResizeObserver | null = null;
  private initialized = false;
  private disposed = false;
  private tracked = false;
  get canvas() {
    return this.app.canvas;
  }
  get tickerStarted() {
    return this.app.ticker.started;
  }
  async init(
    host: HTMLElement,
    scene: Scene,
    count: number,
    names: readonly string[] = [],
  ) {
    this.world = { width: scene.width, height: scene.height };
    this.count = count;
    this.startBounds = scene.startLayout?.bounds;
    this.participantNames = names;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.namesVisible = count <= 20;
    // Own the canvas even if asynchronous WebGL initialization fails.
    const canvas = document.createElement("canvas");
    try {
      await this.app.init({
        canvas,
        preference: "webgl",
        autoStart: false,
        sharedTicker: false,
        width: 600,
        height: 700,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        antialias: true,
        background:
          scene.theme === "pastel"
            ? 0x1c1925
            : scene.theme === "neutral"
              ? 0x131a22
              : 0x020405,
        eventFeatures: {
          move: false,
          globalMove: false,
          click: false,
          wheel: false,
        },
      });
      this.initialized = true;
      this.app.stop();
      this.app.stage.eventMode = "none";
      this.app.stage.addChild(this.root);
      const grid = new Graphics();
      for (let x = 1; x < scene.width; x += 2)
        for (let y = 1; y < scene.height; y += 2)
          grid.circle(x, y, 0.018).fill({ color: 0x6c8ea6, alpha: 0.2 });
      if (scene.theme !== "night") this.root.addChild(grid);
      else grid.destroy();
      // Identify paired vertical rails of a short narrow throat from real map geometry.
      const uprights = scene.obstacles.filter((o) => o.kind === "wall" &&
        Math.abs(Math.cos(o.rotation)) < 0.005 && o.width >= 1 && o.width <= 6);
      for (let i = 0; i < uprights.length; i++) {
        const a = uprights[i]!;
        for (const b of uprights.slice(i + 1)) {
          const left = Math.min(a.x, b.x) + Math.max(a.height, b.height) / 2;
          const right = Math.max(a.x, b.x) - Math.max(a.height, b.height) / 2;
          if (Math.abs(a.y - b.y) > 0.01 || Math.abs(a.width - b.width) > 0.01 ||
            right - left < 0.6 || right - left > 4.5) continue;
          const gate = { y: a.y, left, right, length: a.width };
          this.narrowGates.push(gate);
          const accent = new Graphics();
          for (const x of [left, right]) accent.moveTo(x, gate.y - gate.length / 2)
            .lineTo(x, gate.y + gate.length / 2).stroke({ color: 0xffd45e, width: 0.055, alpha: 0.9 });
          const mid = (left + right) / 2, top = gate.y - gate.length / 2;
          for (const side of [-1, 1]) accent.moveTo(mid + side * 0.5, top - 0.6)
            .lineTo(mid + side * 0.2, top - 0.25).stroke({ color: 0xffd45e, width: 0.05, alpha: 0.7 });
          this.root.addChild(accent);
        }
      }
      for (const [index, stage] of (scene.stages ?? []).entries()) {
        const separator = new Graphics().moveTo(1, stage.y).lineTo(scene.width - 1, stage.y)
          .stroke({ color: 0x79def2, width: 0.025, alpha: 0.2 });
        const title = new Text({ text: `STAGE ${String(index + 1).padStart(2, "0")} / ${stage.title}`,
          style: { fontFamily: '"Apple SD Gothic Neo", sans-serif', fontSize: 24,
            fontWeight: "700", fill: 0x8da5b5, stroke: { color: 0x080d14, width: 3 } } });
        title.anchor.set(0.5, 1);
        title.scale.set(0.017);
        title.position.set(scene.width / 2, stage.y - 0.18);
        this.root.addChild(separator, title);
      }
      if (scene.finish) {
        const line = new Graphics();
        const { left, right, y } = scene.finish;
        if (right - left < 5) {
          line.roundRect(left - 0.3, y - 0.22, right - left + 0.6, 0.78, 0.15)
            .fill({ color: 0xffbd69, alpha: 0.16 });
          const finishLabel = new Text({
            text: "FINISH",
            style: { fontFamily: "monospace", fontSize: 28, fontWeight: "700", fill: 0xffe6b6,
              stroke: { color: 0x080d14, width: 4 } },
          });
          finishLabel.anchor.set(0.5, 0);
          finishLabel.scale.set(0.012);
          finishLabel.position.set((left + right) / 2, y + 0.5);
          this.root.addChild(finishLabel);
        }
        for (let x = left, index = 0; x < right; x += 0.4, index++) {
          line
            .rect(x, y, Math.min(0.4, right - x), 0.17)
            .fill({ color: index % 2 ? 0xf4c76b : 0x344054, alpha: 0.75 });
          line
            .rect(x, y + 0.17, Math.min(0.4, right - x), 0.17)
            .fill({ color: index % 2 ? 0x344054 : 0xf4c76b, alpha: 0.75 });
        }
        this.root.addChild(line);
      }
      if (scene.finishAir && scene.finish) {
        this.finishAirEffects = new FinishAirEffects(scene.finish, scene.finishAir);
        this.root.addChild(this.finishAirEffects.root);
      }
      const mechanisms: Graphics[] = [];
      for (const obstacle of scene.obstacles) {
        const shape = new Graphics();
        const moving = obstacle.kind === "rotor" || obstacle.kind === "moving-platform";
        if (obstacle.motion) {
          const track = new Graphics().moveTo(obstacle.x, obstacle.y)
            .lineTo(obstacle.motion.end.x, obstacle.motion.end.y)
            .stroke({ color: 0xffd45e, width: 0.045, alpha: 0.35 });
          this.root.addChild(track);
        }
        const tint = obstacle.color
          ? Number.parseInt(obstacle.color.slice(1), 16)
          : 0xf4c76b;
        // Build curves in pixel-sized local coordinates, then scale to world units.
        // Pixi tessellates a radius of 0.22 too coarsely for a zoomed-in camera.
        const geometryScale = 100;
        if (obstacle.kind === "bumper" || obstacle.kind === "circle") {
          const radius = (obstacle.width / 2) * geometryScale;
          if (scene.physicsProfile === "arcade-flow-v1") {
            const halo = new Graphics().circle(0, 0, radius + 12)
              .stroke({ color: tint, width: 6 });
            halo.position.set(obstacle.x, obstacle.y);
            halo.scale.set(0.01);
            halo.alpha = 0.18;
            this.root.addChild(halo);
            this.kickerLights.push({ id: obstacle.id, halo, baseScale: 0.01 });
          }
          shape
            .circle(0, 0, radius)
            .fill(0x251e31)
            .stroke({ color: tint, width: 4 });
          shape.circle(0, 0, radius * 0.62).fill({ color: tint, alpha: 0.8 });
          shape
            .circle(-radius * 0.22, -radius * 0.25, radius * 0.12)
            .fill(0xffffff);
        } else {
          const w = obstacle.width * geometryScale,
            h = obstacle.height * geometryScale;
          const left = obstacle.kind === "rotor" && obstacle.pivot === "right" ? -w : -w / 2;
          shape
            .roundRect(left, -h / 2, w, h, 7.5)
            .fill({ color: tint, alpha: moving ? 0.8 : 0.05 });
          shape
            .roundRect(left, -h / 2, w, h, 7.5)
            .stroke({ color: tint, width: 24, alpha: 0.07 });
          shape
            .roundRect(left, -h / 2, w, h, 7.5)
            .stroke({ color: tint, width: 2.8, alpha: 0.9 });
          if (moving) {
            if (scene.physicsProfile === "arcade-flow-v1") {
              // Child geometry follows the interpolated rotor, including pause/reset.
              const halo = new Graphics()
                .roundRect(left - 8, -h / 2 - 8, w + 16, h + 16, 12)
                .stroke({ color: tint, width: 7 });
              halo.alpha = 0.18;
              shape.addChild(halo);
              this.kickerLights.push({ id: obstacle.id, halo, baseScale: 1 });
              shape.circle(left + 13, 0, 7).fill(0xffffff)
                .circle(left + w - 13, 0, 7).fill(0xffffff);
            }
            if (obstacle.kind === "rotor") {
              if (obstacle.pivot === "right") {
                // A stationary mount makes the endpoint pivot clear at the right rail.
                const mount = new Graphics().roundRect(-7, -29, 28, 58, 8)
                  .fill(0x29333b).stroke({ color: tint, width: 3 });
                mount.scale.set(0.01);
                mount.position.set(obstacle.x, obstacle.y);
                this.root.addChild(mount);
              }
              shape.circle(0, 0, 18).fill(0xdfe5ee)
                .circle(0, 0, 6.5).fill(0x123341);
            } else {
              shape.moveTo(-13, -10).lineTo(-24, 0).lineTo(-13, 10)
                .moveTo(13, -10).lineTo(24, 0).lineTo(13, 10)
                .stroke({ color: 0xffffff, width: 4 });
            }
            mechanisms.push(shape);
          }
        }
        shape.scale.set(1 / geometryScale);
        shape.position.set(obstacle.x, obstacle.y);
        shape.rotation = obstacle.rotation;
        this.root.addChild(shape);
      }
      this.raceEffects.scale.set(0.01);
      this.root.addChild(this.raceEffects);
      // Six shared glossy skins; unique names share framed atlas textures.
      this.marbleArt = new MarbleArt(COLORS, count, PROFILE.radius * 2);
      const inscriptions = this.marbleArt.prepareNames(Array.from({ length: count },
        (_, index) => this.participantNames[index] ?? String(index + 1)));
      for (let i = 0; i < count; i++) {
        const marble = new Sprite(this.marbleArt.shells[i % COLORS.length]!);
        marble.anchor.set(0.5);
        marble.scale.set(this.marbleArt.shellScale);
        this.root.addChild(marble);
        this.moving.push(marble);
      }
      // Keep every inscription above the sphere layer and readable while rolling.
      for (const texture of inscriptions) {
        const engraving = new Sprite(texture);
        engraving.anchor.set(0.5);
        engraving.scale.set(this.marbleArt.engravingScale);
        this.engravings.push(engraving);
        this.root.addChild(engraving);
      }
      this.moving.push(...mechanisms);
      // Labels are reused for visible balls, not allocated once per entrant.
      for (let i = 0; i < Math.min(count, 64); i++) {
        const label = new Text({ text: "", style: {
          fontFamily: '"Apple SD Gothic Neo", sans-serif', fontSize: 26, fontWeight: "700",
          fill: COLORS[i % COLORS.length]!, stroke: { color: 0x06121f, width: 5 },
        } });
        label.anchor.set(0.5, 0);
        label.scale.set(0.016);
        label.visible = false;
        this.labels.push(label);
        this.root.addChild(label);
      }
      this.minimap = new CourseMinimap(scene);
      this.app.stage.addChild(this.minimap.root);
      this.canvas.setAttribute(
        "aria-label",
        `${count}개 구슬의 물리 실험 장면`,
      );
      this.canvas.setAttribute("role", "img");
      host.appendChild(this.canvas);
      const resize = () => {
        if (this.disposed) return;
        const { width, height } = host.getBoundingClientRect();
        this.app.renderer.resize(Math.max(1, width), Math.max(1, height));
        this.viewport = { width, height };
        this.minimap?.resize(width, height);
        this.positionCamera();
        if (this.minimap?.root.visible) this.minimap.render(this.moving, this.count, COLORS, this.camera, this.marbleStates);
        // Resizing clears the WebGL buffer. Redraw within this observer callback
        // so opening/closing settings while paused cannot expose a blank frame.
        this.app.render();
      };
      this.observer = new ResizeObserver(resize);
      this.observer.observe(host);
      rendererResources.observers++;
      rendererResources.renderers++;
      this.tracked = true;
      resize();
    } catch (error) {
      if (this.initialized) this.dispose();
      else {
        this.app.stage.destroy({ children: true });
        this.root.destroy({ children: true });
        canvas
          .getContext("webgl2")
          ?.getExtension("WEBGL_lose_context")
          ?.loseContext();
        canvas.remove();
      }
      throw error;
    }
  }
  private positionCamera() {
    const frame = this.camera;
    this.root.scale.set(frame.scale);
    this.root.position.set(frame.x, frame.y);
  }
  render(previous: readonly Pose[], poses: readonly Pose[], alpha: number, elapsed = 1 / 60) {
    for (let i = 0; i < this.moving.length; i++) {
      const before = previous[i]!;
      const after = poses[i]!;
      const shape = this.moving[i]!;
      const active = i >= this.count || !this.marbleStates || this.marbleStates[i] === 1;
      shape.visible = active;
      if (!active) continue;
      shape.position.set(
        before.x + (after.x - before.x) * alpha,
        before.y + (after.y - before.y) * alpha,
      );
      // Rapier wraps rotations at ±π; interpolate along the shortest arc.
      const delta =
        ((after.rotation - before.rotation + Math.PI * 3) % (Math.PI * 2)) -
        Math.PI;
      // Sphere lighting and lettering stay upright; mechanism rotation is physical.
      shape.rotation = i < this.count ? 0 : before.rotation + delta * alpha;
    }
    for (const light of this.kickerLights) {
      const hitTick = this.impactTicks?.get(light.id);
      const age = hitTick === undefined ? 100 : this.simulationTick - hitTick;
      const energy = age >= 0 && age < 15 ? 1 - age / 15 : 0;
      light.halo.alpha = 0.18 + energy * 0.72;
      light.halo.scale.set(light.baseScale * (1 + (this.reducedMotion ? 0 : energy * 0.35)));
    }
    this.finishAirEffects?.render(this.airBurst, this.simulationTick, this.reducedMotion);
    this.raceEffects.clear();
    for (let i = 0; i < this.count; i++) {
      if (this.marbleStates && this.marbleStates[i] !== 1) continue;
      const marble = this.moving[i]!;
      if (this.racing && !this.reducedMotion && (this.count <= 300 || i === this.leaderIndex)) {
        const dx = poses[i]!.x - previous[i]!.x;
        const dy = poses[i]!.y - previous[i]!.y;
        const distance = Math.hypot(dx, dy);
        const stretch = distance ? Math.min(5, 1.1 / distance) : 0;
        this.raceEffects.moveTo((marble.x - dx * stretch) * 100, (marble.y - dy * stretch) * 100)
          .lineTo(marble.x * 100, marble.y * 100)
          .stroke({ color: COLORS[i % COLORS.length]!, width: 14, alpha: 0.25 });
      }
      if (this.winnerIndices.includes(i) || i === this.leaderIndex) {
        this.raceEffects.circle(marble.x * 100, marble.y * 100, 36)
          .stroke({ color: 0xffbd69, width: 4.5, alpha: 0.95 });
        this.raceEffects.circle(marble.x * 100, marble.y * 100, 46)
          .stroke({ color: 0xffbd69, width: 3.5, alpha: 0.22 });
      }
    }
    let targetY = 0, minX = Infinity, maxX = -Infinity, minY = Infinity;
    for (let i = 0; i < this.count; i++) {
      if (this.marbleStates && this.marbleStates[i] !== 1) continue;
      const marble = this.moving[i]!;
      targetY = Math.max(targetY, marble.y);
      minY = Math.min(minY, marble.y);
      minX = Math.min(minX, marble.x);
      maxX = Math.max(maxX, marble.x);
    }
    let groupX = 0,
      groupSize = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.marbleStates && this.marbleStates[i] !== 1) continue;
      const marble = this.moving[i]!;
      if (marble.y >= targetY - 2) {
        groupX += marble.x;
        groupSize++;
      }
    }
    if (!Number.isFinite(minX)) { minX = maxX = this.frontX; minY = targetY = this.frontY; }
    const opening = this.simulationTick === 0;
    const targetX = opening ? (minX + maxX) / 2 : groupSize ? groupX / groupSize : this.world.width / 2;
    const baseScale = Math.max((this.viewport.width - 32) / this.world.width, (this.viewport.height - 32) / Math.min(12, this.world.height));
    const openingZoom = this.startBounds
      ? startCameraFrame(this.world, this.viewport, this.startBounds, this.setupExpanded).scale / baseScale
      : Math.max(0.15, Math.min(2.8,
      this.viewport.width * 0.75 / (maxX - minX + 1.2) / baseScale,
      this.viewport.height * 0.45 / (targetY - minY + 1.2) / baseScale));
    const nearGate = this.narrowGates.some((gate) => targetY >= gate.y - gate.length / 2 - 2 &&
      targetY <= gate.y + gate.length / 2 + 0.7);
    const targetZoom = opening ? openingZoom : nearGate ? 1.25 : this.winnerIndices.length ? 1.3 : 1;
    const blend = this.snapCamera || this.reducedMotion ? 1 : 1 - Math.exp(-Math.min(elapsed, 0.1) * 6);
    this.frontX += (targetX - this.frontX) * blend;
    this.frontY += (targetY - this.frontY) * blend;
    this.cinematicZoom += (targetZoom - this.cinematicZoom) * blend;
    this.snapCamera = false;
    this.followBlend = opening ? 0 : this.reducedMotion ? 1 : Math.min(1, this.followBlend + Math.min(elapsed, 0.1) / 1.25);
    const frame = this.camera;
    if (opening && this.startBounds) this.startFrame = frame;
    if (this.minimap) this.minimap.root.visible = !(opening && this.startBounds);
    let labelCount = 0;
    const labelIndices: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const marble = this.moving[i]!;
      const active = !this.marbleStates || this.marbleStates[i] === 1;
      const inView = active && marble.x >= frame.left - 1 && marble.x <= frame.left + frame.visibleWidth + 1 &&
        marble.y >= frame.top - 1 && marble.y <= frame.top + frame.visibleHeight + 1;
      marble.visible = inView;
      const engraving = this.engravings[i];
      if (engraving) { engraving.position.set(marble.x, marble.y); engraving.visible = inView; }
      if (this.namesVisible && inView && labelIndices.length < this.labels.length) labelIndices.push(i);
    }
    if (this.namesVisible && this.leaderIndex !== null && !labelIndices.includes(this.leaderIndex) &&
      this.moving[this.leaderIndex]?.visible) {
      if (labelIndices.length === this.labels.length) labelIndices.pop();
      labelIndices.unshift(this.leaderIndex);
    }
    for (const index of labelIndices) {
      const marble = this.moving[index]!;
      const label = this.labels[labelCount++]!;
      const letters = Array.from(this.participantNames[index] ?? String(index + 1));
      const text = letters.length > 12 ? `${letters.slice(0, 12).join("")}…` : letters.join("");
      if (label.text !== text) label.text = text;
      const tint = COLORS[index % COLORS.length]!;
      if (label.style.fill !== tint) label.style.fill = tint;
      label.scale.set(Math.min(0.032, Math.max(0.003, 22 / (26 * frame.scale))));
      const halfWidth = label.width / 2;
      label.position.set(Math.max(halfWidth + 0.4, Math.min(this.world.width - halfWidth - 0.4, marble.x)), marble.y + 0.32);
      label.visible = true;
    }
    for (; labelCount < this.labels.length; labelCount++) this.labels[labelCount]!.visible = false;
    if (this.minimap?.root.visible) this.minimap.render(this.moving, this.count, COLORS, frame, this.marbleStates);
    this.positionCamera();
    this.app.render();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer?.disconnect();
    if (this.tracked) {
      rendererResources.observers--;
      rendererResources.renderers--;
    }
    if (this.initialized)
      this.app.destroy(true, {
        children: true,
        texture: false,
        textureSource: false,
      });
    this.marbleArt?.dispose();
    this.marbleArt = null;
    this.moving.length = 0;
    this.labels.length = 0;
    this.engravings.length = 0;
    this.kickerLights.length = 0;
    this.impactTicks = undefined;
    this.airBurst = undefined;
    this.finishAirEffects = null;
    this.minimap = null;
    this.narrowGates.length = 0;
    this.startFrame = null;
  }
}
