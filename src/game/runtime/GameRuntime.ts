import { expandedStart } from "../core/startLayout";
import { FINISH_PACE } from "../core/finishPace";
import { finishAirProfile, finishAirZone } from "../core/finishAir";
import { shuffledStart, AllFinishRace } from "../core/race";
import { createSpawnSlots } from "../contracts/geometry";
import { RaceAudio } from "./RaceAudio";
import { SimulationCore } from "../core/SimulationCore";
import { summarize, type Summary } from "../core/metrics";
import { FIXED_DT, type Phase, type Scene } from "../core/types";
import { createBenchmarkMap } from "../fixtures/scenes";
import { loadMapScene } from "../contracts/loadScene";
import { hashMap } from "../contracts/canonical";
import {
  ParticipantsSchema,
  type Participant,
  type MapDocument,
} from "../contracts/schemas";
import { courseRegions, type CourseRegion, type ViewMode } from "../renderer/camera";
import { CameraInput } from "../renderer/CameraInput";
import {
  ARCADE_MARBLE_CONTACTS,
  initPhysics,
  physicsResources,
  RapierPhysics,
} from "../physics/RapierPhysics";
import { PixiRenderer, rendererResources } from "../renderer/PixiRenderer";

const runtimeResources = { runtimes: 0, rafs: 0, listeners: 0 };
export function resources() {
  return { ...runtimeResources, ...physicsResources, ...rendererResources };
}
export type BenchmarkResult = Summary & {
  runId: number;
  count: number;
  sceneId: string;
  mapHash: string;
  tick: number;
  awake: number;
  droppedMs: number;
  initMs: number;
  dpr: number;
  viewport: string;
  userAgent: string;
};
export type RaceSnapshot = {
  seed: number;
  stageLabel: string | null;
  countdown: number | null;
  leaders: { index: number; name: string; progress: number }[];
  winners: { index: number; name: string }[];
  standings: { index: number; name: string; rank: number | null; seconds: number | null; status: "finished" | "dnf" }[];
  completed: number;
  dnf: number;
  remaining: number;
  queued: number;
  finishSeconds: number | null;
  timedOut: boolean;
  slowMotion: boolean;
  callout: string | null;
};
export type Snapshot = {
  race: RaceSnapshot | null;
  soundEnabled: boolean;
  phase: Phase;
  namesVisible: boolean;
  cameraRegions: readonly CourseRegion[];
  camera: {
    x: number;
    y: number;
    scale: number;
    regionId?: string | null;
    top: number;
    left: number;
    visibleWidth: number;
    zoom: number;
    visibleHeight: number;
    worldHeight: number;
    mode: ViewMode;
  };
  sceneId: string;
  mapHash: string;
  count: number;
  tick: number;
  simulationSeconds: number;
  bodies: number;
  colliders: number;
  awake: number;
  fps: number;
  frameMs: number;
  p95Ms: number;
  droppedMs: number;
  initMs: number;
  measurementSeconds: number | null;
  results: readonly BenchmarkResult[];
  notice: string | null;
};
export type Diagnostics = ReturnType<GameRuntime["diagnostics"]>;
export type DebugBridge = {
  read: () => Diagnostics;
  resources: typeof resources;
};
declare global {
  interface Window {
    __MARBLE_POC__?: DebugBridge;
  }
}

export class GameRuntime {
  private readonly audio = new RaceAudio();
  private readonly raceEnabled: boolean;
  private race: AllFinishRace | null = null;
  private standingsCache: RaceSnapshot["standings"] = [];
  private standingsVersion = -1;
  private seed = 0;
  private assignedStart: ReturnType<typeof shuffledStart> | null = null;
  private countdownMs = 0;
  private benchmarkMode = false;
  private presentationMs = 0;
  private callout: string | null = null;
  private calloutUntil = 0;
  private lastLeader = -1;
  private lastLeadCue = -3000;
  private finishAnnounced = false;
  private lastAirCueTick = -1;
  private lastPopCueTick = -60;
  private lastPopId = 0;
  private readonly scene;
  private readonly map;
  private participantNames: readonly string[];
  private core!: SimulationCore;
  private readonly renderer = new PixiRenderer();
  private readonly regions: readonly CourseRegion[];
  private cameraInput: CameraInput | null = null;
  private raf: number | null = null;
  private disposed = false;
  private active = false;
  private lastTime: number | null = null;
  private lastReport = 0;
  private initMs = 0;
  private mapHash = "";
  private notice: string | null = null;
  private frameTimes: number[] = [];
  private measurement: {
    frames: number[];
    cpu: number[];
    physics: number[];
    elapsed: number;
  } | null = null;
  private results: BenchmarkResult[] = [];
  private runSequence = 0;
  private bridge: DebugBridge | null = null;
  private readonly onVisibility = () => {
    if (document.hidden) {
      this.pause();
      this.notice = "탭이 숨겨져 일시정지했습니다. 재개 버튼을 눌러 주세요.";
      this.publish();
    }
    this.lastTime = null;
  };
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    this.fail(
      new Error("WebGL 연결이 끊어졌습니다. 화면을 다시 불러와 주세요."),
    );
  };
  private constructor(
    private readonly count: number,
    private readonly onSnapshot: (snapshot: Snapshot) => void,
    private readonly onError: (error: Error) => void,
    source?: { map: MapDocument; id: string; stages?: Scene["stages"] },
    participants?: readonly Participant[],
  ) {
    if (!source && count !== 20 && count !== 100)
      throw new Error("계측 장면은 20개 또는 100개로 실행해 주세요.");
    const roster = participants ? ParticipantsSchema.parse(participants) : null;
    if (roster && roster.length !== count)
      throw new Error("구슬 수와 입력 목록의 수가 다릅니다.");
    this.participantNames =
      roster?.map((participant) => participant.name) ??
      Array.from({ length: count }, (_, i) => String(i + 1));
    const loaded = loadMapScene(
      source?.map ?? createBenchmarkMap(count === 100 ? 100 : 20),
      count,
      source?.id ?? `p0-${count}-contract-v1`,
    );
    this.raceEnabled = Boolean(source);
    this.scene = source ? expandedStart({ ...loaded.scene, stages: source.stages }, count) : loaded.scene;
    this.map = loaded.map;
    this.regions = courseRegions(this.scene, this.map.spawn);
  }
  static async create(
    host: HTMLElement,
    count: number,
    signal: AbortSignal,
    debug: boolean,
    onSnapshot: (snapshot: Snapshot) => void,
    onError: (error: Error) => void,
    source?: { map: MapDocument; id: string; stages?: Scene["stages"] },
    participants?: readonly Participant[],
  ) {
    const runtime = new GameRuntime(
      count,
      onSnapshot,
      onError,
      source,
      participants,
    );
    const start = performance.now();
    try {
      await initPhysics();
      signal.throwIfAborted();
      runtime.core = new SimulationCore(
        () => runtime.createPhysics(),
        (tick, previous, poses) => {
          if (!runtime.race) return true;
          const continuing = runtime.race.step(tick, previous, poses, runtime.core.marbleStates);
          runtime.core.retireMarbles(runtime.race.newlySettled);
          return continuing;
        },
      );
      await runtime.renderer.init(
        host,
        runtime.scene,
        count,
        runtime.participantNames,
      );
      signal.throwIfAborted();
      runtime.mapHash = await hashMap(runtime.map);
      signal.throwIfAborted();
      runtime.initMs = performance.now() - start;
      document.addEventListener("visibilitychange", runtime.onVisibility);
      runtime.renderer.canvas.addEventListener(
        "webglcontextlost",
        runtime.onContextLost,
      );
      runtimeResources.listeners += 2;
      runtimeResources.runtimes++;
      runtime.active = true;
      runtime.cameraInput = new CameraInput(runtime.renderer.canvas, {
        zoom: (point, factor) => {
          runtime.renderer.zoomAt(point, factor);
          runtime.redrawCamera();
        },
        pan: (delta) => {
          runtime.renderer.panBy(delta);
          runtime.redrawCamera();
        },
        minimap: (point) => {
          const changed = runtime.renderer.focusMinimap(point);
          if (changed) runtime.redrawCamera();
          return changed;
        },
        fit: () => runtime.setView("overview"),
        follow: () => runtime.setView("follow"),
      });
      runtimeResources.listeners += runtime.cameraInput.listenerCount;
      if (debug) {
        runtime.bridge = { read: () => runtime.diagnostics(), resources };
        window.__MARBLE_POC__ = runtime.bridge;
      }
      runtime.renderer.setMarbleStates(runtime.core.marbleStates);
      runtime.renderer.render(runtime.core.previous, runtime.core.poses, 1);
      runtime.publish();
      runtime.schedule();
      return runtime;
    } catch (error) {
      runtime.dispose();
      throw error;
    }
  }
  private createPhysics() {
    if (!this.raceEnabled || this.benchmarkMode) {
      this.race = null;
      this.assignedStart = null;
      return new RapierPhysics(this.count, this.scene);
    }
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    const scene = shuffledStart(this.scene, seed, this.count, this.scene.startLayout ? this.scene.spawnSlots! : createSpawnSlots(this.map.spawn), this.scene.physicsProfile === "arcade-flow-v1" && !this.scene.startLayout);
    const physics = new RapierPhysics(this.count, scene);
    this.seed = seed;
    this.assignedStart = scene;
    this.race = new AllFinishRace(this.count, this.scene.finish!, { width: this.scene.width, height: this.scene.height });
    this.standingsCache = [];
    this.standingsVersion = -1;
    return physics;
  }
  private raceSnapshot(): RaceSnapshot | null {
    if (!this.race) return null;
    const spawn = this.scene.startLayout?.bounds ?? this.map.spawn;
    const startY = spawn.y + spawn.height;
    const front: { index: number; y: number }[] = [];
    let queued = 0;
    for (let index = 0; index < this.count; index++) {
      const state = this.core.marbleStates?.[index] ?? 1;
      if (state === 0) queued++;
      if (state !== 1) continue;
      const y = this.core.poses[index]!.y;
      const position = front.findIndex((p) => y > p.y);
      if (position >= 0) front.splice(position, 0, { index, y });
      else if (front.length < 3) front.push({ index, y });
      if (front.length > 3) front.pop();
    }
    const leaders = front.map(({ index, y }) => ({ index, name: this.participantNames[index]!,
      progress: Math.max(0, Math.min(1, (y - startY) / (this.scene.finish!.y - startY))),
    }));
    if (this.standingsVersion !== this.race.entries.length) {
      const ordered = this.race.entries.filter((e) => e.status === "finished")
        .concat(this.race.entries.filter((e) => e.status === "dnf"));
      this.standingsCache = ordered.map((entry) => ({ ...entry, name: this.participantNames[entry.index]! }));
      this.standingsVersion = this.race.entries.length;
    }
    return {
      seed: this.seed,
      stageLabel: this.stageLabel(),
      countdown: this.countdownMs > 0 ? Math.ceil(this.countdownMs / 1000) : null,
      leaders,
      standings: this.standingsCache,
      completed: this.race.completed,
      dnf: this.race.dnf,
      remaining: this.count - this.race.completed - this.race.dnf,
      queued,
      winners: this.race.winners.map((index) => ({ index, name: this.participantNames[index]! })),
      finishSeconds: this.race.finishSeconds,
      timedOut: this.race.timedOut,
      slowMotion: this.isFinalStretch() && this.core.phase === "running",
      callout: this.presentationMs < this.calloutUntil ? this.callout : null,
    };
  }
  private stageLabel() {
    const stages = this.scene.stages;
    if (!stages?.length) return null;
    const leader = this.liveLeader();
    const front = leader >= 0 ? this.core.poses[leader]!.y : 0;
    const index = Math.max(0, stages.findLastIndex((stage) => front >= stage.y));
    return `${String(index + 1).padStart(2, "0")} / ${stages.length} · ${stages[index]!.title}`;
  }
  private liveLeader() {
    let leader = -1;
    for (let i = 0; i < this.count; i++) {
      if (this.core.marbleStates && this.core.marbleStates[i] !== 1) continue;
      if (leader < 0 || this.core.poses[i]!.y > this.core.poses[leader]!.y) leader = i;
    }
    return leader;
  }
  private isFinalStretch() {
    // An explicit false disables air effects without restoring legacy slow motion.
    if (!this.race || this.scene.finishAir !== undefined || this.count > 200 || this.race.completed > 0) return false;
    const leader = this.liveLeader();
    return leader >= 0 && this.core.poses[leader]!.y >= this.scene.finish!.y - 5;
  }
  private updatePresentation(delta: number) {
    if (!this.race) return;
    if (this.core.phase === "running" || this.core.phase === "countdown")
      this.presentationMs += Math.min(delta, 100);
    if (this.core.phase === "countdown" && !document.hidden) {
      const before = Math.ceil(this.countdownMs / 1000);
      this.countdownMs = Math.max(0, this.countdownMs - Math.min(delta, 100));
      if (this.countdownMs === 0) {
        this.core.start();
        this.audio.cue("go");
        this.callout = "출발!";
        this.calloutUntil = this.presentationMs + 1100;
        this.publish();
      } else if (before !== Math.ceil(this.countdownMs / 1000)) {
        this.audio.cue("count");
        this.publish();
      }
    }
    const leader = this.liveLeader();
    if (leader >= 0 && this.core.phase === "running" && this.core.tick > 60 && leader !== this.lastLeader) {
      if (this.lastLeader !== -1 && this.presentationMs - this.lastLeadCue > 2400) {
        this.callout = `${this.participantNames[leader]} 선두로!`;
        this.calloutUntil = this.presentationMs + 1700;
        this.lastLeadCue = this.presentationMs;
        this.audio.cue("lead");
      }
      this.lastLeader = leader;
    }
    this.renderer.setRaceFocus(this.core.tick > 0 && leader >= 0 ? leader : null, [],
      this.core.phase === "running");
    if (this.core.phase === "finished" && !this.finishAnnounced) {
      this.finishAnnounced = true;
      if (this.race.winners.length) this.audio.cue("win");
      this.publish();
    }
  }
  async toggleSound() {
    await this.audio.toggle();
    this.publish();
  }
  private schedule() {
    if (this.disposed || this.raf !== null) return;
    this.raf = requestAnimationFrame(this.frame);
    runtimeResources.rafs++;
  }
  private readonly frame = (time: number) => {
    this.raf = null;
    runtimeResources.rafs--;
    if (this.disposed) return;
    try {
      const delta =
        this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
      this.lastTime = time;
      const start = performance.now();
      this.updatePresentation(delta);
      const running = this.core.phase === "running" && !document.hidden;
      const speed = this.isFinalStretch() && !this.measurement ? 0.4 : 1;
      const stepped = this.core.advance(running ? delta / 1000 * speed : 0);
      this.updatePresentation(0);
      const physicsMs = performance.now() - start;
      this.renderer.setMarbleStates(this.core.marbleStates);
      this.renderer.setImpacts(this.core.impacts, this.core.tick);
      const airBurst = this.core.airBurst;
      this.renderer.setAirBurst(airBurst);
      const collisionBursts = this.core.collisionBursts;
      this.renderer.setCollisionBursts(collisionBursts);
      const pop = collisionBursts?.at(-1);
      if (pop && pop.id > this.lastPopId) {
        this.lastPopId = pop.id;
        if (running && pop.tick - this.lastPopCueTick >= 8) {
          this.lastPopCueTick = pop.tick;
          this.audio.puff();
        }
      }
      if (airBurst && airBurst.tick > this.lastAirCueTick) {
        this.lastAirCueTick = airBurst.tick;
        if (running) this.audio.puff(this.scene.finishAir === "pulse-v2");
      }
      this.renderer.render(
        this.core.previous,
        this.core.poses,
        this.core.phase === "running" ? stepped.alpha : 1,
        delta / 1000,
      );
      const cpuMs = performance.now() - start;
      if (running && delta > 0) {
        this.frameTimes.push(delta);
        if (this.frameTimes.length > 240) this.frameTimes.shift();
        if (this.measurement) {
          const m = this.measurement;
          m.frames.push(delta);
          m.cpu.push(cpuMs);
          m.physics.push(physicsMs);
          m.elapsed += delta;
          if (m.elapsed >= 60_000) {
            this.results = [
              ...this.results.slice(-5),
              {
                ...summarize(m.frames, m.cpu, m.physics),
                runId: ++this.runSequence,
                count: this.count,
                sceneId: this.scene.id,
                mapHash: this.mapHash,
                tick: this.core.tick,
                awake: this.core.counts().awake,
                droppedMs: this.core.clock.droppedSeconds * 1000,
                initMs: this.initMs,
                dpr: window.devicePixelRatio,
                viewport: `${window.innerWidth}×${window.innerHeight}`,
                userAgent: navigator.userAgent,
              },
            ];
            this.measurement = null;
            this.core.pause();
            this.notice =
              "60초 측정을 마쳤습니다. 결과는 이 장면을 나가면 초기화됩니다.";
          }
        }
      }
      if (time - this.lastReport >= 250) {
        this.lastReport = time;
        this.publish();
      }
      this.schedule();
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
  };
  private fail(error: Error) {
    this.dispose();
    this.onError(error);
  }
  start() {
    if (this.disposed || document.hidden) return;
    if (this.core.phase === "finished") this.reset();
    this.lastTime = null;
    if (this.race && (this.core.phase === "ready" || this.countdownMs > 0)) {
      if (this.core.phase === "ready") this.countdownMs = 3000;
      this.core.phase = "countdown";
      this.audio.cue("count");
    } else this.core.start();
    this.notice = null;
    this.publish();
  }
  pause() {
    if (this.disposed) return;
    this.core.pause();
    this.lastTime = null;
    if (this.measurement)
      this.notice = "측정이 중단되었습니다. 다시 측정하면 처음부터 시작합니다.";
    this.measurement = null;
    this.publish();
  }
  reset(measuring = false) {
    if (this.disposed) return;
    this.benchmarkMode = measuring;
    this.core.reset();
    this.countdownMs = 0;
    this.presentationMs = 0;
    this.callout = null;
    this.lastLeader = -1;
    this.lastLeadCue = -3000;
    this.finishAnnounced = false;
    this.lastAirCueTick = -1;
    this.lastPopCueTick = -60;
    this.lastPopId = 0;
    this.renderer.setCollisionBursts(undefined);
    this.renderer.setAirBurst(undefined);
    this.renderer.resetCamera();
    this.renderer.setRaceFocus(null, [], false);
    this.renderer.setImpacts(this.core.impacts, 0);
    this.renderer.setMarbleStates(this.core.marbleStates);
    this.lastTime = null;
    this.frameTimes = [];
    this.measurement = null;
    this.notice = null;
    this.renderer.render(this.core.previous, this.core.poses, 1);
    this.publish();
  }
  setParticipants(participants: readonly Participant[]) {
    if (this.disposed) return;
    const roster = ParticipantsSchema.parse(participants);
    if (roster.length !== this.count) throw new Error("구슬 수가 바뀌면 새 장면이 필요합니다.");
    const names = roster.map((participant) => participant.name);
    if (names.every((name, index) => name === this.participantNames[index])) return;
    this.participantNames = names;
    this.renderer.setParticipantNames(names);
    // Never relabel an ongoing/result race as if it used the new roster.
    if (this.core.phase !== "ready") this.reset();
    else {
      this.renderer.render(this.core.previous, this.core.poses, 1);
      this.publish();
    }
  }
  setSetupExpanded(expanded: boolean) {
    if (this.disposed) return;
    this.renderer.setSetupExpanded(expanded);
  }
  private redrawCamera() {
    if (this.disposed) return;
    this.renderer.render(this.core.previous, this.core.poses, 1, 0);
    this.publish();
  }
  setView(mode: ViewMode) {
    if (this.disposed) return;
    this.renderer.setView(mode);
    this.redrawCamera();
  }
  setZoom(zoom: number) {
    if (this.disposed) return;
    this.renderer.setZoom(zoom);
    this.redrawCamera();
  }
  focusRegion(id: string) {
    if (this.disposed) return;
    const region = this.regions.find((item) => item.id === id);
    if (!region) return;
    this.renderer.focusBounds(region.bounds, region.id);
    this.redrawCamera();
  }
  setNamesVisible(visible: boolean) {
    if (this.disposed) return;
    this.renderer.setNamesVisible(visible);
    this.renderer.render(this.core.previous, this.core.poses, 1);
    this.publish();
  }
  benchmark() {
    this.reset(true);
    if (this.disposed || document.hidden) return;
    this.measurement = { frames: [], cpu: [], physics: [], elapsed: 0 };
    this.start();
  }
  snapshot(): Snapshot {
    const summary = summarize(this.frameTimes, [], []);
    return {
      phase: this.core.phase,
      race: this.raceSnapshot(),
      soundEnabled: this.audio.enabled,
      camera: this.renderer.camera,
      cameraRegions: this.regions,
      namesVisible: this.renderer.labelsVisible,
      sceneId: this.scene.id,
      mapHash: this.mapHash,
      count: this.count,
      tick: this.core.tick,
      simulationSeconds: this.core.tick * FIXED_DT,
      ...this.core.counts(),
      fps: summary.fps,
      frameMs: summary.meanFrameMs,
      p95Ms: summary.p95FrameMs,
      droppedMs: this.core.clock.droppedSeconds * 1000,
      initMs: this.initMs,
      measurementSeconds: this.measurement
        ? this.measurement.elapsed / 1000
        : null,
      results: this.results,
      notice: this.notice,
    };
  }
  diagnostics() {
    const hasEdgePivot = this.scene.obstacles.some((object) => object.kind === "rotor" && object.pivot === "right");
    const simulationVersion = this.race
      ? (this.scene.physicsProfile === "arcade-flow-v1" ? "arcade-flow-all-finish-expanded-start-v1" : "all-finish-v1")
      : this.scene.physicsProfile === "arcade-flow-v1"
        ? (this.scene.startLayout ? "arcade-flow-expanded-start-benchmark-v1" : "arcade-flow-benchmark-v2")
        : "p0-fixed-v1";
    const ruleVersion = this.scene.finishAir === false
      ? `${simulationVersion}.finish-air-off-v1`
      : this.scene.finishAir === "pulse-v2"
      ? (this.race ? "arcade-flow-all-finish-air-v2"
        : this.scene.startLayout ? "arcade-flow-expanded-air-benchmark-v2" : "arcade-flow-air-benchmark-v2")
      : this.scene.finishAir === "pulse-v1"
      ? (this.race ? "arcade-flow-all-finish-air-v1"
        : this.scene.startLayout ? "arcade-flow-expanded-air-benchmark-v1" : "arcade-flow-air-benchmark-v1")
      : this.scene.finishPace === "dramatic-v1"
      ? (this.race ? "arcade-flow-all-finish-dramatic-v1"
        : this.scene.startLayout ? "arcade-flow-expanded-dramatic-benchmark-v1"
          : "arcade-flow-dramatic-benchmark-v1")
      : hasEdgePivot ? `${simulationVersion}.edge-pivot-v1` : simulationVersion;
    return {
      ...this.snapshot(),
      resources: resources(),
      mapHash: this.mapHash,
      poses: this.core.poses.map((p) => ({ ...p })),
      tickerStarted: this.renderer.tickerStarted,
      participantNames: [...this.participantNames],
      simulationVersion: this.scene.physicsProfile === "arcade-flow-v1"
        ? `${ruleVersion}.${ARCADE_MARBLE_CONTACTS.version}${this.scene.collisionPop ? ".collision-pop-random-v1" : ""}` : ruleVersion,
      marbleContacts: true,
      collisionPop: this.scene.collisionPop ?? null,
      collisionBursts: this.core.collisionBursts ?? [],
      finishPace: this.scene.finishPace && this.scene.finish ? {
        ...FINISH_PACE, startY: this.scene.finish.y - FINISH_PACE.approachDistance,
        fullY: this.scene.finish.y - FINISH_PACE.fullDistance,
      } : null,
      finishAir: this.scene.finishAir && this.scene.finish ? {
        ...finishAirProfile(this.scene.finishAir), zone: finishAirZone(this.scene.finish, finishAirProfile(this.scene.finishAir)), burst: this.core.airBurst ?? null,
      } : null,
      startLayout: this.scene.startLayout ?? null,
      physicsProfile: this.scene.physicsProfile ?? "classic-v1",
      flowStats: this.core.flowStats,
      assignedSlots: this.assignedStart?.spawnSlots ?? this.scene.spawnSlots,
      initialVelocities: this.assignedStart?.initialVelocities ?? null,
    };
  }
  private publish() {
    if (!this.disposed) this.onSnapshot(this.snapshot());
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf !== null) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
      runtimeResources.rafs--;
    }
    if (this.cameraInput) {
      runtimeResources.listeners -= this.cameraInput.listenerCount;
      this.cameraInput.dispose();
      this.cameraInput = null;
    }
    if (this.active) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.renderer.canvas.removeEventListener(
        "webglcontextlost",
        this.onContextLost,
      );
      runtimeResources.listeners -= 2;
      runtimeResources.runtimes--;
    }
    if (this.bridge && window.__MARBLE_POC__ === this.bridge)
      delete window.__MARBLE_POC__;
    this.core?.dispose();
    this.renderer.dispose();
    this.audio.dispose();
    this.measurement = null;
    this.results = [];
    this.frameTimes = [];
  }
}
