/**
 * Mounts: the loaner horse and the park hoverboard.
 *
 *  - Horse ('ride'): weighty gaits, wide turns at speed, a gathered jump. Uses the player capsule
 *    (moveBy) so it collides with the world. Summoned with the HUD mount button once the
 *    Stablemaster hands over the whistle (flag `horse_whistle`), or borrowed via
 *    game.hooks.borrowHorse().
 *  - Hoverboard ('board'): momentum physics on the park's analytic height field (kitB.PARK), so
 *    ramps and transitions never snag. Ollies, grinds, air tricks, combos, bails.
 */
import * as THREE from 'three';
import { angleDiff, clamp, clamp01, damp, dampAngle, lerp, rand } from '../../core/util';
import { makeHorse, makeHoverboard } from '../../entities/humanoid/mounts';
import type { HorsePose, HorseRig, HoverboardRig } from '../../entities/humanoid/types';
import type { MoveMode, Player } from '../../entities/player';
import type { Game, System } from '../../game';
import { SP } from '../../gfx/fx';
import type { Interactable } from '../../systems/interact';
import { PAL } from '../layout';
import { B, HORSE_HOME, PARK, type Feat, type MountApi, type MountState, type Rail, parkH, parkN } from './kitB';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();
const _n = new THREE.Vector3(), _n2 = new THREE.Vector3(), _a = new THREE.Vector3(), _dir = new THREE.Vector3(), _x = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const _o: [number, number, number] = [0, 0, 0];
const CENTER_Y = 0.86; // capsule centre above the feet (player.ts)

const HOV = 0.36;      // deck height above the surface
const BG = 19;         // gravity along a surface
const AG = 14;         // gravity in the air: a hoverboard floats a little, which is what makes tricks land
interface Trick { name: string; act: 'boardTrick1' | 'boardTrick2' | 'boardTrick3'; dur: number; pts: number; t: number }
const TRICKS = {
  flip: { name: 'Backflip', act: 'boardTrick3', dur: 0.56, pts: 800 },
  kick: { name: 'Kickflip', act: 'boardTrick1', dur: 0.4, pts: 300 },
  grab: { name: 'Indy Grab', act: 'boardTrick2', dur: 0.45, pts: 400 },
} as const;

class Mounts implements System, MountApi {
  // ---------------------------------------------------------------- horse state
  horse: HorseRig | null = null;
  private hPose: HorsePose = { time: 0, speed: 0, vy: 0, grounded: true, turn: 0, rear: 0 };
  private hState: 'home' | 'parked' | 'coming' | 'ridden' = 'home';
  private hPos = new THREE.Vector3(); private hYaw = 0;
  private hSpeed = 0; private hVy = 0; private hGrounded = true; private hGather = 0; private hAir = 0; private hStride = 0;
  private hJumpBuf = 0; private hHold = 0; private hYawRate = 0; private hRideT = 0; private hComeT = 0; private hSnort = 6;
  private hInteract!: Interactable;
  private riderRoot: THREE.Object3D | null = null;
  private rideMode: MoveMode;
  // ---------------------------------------------------------------- board state
  board: HoverboardRig | null = null;
  private boardMode: MoveMode;
  private c = new THREE.Vector3();       // contact point on the surface
  private bn = new THREE.Vector3(0, 1, 0); // smoothed surface normal for visuals
  private bGround = true; private bAir = 0; private bJumpBuf = 0;
  private assist = new THREE.Vector3(); private assistOn = false;
  private airSpin = 0; private trick: Trick | null = null; private flipA = 0; private kickA = 0;
  private combo = { names: [] as string[], pts: 0, t: 0 };
  private rail: Rail | null = null; private ru = 0; private rs = 0; private bal = 0; private balBias = 0; private grindT = 0; private railCd = 0; private sparkT = 0;
  private bailT = 0; private pitch = 0; private roll = 0; private lastYaw = 0; private glowT = 0; private maxAirY = 0; private launchY = 0;
  private loopHover = 0; private loopGrind = 0; private loopGallop = 0;

  constructor(private game: Game) {
    const g = game;
    try { this.horse = makeHorse(); } catch (e) { console.warn('horse rig unavailable', e); }
    try { this.board = makeHoverboard(); } catch (e) { console.warn('hoverboard rig unavailable', e); }
    this.hPos.set(HORSE_HOME.x, g.terrain.h(HORSE_HOME.x, HORSE_HOME.z), HORSE_HOME.z); this.hYaw = HORSE_HOME.yaw + Math.PI / 2;
    if (this.horse) { g.scene.add(this.horse.root); this.placeHorse(); }

    this.rideMode = { name: 'ride', enter: (p) => this.rideEnter(p), update: (p, dt) => this.rideUpdate(p, dt), exit: (p) => this.rideExit(p) };
    this.boardMode = { name: 'board', enter: (p) => this.boardEnter(p), update: (p, dt) => this.boardUpdate(p, dt), exit: (p) => this.boardExit(p) };

    this.hInteract = g.interact.add({
      id: 'horse_mount', pos: this.hPos, radius: 3.2, icon: 'horse', priority: 0.5,
      label: () => (this.hState === 'home' ? 'Ride the loaner horse' : 'Mount up'),
      enabled: () => !!this.horse && (this.hState === 'home' || this.hState === 'parked') && !g.player.mode && !g.interior,
      onUse: () => this.mountHorse(),
    });
    g.hooks.borrowHorse = () => {
      const sg = g.town?.stableGate;
      return sg ? this.callHorse(sg.x, sg.z + 5) : this.callHorse();
    };
    g.hooks.mountState = () => this.state();
    g.hooks.dismount = () => this.dismount();
    // HUD buttons are refreshed by the game before plates are drawn; override what the board changes
    g.plateFns.push(() => this.hudButtons());
    g.state.events.on('playerDeath', () => this.dismount());
  }

  // ================================================================ shared
  state(): MountState { const m = this.game.player.mode; return m === this.rideMode ? 'horse' : m === this.boardMode ? 'board' : 'none'; }
  dismount() {
    const p = this.game.player, s = this.state();
    if (s === 'horse') {
      const yaw = p.yaw;
      p.setMode(null);
      // step off on the near side
      _v.set(Math.cos(yaw) * 1.25, 0, -Math.sin(yaw) * 1.25);
      p.moveBy(_v, true);
      p.vel.set(0, 0, 0);
      this.game.sfx('land', { vol: 0.5 });
    } else if (s === 'board') this.stowBoard();
  }
  private hBlock = 0;
  private hudButtons() {
    const g = this.game, hud = g.hud, s = this.state();
    const whistle = !!g.state.flag('horse_whistle');
    const hidden = !(whistle || s !== 'none') || !!g.interior;
    hud.setAct('mount', { icon: s === 'board' ? 'board' : 'horse', hidden, off: s === 'none' && (g.mobs.inCombat > 0 || !!g.player.mode) });
    if (s === 'board') {
      hud.setAct('skill1', { icon: 'spin', cd: 0, cdMax: 1, off: false });
      hud.setAct('skill2', { icon: 'star', cd: 0, cdMax: 1, off: false });
      hud.setAct('dodge', { cd: 0, cdMax: 1 });
    }
  }

  update(dt: number, rdt: number) {
    const g = this.game, p = g.player, inp = g.input, s = this.state();
    // ---- mount button ----
    if (inp.pressed('mount') && p.controllable && !p.dead) {
      if (s !== 'none') this.dismount();
      else if (p.mode) { /* busy on a zipline, ladder... */ }
      else if (g.state.flag('horse_whistle')) this.callHorse();
      else g.hud.toast('No mount yet', 'warn', 'The Stablemaster in Brasswick lends horses');
    }
    // ---- horse when nobody is riding ----
    const h = this.horse;
    if (h && this.hState !== 'ridden') {
      h.root.visible = !g.interior;
      const dx = p.pos.x - this.hPos.x, dz = p.pos.z - this.hPos.z, dist = Math.hypot(dx, dz);
      if (this.hState === 'coming') {
        this.hComeT += dt;
        if (p.mode || p.dead || g.interior) { this.hState = 'parked'; this.hSpeed = 0; }
        else {
          const want = Math.atan2(dx, dz);
          this.hYaw = dampAngle(this.hYaw, want, 9, dt);
          this.hSpeed = damp(this.hSpeed, clamp(dist * 2.2 + 3, 4, 15), 5, dt);
          const st = Math.min(dist, this.hSpeed * dt);
          this.hPos.x += Math.sin(this.hYaw) * st; this.hPos.z += Math.cos(this.hYaw) * st;
          this.hPos.y = g.groundY(this.hPos.x, this.hPos.z, p.pos.y + 2);
          this.hoofbeats(dt, this.hSpeed, this.hPos, 0.7);
          if (dist < 2.6 || this.hComeT > 5) this.mountHorse();
        }
      } else {
        this.hSpeed = damp(this.hSpeed, 0, 6, dt);
        // an idle horse looks at whoever walks up
        if (dist < 9 && dist > 1.5) this.hYaw = dampAngle(this.hYaw, Math.atan2(dx, dz) + 0.5, 0.6, dt);
        this.hSnort -= dt;
        if (this.hSnort <= 0 && dist < 24 && !g.interior) { this.hSnort = rand(7, 14); g.sfx('horse_snort', { pos: this.hPos, vol: 0.6 }); this.hPose.rear = 0; }
        // a loaner left far behind finds its own way home
        if (this.hState === 'parked' && dist > 85) this.sendHome();
      }
      if ((this.hState as string) !== 'ridden') {
        this.placeHorse();
        const hp = this.hPose;
        hp.time += dt; hp.speed = this.hSpeed; hp.vy = 0; hp.grounded = true; hp.turn = 0; hp.rear = damp(hp.rear, 0, 4, dt);
        if (!g.interior && dist < 140) h.update(dt, hp);
      }
    }
    // ---- loops ----
    const a = g.audio;
    if (a?.loop) {
      const riding = s === 'horse', boarding = s === 'board';
      const gl = riding ? clamp01((this.hSpeed - 7.5) / 5) * 0.55 : 0;
      if (gl > 0 || this.loopGallop > 0) { a.loop('gallop', gl, 0.9 + this.hSpeed * 0.012); this.loopGallop = gl; }
      const sp = p.vel.length();
      const hl = boarding ? 0.22 + clamp01(sp / 14) * 0.4 : 0;
      if (hl > 0 || this.loopHover > 0) { a.loop('hover', hl, 0.8 + clamp01(sp / 16) * 0.6); this.loopHover = hl; }
      const grl = boarding && this.rail ? 0.7 : 0;
      if (grl > 0 || this.loopGrind > 0) { a.loop('grind', grl, 0.9 + Math.abs(this.rs) * 0.03); this.loopGrind = grl; }
    }
    void rdt;
  }

  // ================================================================ horse
  private placeHorse() {
    const h = this.horse;
    if (!h) return;
    h.root.position.copy(this.hPos); h.root.rotation.set(0, this.hYaw, 0);
  }
  private sendHome() {
    const g = this.game;
    this.hPos.set(HORSE_HOME.x, g.terrain.h(HORSE_HOME.x, HORSE_HOME.z), HORSE_HOME.z); this.hYaw = HORSE_HOME.yaw + Math.PI / 2;
    this.hState = 'home';
  }
  callHorse(fromX?: number, fromZ?: number): boolean {
    const g = this.game, p = g.player;
    if (!this.horse || this.hState === 'ridden' || this.hState === 'coming') return false;
    if (g.interior) { g.hud.toast("A horse won't fit in here", 'warn'); return false; }
    if (p.dead || p.mode || !p.controllable) return false;
    if (g.mobs.inCombat > 0 || g.combat.sinceHurt < 4) { g.hud.toast("Your horse won't come near a fight", 'warn'); g.sfx('ui_deny'); return false; }
    const near = Math.hypot(this.hPos.x - p.pos.x, this.hPos.z - p.pos.z) < 60;
    if (fromX !== undefined && fromZ !== undefined && Math.hypot(fromX - p.pos.x, fromZ - p.pos.z) < 50) this.hPos.set(fromX, 0, fromZ);
    else if (!near || fromX !== undefined) {
      // gallop in from behind the camera
      g.cameraRig.forward(_f);
      const side = rand(-7, 7);
      this.hPos.set(p.pos.x - _f.x * 24 - _f.z * side, 0, p.pos.z - _f.z * 24 + _f.x * side);
    }
    this.hPos.x = clamp(this.hPos.x, -246, 246); this.hPos.z = clamp(this.hPos.z, -246, 246);
    this.hPos.y = g.groundY(this.hPos.x, this.hPos.z, p.pos.y + 2);
    this.hYaw = Math.atan2(p.pos.x - this.hPos.x, p.pos.z - this.hPos.z);
    this.hState = 'coming'; this.hComeT = 0; this.hSpeed = 8;
    g.sfx('bird', { pitch: 1.7, vol: 0.9 }); g.sfx('bird', { pitch: 2.1, vol: 0.9, delay: 0.16 });
    g.sfx('horse_whinny', { pos: this.hPos, delay: 0.35 });
    return true;
  }
  private mountHorse() {
    const g = this.game, p = g.player;
    if (!this.horse || p.mode || p.dead || g.interior) return;
    p.setMode(this.rideMode);
  }
  private rideEnter(p: Player) {
    const g = this.game, h = this.horse!;
    this.hState = 'ridden'; this.hRideT = 0;
    this.hVy = 0; this.hGrounded = true; this.hGather = 0; this.hAir = 0; this.hJumpBuf = 0; this.hHold = 0; this.hYawRate = 0;
    this.hSpeed = Math.min(this.hSpeed, 6);
    // the capsule moves to where the horse stands
    const y = Math.max(this.hPos.y, g.groundY(this.hPos.x, this.hPos.z, this.hPos.y + 1.5));
    p.teleport(this.hPos.x, y + 0.05, this.hPos.z, this.hYaw);
    p.root.add(h.root); h.root.position.set(0, 0, 0); h.root.rotation.set(0, 0, 0); h.root.visible = true;
    this.riderRoot = p.rig?.root ?? null;
    if (this.riderRoot) { h.saddle.add(this.riderRoot); this.riderRoot.position.set(0, 0, 0); this.riderRoot.rotation.set(0, 0, 0); }
    p.grounded = true; p.action = null;
    g.combat.cancel();
    g.interact.blocked = true;
    this.hPose.rear = 0.55;
    g.sfx('horse_whinny', { vol: 0.8 }); g.fx.dust(p.pos, 6, 1.1); g.haptic(18);
  }
  private rideExit(p: Player) {
    const g = this.game, h = this.horse!;
    if (this.riderRoot) { p.root.add(this.riderRoot); this.riderRoot.position.set(0, 0, 0); this.riderRoot.rotation.set(0, 0, 0); this.riderRoot = null; }
    g.scene.add(h.root);
    this.hPos.copy(p.pos); this.hYaw = p.yaw; this.hState = 'parked'; this.hSpeed = 0; this.hSnort = 4;
    this.placeHorse();
    g.interact.blocked = false;
    g.fovExtra = 0; g.camDist = 1; g.speedFx = 0;
    p.vel.set(0, 0, 0); p.moveHeading = null;
  }
  private hoofbeats(dt: number, speed: number, pos: THREE.Vector3, vol: number) {
    if (speed < 0.6) return;
    const g = this.game;
    this.hStride += speed * dt;
    const stride = speed < 3.4 ? 0.85 : speed < 7 ? 1.25 : 2.5;
    if (this.hStride < stride) return;
    this.hStride = 0;
    const gallop = speed >= 7;
    const v = vol * clamp(0.35 + speed * 0.04, 0.35, 0.9), pt = 0.9 + Math.random() * 0.15;
    g.sfx('hoof', { vol: v, pitch: pt, pos });
    if (gallop) { g.sfx('hoof', { vol: v * 0.9, pitch: pt * 1.08, pos, delay: 0.07 }); g.sfx('hoof', { vol: v * 0.8, pitch: pt * 0.94, pos, delay: 0.15 }); }
    else if (speed >= 3.4) g.sfx('hoof', { vol: v * 0.8, pitch: pt * 1.06, pos, delay: 0.1 });
    if (speed > 6) g.fx.dust(pos, gallop ? 3 : 1, gallop ? 1.0 : 0.7);
    if (gallop && this.hState === 'ridden') { g.haptic(6); g.cameraRig.shake(0.035); }
  }
  private rideUpdate(p: Player, dt: number) {
    const g = this.game, inp = g.input, cam = g.cameraRig, h = this.horse!;
    const can = p.controllable && !p.dead;
    this.hRideT += dt;
    cam.forward(_f); _r.set(-_f.z, 0, _f.x);
    let wx = 0, wz = 0, mag = 0;
    if (can) { wx = _r.x * inp.moveX + _f.x * inp.moveY; wz = _r.z * inp.moveX + _f.z * inp.moveY; mag = Math.min(1, Math.hypot(inp.moveX, inp.moveY)); }
    // gaits: walk / trot / canter on the stick, gallop on sprint or a held full tilt
    this.hHold = mag > 0.93 ? this.hHold + dt : 0;
    const gallop = mag > 0.6 && (inp.down('sprint') || this.hHold > 0.55);
    let target = mag < 0.08 ? 0 : mag < 0.55 ? lerp(2.2, 5.6, (mag - 0.08) / 0.47) : lerp(5.6, 9.8, (mag - 0.55) / 0.45);
    if (gallop) target = 14.4;
    let yawStep = 0;
    if (mag > 0.08) {
      const d = angleDiff(p.yaw, Math.atan2(wx, wz));
      // a horse at speed has to be reined in before it can come about
      if (Math.abs(d) > 1.9 && this.hSpeed > 4.5) target = Math.min(target, 2.6);
      const rate = lerp(3.2, 1.0, clamp01(this.hSpeed / 14)) * (this.hGrounded ? 1 : 0.25);
      yawStep = clamp(d, -rate * dt, rate * dt);
      p.yaw += yawStep;
    }
    this.hYawRate = damp(this.hYawRate, yawStep / Math.max(dt, 1e-4), 8, dt);
    if (this.hGrounded) {
      if (this.hSpeed < target) this.hSpeed = Math.min(target, this.hSpeed + 5.6 * (1 - 0.4 * this.hSpeed / 14.4) * dt);
      else this.hSpeed = Math.max(target, this.hSpeed - (mag < 0.08 ? 5 : 9) * dt);
    }
    // gathered jump
    this.hJumpBuf = Math.max(0, this.hJumpBuf - dt);
    if (can && inp.pressed('jump')) this.hJumpBuf = 0.2;
    if (this.hJumpBuf > 0 && this.hGrounded && this.hGather <= 0) { this.hGather = 0.1; this.hJumpBuf = 0; }
    if (this.hGather > 0) {
      this.hGather -= dt;
      if (this.hGather <= 0) {
        // a standing jump still lunges forward, so a refusal at a fence can be put right on the spot
        this.hVy = 8.6 + this.hSpeed * 0.06; this.hGrounded = false; this.hAir = 0; if (mag > 0.3) this.hSpeed = Math.max(this.hSpeed, 6.2);
        g.sfx('jump', { pitch: 0.7 }); g.sfx('hoof', { vol: 0.9, pitch: 0.8 }); g.fx.dust(p.pos, 6, 1.2);
        if (Math.random() < 0.35) g.sfx('horse_snort', { vol: 0.6 });
      }
    }
    if (!this.hGrounded) this.hVy = Math.max(-40, this.hVy - (this.hVy > 0 ? 22 : 30) * dt);
    else this.hVy = 0;
    // move the capsule
    const sx = Math.sin(p.yaw), cz = Math.cos(p.yaw);
    const bx = p.pos.x, bz = p.pos.z, by = p.pos.y;
    _v.set(sx * this.hSpeed * dt, this.hGrounded ? -0.04 : this.hVy * dt, cz * this.hSpeed * dt);
    const was = this.hGrounded;
    this.hGrounded = p.moveBy(_v, this.hVy <= 0);
    if (this.hVy > 0 && p.pos.y - by < this.hVy * dt * 0.3) this.hVy = Math.min(this.hVy, 1);
    const want = this.hSpeed * dt;
    let moved = Math.hypot(p.pos.x - bx, p.pos.z - bz);
    if (was && want > 0.02 && moved < want * 0.45) {
      // The character controller sometimes snags for a frame on a terrain seam at a gallop: lift the
      // hooves a touch and try again before deciding this is a real obstacle.
      _v.set(sx * want - (p.pos.x - bx), 0.07, cz * want - (p.pos.z - bz));
      p.moveBy(_v, false);
      _v.set(0, -0.12, 0);
      this.hGrounded = p.moveBy(_v, true) || this.hGrounded;
      moved = Math.hypot(p.pos.x - bx, p.pos.z - bz);
    }
    if (was && want > 0.02 && moved < want * 0.45) {
      this.hBlock += dt;
      if (this.hBlock > 0.09) {
        // ran into something solid: the horse pulls up
        if (this.hSpeed > 8) { this.hPose.rear = 0.8; g.sfx('horse_whinny', { vol: 0.8 }); cam.shake(0.25); g.haptic(40); }
        this.hSpeed = Math.min(this.hSpeed, Math.max(1.2, moved / Math.max(dt, 1e-4)));
      }
    } else this.hBlock = 0;
    if (this.hGrounded) {
      if (!was && this.hAir > 0.22) {
        const hard = clamp01(this.hAir / 0.9);
        g.sfx('land_heavy', { vol: 0.6 + hard * 0.4 }); g.sfx('hoof', { vol: 1, pitch: 0.75 });
        g.fx.dust(p.pos, 8 + hard * 6, 1.3); cam.shake(0.16 + hard * 0.2); g.haptic(30);
        this.hSpeed *= 0.92; p.landT = 0;
      }
      this.hAir = 0;
    } else this.hAir += dt;
    p.grounded = this.hGrounded; p.airTime = this.hAir;
    p.vel.set(dt > 0 ? (p.pos.x - bx) / dt : 0, this.hVy, dt > 0 ? (p.pos.z - bz) / dt : 0);
    p.moveHeading = this.hSpeed > 1.2 ? p.yaw : null;
    if (this.hGrounded) this.hoofbeats(dt, this.hSpeed, p.pos, 1);
    // pose
    const hp = this.hPose;
    hp.time += dt; hp.speed = this.hSpeed; hp.vy = this.hVy; hp.grounded = this.hGrounded && this.hGather <= 0;
    hp.turn = clamp(-this.hYawRate / 1.5, -1, 1) * clamp01(this.hSpeed / 4);
    hp.rear = damp(hp.rear, 0, 2.6, dt);
    h.update(dt, hp);
    // sense of speed
    const k = clamp01((this.hSpeed - 5.5) / 8.5);
    g.fovExtra = damp(g.fovExtra, k * 13, 4, dt);
    g.camDist = damp(g.camDist, 1.2 + k * 0.28, 3, dt);
    g.speedFx = k > 0.55 ? (k - 0.55) * 1.5 : 0;
    // a hit throws the rider
    if (g.combat.sinceHurt < 0.06 && this.hRideT > 0.4) { this.hPose.rear = 1; g.sfx('horse_whinny'); this.dismount(); return; }
    if (g.interior) this.dismount();
  }

  // ================================================================ hoverboard
  rideBoard(): boolean {
    const g = this.game, p = g.player;
    if (!this.board || p.dead || g.interior) return false;
    if (p.mode === this.boardMode) return true;
    if (p.mode) { if (p.mode === this.rideMode) this.dismount(); else return false; }
    p.setMode(this.boardMode);
    return true;
  }
  stowBoard(silent = false) {
    const g = this.game, p = g.player;
    if (p.mode !== this.boardMode) return;
    p.setMode(null);
    if (!silent) g.hud.toast('Board returned to the rack', 'info');
    B.onBoardStow?.();
  }
  private boardEnter(p: Player) {
    const g = this.game, b = this.board!;
    this.c.set(p.pos.x, parkH(p.pos.x, p.pos.z), p.pos.z);
    this.bn.set(0, 1, 0); this.bGround = true; this.bAir = 0; this.bJumpBuf = 0; this.assistOn = false;
    this.airSpin = 0; this.trick = null; this.flipA = 0; this.kickA = 0; this.rail = null; this.railCd = 0; this.bailT = 0; this.pitch = 0; this.roll = 0;
    this.combo.names.length = 0; this.combo.pts = 0; this.combo.t = 0;
    p.vel.y = 0; p.vel.multiplyScalar(0.6);
    p.root.rotation.order = 'YXZ';
    p.root.add(b.root); b.root.position.set(0, 0, 0); b.root.rotation.set(0, 0, 0);
    p.action = null; this.lastYaw = p.yaw;
    g.combat.cancel();
    g.interact.blocked = true;
    g.sfx('hover_on'); g.fx.ring(this.c, 1.8, PAL.cyan, 0.3, 2); g.haptic(12);
  }
  private boardExit(p: Player) {
    const g = this.game, b = this.board!;
    this.bankCombo(true);
    p.root.remove(b.root);
    p.root.rotation.set(0, p.yaw, 0); p.root.rotation.order = 'XYZ';
    const y = Math.max(parkH(this.c.x, this.c.z), g.groundY(this.c.x, this.c.z, this.c.y + 1));
    const yaw = p.yaw;
    p.teleport(this.c.x, Math.max(y, Math.min(this.c.y, y + 6)) + 0.05, this.c.z, yaw);
    p.action = null; p.moveHeading = null;
    g.interact.blocked = false;
    g.fovExtra = 0; g.camDist = 1; g.speedFx = 0;
    g.sfx('hover_off');
  }
  private addTrick(name: string, pts: number) {
    const g = this.game;
    this.combo.names.push(name); this.combo.pts += pts; this.combo.t = 1.5;
    _v.copy(g.player.pos); _v.y += 1.9;
    g.hud.damage(_v, `${name} +${pts}`, this.combo.names.length > 2 ? 'crit' : 'scrip');
    B.onTrick?.(name, pts);
  }
  private bankCombo(silent = false) {
    const c = this.combo;
    if (!c.names.length) return;
    const mult = Math.min(8, c.names.length), total = Math.round(c.pts * mult / 10) * 10;
    const label = c.names.length > 3 ? `${c.names.slice(0, 3).join(' + ')} +${c.names.length - 3}` : c.names.join(' + ');
    c.names.length = 0; c.pts = 0; c.t = 0;
    if (!silent) {
      const g = this.game;
      g.hud.toast(`${total.toLocaleString()} pts${mult > 1 ? ` · x${mult}` : ''}`, mult >= 3 ? 'pb' : 'good', label, 'board');
      g.sfx(mult >= 3 ? 'pb' : 'ring_pass', { vol: 0.8 });
    }
    B.onBank?.(total, label);
  }
  private bail(p: Player) {
    const g = this.game;
    if (this.bailT > 0) return;
    this.bailT = 0.9; this.trick = null; this.flipA = 0; this.kickA = 0; this.rail = null; this.railCd = 0.5;
    const lost = this.combo.names.length > 0;
    this.combo.names.length = 0; this.combo.pts = 0; this.combo.t = 0;
    p.vel.multiplyScalar(0.3);
    p.action = 'hit'; p.actionT = 0;
    _v.copy(p.pos); _v.y += 1.8;
    g.hud.damage(_v, lost ? 'BAIL! combo lost' : 'BAIL!', 'hurt');
    g.sfx('crate_bump', { vol: 1 }); g.sfx('hurt', { vol: 0.5 });
    g.cameraRig.shake(0.45); g.haptic(70); g.fx.dust(this.c, 10, 1.2);
    g.renderer.post.hurt = Math.max(g.renderer.post.hurt, 0.25);
    B.onBail?.();
  }
  private leave(n: THREE.Vector3, v: THREE.Vector3) {
    this.bGround = false; this.bAir = 0; this.airSpin = 0; this.launchY = this.c.y; this.maxAirY = this.c.y;
    this.assistOn = false;
    // off a vert lip: steer the arc back into the transition instead of out onto the deck
    if (n.y < 0.6 && v.y > 2.5) {
      const hl = Math.hypot(n.x, n.z);
      if (hl > 1e-3) {
        const ix = n.x / hl, iz = n.z / hl, out = -(v.x * ix + v.z * iz);
        if (out > 0) { const a = (out * AG / v.y) * 1.12; this.assist.set(ix * a, 0, iz * a); this.assistOn = true; }
      }
    }
  }
  private land(p: Player, n: THREE.Vector3) {
    const g = this.game, v = p.vel;
    const vn = v.dot(n), impact = -vn;
    v.addScaledVector(n, -vn);
    this.bGround = true; this.assistOn = false;
    const air = this.bAir, height = this.maxAirY - Math.min(this.launchY, this.c.y);
    if (this.trick && this.trick.t < this.trick.dur * 0.78) { this.bail(p); return; }
    // close enough to round: the last fraction of a trick is stomped out on landing
    if (this.trick) this.addTrick(this.trick.name, this.trick.pts);
    this.trick = null; this.flipA = 0; this.kickA = 0; if (p.action && p.action.startsWith('boardTrick')) p.action = null;
    if (air > 0.25) {
      const hard = clamp01(impact / 14);
      g.sfx('hover_land', { vol: 0.5 + hard * 0.5 }); g.cameraRig.shake(0.08 + hard * 0.28); g.haptic(14 + hard * 30);
      g.fx.dust(this.c, 4 + hard * 8, 0.9 + hard * 0.5); g.fx.ring(this.c, 1.4 + hard * 1.6, PAL.cyan, 0.25, 1.6);
      p.landT = 0;
      const spins = Math.round(Math.abs(this.airSpin) / Math.PI);
      if (spins >= 1) this.addTrick(`${spins * 180}`, [0, 200, 500, 900, 1400, 2000][Math.min(5, spins)]);
      if (height > 2.2 && air > 0.7) this.addTrick('Big Air', Math.round(height * 60 / 10) * 10);
      if (this.combo.names.length) { this.combo.t = 1.5; g.sfx('ring_pass', { vol: 0.5, pitch: 1.2 }); }
    }
    this.airSpin = 0;
  }
  private bonk(p: Player, dx: number, dz: number) {
    const g = this.game, v = p.vel, sp = Math.hypot(v.x, v.z);
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dx / l, nz = -dz / l, d = v.x * nx + v.z * nz;
    if (d < 0) { v.x -= 1.5 * d * nx; v.z -= 1.5 * d * nz; }
    v.x *= 0.5; v.z *= 0.5; v.y = Math.min(v.y, 0);
    if (sp > 3) { g.sfx('crate_bump', { vol: clamp(sp / 12, 0.3, 1) }); g.cameraRig.shake(clamp(sp * 0.025, 0.05, 0.35)); g.haptic(25); }
    if (sp > 9.5) this.bail(p);
  }

  private boardStep(p: Player, h: number, wx: number, wz: number, mag: number) {
    const v = p.vel, c = this.c, P = PARK;
    let back = 0, wallY = 1;
    if (this.bGround) {
      // sample a touch behind the board so a lip or a ramp's end reads as the surface we came up
      const hv = Math.hypot(v.x, v.z);
      back = hv > 0.5 ? 0.12 / hv : 0;
      const n = parkN(c.x - v.x * back, c.z - v.z * back, _n);
      wallY = n.y;
      v.addScaledVector(n, -v.dot(n));
      let speed = v.length();
      const steep = n.y < 0.93;
      if (mag > 0.05) {
        _d.set(wx, 0, wz); _d.addScaledVector(n, -_d.dot(n));
        if (_d.lengthSq() > 1e-4) {
          _d.normalize();
          if (speed < 0.6 && !steep) _t.copy(_d); else if (speed > 1e-3) _t.copy(v).divideScalar(speed); else _t.set(n.x, 0, n.z).addScaledVector(n, -(n.x * n.x + n.z * n.z)).normalize();
          const cosA = _t.dot(_d);
          // on a wall the board rides fakie rather than fighting the slope: the stick only pumps and carves
          const fakie = steep && (speed < 2.2 || cosA < -0.1);
          if (cosA < -0.6 && speed > 3 && !steep) speed = Math.max(0, speed - 15 * h);
          else {
            if (cosA < -0.3) { _x.crossVectors(n, _t); if (_x.dot(_d) < 0) _x.negate(); _d.copy(_x); }
            const ang = Math.acos(clamp(_t.dot(_d), -1, 1));
            const rate = lerp(3.8, 2.0, clamp01(speed / 14)) * (0.45 + 0.55 * mag) * (steep ? 0.55 : 1);
            if (ang > 1e-4 && !fakie) { _t.lerp(_d, Math.min(1, (rate * h) / ang)); _t.addScaledVector(n, -_t.dot(n)).normalize(); }
            // thrust on the flat, pump on the way down a transition
            const pumping = steep && v.y < -0.8;
            const vmax = pumping ? 17.5 : 12.5;
            if (speed < vmax && (!steep || pumping)) speed = Math.min(vmax, speed + (pumping ? 15 : 8.5 * (1 - 0.45 * speed / vmax)) * mag * h);
          }
          v.copy(_t).multiplyScalar(speed);
        }
      } else if (!steep) { speed = Math.max(0, speed - 1.6 * h); if (v.lengthSq() > 1e-6) v.setLength(speed); }
      v.multiplyScalar(1 - 0.07 * h);
      // gravity along the slope
      v.x += BG * n.y * n.x * h; v.y += (-BG + BG * n.y * n.y) * h; v.z += BG * n.y * n.z * h;
      // ollie
      if (this.bJumpBuf > 0) {
        this.bJumpBuf = 0;
        v.addScaledVector(n, 2.2); v.y += 4.2;
        this.leave(n, v);
        const g = this.game;
        g.sfx('jump', { pitch: 1.25 }); g.fx.ring(c, 1.2, PAL.cyan, 0.22, 2); g.haptic(10);
      }
    } else {
      v.y = Math.max(-40, v.y - AG * h);
      if (this.assistOn) { v.x += this.assist.x * h; v.z += this.assist.z * h; }
      else if (mag > 0.05) { v.x += wx * 3 * h; v.z += wz * 3 * h; }
    }
    let nx = c.x + v.x * h, nz = c.z + v.z * h;
    const ny = c.y + v.y * h;
    // park fence
    if (nx < P.x0) { nx = P.x0; if (v.x < 0) v.x *= -0.4; } else if (nx > P.x1) { nx = P.x1; if (v.x > 0) v.x *= -0.4; }
    if (nz > P.z1) { nz = P.z1; if (v.z > 0) v.z *= -0.4; }
    else if (nz < P.z0) {
      if (nx > P.gate.x0 && nx < P.gate.x1 && v.z < 0) { c.set(nx, c.y, nz); this.stowBoard(); return; }
      nz = P.z0; if (v.z < 0) v.z *= -0.4;
    }
    for (const o of P.obst) {
      const dx = nx - o[0], dz = nz - o[1], d = Math.hypot(dx, dz);
      if (d < o[2] && d > 1e-4 && c.y < P.base + 2.2) { nx = o[0] + (dx / d) * o[2]; nz = o[1] + (dz / d) * o[2]; this.bonk(p, -dx, -dz); }
    }
    const g2 = parkH(nx, nz);
    if (this.bGround) {
      const rise = g2 - c.y, run = Math.hypot(nx - c.x, nz - c.z);
      if (rise > 0.5 && rise > run * 5) { this.bonk(p, nx - c.x, nz - c.z); return; }
      const n2 = parkN(nx - v.x * back, nz - v.z * back, _n2), vn2 = v.dot(n2), s2 = v.length(), gap = ny - g2;
      // a wall only ever curves up under the board, so any daylight while climbing one is the lip
      if (gap > 0.02 && (vn2 > 0.14 * s2 + 0.9 || gap > 0.12 + s2 * h * 0.6 || (wallY < 0.8 && v.y > 1.5))) {
        // the surface fell away, or we shot off a lip
        _a.copy(_n);
        c.set(nx, ny, nz);
        this.leave(_a, v);
      } else {
        c.set(nx, g2, nz);
        if (s2 > 1e-3) {
          v.addScaledVector(n2, -vn2);
          // riding through a transition keeps its speed; slamming into one does not
          if (vn2 > -0.5 * s2) { const t = v.length(); if (t > 1e-3) v.multiplyScalar(s2 / t); }
        }
      }
    } else {
      if (ny > this.maxAirY) this.maxAirY = ny;
      if (ny <= g2) {
        if (g2 - c.y > 0.7 && g2 - ny > 0.5) { this.bonk(p, nx - c.x, nz - c.z); return; }
        c.set(nx, g2, nz);
        this.land(p, parkN(nx, nz, _n2));
      } else c.set(nx, ny, nz);
    }
  }

  private startGrind(p: Player, rail: Rail, u: number) {
    const g = this.game, v = p.vel;
    rail.at(u, _a, _dir);
    let s = v.x * _dir.x + v.y * _dir.y + v.z * _dir.z;
    const sg = s < 0 ? -1 : 1;
    s = sg * Math.max(5.5, Math.abs(s));
    if (this.trick && this.trick.t < this.trick.dur * 0.7) { this.bail(p); return; }
    this.trick = null; this.flipA = 0; this.kickA = 0;
    const spins = Math.round(Math.abs(this.airSpin) / Math.PI);
    if (spins >= 1) this.addTrick(`${spins * 180} In`, 150 * spins);
    this.airSpin = 0;
    this.rail = rail; this.ru = u; this.rs = s; this.bal = 0; this.balBias = rand(-0.3, 0.3); this.grindT = 0; this.sparkT = 0;
    this.bGround = false; this.assistOn = false;
    this.c.copy(_a);
    this.addTrick(`${rail.name} Grind`, 150);
    g.sfx('rail_on'); g.cameraRig.shake(0.1); g.haptic(16);
    g.fx.hitSparks(_a, UP, 0xffc46a, 1);
  }
  private grindUpdate(p: Player, dt: number, wx: number, wz: number, mag: number, jump: boolean) {
    const g = this.game, rail = this.rail!, v = p.vel;
    rail.at(this.ru, _a, _dir);
    this.rs += -BG * _dir.y * dt;
    this.rs -= Math.sign(this.rs) * 0.4 * dt;
    if (Math.abs(this.rs) < 3) this.rs = Math.sign(this.rs || 1) * 3;
    this.ru += this.rs * dt;
    this.grindT += dt;
    const sg = this.rs < 0 ? -1 : 1;
    // balance: the stick across the rail holds you on
    const lx = _dir.z * sg, lz = -_dir.x * sg; // rider's side axis
    const lean = mag > 0.05 ? wx * lx + wz * lz : 0;
    this.balBias = clamp(this.balBias + rand(-1, 1) * 2.4 * dt, -0.8, 0.8);
    this.bal += (this.balBias * (0.45 + this.grindT * 0.22) + lean * 1.7 - this.bal * 0.35) * dt;
    // points tick up for as long as you hold it
    this.combo.pts += 220 * dt; this.combo.t = 1.5;
    const ended = this.ru <= 0 || this.ru >= rail.len;
    if (ended || jump || Math.abs(this.bal) > 1) {
      rail.at(clamp(this.ru, 0, rail.len), _a, _dir);
      v.copy(_dir).multiplyScalar(this.rs);
      this.c.copy(_a);
      if (jump) { v.y += 6.4; v.x += wx * 1.5; v.z += wz * 1.5; g.sfx('jump', { pitch: 1.3 }); g.haptic(10); }
      else if (!ended) { v.x += lx * Math.sign(this.bal) * 2.2; v.z += lz * Math.sign(this.bal) * 2.2; v.y += 1.5; _x.copy(p.pos); _x.y += 1.8; g.hud.damage(_x, 'Slipped', 'miss'); }
      else v.y += 1.2;
      const secs = this.grindT;
      if (secs > 1.2) this.addTrick(`${secs.toFixed(1)}s hold`, Math.round(secs * 100 / 10) * 10);
      this.rail = null; this.railCd = jump ? 0.35 : 0.5;
      this.bGround = false; this.bAir = 0; this.airSpin = 0; this.launchY = this.c.y; this.maxAirY = this.c.y; this.assistOn = false;
      return;
    }
    this.c.copy(_a);
    v.copy(_dir).multiplyScalar(this.rs);
    // sparks off the trucks
    this.sparkT -= dt;
    if (this.sparkT <= 0) {
      this.sparkT = 0.03;
      _d.copy(_dir).multiplyScalar(-sg); _d.y += 0.5;
      g.fx.emit(_a, { count: 2, dir: _d.normalize(), speed: [2.5, 7], spread: 0.5, life: [0.15, 0.4], size: [0.05, 0.12], color: 0xffd27a, color2: PAL.cyan, glow: 4, gravity: 9, sprite: SP.STREAK, stretch: 3 });
      if (Math.random() < 0.25) g.haptic(5);
    }
    if (Math.abs(this.bal) > 0.72 && Math.random() < dt * 6) { _x.copy(p.pos); _x.y += 1.8; g.hud.damage(_x, '!', 'hurt'); }
  }

  private boardUpdate(p: Player, dt: number) {
    const g = this.game, inp = g.input, cam = g.cameraRig, b = this.board!, v = p.vel;
    const can = p.controllable && !p.dead && this.bailT <= 0;
    this.bailT = Math.max(0, this.bailT - dt); this.railCd = Math.max(0, this.railCd - dt);
    if (this.bailT <= 0 && p.action === 'hit') p.action = null;
    else if (this.bailT > 0) p.actionT = clamp01(1 - this.bailT / 0.9);
    cam.forward(_f); _r.set(-_f.z, 0, _f.x);
    let wx = 0, wz = 0, mag = 0;
    if (can) { wx = _r.x * inp.moveX + _f.x * inp.moveY; wz = _r.z * inp.moveX + _f.z * inp.moveY; mag = Math.min(1, Math.hypot(inp.moveX, inp.moveY)); if (mag > 0.01) { const l = Math.hypot(wx, wz); wx /= l; wz /= l; } }
    // buttons: read here so combat never sees them
    const jump = inp.consume('jump') && can, flip = inp.consume('dodge') && can, t1 = inp.consume('skill1') && can, t2 = inp.consume('skill2') && can;
    inp.consume('attack');
    this.bJumpBuf = Math.max(0, this.bJumpBuf - dt);

    if (this.rail) this.grindUpdate(p, dt, wx, wz, mag, jump);
    else {
      if (jump) this.bJumpBuf = 0.14;
      const n = Math.max(1, Math.min(5, Math.ceil((v.length() * dt) / 0.16)));
      for (let i = 0; i < n && p.mode === this.boardMode && !this.rail; i++) {
        const py = this.c.y;
        this.boardStep(p, dt / n, wx, wz, mag);
        // catch a rail on the way down
        if (!this.bGround && this.railCd <= 0 && v.y < 3 && this.bailT <= 0) {
          for (const rail of PARK.rails) {
            rail.nearest(this.c.x, this.c.z, _o);
            if (_o[1] < 0.85 && this.c.y <= _o[2] + 0.4 && this.c.y >= _o[2] - 0.55 && py >= _o[2] - 0.25) { this.startGrind(p, rail, _o[0]); break; }
          }
        }
      }
      if (p.mode !== this.boardMode) return;
    }
    // ---- air tricks ----
    if (!this.bGround && !this.rail) {
      this.bAir += dt;
      if (can && !this.trick && this.bAir > 0.06) {
        const def = flip ? TRICKS.flip : t1 ? TRICKS.kick : t2 ? TRICKS.grab : null;
        if (def) { this.trick = { ...def, t: 0 }; g.sfx('hover_trick', { pitch: flip ? 0.9 : t1 ? 1.2 : 1.05 }); g.haptic(8); }
      }
      if (can && Math.abs(inp.moveX) > 0.3 && this.bAir > 0.1) { const s = -inp.moveX * 7.5 * dt; p.yaw += s; this.airSpin += s; }
    }
    if (this.trick) {
      const tr = this.trick;
      tr.t += dt;
      const k = clamp01(tr.t / tr.dur), e = k * k * (3 - 2 * k);
      if (tr.act === 'boardTrick3') this.flipA = e * Math.PI * 2;
      else if (tr.act === 'boardTrick1') this.kickA = e * Math.PI * 2;
      p.action = tr.act; p.actionT = k;
      if (k >= 1) { this.addTrick(tr.name, tr.pts); this.trick = null; this.flipA = 0; this.kickA = 0; p.action = null; }
    }
    // ---- combo banks a moment after a clean landing ----
    if (this.bGround && !this.rail && this.combo.names.length) { this.combo.t -= dt; if (this.combo.t <= 0) this.bankCombo(); }

    // ---- orientation ----
    const hs = Math.hypot(v.x, v.z);
    if (this.rail) p.yaw = dampAngle(p.yaw, Math.atan2(v.x, v.z), 14, dt);
    else if (this.bGround && hs > 1.3) p.yaw = dampAngle(p.yaw, Math.atan2(v.x, v.z), 11, dt);
    if (this.bGround) parkN(this.c.x, this.c.z, _n); else if (this.rail) _n.set(0, 1, 0).addScaledVector(_dir, -_dir.y).normalize(); else _n.set(0, 1, 0);
    this.bn.lerp(_n, 1 - Math.exp(-(this.bGround ? 16 : 5) * dt)).normalize();
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const yr = angleDiff(this.lastYaw, p.yaw) / Math.max(dt, 1e-4); this.lastYaw = p.yaw;
    const carve = this.bGround ? clamp(-yr * 0.11 * clamp01(hs / 6), -0.5, 0.5) : this.rail ? this.bal * 0.45 : 0;
    this.pitch = Math.asin(clamp(this.bn.x * fx + this.bn.z * fz, -1, 1));
    this.roll = damp(this.roll, -Math.asin(clamp(this.bn.x * rx + this.bn.z * rz, -1, 1)) + carve, 10, dt);
    p.root.rotation.x = this.pitch - this.flipA;
    p.root.rotation.z = this.roll;
    b.root.rotation.z = this.kickA;
    // deck floats a hand above the surface, along its normal
    const bob = this.bGround ? Math.sin(p.pose.time * 2.6) * 0.02 : 0;
    p.pos.copy(this.c).addScaledVector(this.bn, HOV + bob);
    p.body.setNextKinematicTranslation({ x: p.pos.x, y: p.pos.y + CENTER_Y, z: p.pos.z });
    p.grounded = this.bGround || !!this.rail; p.airTime = this.bAir;
    // follow camera: behind the board on the flat; in the pipe and bowl it holds its heading (so the
    // stick keeps meaning the same thing wall to wall) and rises to look down into the transition
    const vf = this.onVert();
    p.moveHeading = !vf && hs > 2 ? Math.atan2(v.x, v.z) : null;
    if (vf && !cam.steering) cam.pitch = damp(cam.pitch, 0.6, 1.4, dt);
    const sp = v.length();
    b.update(dt, clamp01(0.25 + sp / 14));
    // underglow wash + speed feel
    this.glowT -= dt;
    if (this.bGround && sp > 3 && this.glowT <= 0) {
      this.glowT = 0.05;
      g.fx.emit(this.c, { count: 1, speed: [0.2, 0.8], life: [0.25, 0.5], size: [0.18, 0.34], grow: 0.3, color: PAL.cyan, glow: 2.2, alpha: 0.5, gravity: -0.5, sprite: SP.DOT, radius: 0.25 });
      if (sp > 9 && Math.random() < 0.4) g.fx.dust(this.c, 1, 0.7);
    }
    const k = clamp01((sp - 6) / 9);
    g.fovExtra = damp(g.fovExtra, k * 12, 4, dt);
    g.camDist = damp(g.camDist, vf ? 1.5 : 1.08 + k * 0.2, 3, dt);
    g.speedFx = k > 0.5 ? (k - 0.5) * 1.4 : 0;
    if (g.interior || p.dead) this.stowBoard(true);
  }
  /** true while riding the pipe or bowl walls: the follow camera should hold still there */
  private onVert(): Feat | null {
    const c = this.c;
    for (const f of PARK.feats) {
      if (f.kind !== 'pipe' && f.kind !== 'bowl') continue;
      const dx = c.x - f.cx, dz = c.z - f.cz;
      if (f.kind === 'bowl') { if (Math.hypot(dx, dz) < f.hx - f.p.out + 0.5) return f; continue; }
      // inside the pipe footprint (local test)
      const lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c;
      if (Math.abs(lx) < f.hx - f.p.back && Math.abs(lz) < f.hz + 1) return f;
    }
    return null;
  }
}

export function start(game: Game) {
  PARK.ground = (x, z) => game.terrain.h(x, z);
  const m = new Mounts(game);
  B.mounts = m;
  game.addSystem(m);
}
