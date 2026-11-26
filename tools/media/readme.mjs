#!/usr/bin/env node
// Writes the section READMEs of docs/media (zone, hud, combat, features, clips) from the shot and
// clip lists, so the captions live next to the code that stages each picture.
//
//   node tools/media/readme.mjs [--out docs/media]
//
// Sections without a list entry here (golden) keep their hand-written README.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const i = process.argv.indexOf('--out');
const OUT = resolve(i > 0 ? process.argv[i + 1] : join(ROOT, 'docs/media'));
const load = (file, name) => new Function('window', readFileSync(join(HERE, file), 'utf8') + '; return ' + name + ';')({});
const ITEMS = [...load('shots.js', 'MEDIA_SHOTS'), ...load('clips.js', 'MEDIA_CLIPS').map((c) => ({ ...c, clip: true }))];
const VIEWNAME = { p: 'portrait 402x874', l: 'landscape 874x402', d: 'desktop 1440x900' };

const SECTIONS = {
  zone: ['The zone, segment by segment',
    'Every part of the 500 x 500 m map: Brasswick, the six combat bands east of the Blast Wall, the six field outposts, the peaceful west with its courses, the Training Vault, the gauntlet and the Crate Titan\'s arena, plus the map panel. Day unless the title says otherwise; a few at night or in a storm. Coordinates are game metres (x east, z south; the town is near (-30, 0), x > 0 is the combat half). Every frame is the phone tier (`?q=medium`) in portrait, with the HUD as a player sees it.'],
  hud: ['The HUD',
    'The HUD in its contexts and every panel, in portrait (402x874), landscape (874x402) and desktop (1440x900) where the layout differs. The design and its rules are in `docs/HUD.md` (built from the study in `docs/HUD-STUDY.md`); the staging is borrowed from the HUD matrix (`tools/hud-matrix/states.js`, `tools/hud-matrix/panels.js`), so these frames match what `tools/hud-matrix.sh` checks.'],
  combat: ['Combat',
    'Weapons, skills, Overdrive, stagger and Broken, finishers, statuses, telegraphs, the robots and the bosses. The design contract with every number is `docs/COMBAT.md`. Each elite\'s signature mechanic and its tell, state by state, is in the tell sheets under `elites/`. Frames are staged with the hero made invulnerable and the camera held, so they show the move, not a real fight\'s chaos; the clips show it moving.'],
  features: ['Features',
    'One showcase per system: field quests, bounties and contracts, the Tally Book, After hours, simulated adventurers, chat, zone events, emotes, mounts, first person, fast travel, the day cycle and weather, and the loading screen. Where a feature is better seen moving, the clip is in `../clips/`.'],
  clips: ['Clips',
    'Short gameplay videos, each 10 s or less, H.264 MP4 at 30 fps with no sound. Each is frame-stepped: the game runs on a fixed 60 Hz clock and is frozen for a screenshot every two simulation frames, so motion is smooth whatever the machine was doing. The poster frame links to the video. Portrait clips are 540 wide; landscape ones 540 high. Note that HUD fades and other CSS animations run on the wall clock and may look slightly faster than the game.'],
};

// golden: the 25 fixed frames, start (docs/golden/now, the baseline) | now (re-shot here) | target
{
  const G = new Function(readFileSync(join(ROOT, 'tools/golden/scenes.js'), 'utf8') + '; return GOLDEN_SCENES;')();
  const L = ['# Golden frames', '',
    'Twenty-five fixed shots that every art phase is measured against (`docs/AAA-PLAN.md` section 3, "Method: golden frames and remaster targets"; the rules drawn from the targets are `docs/LOOK.md`). Each is scripted in `tools/golden/scenes.js`: a fixed camera, hour, weather and game state on the phone tier at 402x874, on a seeded RNG and a fixed 60 Hz clock, so a re-shoot months later frames the same moment.', '',
    'Three columns per frame:', '',
    '- **Start**: the baseline build of 2026-11-25, before the AAA plan (`../../golden/now/`, kept as committed then).',
    '- **Now**: re-shot for this library from the production build of the HEAD named in `../README.md` (`now/` here, 402x874).',
    '- **Target**: the painted remaster target, made by feeding the start frame to an image model with one shared brief: same camera, composition and HUD, only the rendering raised (`../../golden/target/`). The owner approved these as the direction on 2026-11-25. They are direction, not specification: the phone budgets win any conflict.', '',
    'Side-by-side sheets of start and target with the gap notes are in `../../golden/sheets/`. Re-shoot: `GOLDEN_SESSION=media tools/golden.sh all --url <build> --out <dir>`, then `node tools/media/golden.mjs <dir>` to scale them into `now/`.', ''];
  for (const s of G) {
    const f = (s.id ?? String(s.n).padStart(2, '0')) + '-' + s.name;
    const [t, why] = s.what.split(': ');
    L.push(`## ${f.slice(0, f.indexOf('-'))}. ${t}`, '', `Tests: ${why || t}.`, '',
      '| Start | Now | Target |', '|---|---|---|',
      `| <img src="../../golden/now/${f}.jpg" width="250"> | <img src="now/${f}.jpg" width="250"> | <img src="../../golden/target/${f}.jpg" width="250"> |`, '');
  }
  mkdirSync(join(OUT, 'golden'), { recursive: true });
  writeFileSync(join(OUT, 'golden', 'README.md'), L.join('\n'));
}

// combat/elites: the tell sheets from tools/vfx/mech.sh
const MECH = [
  ['gatecrasher', 'Gatecrasher (band 1 gate, L3)', 'Shelled (x0.2 damage) while two or more of its larvae live. Tell: it unpacks, rings rise, larvae come down columns of light. Answer: a sweep that clears the larvae.'],
  ['big-pallet', 'Big Pallet (band 2 gate, L6)', 'A ram that hardly staggers (x0.25). Tell: the ram wind-up and the brackets on the hero. Answer: roll in and counter within 2.2 s of the ram: it breaks on the spot.'],
  ['plumb-prime', 'Plumb Line Prime (band 3 gate, L9)', 'A tracking laser with a 1.3 s lock. Tell: a line that fattens from the emitter, brackets closing on the hero. Answer: break line of sight, or cut the line with a heavy, a full-draw shot or a shot to the lens (stun 2.4 s).'],
  ['slag-plate', 'Shift Boss Slag (band 4 gate, L12)', 'Plated: x0.2 damage and no stagger. Answer: a breaker or a full-draw arrow, bolt or rifle round cracks the plate for 9 s.'],
  ['old-reliable', 'Old Reliable (band 5 gate, L15)', 'A bulwark: x0.25 from the front, x1.25 from behind, slow to turn. Answer: get behind it.'],
  ['foreman-deadline', 'Foreman Unit 7 (band 6 gate, L18)', 'An amber deadline ring fills over it. Answer: break it before the ring closes, or it goes into overtime.'],
  ['sir-nibbles', 'Sir Nibbles (night elite, band 2)', 'Shell plus a lance charge. Answer: dodge, and it overruns into the scenery, UNHORSED.'],
  ['hot-mess', 'Hot Mess (night elite, band 4)', 'Plate and a heat glow that builds to a vent. Answer: back off while it vents, then hit the open vent.'],
  ['riveting-rita', 'Riveting Rita (night elite, band 6)', 'Her front is riveted and a ring is driven round her. Answer: get inside the ring, where her front opens.'],
  ['lucky-lid', 'Lucky Lid (rare mite)', 'Plays dead with a gold glint. Answer: hit it while it lies there.'],
  ['pallet-royale', 'Pallet Royale (rare pallet jack)', 'A fork lunge that pins and throws. Answer: a perfect roll through the forks opens a finisher whatever its health.'],
  ['warden-exam', 'Vault Warden, phase 3: Exam: Final', 'Three of eight pillar lamps light in order, each with its note; strike them in that order within 14 s to break it. Between questions, five red bars cross the hall. Near and far rows.'],
  ['titan-fist', 'Crate Titan, phase 1: the planted fist', 'A slam leaves the fist planted for 2.6 s, glowing amber; it takes x1.3 damage and x3 stagger, so a full punish topples the Titan. Near and far rows.'],
];
{
  const L = ['# Elite and boss mechanics: the tell sheets', '',
    'Every elite-class robot has one signature mechanic: a tell that reads with the sound off, an answer that works in melee, in the shooter stance and in first person, and a fail that hurts but never kills from full health (`docs/COMBAT.md`, "Elites and bosses"; code in `src/systems/mechanics.ts` and `src/systems/mechanics/`).', '',
    'Each sheet is one mechanic staged in its own band by `tools/vfx/mech.sh` (`tools/vfx/mech.js`). Columns are its states (tell, window, success, fail) as labelled; rows are noon and night, at fighting distance and from 15 m (interiors: near and far). Only the game canvas is copied, so HUD words are not in the picture: a sheet shows what the world itself says. Sheets are scaled to half size.', '',
    'Honest state: the shared tells (the gold arc over an open robot, aim brackets, dive lines, summon rings) are drawn on the body for every robot; the per-mechanic tells named in COMBAT.md as not built yet (Hot Mess\'s heat on its body, shield states, the Warden\'s lamps beyond their light, the Titan\'s fist beyond its glow) read only as they did before. Judge each sheet against its caption.', ''];
  for (const [f, t, why] of MECH) {
    if (!existsSync(join(OUT, 'combat/elites', f + '.jpg'))) continue;
    L.push(`## ${t}`, '', `![${t}](${f}.jpg)`, '', why, '');
  }
  mkdirSync(join(OUT, 'combat/elites'), { recursive: true });
  writeFileSync(join(OUT, 'combat/elites', 'README.md'), L.join('\n'));
}

const kb = (f) => (existsSync(f) ? Math.round(statSync(f).size / 1024) : 0);
for (const [sec, [title, intro]] of Object.entries(SECTIONS)) {
  const items = ITEMS.filter((s) => s.id.startsWith(sec + '/'));
  const lines = [`# ${title}`, '', intro, '', `Re-shoot: \`node tools/media/shoot.mjs ${sec}/\` (see \`../README.md\`). Captions live in \`tools/media/${sec === 'clips' ? 'clips' : 'shots'}.js\`; regenerate this file with \`node tools/media/readme.mjs\`.`, ''];
  lines.push('## Contents', '');
  for (const s of items) lines.push(`- [${s.title}](#${s.title.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')})`);
  lines.push('');
  if (sec === 'combat') lines.push('Tell sheets for each elite and boss mechanic: [elites/README.md](elites/README.md).', '');
  for (const s of items) {
    const name = s.id.slice(sec.length + 1), views = s.views || ['p'];
    lines.push(`## ${s.title}`, '');
    if (s.clip) {
      const f = name + (views.length > 1 ? '-' + views[0] : '');
      lines.push(`[![${s.title}](${f}.jpg)](${f}.mp4)`, '', `Video: [${f}.mp4](${f}.mp4), ${s.secs} s, ${VIEWNAME[views[0]]}, ${kb(join(OUT, sec, f + '.mp4'))} KB.`, '');
    } else if (views.length === 1) {
      lines.push(`![${s.title}](${name}.jpg)`, '');
      if (views[0] !== 'p') lines.push(`(${VIEWNAME[views[0]]})`, '');
    } else {
      const small = views.filter((v) => v !== 'd'), big = views.filter((v) => v === 'd');
      lines.push(small.map((v) => `![${s.title}, ${VIEWNAME[v]}](${name}-${v}.jpg)`).join(' '), '');
      for (const v of big) lines.push(`![${s.title}, ${VIEWNAME[v]}](${name}-${v}.jpg)`, '');
      lines.push(`(${views.map((v) => VIEWNAME[v]).join('; ')})`, '');
    }
    if (s.what) lines.push(`- **What:** ${s.what}`);
    lines.push(`- **Where:** ${s.where}`);
    lines.push(`- **Why:** ${s.why}`);
    if (s.use) lines.push(`- **Staged by:** \`${s.use}\`${s.setup ? ' plus its own setup' : ''} in \`tools/media/shots.js\`.`);
    lines.push('');
  }
  mkdirSync(join(OUT, sec), { recursive: true });
  writeFileSync(join(OUT, sec, 'README.md'), lines.join('\n'));
  console.log(join(OUT, sec, 'README.md'), items.length, 'items');
}
