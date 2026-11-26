import { xpToNext } from '../data/balance';
import { WEAPON_ORDER } from '../data/weapons';
import type { Game } from '../game';
import { BAND_GATES, GAUNTLET, VAULT_PORTAL } from '../world/layout';

/** Cheat drawer for playtesting, shown only with ?dev in the URL. */
export function installDev(game: Game) {
  const css = document.createElement('style');
  css.textContent = `
  /* out of the player's layout: on the top edge between the frame-rate digits and the notice lane, which no HUD slot uses */
  #dev { position: fixed; left: calc(150px + env(safe-area-inset-left, 0px)); top: calc(3px + env(safe-area-inset-top, 0px)); z-index: 60; font: 700 11px/1 system-ui, sans-serif; color: #fff; pointer-events: auto; }
  @media (orientation: portrait) { #dev { left: 178px; } }
  #dev > button { background: #0006; color: #7ff0ffb0; border: 1px solid #7ff0ff40; border-radius: 6px; padding: 4px 6px; font: 700 9px/1 system-ui, sans-serif; letter-spacing: .1em; }
  #dev.open > button { background: #000c; color: #7ff0ff; }
  #dev .dd { display: none; margin-top: 6px; background: #0b0f14ee; border: 1px solid #ffffff22; border-radius: 10px; padding: 8px; width: 236px; max-height: 60vh; overflow-y: auto; }
  #dev.open .dd { display: block; }
  #dev h5 { margin: 8px 0 5px; font-size: 9px; letter-spacing: .18em; color: #ffb04a; }
  #dev h5:first-child { margin-top: 0; }
  #dev .row { display: flex; flex-wrap: wrap; gap: 5px; }
  #dev .row button { background: #1c232c; color: #e8eef4; border: 1px solid #ffffff1c; border-radius: 7px; padding: 7px 8px; font: inherit; }
  #dev .row button.on { background: #f28a2e; color: #15171a; }`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'dev';
  const toggle = document.createElement('button'); toggle.textContent = 'DEV';
  const dd = document.createElement('div'); dd.className = 'dd';
  root.append(toggle, dd); document.body.appendChild(root);
  toggle.onclick = () => root.classList.toggle('open');
  const st = game.state;
  const section = (title: string) => { const h = document.createElement('h5'); h.textContent = title; const r = document.createElement('div'); r.className = 'row'; dd.append(h, r); return r; };
  const btn = (row: HTMLElement, label: string, fn: (b: HTMLButtonElement) => void) => { const b = document.createElement('button'); b.textContent = label; b.onclick = (e) => { e.stopPropagation(); fn(b); }; row.appendChild(b); return b; };
  const go = (x: number, z: number, yaw = 0) => { if (game.interior) return; game.player.setMode(null); game.player.teleport(x, game.terrain.h(x, z) + 0.4, z, yaw); game.cameraRig.snap(yaw + Math.PI, 0.16); };
  const setLevel = (n: number) => { while (st.d.level < n) st.addXp((xpToNext(st.d.level) - st.d.xp) / st.xpBoost); st.d.hp = st.maxHp; };

  let r = section('PLAYER');
  btn(r, 'God', (b) => { st.god = !st.god; b.classList.toggle('on', st.god); });
  btn(r, '+1 level', () => setLevel(st.d.level + 1));
  for (const n of [5, 10, 15, 18, 20]) btn(r, 'L' + n, () => setLevel(n));
  btn(r, '+2000 scrip', () => st.addScrip(2000));
  btn(r, 'All weapons', () => { for (const id of WEAPON_ORDER) st.giveWeapon(id); });
  btn(r, 'Salvage', () => { for (const id of ['scrap', 'wire', 'servo', 'lens', 'cell', 'core']) st.addItem(id, 40, true); st.addItem('kit', 5, true); });
  btn(r, 'Heal', () => { st.d.hp = st.maxHp; st.d.energy = st.maxEnergy; });
  r = section('XP');
  // ?boost=<n>: an XP multiplier for reviewing; a boosted run plays on its own save slot, so a normal save never sees it
  const boostTo = (n: number) => { const u = new URL(location.href); if (n > 1) u.searchParams.set('boost', String(n)); else u.searchParams.delete('boost'); location.href = u.toString(); };
  for (const n of [1, 5, 10, 25]) btn(r, n === 1 ? 'XP x1' : 'XP x' + n, () => boostTo(n)).classList.toggle('on', st.xpBoost === n);
  btn(r, 'Rare', () => game.grind.cheat('rare'));
  btn(r, 'Champion', () => game.grind.cheat('champion'));
  btn(r, 'Streak +5', () => game.grind.cheat('streak'));
  btn(r, 'Tuning', () => game.grind.cheat('tune'));
  r = section('HUD');
  btn(r, 'Left hand', (b) => { const s = st.d.settings; s.lefty = !s.lefty; st.touch(); b.classList.toggle('on', s.lefty); });
  r = section('WORLD');
  for (const [l, h] of [['Dawn', 6.4], ['Day', 11], ['Dusk', 18.3], ['Night', 23]] as const) btn(r, l, () => { game.env.forcedHour = h; setTimeout(() => { game.env.hour = h; game.env.forcedHour = null; }, 300); });
  for (const w of ['clear', 'rain', 'storm'] as const) btn(r, w, () => { game.env.forcedWeather = game.env.forcedWeather === w ? null : w; });
  btn(r, 'Open gates', () => { for (const g of BAND_GATES) st.setFlag('gate_' + g.id); st.setFlag('gauntlet_clear'); st.setFlag('vault_open'); });
  btn(r, 'Kill near', () => { for (const m of [...game.mobs.list]) if (m.alive && m.state !== 'spawn' && m.pos.distanceTo(game.player.pos) < 30) m.takeHit({ dmg: 1e7, crit: true, dirX: 0, dirZ: 1, knock: 2, heavy: true, source: 'skill', color: 0xffffff }); });
  btn(r, 'Reset save', () => { st.reset(); location.reload(); });
  r = section('TRAVEL');
  const places: Array<[string, number, number, number?]> = [
    ['Town', -30, 6, -Math.PI / 2], ['East gate', 14, 0, Math.PI / 2], ['Range', -70, -58], ['Physics', -146, -68], ['Climb', -218, -34], ['Rock', -160, -160],
    ['Movers', -70, 58], ['Paddock', -84, 44], ['Hover', -66, 148], ['Grapple', -60, -156], ['Lake', -150, 110],
    ['B1 Fields', 60, 10, Math.PI / 2], ['B2 Docks', 66, 130], ['B3 Heights', 180, 150], ['B4 Slag', 180, 20], ['B5 Rivet', 180, -130], ['B6 Arc', 70, -130],
    ['Vault', VAULT_PORTAL.x - 6, VAULT_PORTAL.z, Math.PI / 2], ['Gauntlet', GAUNTLET.courts[0].x, GAUNTLET.courts[0].z + 18, Math.PI], ['Titan yard', 40, -132, -0.9],
  ];
  for (const [l, x, z, yaw] of places) btn(r, l, () => go(x, z, yaw ?? 0));
  btn(r, 'Enter vault', () => game.hooks.enterVault?.());
  btn(r, 'Enter arena', () => game.hooks.enterArena?.());
  r = section('INFO');
  const info = document.createElement('div'); info.style.cssText = 'font-weight:600;line-height:1.5;color:#9fb0c0;width:100%';
  r.appendChild(info);
  setInterval(() => {
    if (!root.classList.contains('open')) return;
    const gl = game.renderer.gl.info.render, p = game.player.pos;
    info.textContent = `${Math.round(game.fps)} fps · ${gl.calls} calls · ${(gl.triangles / 1000).toFixed(0)}k tris · mobs ${game.mobs.list.length} · pos ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}`;
  }, 500);
}
