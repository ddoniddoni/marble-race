import { LIMITS } from "../contracts/schemas";
import { platformPosition } from "../core/motion";
import type { Obstacle } from "../core/types";
import { ArcadeFlow } from "./ArcadeFlow";
import RAPIER from "@dimforge/rapier2d-compat";
import {
  FIXED_DT,
  PROFILE,
  type PhysicsAdapter,
  type Pose,
  type Scene,
} from "../core/types";

// Membership/filter bits: obstacles hit marbles; marbles hit both groups.
export const ARCADE_MARBLE_CONTACTS = {
  version: "marble-contacts-v1",
  obstacleGroups: 0x00010002,
  marbleGroups: 0x00020003,
  solverIterations: 8,
  substeps: 4,
  ccdSubsteps: 4,
  contactFrequency: 120,
  allowedLinearError: 0.0005,
  neighborPrediction: 0.2,
  skin: 0.005,
  predictionDistance: 2 * 18 * FIXED_DT / 4,
} as const;

let initialization: Promise<void> | undefined;
export const physicsResources = { worlds: 0, bodies: 0, colliders: 0 };
export function initPhysics() {
  initialization ??= RAPIER.init().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export class RapierPhysics implements PhysicsAdapter {
  private world: RAPIER.World | null;
  private readonly flow: ArcadeFlow | null;
  private readonly marbleColliders: RAPIER.Collider[] = [];
  get impacts() { return this.flow?.impacts; }
  get airBurst() { return this.flow?.airBurst; }
  get flowStats() { return this.flow ? { kicks: this.flow.kicks, assists: this.flow.assists,
    ...(this.scene.finishAir ? { airBursts: this.flow.airBursts, airLifts: this.flow.airLifts } : {}),
  } : null; }
  private readonly marbles: RAPIER.RigidBody[] = [];
  private readonly mechanisms: {
    body: RAPIER.RigidBody;
    object: Obstacle;
  }[] = [];
  readonly marbleStates: Uint8Array;
  private readonly total: number;
  readonly poses: Pose[] = [];
  readonly previous: Pose[] = [];
  constructor(
    readonly marbleCount: number,
    readonly scene: Scene,
  ) {
    if (!Number.isInteger(marbleCount) || marbleCount < 2 || marbleCount > LIMITS.participants)
      throw new Error("구슬 수는 2~10,000의 정수여야 합니다.");
    this.marbleStates = new Uint8Array(marbleCount);
    const arcade = scene.physicsProfile === "arcade-flow-v1";
    this.flow = arcade ? new ArcadeFlow(marbleCount, scene.width,
      scene.finishPace === "dramatic-v1" ? scene.finish?.y : undefined,
      scene.finishAir ? scene.finish : undefined, scene.finishAir) : null;
    const world = new RAPIER.World({ x: 0, y: 9.81 });
    this.world = world;
    world.timestep = FIXED_DT / (arcade ? ARCADE_MARBLE_CONTACTS.substeps : 1);
    world.numSolverIterations = arcade ? ARCADE_MARBLE_CONTACTS.solverIterations : PROFILE.solverIterations;
    if (arcade) {
      world.maxCcdSubsteps = ARCADE_MARBLE_CONTACTS.ccdSubsteps;
      // Dense impacts need rigid contacts as well as more solver passes.
      world.integrationParameters.contact_natural_frequency = ARCADE_MARBLE_CONTACTS.contactFrequency;
      world.integrationParameters.normalizedAllowedLinearError = ARCADE_MARBLE_CONTACTS.allowedLinearError;
      world.integrationParameters.normalizedPredictionDistance = ARCADE_MARBLE_CONTACTS.neighborPrediction;
    }
    try {
      for (const [order, object] of scene.obstacles.entries()) {
        const moving = object.kind === "rotor" || object.kind === "moving-platform";
        const position = object.kind === "moving-platform" ? platformPosition(object, 0) : object;
        const description =
          moving
            ? RAPIER.RigidBodyDesc.kinematicPositionBased()
            : RAPIER.RigidBodyDesc.fixed();
        const body = world.createRigidBody(
          description
            .setTranslation(position.x, position.y)
            .setRotation(object.rotation),
        );
        const collider =
          object.kind === "bumper" || object.kind === "circle"
            ? RAPIER.ColliderDesc.ball(object.width / 2)
            : RAPIER.ColliderDesc.cuboid(object.width / 2, object.height / 2);
        // Body pose is the fixed hinge; the real cuboid sits to its left.
        // ArcadeFlow reads collider.translation(), so contact normals stay correct.
        if (object.kind === "rotor" && object.pivot === "right")
          collider.setTranslation(-object.width / 2, 0);
        const obstacleCollider = world.createCollider(
          collider
            .setCollisionGroups(arcade ? ARCADE_MARBLE_CONTACTS.obstacleGroups : 0xffffffff)
            .setFriction(arcade ? 0.03 : PROFILE.friction)
            .setRestitution(
              object.kind === "bumper"
                ? (object.restitution ?? PROFILE.bumperRestitution)
                : PROFILE.restitution,
            )
            .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
            .setFrictionCombineRule(arcade ? RAPIER.CoefficientCombineRule.Min : RAPIER.CoefficientCombineRule.Average),
          body,
        );
        this.flow?.register(object, obstacleCollider, order);
        if (moving) this.mechanisms.push({ body, object });
      }
      for (let i = 0; i < marbleCount; i++) {
        const x = scene.spawnSlots?.[i]?.x ?? 2 + (i % 20) * 1.05;
        const y = scene.spawnSlots?.[i]?.y ?? 1.5 + Math.floor(i / 20) * 0.8;
        this.marbleStates[i] = 1;
        const body = world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y)
            .setLinvel(scene.initialVelocities?.[i]?.x ?? 0, scene.initialVelocities?.[i]?.y ?? 0)
            .setCanSleep(!arcade)
            .setCcdEnabled(PROFILE.ccd)
            .setSoftCcdPrediction(arcade ? ARCADE_MARBLE_CONTACTS.predictionDistance : 0),
        );
        const marbleCollider = world.createCollider(
          RAPIER.ColliderDesc.ball(PROFILE.radius)
            .setCollisionGroups(arcade ? ARCADE_MARBLE_CONTACTS.marbleGroups : 0xffffffff)
            .setContactSkin(arcade ? ARCADE_MARBLE_CONTACTS.skin : 0)
            .setMass(PROFILE.mass)
            .setFriction(PROFILE.friction)
            .setRestitution(PROFILE.restitution)
            .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Max)
            .setFrictionCombineRule(arcade ? RAPIER.CoefficientCombineRule.Min : RAPIER.CoefficientCombineRule.Average),
          body,
        );
        this.marbles.push(body);
        this.marbleColliders.push(marbleCollider);
      }
      for (const body of [...this.marbles, ...this.mechanisms.map((r) => r.body)]) {
        const position = body.translation();
        const pose = {
          x: position.x,
          y: position.y,
          rotation: body.rotation(),
        };
        this.poses.push(pose);
        this.previous.push({ ...pose });
      }
    } catch (error) {
      world.free();
      this.world = null;
      throw error;
    }
    this.total = world.bodies.len();
    physicsResources.worlds++;
    physicsResources.bodies += this.total;
    physicsResources.colliders += world.colliders.len();
  }
  step(tick: number) {
    if (!this.world) return;
    for (let i = 0; i < this.poses.length; i++) {
      if (i < this.marbleCount && this.marbleStates[i] !== 1) continue;
      Object.assign(this.previous[i]!, this.poses[i]);
    }
    this.flow?.prepareStep(this.marbles, this.poses, this.marbleStates, tick);
    const substeps = this.flow ? ARCADE_MARBLE_CONTACTS.substeps : 1;
    for (let substep = 1; substep <= substeps; substep++) {
      const sampleTick = tick - 1 + substep / substeps;
      for (const { body, object } of this.mechanisms) {
        if (object.kind === "moving-platform")
          body.setNextKinematicTranslation(platformPosition(object, sampleTick));
        else body.setNextKinematicRotation(object.rotation + object.speed * sampleTick * FIXED_DT);
      }
      this.world.step();
    }
    this.flow?.step(this.world, this.marbles, this.marbleColliders, tick, this.marbleStates);
    for (let i = 0; i < this.poses.length; i++) {
      if (i < this.marbleCount && this.marbleStates[i] !== 1) continue;
      const body =
        i < this.marbles.length
          ? this.marbles[i]!
          : this.mechanisms[i - this.marbles.length]!.body;
      const p = body.translation();
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
        throw new Error("Non-finite physics state");
      Object.assign(this.poses[i]!, {
        x: p.x,
        y: p.y,
        rotation: body.rotation(),
      });
    }
  }
  retireMarbles(indices: readonly number[]) {
    if (!this.world) return;
    for (const index of indices) {
      this.marbleStates[index] = 2;
      this.marbles[index]!.setEnabled(false);
    }
  }
  counts() {
    return {
      bodies: this.world?.bodies.len() ?? 0,
      colliders: this.world?.colliders.len() ?? 0,
      awake: this.world
        ? this.marbles.filter((b, i) => this.marbleStates[i] === 1 && !b.isSleeping()).length
        : 0,
    };
  }
  dispose() {
    if (!this.world) return;
    physicsResources.worlds--;
    physicsResources.bodies -= this.total;
    physicsResources.colliders -= this.world.colliders.len();
    this.world.free();
    this.world = null;
    this.flow?.dispose();
    this.marbleColliders.length = 0;
    this.marbles.length = 0;
    this.mechanisms.length = 0;
    this.poses.length = 0;
    this.previous.length = 0;
  }
}
