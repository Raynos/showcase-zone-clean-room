import * as THREE from 'three';
import type { Game } from '../game';
import { CG, G_PLAYER, RAPIER, groups } from '../core/physics';
import { angleDiff, clamp, damp, dampAngle, lerp } from '../core/util';
import { DOWN as KNOCKDOWN } from './humanoid/types';
import type { HumanAction, HumanPose, HumanoidRig, Locomotion, WeaponModel } from './humanoid/types';

const RADIUS = 0.36, HALF_H = 0.5;
const CENTER_Y = RADIUS + HALF_H;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

/** Alternate traversal states (riding, hoverboard, zipline, ladders...) plug in here. */
const _probe = new THREE.Vector3(), DOWN = new THREE.Vector3(0, -1, 0);
/**
 * Footing. Ground steeper than WALK degrees cannot be stood on: no jump or air jump from it, the
 * hero slides down it, and no move (air control, a roll, a lunge) carries them up a face that
 * steep. This is what keeps the band ridges a wall rather than a staircase of jumps.
 */
const WALK = 50, COS_WALK = Math.cos((WALK * Math.PI) / 180), SLIDE_ACC = 16, SLIDE_MAX = 9;
const _gn = new THREE.Vector3(), _face = new THREE.Vector3(), _pre = new THREE.Vector3();
/** what the hero can stand on */
const RAY_FOOT = groups(0xffff, CG.WORLD | CG.PROP | CG.NOCAM);

export interface MoveMode {
  name: Locomotion;
  /** when true the capsule still collides via moveBy(); otherwise the mode sets pos directly */
  enter?(p: Player): void;
  update(p: Player, dt: number): void;
  exit?(p: Player): void;
  /** allow attacking while in this mode */
  canAttack?: boolean;
}

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  /** facing heading: forward = (sin yaw, 0, cos yaw) */
  yaw = 0;
  grounded = true;
  /** on ground too steep to stand on (see WALK): sliding off it, and no jumping from it */
  sliding = false;
  /** seconds since the last contact with a too-steep face, and that face's outward direction */
  private faceT = 9; private faceN = new THREE.Vector3();
  root = new THREE.Group();
  rig!: HumanoidRig;
  weaponModel: WeaponModel | null = null;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  private kcc: RAPIER.KinematicCharacterController;
  mode: MoveMode | null = null;
  /** gameplay locks */
  controllable = true;
  dead = false;
  /** seconds of invulnerability left (dodge i-frames, respawn grace) */
  invuln = 0;
  // movement feel
  runSpeed = 6.6; sprintSpeed = 9.8;
  sprinting = false; private sprintHold = 0;
  private coyote = 0; private jumpBuf = 0; private jumpsLeft = 1; private jumpHeld = false;
  airTime = 0; private fallStart = 0; landT = 9;
  // roll
  rolling = false; rollT = 0; private rollDir = new THREE.Vector3(); rollCd = 0;
  /** speed multiplier imposed by actions (attacking, aiming) */
  actionSlow = 1;
  /** when set, movement input is ignored and this velocity is used (attack lunges) */
  lunge = new THREE.Vector3(); lungeT = 0;
  /** length of the eased lunge in progress (0 for a plain constant-velocity one) */
  private lungeDur = 0;
  /** 0..1 while sliding into a strike: the body holds a planted stance instead of running */
  private lungeK = 0;
  /** external knockback, decays */
  private knock = new THREE.Vector3();
  /** seconds of lost control left after a staggering hit */
  stunT = 0;
  /** seconds since a knockdown began, or -1 when on the feet */
  downT = -1;
  private flinchT = 9; private flinchPow = 0;
  // visual inertia only: none of these change how the capsule moves
  private jumpT = 9; private pivotT = 9; private settleT = 9; private prevMag = 0;
  private pivotDir = new THREE.Vector3();
  /** velocity of the platform under our feet */
  groundVel = new THREE.Vector3();
  groundTag = '';
  /** live velocity vector of the surface under us (a mover's, updated before we move) */
  private groundRef: THREE.Vector3 | null = null;
  /** face this heading instead of the move direction (combat) */
  faceYaw: number | null = null;
  moveHeading: number | null = null;
  pose: HumanPose = {
    time: 0, locomotion: 'ground', speed: 0, moveX: 0, moveZ: 0, vy: 0, landT: 9, weapon: 'none', drawn: false,
    action: null, actionT: 0, aimPitch: 0, lean: 0, rollT: 0, lookYaw: 0, lookPitch: 0, climbPhase: 0,
  };
  /** current upper-body action (set by combat / interactions) */
  action: HumanAction = null; actionT = 0;
  private lean = 0; private stepAcc = 0;
  private lastYaw = 0;
  /** seconds since last combat event (drives sheathing, regen, sprint) */
  sinceCombat = 99;
  onLand: ((fall: number) => void) | null = null;
  onStep: (() => void) | null = null;
  onJump: ((double: boolean) => void) | null = null;

  constructor(public game: Game) {
    const w = game.physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(HALF_H, RADIUS).setCollisionGroups(G_PLAYER), this.body);
    const k = w.createCharacterController(0.03);
    k.setUp({ x: 0, y: 1, z: 0 });
    k.enableAutostep(0.45, 0.18, true);
    k.enableSnapToGround(0.4);
    k.setMaxSlopeClimbAngle((52 * Math.PI) / 180);
    k.setMinSlopeSlideAngle((58 * Math.PI) / 180);
    k.setApplyImpulsesToDynamicBodies(true);
    k.setCharacterMass(75);
    this.kcc = k;
    game.scene.add(this.root);
  }

  setRig(rig: HumanoidRig) {
    if (this.rig) { this.root.remove(this.rig.root); this.rig.dispose(); }
    this.rig = rig;
    this.root.add(rig.root);
  }

  get center() { return _v.set(this.pos.x, this.pos.y + 1.05, this.pos.z); }
  forward(out: THREE.Vector3) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  get speed2d() { return Math.hypot(this.vel.x, this.vel.z); }

  teleport(x: number, y: number, z: number, yaw?: number) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.knock.set(0, 0, 0);
    if (yaw !== undefined) this.yaw = yaw;
    this.body.setTranslation({ x, y: y + CENTER_Y, z }, true);
    this.body.setNextKinematicTranslation({ x, y: y + CENTER_Y, z });
    this.grounded = false; this.airTime = 0; this.fallStart = y;
    this.root.position.copy(this.pos);
  }

  setMode(m: MoveMode | null) {
    if (this.mode === m) return;
    this.mode?.exit?.(this);
    this.mode = m;
    m?.enter?.(this);
    this.rolling = false; this.lungeT = 0;
  }

  knockback(dx: number, dz: number, power: number, up = 0) {
    const l = Math.hypot(dx, dz) || 1;
    this.knock.x += (dx / l) * power; this.knock.z += (dz / l) * power;
    if (up > 0 && this.grounded) { this.vel.y = up; this.grounded = false; this.coyote = 0; }
  }
  /** Show a blow landing: the torso gives along (dx, dz) in world space. Layers over any action. */
  flinch(dx: number, dz: number, power = 1) {
    const l = Math.hypot(dx, dz) || 1, sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // into character space: x toward the character's left (+X of the rig), z forward
    this.pose.flinchX = ((dx / l) * cy - (dz / l) * sy); this.pose.flinchZ = ((dx / l) * sy + (dz / l) * cy);
    this.flinchT = 0; this.flinchPow = power;
  }
  /** Take control away for a moment (a staggering hit). */
  stagger(sec: number) { this.stunT = Math.max(this.stunT, sec); this.rolling = false; this.lungeT = 0; }
  /** Knock flat. Control returns KNOCKDOWN.end seconds later, or sooner through a roll. */
  knockDown() { this.downT = 0; this.stunT = 0; this.rolling = false; this.lungeT = 0; this.sprinting = false; }
  get down() { return this.downT >= 0; }
  /** Launch upward/outward (kickers, bounce pads, skills). */
  launch(vx: number, vy: number, vz: number) {
    this.vel.set(vx, vy, vz); this.grounded = false; this.coyote = 0; this.jumpsLeft = 1; this.fallStart = this.pos.y;
  }

  /** Collide-and-slide the capsule by a displacement. Returns true when standing on something. */
  moveBy(d: THREE.Vector3, snap = true): boolean {
    const k = this.kcc;
    if (snap) k.enableSnapToGround(0.4); else k.disableSnapToGround();
    k.computeColliderMovement(this.collider, d, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, G_PLAYER);
    const m = k.computedMovement();
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;
    // world bounds
    this.pos.x = clamp(this.pos.x, -248.5, 248.5); this.pos.z = clamp(this.pos.z, -248.5, 248.5);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + CENTER_Y, z: this.pos.z });
    const g = k.computedGrounded();
    // what are we standing on?
    this.groundVel.set(0, 0, 0); this.groundTag = ''; this.groundRef = null;
    let found = false;
    if (g) {
      const n = k.numComputedCollisions();
      for (let i = 0; i < n; i++) {
        const c = k.computedCollision(i);
        if (!c || !c.collider || c.normal1.y < 0.6) continue;
        const meta = this.game.physics.meta.get(c.collider.handle);
        if (meta) { if (meta.vel) { this.groundVel.copy(meta.vel); this.groundRef = meta.vel; } if (meta.tag) this.groundTag = meta.tag; found = true; }
      }
    }
    // The controller hovers a skin-width above the floor, so a level move often reports no contact:
    // probe straight down so moving platforms and conveyors always carry us.
    if ((g || this.grounded) && !found) {
      const h = this.game.physics.raycast(_probe.set(this.pos.x, this.pos.y + 0.45, this.pos.z), DOWN, 1.0, undefined, this.collider);
      if (h?.collider) {
        const meta = this.game.physics.meta.get(h.collider.handle);
        if (meta) {
          if (meta.vel) { this.groundVel.copy(meta.vel); this.groundRef = meta.vel; }
          if (meta.tag) this.groundTag = meta.tag;
          // a rising platform must never swallow our feet
          if (meta.mover && h.dist < 0.44) { this.pos.y += 0.45 - h.dist; this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + CENTER_Y, z: this.pos.z }); }
        }
      }
    }
    return g;
  }

  /**
   * Slide `dist` metres along (dx, dz) in `dur` seconds, quick off the mark and braking into the
   * strike. The speed profile runs from 1.2 to 0.8 of the average, so the distance is exact.
   */
  startLunge(dx: number, dz: number, dist: number, dur: number, soft = false) {
    const l = Math.hypot(dx, dz) || 1, v = dist / Math.max(dur, 1e-3);
    this.lunge.set((dx / l) * v, 0, (dz / l) * v); this.lungeT = dur; this.lungeDur = dur; this.lungeSoft = soft;
  }
  /** first person: the slide eases in and out (same distance, same time), so the eyes are carried to the target, not thrown at it */
  private lungeSoft = false;

  /**
   * Can the ground under the hero be stood on (no steeper than WALK)? Leaves its normal in _gn. The
   * terrain is a 2 m mesh whose facets kink, so it is judged by its slope across the feet.
   */
  private walkable(): boolean {
    const g = this.game, p = this.pos;
    const h = g.physics.raycast(_probe.set(p.x, p.y + 0.45, p.z), DOWN, 0.85, RAY_FOOT, this.collider);
    if (h) {
      if (h.collider.shapeType() === RAPIER.ShapeType.TriMesh && Math.abs(h.point.y - g.terrain.h(p.x, p.z)) < 0.12) g.terrain.normal(p.x, p.z, _gn);
      else _gn.copy(h.normal);
      return _gn.y >= COS_WALK;
    }
    // nothing under the centre (perched on an edge, or resting high on a steep face, where the
    // contact is uphill of the centre): go by what the capsule touches. Built surfaces by their
    // contact normal; the terrain by its own slope, never by a facet normal, and also when the
    // controller reports ground through its snap with no contact at all (that was how a run of
    // hops climbed a band ridge's 70-degree shoulder).
    const k = this.kcc, n = k.numComputedCollisions();
    let steep = false;
    for (let i = 0; i < n; i++) {
      const c = k.computedCollision(i);
      if (!c) continue;
      const w = c.witness1;
      if (c.collider && c.collider.shapeType() === RAPIER.ShapeType.TriMesh && Math.abs(w.y - g.terrain.h(w.x, w.z)) < 0.15) continue;
      if (c.normal1.y >= COS_WALK) return true;
      if (c.normal1.y > 0.05) { steep = true; _gn.set(c.normal1.x, c.normal1.y, c.normal1.z); }
    }
    if (steep) return false;
    // a plank or deck under the rim of the capsule (its edge) is footing, whatever the slope beneath it
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2, r = RADIUS * 0.85;
      const e = g.physics.raycast(_probe.set(p.x + Math.sin(a) * r, p.y + 0.45, p.z + Math.cos(a) * r), DOWN, 0.85, RAY_FOOT, this.collider);
      if (e && !(e.collider.shapeType() === RAPIER.ShapeType.TriMesh && Math.abs(e.point.y - g.terrain.h(e.point.x, e.point.z)) < 0.12) && e.normal.y >= COS_WALK) return true;
    }
    if (p.y - g.terrain.h(p.x, p.z) < 1.6) { g.terrain.normal(p.x, p.z, _gn); return _gn.y >= COS_WALK; }
    return true;
  }
  /** For mounts: is the ground under the capsule too steep to stand on (see WALK)? Its level downhill direction goes in `out`. */
  steepGround(out: THREE.Vector3): boolean {
    if (this.walkable()) return false;
    out.set(_gn.x, 0, _gn.z).normalize();
    return true;
  }
  /** The outward direction (level) of a too-steep face the last move touched, or null. */
  private steepContact(): THREE.Vector3 | null {
    const k = this.kcc, n = k.numComputedCollisions();
    for (let i = 0; i < n; i++) {
      const c = k.computedCollision(i);
      if (c && c.normal1.y > 0.05 && c.normal1.y < COS_WALK) return _face.set(c.normal1.x, 0, c.normal1.z).normalize();
    }
    return null;
  }
  /** Drop the part of a level motion that runs into the face in faceN. */
  private offFace(v: THREE.Vector3) {
    const into = v.x * this.faceN.x + v.z * this.faceN.z;
    if (into < 0) { v.x -= into * this.faceN.x; v.z -= into * this.faceN.z; }
  }

  startRoll(dirX: number, dirZ: number) {
    if (this.rolling || this.rollCd > 0 || !this.grounded && this.airTime > 0.15) return false;
    // from the ground: once the fall has landed, a roll is the quick way up
    if (this.downT >= 0) { if (this.downT < KNOCKDOWN.rollAt) return false; this.downT = -1; }
    if (this.stunT > 0) return false;
    const l = Math.hypot(dirX, dirZ);
    if (l < 0.1) this.forward(this.rollDir); else this.rollDir.set(dirX / l, 0, dirZ / l);
    this.rolling = true; this.rollT = 0; this.rollCd = 0.75;
    this.invuln = Math.max(this.invuln, 0.42);
    this.yaw = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.lungeT = 0;
    return true;
  }

  update(dt: number) {
    const g = this.game, inp = g.input, cam = g.cameraRig;
    this.pose.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.sinceCombat += dt;
    this.landT += dt;
    this.stunT = Math.max(0, this.stunT - dt);
    if (this.downT >= 0) { this.downT += dt; if (this.downT >= KNOCKDOWN.end || this.mode || this.dead) this.downT = -1; }
    this.flinchT += dt; this.jumpT += dt; this.pivotT += dt; this.settleT += dt;

    if (this.mode) {
      this.mode.update(this, dt);
    } else {
      this.updateNormal(dt);
    }
    // pose
    const p = this.pose;
    const sp = this.speed2d;
    const turn = angleDiff(this.lastYaw, this.yaw) / Math.max(dt, 1e-3);
    this.lastYaw = this.yaw;
    this.lean = damp(this.lean, clamp(-turn * 0.09, -1, 1) * Math.min(1, sp / 5), 8, dt);
    // a lunge is a slide in a planted stance, not a sprint: hide its speed from the gait
    this.lungeK = damp(this.lungeK, this.lungeT > 0 && !this.rolling && !this.mode ? 1 : 0, this.lungeT > 0 ? 40 : 14, dt);
    p.lunge = this.lungeK;
    p.speed = sp * (1 - this.lungeK); p.vy = this.vel.y; p.landT = this.landT; p.lean = this.lean;
    if (!this.mode) p.locomotion = this.dead ? 'dead' : this.downT >= 0 ? 'down' : this.rolling ? 'roll' : this.grounded || this.airTime < 0.08 ? 'ground' : 'air';
    else p.locomotion = this.dead ? 'dead' : this.mode.name;
    p.rollT = this.rollT; p.downT = this.downT;
    p.jumpT = this.jumpT; p.settleT = this.grounded ? this.settleT : 9;
    {
      const t = this.pivotT;
      p.pivot = !this.grounded || t > 0.34 ? 0 : t < 0.05 ? t / 0.05 : 1 - (t - 0.05) / 0.29;
      if (p.pivot > 0) p.pivot = p.pivot * p.pivot * (3 - 2 * p.pivot);
      // the slide direction in character space (the character is already turning to the new heading)
      const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      p.pivotX = this.pivotDir.x * cy - this.pivotDir.z * sy; p.pivotZ = this.pivotDir.x * sy + this.pivotDir.z * cy;
    }
    // flinch envelope: there in 40 ms, gone in about a third of a second
    p.flinch = this.flinchT < 0.04 ? (this.flinchT / 0.04) * this.flinchPow : this.flinchT < 0.6 ? Math.exp(-(this.flinchT - 0.04) * 9) * Math.cos((this.flinchT - 0.04) * 6) * this.flinchPow : 0;
    // local move direction
    this.forward(_f); _r.set(_f.z, 0, -_f.x);
    if (sp > 0.2) { p.moveX = (this.vel.x * _r.x + this.vel.z * _r.z) / sp; p.moveZ = (this.vel.x * _f.x + this.vel.z * _f.z) / sp; }
    else { p.moveX = 0; p.moveZ = 0; }
    p.action = this.action; p.actionT = this.actionT;
    p.fp = g.cameraRig.eyeAmount; p.fpPitch = g.cameraRig.pitch;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.rig?.update(dt, p);
    // footsteps
    if (p.locomotion === 'ground' && sp > 1.5 && this.grounded) {
      this.stepAcc += sp * dt;
      if (this.stepAcc > (this.sprinting ? 2.3 : 1.9)) { this.stepAcc = 0; this.onStep?.(); }
    }
    void inp; void cam;
  }

  private updateNormal(dt: number) {
    const g = this.game, inp = g.input, cam = g.cameraRig;
    const can = this.controllable && !this.dead && this.stunT <= 0 && this.downT < 0;
    // camera-relative wish direction
    cam.forward(_f); _r.set(-_f.z, 0, _f.x);
    let wx = 0, wz = 0, mag = 0;
    if (can) {
      wx = _r.x * inp.moveX + _f.x * inp.moveY; wz = _r.z * inp.moveX + _f.z * inp.moveY;
      mag = Math.min(1, Math.hypot(inp.moveX, inp.moveY));
    }
    // sprint: key on desktop, sustained full tilt on touch
    if (mag > 0.93) this.sprintHold += dt; else this.sprintHold = 0;
    const wantSprint = can && mag > 0.5 && (inp.down('sprint') || (inp.isTouch && this.sprintHold > 0.8)) && this.sinceCombat > 2.5 && this.actionSlow > 0.9;
    if (wantSprint && !this.sprinting && this.grounded) g.onSprintStart?.();
    this.sprinting = wantSprint;
    const maxSp = (this.sprinting ? this.sprintSpeed : this.runSpeed) * g.state.moveMult * this.actionSlow;

    if (this.rolling) {
      this.rollT += dt / 0.52;
      const k = this.rollT < 0.75 ? 1 : 1 - (this.rollT - 0.75) / 0.25 * 0.5;
      const sp = 13.2 * k;
      this.vel.x = this.rollDir.x * sp; this.vel.z = this.rollDir.z * sp;
      if (this.rollT >= 1) { this.rolling = false; this.vel.x = this.rollDir.x * this.runSpeed; this.vel.z = this.rollDir.z * this.runSpeed; }
    } else if (this.lungeT > 0) {
      const lu = this.lungeDur > 0 ? clamp(1 - this.lungeT / this.lungeDur, 0, 1) : 0, lm = clamp(lu + 0.5 * dt / Math.max(this.lungeDur, 1e-3), 0, 1);
      const k = this.lungeDur <= 0 ? 1 : this.lungeSoft ? 6 * lm * (1 - lm) : 1.2 - 0.4 * lu;
      this.lungeT -= dt;
      this.vel.x = this.lunge.x * k; this.vel.z = this.lunge.z * k;
      if (this.lungeT <= 0) { this.vel.x *= 0.3; this.vel.z *= 0.3; this.lungeDur = 0; }
    } else {
      // weight cues for the animation: a hard reversal plants and pivots, letting go at a run settles
      const sp0 = Math.hypot(this.vel.x, this.vel.z);
      if (this.grounded && mag > 0.5 && sp0 > 3.8 && this.pivotT > 0.5 && (this.vel.x * wx + this.vel.z * wz) / (sp0 * Math.hypot(wx, wz)) < -0.45) {
        this.pivotT = 0; this.pivotDir.set(this.vel.x / sp0, 0, this.vel.z / sp0);
        g.fx.dust(this.pos, 4, 0.9); g.sfx('slide', { vol: 0.3, pitch: 1.2 });
      }
      if (this.grounded && mag <= 0.01 && this.prevMag > 0.5 && sp0 > 4.5) { this.settleT = 0; g.fx.dust(this.pos, 2, 0.6); }
      this.prevMag = mag;
      const tx = mag > 0.01 ? (wx / Math.hypot(wx, wz)) * maxSp * mag : 0, tz = mag > 0.01 ? (wz / Math.hypot(wx, wz)) * maxSp * mag : 0;
      const acc = this.grounded ? (mag > 0.01 ? 58 : 46) : 16;
      const dx = tx - this.vel.x, dz = tz - this.vel.z, dl = Math.hypot(dx, dz);
      const step = acc * dt;
      if (dl <= step) { this.vel.x = tx; this.vel.z = tz; } else { this.vel.x += (dx / dl) * step; this.vel.z += (dz / dl) * step; }
    }
    this.moveHeading = mag > 0.1 ? Math.atan2(wx, wz) : null;

    // jump (buffered, coyote, variable height, one air jump)
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (can && inp.pressed('jump')) this.jumpBuf = 0.14;
    this.jumpHeld = can && inp.down('jump');
    if (this.jumpBuf > 0 && !this.rolling) {
      if (this.coyote > 0) {
        this.vel.y = 9.4; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.jumpsLeft = 1; this.fallStart = this.pos.y;
        this.vel.x += this.groundVel.x; this.vel.z += this.groundVel.z;
        this.jumpT = 0;
        this.onJump?.(false);
      } else if (this.jumpsLeft > 0 && this.airTime > 0.12 && !this.sliding && this.faceT > 0.25) {
        this.vel.y = 8.6; this.jumpsLeft--; this.jumpBuf = 0; this.fallStart = Math.max(this.fallStart, this.pos.y);
        this.jumpT = 0;
        this.onJump?.(true);
      }
    }
    // gravity with a snappier fall and jump-cut
    const grav = this.vel.y > 0 ? (this.jumpHeld ? 23 : 46) : 34;
    if (!this.grounded) this.vel.y = Math.max(-42, this.vel.y - grav * dt);
    else if (this.vel.y < 0) this.vel.y = 0;

    // knockback decays
    this.knock.x = damp(this.knock.x, 0, 7, dt); this.knock.z = damp(this.knock.z, 0, 7, dt);

    // footing: slide off ground too steep to stand on; off walkable ground, nothing pushes up a steep face
    this.faceT += dt;
    if (this.sliding && !this.rolling) {
      const s = this.vel.x * this.faceN.x + this.vel.z * this.faceN.z;
      if (s < SLIDE_MAX) { const a = Math.min(SLIDE_ACC * dt, SLIDE_MAX - s); this.vel.x += this.faceN.x * a; this.vel.z += this.faceN.z * a; }
      this.vel.y = Math.max(this.vel.y, -SLIDE_MAX);
    }
    if (!this.grounded && this.faceT < 0.25) this.offFace(this.vel);

    const wasGrounded = this.grounded;
    const vyBefore = this.vel.y;
    _v.set((this.vel.x + this.knock.x) * dt, this.vel.y * dt, (this.vel.z + this.knock.z) * dt);
    // Ride whatever we stand on. Movers are teleported fixed bodies, so the controller's query sees
    // us and the platform at last step's positions (a consistent pair); we add the platform's
    // displacement for this frame ourselves, then resolve our own movement on top of it.
    if (this.grounded) {
      const gv = this.groundRef ?? this.groundVel;
      if (gv.x !== 0 || gv.y !== 0 || gv.z !== 0) { this.pos.x += gv.x * dt; this.pos.y += gv.y * dt; this.pos.z += gv.z * dt; }
      _v.y -= 0.02;
    }
    const yBefore = this.pos.y;
    _pre.copy(this.pos);
    this.grounded = this.moveBy(_v, this.vel.y <= 0);
    {
      // A steep face met off walkable ground must not lift us: the controller slides a push into a
      // slope up along it. Take the push into the face out and make the move again from where it began.
      let face = this.steepContact();
      if (face && this.pos.y - yBefore > Math.max(_v.y, 0) + 0.004 && !(this.grounded && this.walkable())) {
        this.faceN.copy(face); this.faceT = 0;
        this.offFace(_v);
        this.pos.copy(_pre);
        this.grounded = this.moveBy(_v, this.vel.y <= 0);
        face = this.steepContact();
      }
      if (face) { this.faceN.copy(face); this.faceT = 0; }
      // standing on it is not the same as being able to stand on it
      const was = this.sliding;
      this.sliding = (this.grounded || (!!face && this.vel.y <= 0.5)) && !this.walkable();
      if (this.sliding) {
        this.grounded = false;
        this.faceN.set(_gn.x, 0, _gn.z).normalize(); this.faceT = 0;
        // a slide is not a fall: no fall damage or heavy landing when it runs out onto level ground
        this.fallStart = this.pos.y;
        if (!was) this.coyote = 0;
      }
    }
    // hit a ceiling
    if (this.vel.y > 0 && this.pos.y - yBefore < _v.y * 0.3) this.vel.y = Math.min(this.vel.y, 1);
    if (this.grounded) {
      if (!wasGrounded) {
        const fall = this.fallStart - this.pos.y;
        if (this.airTime > 0.18) { this.landT = 0; this.onLand?.(Math.max(fall, -vyBefore * 0.12)); }
        this.jumpsLeft = 1;
      }
      this.airTime = 0; this.fallStart = this.pos.y;
    } else {
      if (wasGrounded) this.fallStart = this.pos.y;
      this.airTime += dt;
      this.fallStart = Math.max(this.fallStart, this.pos.y);
    }
    // facing
    if (!this.rolling) {
      // first person: the body turns with the view and the stick strafes (systems/view.ts)
      if (cam.fp) this.yaw = dampAngle(this.yaw, g.view.bodyYaw(cam.yaw + Math.PI, this.faceYaw), 30, dt);
      else if (this.faceYaw !== null) this.yaw = dampAngle(this.yaw, this.faceYaw, 22, dt);
      else if (this.moveHeading !== null && this.lungeT <= 0) this.yaw = dampAngle(this.yaw, this.moveHeading, this.grounded ? 14 : 8, dt);
    }
    // safety net: never fall out of the world. Inside an interior (the vault is 70 m under the
    // Slagworks) the terrain is the wrong floor: a hero put there stood on the surface with the
    // vault still entered and its robots out of reach (QA 2026-11-26), so go back to its checkpoint.
    if (this.pos.y < -260) {
      const cp = g.interior ? g.combat.checkpoint : null;
      // and the interior resets as it does for a death: the vault's checkpoint stands behind the
      // combat chamber's closed door, so without the reset the hero waited there for a wave that could not reach them
      if (cp) { this.teleport(cp.x, cp.y + 0.15, cp.z, cp.yaw); cp.onRespawn?.(); }
      else { const y = g.terrain.h(this.pos.x, this.pos.z) + 2; this.teleport(this.pos.x, y, this.pos.z); }
    }
    void lerp;
  }
}
