import * as THREE from 'three';
import type { Game } from '../../game';
import { SP } from '../../gfx/fx';
import { Geo } from '../../gfx/geo';
import { worldMat } from '../../gfx/material';
import { T } from '../../gfx/textures';
import type { Hittable, HitInfo } from '../../systems/combat';
import { BANDS, LAKE, PAL } from '../layout';
import { gear } from '../props';
import { Ctx, chestBody, chestLid, tripod, type DressInfo, type Nook } from './kit';

export interface ChestPlan { id: string; x: number; y: number; z: number; yaw: number; band: number; rare: boolean; secret?: string }
export interface CogPlan { id: string; x: number; y: number; z: number; band: number }
export interface VistaPlan { id: string; name: string; x: number; y: number; z: number; tx: number; ty: number; tz: number; band: number }
export interface FindPlan { chests: ChestPlan[]; cogs: CogPlan[]; vistas: VistaPlan[] }

const VISTAS: Array<[string, string, number, string | null]> = [
  ['vista_stack', 'Stack Overlook', 1, null],
  ['vista_plumb', 'The Great Plumb', 3, 'L3'],
  ['vista_smelter', 'Smelter Gantry', 4, null],
  ['vista_coil', 'The Great Coil', 6, 'L6'],
  ['vista_lake', 'Jetty\'s End', 0, null],
  ['vista_mill', 'Old Mill Rise', 0, null],
];

/** Choose where everything hides (deterministic) and draw the static parts. Called from build(). */
export function planFinds(c: Ctx): FindPlan {
  const info = c.info, A = info.anchors;
  const plan: FindPlan = { chests: [], cogs: [], vistas: [] };
  const used = new Set<Nook>(), taken: Array<[number, number]> = [];
  const far = (band: number, pred?: (n: Nook) => boolean): Nook | null => {
    let best: Nook | null = null, bd = -1;
    for (const n of info.nooks) {
      if (n.band !== band || used.has(n) || (pred && !pred(n))) continue;
      let d = 1e9;
      for (const t of taken) d = Math.min(d, Math.hypot(n.x - t[0], n.z - t[1]));
      if (d > bd) { bd = d; best = n; }
    }
    if (best) { used.add(best); taken.push([best.x, best.z]); }
    return best;
  };
  for (let b = 0; b <= 6; b++) {
    taken.length = 0;
    const L = A['L' + b]; if (L) taken.push([L.x, L.z]);
    if (b === 0) { taken.push([LAKE.x, LAKE.z]); if (info.windmill) taken.push([info.windmill.x, info.windmill.z]); }
    // chests: two per band, the first in a high or awkward place where there is one
    let nChest = 2, nCog = b === 0 ? 5 : 3;
    if (b === 1 && A.chest_stack) { const a = A.chest_stack; plan.chests.push({ id: 'chest_b1_0', x: a.x, y: a.y, z: a.z, yaw: a.yaw, band: 1, rare: true }); taken.push([a.x, a.z]); nChest = 1; }
    for (let i = 0; i < nChest; i++) {
      const hi = i === 0 && b > 0 ? far(b, (n) => !!n.high) : null, n = hi ?? far(b);
      if (n) plan.chests.push({ id: `chest_b${b}_${plan.chests.filter((q) => q.band === b).length}`, x: n.x, y: n.y, z: n.z, yaw: n.yaw, band: b, rare: !!hi });
    }
    if (b === 1 && A.cog_stack) { plan.cogs.push({ id: 'cog_b1_0', x: A.cog_stack.x, y: A.cog_stack.y, z: A.cog_stack.z, band: 1 }); taken.push([A.cog_stack.x, A.cog_stack.z]); nCog = 2; }
    if (b === 0 && A.cog_jetty) plan.cogs.push({ id: 'cog_b0_0', x: A.cog_jetty.x, y: A.cog_jetty.y, z: A.cog_jetty.z, band: 0 });
    for (let i = 0; i < nCog; i++) {
      const n = (i === 0 && b > 1 ? far(b, (q) => !!q.high) : null) ?? far(b);
      if (n) plan.cogs.push({ id: `cog_b${b}_${plan.cogs.filter((q) => q.band === b).length}`, x: n.x, y: n.y + 1.15, z: n.z, band: b });
    }
  }
  // secret caches
  if (A.sluice_cache) plan.chests.push({ id: 'secret_sluice', x: A.sluice_cache.x, y: A.sluice_cache.y, z: A.sluice_cache.z, yaw: A.sluice_cache.yaw, band: 4, rare: true, secret: 'Behind the slag fall' });
  if (A.hollow) plan.chests.push({ id: 'secret_hollow', x: A.hollow.x, y: A.hollow.y, z: A.hollow.z, yaw: A.hollow.yaw, band: 2, rare: true, secret: 'The open container' });
  for (const ch of plan.chests) c.putY(ch.x, ch.y, ch.z, ch.yaw, (g) => { chestBody(g, ch.rare); g.colBox(1.3, 0.9, 0.86, { at: [0, 0.45, 0] }); });
  // vista markers: a brass theodolite on a little dais
  for (const [id, name, band, look] of VISTAS) {
    const a = A[id]; if (!a) continue;
    // the subject of the crane shot: the landmark the vista belongs to
    let tx: number, ty: number, tz: number;
    if (look && A[look]) { tx = A[look].x; ty = A[look].y + 16; tz = A[look].z; }
    else if (id === 'vista_stack' && A.L1) { tx = A.L1.x; ty = A.L1.y + 14; tz = A.L1.z; }
    else if (id === 'vista_smelter' && A.L4) { tx = A.L4.x; ty = A.L4.y + 15; tz = A.L4.z; }
    else if (id === 'vista_mill' && info.windmill) { tx = info.windmill.x; ty = info.windmill.y - 2; tz = info.windmill.z; }
    else { tx = LAKE.x; ty = LAKE.level + 1; tz = LAKE.z; }
    plan.vistas.push({ id, name, x: a.x, y: a.y, z: a.z, tx, ty, tz, band });
    c.putY(a.x, a.y, a.z, Math.atan2(tx - a.x, tz - a.z), (g) => {
      g.cyl(0.9, 1.0, 0.1, 10, { at: [0, 0.05, 0], color: PAL.slateDark, layer: T.PLATE, uvScale: 0.6, col: 'none' });
      g.torus(0.8, 0.04, 4, 14, { at: [0, 0.11, 0], rot: [Math.PI / 2, 0, 0], color: PAL.amber, emit: 1.6, col: 'none' });
      g.push().translate(0, 0.1, 0.1); tripod(g, PAL.amber); g.pop();
    });
  }
  return plan;
}

interface ChestRec { p: ChestPlan; lid: THREE.Mesh; open: number; want: boolean }
const _v = new THREE.Vector3();

export function startFinds(game: Game, info: DressInfo, plan: FindPlan) {
  const st = game.state, A = info.anchors;
  const timers: Array<{ t: number; f: () => void }> = [];
  const after = (t: number, f: () => void) => timers.push({ t, f });
  const lvlOf = (b: number) => (b > 0 ? BANDS[b - 1].lo + 1 : 1);

  // ---------------- chests ----------------
  const lidGeo = [false, true].map((rare) => { const g = new Geo(); chestLid(g, rare); return g.mesh(worldMat(), true); });
  const chests: ChestRec[] = plan.chests.map((p) => {
    const lid = new THREE.Mesh(lidGeo[p.rare ? 1 : 0].geometry, worldMat());
    lid.castShadow = true;
    lid.rotation.order = 'YXZ'; lid.rotation.y = p.yaw;
    lid.position.set(p.x - Math.sin(p.yaw) * 0.43, p.y + 0.68, p.z - Math.cos(p.yaw) * 0.43);
    game.scene.add(lid);
    const rec: ChestRec = { p, lid, open: st.found(p.id) ? 1 : 0, want: st.found(p.id) };
    lid.rotation.x = -rec.open * 1.9;
    game.interact.add({
      id: 'dress#' + p.id, pos: new THREE.Vector3(p.x + Math.sin(p.yaw) * 0.6, p.y + 0.4, p.z + Math.cos(p.yaw) * 0.6), radius: 2.3, icon: 'bag',
      label: p.rare ? 'Open strongbox' : 'Open chest', enabled: () => !st.found(p.id),
      onUse: () => {
        if (!st.markFound(p.id)) return;
        rec.want = true; game.sfx('chest_open', { pos: p }); game.haptic(20);
        after(0.3, () => {
          const at = new THREE.Vector3(p.x, p.y + 0.9, p.z), lv = lvlOf(p.band), b = p.band;
          game.loot.scrip(at, Math.round((16 + lv * 9) * (p.rare ? 2 : 1)), 1.5);
          game.loot.item(at, 'scrap', 2 + Math.floor(b / 2), 1.3);
          game.loot.item(at, b >= 5 ? 'cell' : b >= 3 ? 'lens' : b >= 2 ? 'servo' : 'wire', p.rare ? 2 : 1, 1.3);
          if (b === 0 || p.rare) game.loot.item(at, 'kit', 1, 1.2);
          if (p.rare) { game.loot.item(at, b >= 4 ? 'core' : 'servo', 1, 1.6); game.loot.item(at, b >= 5 ? 'bolt_pierce' : b >= 3 ? 'bolt_blast' : 'bolt_shock', 6, 1.4); }
          game.fx.emit(at, { count: 22, speed: [2, 6], up: 3, life: [0.4, 0.9], size: [0.05, 0.12], color: p.rare ? 0x7ff0ff : 0xffc04a, color2: 0xffffff, glow: 4, drag: 2, gravity: 6, sprite: SP.STAR });
          game.fx.ring(at, 2.4, p.rare ? 0x7ff0ff : 0xffc04a, 0.45, 2);
          st.addXp((p.rare ? 40 : 20) + lv * 8);
          if (p.secret) { game.sfx('secret'); game.hud.toast('Secret found', 'secret', p.secret); }
          else game.hud.toast(p.rare ? 'Strongbox opened' : 'Chest opened', 'good', `${plan.chests.filter((q) => !q.secret && st.found(q.id)).length} / ${plan.chests.filter((q) => !q.secret).length} found`);
          st.save();
        });
      },
    });
    return rec;
  });

  // ---------------- cogs: one instanced mesh ----------------
  const cg = new Geo(); gear(cg, 0.34, 8, 0.12, 0xffc24a, { emit: 1.4 });
  const cogMesh = new THREE.InstancedMesh(cg.mesh(worldMat(), false).geometry, worldMat(), plan.cogs.length);
  cogMesh.frustumCulled = false; cogMesh.castShadow = false;
  game.scene.add(cogMesh);
  const cogTaken = plan.cogs.map((q) => st.found(q.id));
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < plan.cogs.length; i++) cogMesh.setMatrixAt(i, zero);

  // ---------------- vistas ----------------
  let cine: { t: number; v: VistaPlan } | null = null;
  const cpos = new THREE.Vector3(), clook = new THREE.Vector3();
  for (const v of plan.vistas) {
    game.pois.push({ id: v.id, x: v.x, z: v.z, icon: 'star', label: v.name, color: '#ffc24a', show: () => st.found(v.id) });
    game.interact.add({
      id: 'dress#' + v.id, pos: new THREE.Vector3(v.x, v.y + 0.5, v.z), radius: 2.4, icon: 'star', label: 'Take in the view',
      enabled: () => !cine,
      onUse: () => {
        // crane shot: pull back and up from the viewpoint, tilting from the player to the landmark
        const dx = v.x - v.tx, dz = v.z - v.tz, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        cine = { t: 0, v };
        game.player.controllable = false; game.interact.blocked = true;
        const ease = (t: number) => { const k = Math.min(1, t / 6); return k * k * (3 - 2 * k); };
        game.cameraRig.startCine({
          pos: (t) => { const e = ease(t), back = 5 + e * 24, side = (e - 0.35) * 12; cpos.set(v.x + ux * back - uz * side, v.y + 2.4 + e * 11, v.z + uz * back + ux * side); cpos.y = Math.max(cpos.y, game.terrain.h(cpos.x, cpos.z) + 3); return cpos; },
          look: (t) => { const e = ease(t); return clook.set(v.x + (v.tx - v.x) * e, v.y + 1.4 + (v.ty - v.y - 1.4) * e, v.z + (v.tz - v.z) * e); },
          fov: 54,
        });
        game.sfx('vista');
        if (st.markFound(v.id)) {
          const n = plan.vistas.filter((q) => st.found(q.id)).length;
          game.hud.toast(v.name, 'secret', `Vista ${n} / ${plan.vistas.length}`, 'star');
          st.addXp(40 + st.d.level * 10); st.save();
        }
      },
    });
  }

  // ---------------- secrets ----------------
  if (A.xmark && !st.found('secret_x')) {
    const a = A.xmark;
    game.interact.add({
      id: 'dress#secret_x', pos: new THREE.Vector3(a.x, a.y + 0.4, a.z), radius: 2.1, icon: 'interact', label: 'Dig here', enabled: () => !st.found('secret_x'),
      onUse: () => {
        if (!st.markFound('secret_x')) return;
        _v.set(a.x, a.y + 0.4, a.z);
        game.fx.dust(_v, 14, 1.4, 0xd9c08f); game.sfx('secret'); game.haptic(24);
        const at = _v.clone();
        after(0.25, () => { game.loot.scrip(at, 60, 1.6); game.loot.item(at, 'kit', 2, 1.3); game.loot.item(at, 'bolt_shock', 8, 1.3); game.loot.item(at, 'lens', 1, 1.3); });
        game.hud.toast('Secret found', 'secret', 'X marks the spot'); st.addXp(60); st.save();
      },
    });
  }
  if (A.note) {
    const a = A.note;
    game.interact.add({
      id: 'dress#secret_note', pos: new THREE.Vector3(a.x, a.y + 0.6, a.z), radius: 2.2, icon: 'board', label: 'Read the note',
      onUse: () => {
        game.hud.banner('"RITA - SPARE CORE IS TAPED UNDER THE BENCH."', 'It still is.', '');
        if (!st.markFound('secret_note')) return;
        game.sfx('secret'); game.haptic(20);
        const at = new THREE.Vector3(a.x, a.y + 0.8, a.z);
        after(0.6, () => { game.loot.item(at, 'core', 1, 1.4); game.loot.scrip(at, 45, 1.4); });
        game.hud.toast('Secret found', 'secret', 'The riveter\'s note'); st.addXp(60); st.save();
      },
    });
  }
  // the crate that says not to
  let smash: { mesh: THREE.Mesh; col: unknown; hp: number; shake: number } | null = null;
  if (A.smash && !st.found('secret_smash')) {
    const a = A.smash, g = new Geo();
    g.box(1.3, 1.3, 1.3, { at: [0, 0.65, 0], color: 0x2f6f86, layer: T.CRATE2, uv: 'fit', col: 'none', bevel: 0.05 });
    g.box(1.34, 0.22, 1.34, { at: [0, 0.65, 0], color: PAL.yellow, layer: T.STRIPE, uv: 'world', uvScale: 0.8, col: 'none' });
    g.box(0.3, 0.3, 0.04, { at: [0, 0.98, 0.67], color: PAL.cyan, emit: 1.8, col: 'none' });
    const mesh = g.mesh(worldMat(), true);
    mesh.position.set(a.x, a.y, a.z); mesh.rotation.y = a.yaw;
    game.scene.add(mesh);
    const col = game.physics.addBox(a.x, a.y + 0.65, a.z, 0.65, 0.65, 0.65, a.yaw);
    const rec = (smash = { mesh, col, hp: 3, shake: 0 });
    const h: Hittable = {
      pos: new THREE.Vector3(a.x, a.y, a.z), radius: 0.85, height: 1.3, alive: true, targetable: true, name: 'Suspicious Crate', level: 1, hpFrac: 1, cls: 'prop',
      center: (out) => out.set(a.x, a.y + 0.65, a.z),
      takeHit: (hit: HitInfo) => {
        if (!h.alive) return 0;
        rec.hp -= hit.heavy ? 2 : 1; rec.shake = 1; h.hpFrac = Math.max(0, rec.hp / 3);
        _v.set(a.x, a.y + 0.7, a.z);
        game.sfx(rec.hp > 0 ? 'hit_wood' : 'crate_break', { pos: _v });
        game.fx.chunks(_v, rec.hp > 0 ? 4 : 14, [0x2f6f86, 0xb98a55, 0xffcf3a], rec.hp > 0 ? 4 : 7, 0.2);
        if (rec.hp <= 0) {
          h.alive = false; h.targetable = false;
          game.scene.remove(mesh); game.physics.remove(col as never);
          const k = game.combat.extras.indexOf(h); if (k >= 0) game.combat.extras.splice(k, 1);
          if (st.markFound('secret_smash')) {
            const at = _v.clone();
            game.loot.scrip(at, 40, 1.8); game.loot.item(at, 'kit', 1, 1.5); game.loot.item(at, 'servo', 2, 1.5); game.loot.item(at, 'bolt_shock', 6, 1.5);
            game.sfx('secret'); game.hud.toast('Secret found', 'secret', 'It said DO NOT SMASH'); st.addXp(50); st.save();
          }
        }
        return hit.dmg;
      },
    };
    game.combat.extras.push(h);
  }

  let t = 0;
  game.addSystem({
    update: (_dt: number, rdt: number) => {
      t += rdt;
      for (let i = timers.length - 1; i >= 0; i--) if ((timers[i].t -= rdt) <= 0) { const f = timers[i].f; timers.splice(i, 1); f(); }
      if (cine) {
        cine.t += rdt;
        if (cine.t > 6.6 || game.player.dead) { cine = null; game.cameraRig.endCine(); game.cameraRig.snap(game.player.yaw + Math.PI, 0.16); game.player.controllable = true; game.interact.blocked = false; }
      }
      const inside = !!game.interior;
      cogMesh.visible = !inside;
      if (smash) { smash.mesh.visible = !inside; if (smash.shake > 0) { smash.shake = Math.max(0, smash.shake - rdt * 5); smash.mesh.rotation.z = Math.sin(t * 60) * 0.06 * smash.shake; } }
      const p = game.player.pos;
      for (const c of chests) {
        const near = !inside && Math.abs(c.p.x - p.x) < 90 && Math.abs(c.p.z - p.z) < 90;
        c.lid.visible = near;
        if (!near) continue;
        if (c.want && c.open < 1) { c.open = Math.min(1, c.open + rdt * 3.2); c.lid.rotation.x = -1.9 * (1 - Math.pow(1 - c.open, 3)); }
        if (!c.want && Math.random() < rdt * 1.6 && Math.abs(c.p.x - p.x) < 34 && Math.abs(c.p.z - p.z) < 34)
          game.fx.emit({ x: c.p.x, y: c.p.y + 0.8, z: c.p.z }, { count: 1, speed: [0.2, 0.7], up: 0.8, life: [0.6, 1.2], size: [0.04, 0.09], color: c.p.rare ? 0x7ff0ff : 0xffd36a, glow: 3, gravity: -0.6, sprite: SP.STAR, radius: 0.6 });
      }
      if (inside) return;
      for (let i = 0; i < plan.cogs.length; i++) {
        if (cogTaken[i]) continue;
        const c = plan.cogs[i], dx = c.x - p.x, dz = c.z - p.z;
        if (Math.abs(dx) > 80 || Math.abs(dz) > 80) { cogMesh.setMatrixAt(i, zero); continue; }
        const y = c.y + Math.sin(t * 2.4 + c.x) * 0.12;
        e4.set(0.25, t * 2.2 + i, 0); q4.setFromEuler(e4); s4.setScalar(1);
        cogMesh.setMatrixAt(i, m4.compose(_v.set(c.x, y, c.z), q4, s4));
        if (dx * dx + dz * dz < 1.6 * 1.6 && Math.abs(c.y - (p.y + 1)) < 2) {
          cogTaken[i] = true; cogMesh.setMatrixAt(i, zero);
          if (st.markFound(c.id)) {
            _v.set(c.x, c.y, c.z);
            game.loot.item(_v, 'cog', 1, 0.6);
            game.fx.emit(_v, { count: 18, speed: [2, 6], life: [0.3, 0.7], size: [0.05, 0.12], color: 0xffc04a, color2: 0x3fe3ff, glow: 4, drag: 2, sprite: SP.STAR });
            game.fx.ring(_v, 2, 0xffc04a, 0.4, 2);
            game.sfx('collectible'); game.haptic(14);
            game.hud.toast(`Cog ${cogTaken.filter(Boolean).length} / ${plan.cogs.length}`, 'secret', 'Cog collected');
            st.addXp(20 + 6 * st.d.level); st.save();
          }
        } else if (Math.random() < rdt * 3 && dx * dx + dz * dz < 900) {
          game.fx.emit({ x: c.x, y, z: c.z }, { count: 1, speed: [0.2, 0.8], life: [0.5, 0.9], size: [0.04, 0.08], color: 0xffd36a, glow: 3, gravity: -1, sprite: SP.STAR, radius: 0.4 });
        }
      }
      cogMesh.instanceMatrix.needsUpdate = true;
    },
  });
}
