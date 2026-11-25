import * as THREE from 'three';
import type { RobotLook, RobotRig } from './types';
import { Rig, easeOutBack, recoil, ss } from './common';

const HIP = 6.3, LT = 2.7, LS = 3.6;

interface Link { m: THREE.Object3D; b: THREE.Object3D; o: number; pp: THREE.Vector3; pq: THREE.Quaternion; kind: 0 | 1 | 2 | 3 | 4 }

/**
 * Crate Titan: fifteen metres of freight that learned to stand up. A detached skeleton drives
 * sixteen rigid pieces of one skinned model (art/robots/titan.py); because the model's bones
 * are flat, each written in rig space, the pieces can also fly apart into (and assemble from)
 * a heap for spawn and death.
 */
export function makeTitan(look: RobotLook): RobotRig {
  const rig = new Rig('titan', look, 15, 4.2);
  // ---- skeleton (detached; matrices are in rig-inner space) ---------------------------------
  const skel = new THREE.Group();
  const B = (parent: THREE.Object3D, x: number, y: number, z: number) => { const o = new THREE.Group(); o.position.set(x, y, z); parent.add(o); return o; };
  const hipsB = B(skel, 0, HIP, 0);
  const chestB = B(hipsB, 0, 1.3, 0);
  const headB = B(chestB, 0, 4.25, 0.3), jawB = B(headB, 0, 0.25, -0.9);
  const armLB = B(chestB, 4.15, 3.3, 0), foreLB = B(armLB, 0, -3.0, 0);
  const armRB = B(chestB, -4.15, 3.3, 0), foreRB = B(armRB, 0, -3.0, 0);
  const thighLB = B(hipsB, 1.6, 0, 0), shinLB = B(thighLB, 0, -LT, 0);
  const thighRB = B(hipsB, -1.6, 0, 0), shinRB = B(thighRB, 0, -LT, 0);

  // ---- the model: one skinned mesh, a flat bone per rigid piece ---------------------------------
  const b = rig.useModel('titan');
  // pieces are thrown well clear of the rest pose (assembly, shed armour, the death heap)
  rig.inner.traverse((o) => { const sm = o as THREE.SkinnedMesh; if (sm.isSkinnedMesh) sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 7, 0), 26); });
  const links: Link[] = [];
  const pH = Math.PI / 2;
  /** bind a model bone to a skeleton joint. `pile`/`prot` are where it lies in the heap; kind 1, 2 = shed armour, 3 = seams, 4 = furnace */
  const P = (name: string, bone: THREE.Object3D, order: number, pile: [number, number, number], prot: [number, number, number], kind: Link['kind']) => {
    const m = b[name];
    links.push({ m, b: bone, o: order, pp: new THREE.Vector3(...pile), pq: new THREE.Quaternion().setFromEuler(new THREE.Euler(...prot)), kind });
    return m;
  };
  const footL = P('shinL', shinLB, 0, [2.4, 1.05, 3.0], [pH, 0.3, 0], 0);
  const footR = P('shinR', shinRB, 0.05, [-2.6, 1.05, 2.6], [pH, -0.5, 0], 0);
  P('thighL', thighLB, 0.16, [3.8, 1.0, -0.6], [pH, 1.3, 0.2], 0);
  P('thighR', thighRB, 0.2, [-3.6, 1.0, -1.4], [pH, -1.1, 0], 0);
  P('pelvis', hipsB, 0.32, [0, 0.9, -0.8], [0.08, 0.4, -0.06], 0);
  // permanent frame and core
  const chestM = P('chest', chestB, 0.46, [0.3, 2.7, 2.4], [-pH + 0.14, 0.2, 0], 0);
  // front armour: crates around a barred window onto the core. Shed in phase 2.
  P('shellA', chestB, 0.5, [0.6, 1.9, 3.2], [pH, 0.3, 0], 1);
  // pauldrons, back hump and skirt. Shed in phase 3.
  P('shellB', chestB, 0.54, [0, 1.7, -2.6], [-pH + 0.1, 0.5, 0], 2);
  // orange seams that open up once the armour is gone
  P('seams', chestB, 0.5, [0, 0, 0], [0, 0, 0], 3);
  // phase 3: the core runs away into a furnace
  P('furnace', chestB, 0.5, [0, 0, 0], [0, 0, 0], 4);
  const head = P('head', headB, 0.86, [3.9, 1.25, 4.8], [0.3, 0.7, 1.5], 0);
  P('jaw', jawB, 0.88, [-3.4, 0.5, 5.4], [0, -0.5, 0.15], 0);
  P('upperL', armLB, 0.6, [5.2, 0.9, 2.2], [pH, 0.9, 0], 0);
  P('upperR', armRB, 0.64, [-5.4, 0.9, 1.2], [pH, -0.6, 0], 0);
  const handL = P('foreL', foreLB, 0.72, [5.8, 1.3, -3.4], [pH + 0.2, 2.2, 0.3], 0);
  const handR = P('foreR', foreRB, 0.76, [-5.6, 1.3, -4.2], [1.2, -2.0, 0], 0);

  rig.socket('core', chestM, 0, 2.25, 0.3);
  rig.socket('muzzle', chestM, 0, 2.25, 1.6);
  rig.socket('head', head, 0, 3.6, 0);
  rig.socket('mouth', head, 0, 0.3, 1.4);
  rig.socket('handL', handL, 0, -3.2, 0); rig.socket('handR', handR, 0, -3.2, 0);
  rig.socket('footL', footL, 0, -3.6, 0.4); rig.socket('footR', footR, 0, -3.6, 0.4);

  // ---- animation -----------------------------------------------------------------------------
  /** wind-up -> accelerating hit -> hold on target -> release */
  const slam = (t: number, wind: number, hit: number, hold: number) => {
    if (t < wind) return { w: Math.sin((t / wind) * pH), h: 0 };
    if (t < hit) { const x = (t - wind) / (hit - wind); return { w: 1 - x, h: x * x * x }; }
    if (t < hold) return { w: 0, h: 1 };
    return { w: 0, h: 1 - ss(hold, 1, t) };
  };
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _q2 = new THREE.Quaternion(), _f = new THREE.Vector3();
  let shedA = -1, shedB = -1, furn = 0, rimK = 0;

  rig.animate = (dt, pose) => {
    const t = pose.t, tm = pose.time, a = pose.action, ph = pose.phase ?? 1;
    if (a === 'move') rig.gait += Math.min(3.2, 0.9 + pose.speed * 0.45) * dt;
    const g = rig.gait;
    const rag = ph >= 3 ? 1 : 0;
    const br = Math.sin(tm * (0.8 + rag * 0.9));
    const tg = {
      hy: 0, hz: 0, roll: 0, cr: 0.06 + br * 0.012 + rag * 0.1, lean: 0.04 + br * 0.014 + rag * 0.12, twist: pose.aimYaw * 0.3,
      hp: -pose.aimPitch * 0.4 + 0.08, hyw: pose.aimYaw * 0.5 + Math.sin(tm * 0.31) * 0.28, jaw: 0.02 + rag * 0.12,
      thL: 0, knL: 0, thR: 0, knR: 0, aL: 0.04 + br * 0.02, sL: 0.14 + rag * 0.1, eL: -0.28 - br * 0.03, aR: 0.04 - br * 0.02, sR: 0.14 + rag * 0.1, eR: -0.28 + br * 0.03, shake: rag * 0.004,
    };
    let col = 0, colUp = false;
    if (a === 'move') {
      const s = Math.sin(g), c = Math.cos(g);
      tg.thL = s * 0.34 - Math.max(0, c) * 0.3; tg.knL = Math.max(0, c) * 0.8; tg.thR = -s * 0.34 - Math.max(0, -c) * 0.3; tg.knR = Math.max(0, -c) * 0.8;
      tg.roll = -c * 0.035; tg.twist = s * 0.1; tg.lean = 0.1 + Math.abs(s) * 0.02; tg.aL = s * 0.3; tg.aR = -s * 0.3; tg.eL = -0.35; tg.eR = -0.35; tg.hyw = pose.aimYaw * 0.5; tg.cr = 0.08;
    } else if (a === 'windup') {
      tg.lean = -0.14 - t * 0.05; tg.cr = 0.28; tg.aL = 0.55; tg.aR = 0.55; tg.sL = 0.4; tg.sR = 0.4; tg.eL = -0.8; tg.eR = -0.8; tg.hp = 0.2; tg.hyw = 0; tg.jaw = 0.15 + t * 0.15; tg.shake = 0.006 + t * 0.008;
    } else if (a === 'attack') {
      const { w, h } = slam(t, 0.4, 0.52, 0.74);
      tg.aL = tg.aR = -2.95 * w - 1.2 * h; tg.sL = tg.sR = 0.3 * w + 0.1; tg.eL = tg.eR = -0.4 * w - 0.05; tg.lean = -0.22 * w + 0.95 * h; tg.cr = 0.15 * w + 1.12 * h; tg.hp = -0.3 * w + 0.2 * h; tg.hyw = 0; tg.jaw = 0.4 * w + 0.2 * h; tg.hz = 0.6 * h;
    } else if (a === 'attack2') {
      const { w, h } = slam(t, 0.38, 0.62, 0.7), on = Math.max(w, h);
      tg.twist = -0.95 * w + 0.95 * h; tg.lean = 0.62 * on; tg.cr = 0.95 * on; tg.aR = -1.3 * on; tg.sR = 0.55 * w + 0.15 * h; tg.eR = -0.1; tg.aL = 0.5 * on; tg.sL = 0.5 * on; tg.eL = -0.7; tg.hp = 0.15 * on; tg.hyw = -0.4 * w + 0.4 * h; tg.jaw = 0.25 * on;
    } else if (a === 'attack3') {
      const { w, h } = slam(t, 0.4, 0.5, 0.64);
      tg.thR = -1.05 * w - 0.1 * h; tg.knR = 1.35 * w; tg.roll = 0.05 * w; tg.lean = -0.1 * w + 0.2 * h; tg.cr = 0.05 + 0.42 * h; tg.aL = tg.aR = -0.45 * w + 0.25 * h; tg.sL = tg.sR = 0.6 * w + 0.4 * h; tg.eL = tg.eR = -0.6; tg.hp = 0.25 * h; tg.hyw = 0; tg.jaw = 0.3 * w;
    } else if (a === 'recover') {
      tg.lean = 0.56 + Math.sin(tm * 3) * 0.02; tg.cr = 0.62; tg.aL = tg.aR = -0.56; tg.eL = tg.eR = -0.05; tg.sL = tg.sR = 0.1; tg.hp = 0.42; tg.hyw = 0; tg.jaw = 0.3 + Math.sin(tm * 3) * 0.08;
    } else if (a === 'stagger') {
      const rc = recoil(t, 3), ab = Math.abs(rc);
      tg.lean = -0.3 * rc; tg.hz = -1.2 * (1 - t) * (1 - t); tg.thL = 0.3 * rc; tg.knL = 0.3 * ab; tg.aL = tg.aR = -0.7 * ab; tg.sL = tg.sR = 0.7 * ab + 0.1; tg.hp = -0.35 * rc; tg.hyw = 0; tg.jaw = 0.4 * ab; tg.cr = 0.2;
    } else if (a === 'stun') {
      tg.lean = 0.3 + Math.sin(tm * 1.6) * 0.07; tg.roll = Math.cos(tm * 1.6) * 0.045; tg.cr = 0.4; tg.aL = tg.aR = -0.3; tg.eL = tg.eR = -0.05; tg.hp = 0.3 + Math.sin(tm * 2.6) * 0.12; tg.hyw = Math.cos(tm * 2.6) * 0.4; tg.jaw = 0.38;
    } else if (a === 'death') {
      const k = ss(0, 0.2, t);
      tg.lean = -0.22 * k; tg.cr = 0.3 * k; tg.aL = tg.aR = -0.5 * k; tg.sL = tg.sR = 0.6 * k; tg.hp = -0.45 * k; tg.hyw = 0; tg.jaw = 0.7 * k; tg.shake = 0.012 * (1 - t);
      col = Math.max(0, (t - 0.16) / 0.8);
    } else if (a === 'spawn') {
      tg.aL = tg.aR = 0; tg.sL = tg.sR = 0.25; tg.hyw = 0; tg.jaw = 0.5 * ss(0.85, 1, t); tg.lean = 0.04 - 0.1 * ss(0.85, 1, t);
      col = 1 - t; colUp = true;
    } else if (a === 'roar') {
      tg.lean = -0.26; tg.cr = 0.45; tg.aL = tg.aR = 0.3; tg.sL = tg.sR = 0.8; tg.eL = tg.eR = -1.0; tg.hp = -0.5; tg.hyw = 0; tg.jaw = 0.8 + Math.sin(tm * 30) * 0.08; tg.shake = 0.014;
    }
    const c = rig.blend(tg, dt, a === 'attack' || a === 'attack2' || a === 'attack3' ? 16 : 7);
    const sh = c.shake, n1 = Math.sin(tm * 47) * sh, n2 = Math.sin(tm * 61 + 1) * sh;

    // legs: squat keeps the feet flat; the longer (supporting) leg sets hip height
    const tL = c.thL - c.cr, kL = c.knL + c.cr, tR = c.thR - c.cr, kR = c.knR + c.cr;
    // (a tilted sole pivots on its toe or heel, so the tilt adds reach)
    const extL = LT * Math.cos(tL) + LS * Math.cos(tL + kL) + 2.1 * Math.abs(Math.sin(tL + kL)), extR = LT * Math.cos(tR) + LS * Math.cos(tR + kR) + 2.1 * Math.abs(Math.sin(tR + kR));
    hipsB.position.set(0, Math.max(extL, extR) + c.hy, c.hz - LT * Math.sin(c.cr) * 0.75);
    hipsB.rotation.set(0, 0, c.roll + n2);
    thighLB.rotation.set(tL, 0, 0.03 - c.roll); shinLB.rotation.x = kL;
    thighRB.rotation.set(tR, 0, -0.03 - c.roll); shinRB.rotation.x = kR;
    chestB.rotation.set(c.lean + n1, c.twist, -c.roll * 0.6);
    headB.rotation.set(c.hp + n2 * 2, c.hyw, n1 * 2);
    jawB.rotation.x = Math.max(0, c.jaw);
    armLB.rotation.set(c.aL, 0, c.sL); foreLB.rotation.x = c.eL;
    armRB.rotation.set(c.aR, 0, -c.sR); foreRB.rotation.x = c.eR;
    skel.updateMatrixWorld(true);

    // phases: shed armour, light the seams, then the furnace
    const wantA = ph >= 2 ? 1 : 0, wantB = ph >= 3 ? 1 : 0;
    if (shedA < 0) { shedA = wantA; shedB = wantB; furn = wantB; rimK = ph >= 3 ? 1 : ph >= 2 ? 0.45 : 0; }
    shedA = wantA ? Math.min(1, shedA + dt / 1.5) : 0;
    shedB = wantB ? Math.min(1, shedB + dt / 1.5) : 0;
    furn += ((wantB ? 1 : 0) - furn) * Math.min(1, dt * 2.5);
    rimK += ((ph >= 3 ? 1 : ph >= 2 ? 0.45 : 0) - rimK) * Math.min(1, dt * 2);

    for (const L of links) {
      L.b.matrixWorld.decompose(_p, _q, _s);
      let scale = 1;
      if (L.kind === 1 || L.kind === 2) {
        const sd = L.kind === 1 ? shedA : shedB;
        if (sd > 0) {
          // tear free: shoved outward along the chest's facing, then gravity takes it
          const tau = sd * 1.5, dir = L.kind === 1 ? 1 : -1;
          _f.set(0, 0, dir).applyQuaternion(_q);
          _p.addScaledVector(_f, 5.5 * tau); _p.y += 2.2 * tau - 11 * tau * tau;
          _q.multiply(_q2.setFromEuler(_e.set(dir * 1.4 * tau, 0.5 * tau, 0.3 * tau)));
          if (sd >= 1 || _p.y < -9) scale = 0;
        }
      } else if (L.kind === 3) scale = ph >= 2 ? 1 : 0;
      else if (L.kind === 4) scale = furn * (1 + Math.sin(tm * 23) * 0.03);
      if (col > 0) {
        if (L.kind >= 3) scale *= Math.max(0, 1 - col * 5);
        else {
          // spawn builds bottom-up, death crumbles top-down
          const o = colUp ? L.o : 0.88 - L.o;
          let k: number, arc = 0;
          if (colUp) { const u = ss(o * 0.72, o * 0.72 + 0.28, 1 - col); k = 1 - easeOutBack(u) ; arc = Math.sin(Math.min(1, u) * Math.PI) * (2.5 + L.o * 5); }
          else { const u = Math.min(1, Math.max(0, (col - o * 0.5) / 0.5)); k = u * u; if (u >= 1) k = 1; arc = Math.sin(u * Math.PI) * 0.6; }
          const kc = Math.max(0, Math.min(1.08, k));
          _p.lerp(L.pp, Math.min(1, kc)); _p.y += arc; if (_p.y < 0.3 && kc > 0.5) _p.y = Math.max(_p.y, L.pp.y * kc);
          _q.slerp(L.pq, Math.min(1, kc));
        }
      }
      L.m.position.copy(_p); L.m.quaternion.copy(_q);
      L.m.scale.setScalar(Math.max(1e-4, scale));
    }

    // glow + rim
    const ignite = a === 'spawn' ? ss(0.8, 0.95, t) * (1 + (1 - ss(0.95, 1, t)) * 1.5) : 1;
    const dead = a === 'death' ? ss(0.15, 0.85, t) : 0;
    const flick = a === 'death' ? (Math.sin(tm * 37) > 0.2 ? 1 : 0.3) : 1;
    rig.mat.emitMul.value = (1 + br * 0.12 + pose.charge * 2.0 + rag * (0.2 + Math.sin(tm * 13) * 0.14) + (a === 'roar' ? 0.5 : 0) + (a === 'stun' ? Math.sin(tm * 15) * 0.5 - 0.3 : 0)) * ignite * flick * (1 - dead * 0.96);
    rig.mat.rim.value.set(0.55 + 0.45 * rimK, 0.85 - 0.47 * rimK, 1.0 - 0.9 * rimK, 0.3 + 0.16 * rimK);
  };
  return rig;
}
