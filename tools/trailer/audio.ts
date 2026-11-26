/**
 * The trailer soundtrack, rendered offline from the game's own audio code: the score (`Music`),
 * the effect recipes (`startVoice`), the buses and the limiter (`Graph`), at the levels the game
 * itself uses (norm.ts). Nothing recorded, nothing from outside the game.
 *
 * Served by a Vite dev server as /tools/trailer/audio.html; tools/trailer/render.mjs calls
 * `renderEdit('30', postUrl)` and the page posts a 48 kHz 16-bit stereo WAV to tools/trailer/serve.mjs.
 * The edit (tempo, score states and effect cues by beat) is tools/trailer/cuts.json.
 */
import { startVoice, type MusicState, type SfxName } from '../../src/core/audio';
import { Graph } from '../../src/core/audio/graph';
import { Kit } from '../../src/core/audio/kit';
import { Music } from '../../src/core/audio/music';
import { MUSIC_NORM, SFX_NORM } from '../../src/core/audio/norm';
import { SFX } from '../../src/core/audio/sfx';

const SR = 48000;
/** a score layer starts this long after setState (music.ts): states are switched this much early */
const LEAD = 0.06;
/** the ring-out after the last beat */
const TAIL = 0;

interface Edit { beats: number; music: { at: number; state: MusicState }[]; cues: { at: number; sfx: SfxName; gain?: number; pm?: number }[] }

async function renderEdit(id: string, post: string): Promise<string> {
  const cuts = await (await fetch('/tools/trailer/cuts.json')).json();
  const e: Edit = cuts.edits[id], beat = 60 / cuts.bpm, len = e.beats * beat + TAIL;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * len), SR);
  const g = new Graph(ctx, ctx.destination, true);
  // the settings defaults, with the score a little forward: a trailer is carried by its music
  g.master.gain.value = 0.9; g.sfx.gain.value = 0.85; g.music.gain.value = 0.75; g.amb.gain.value = 0.6;
  const kit = new Kit(ctx, g.sfx);
  const mus = new Music(ctx, g.music, g.revIn, MUSIC_NORM);
  mus.setIntensity(2);
  const missing: string[] = [];
  for (const c of e.cues) {
    if (!SFX[c.sfx]) { missing.push(c.sfx); continue; }
    startVoice(g, kit, c.sfx, Math.max(0, c.at * beat), { gain: (SFX_NORM[c.sfx] ?? 0.5) * (c.gain ?? 1), pm: c.pm ?? 1, take: 0 });
  }
  // the score: each state from its beat to the next, switched on the audio clock
  const music = [...e.music].sort((a, b) => a.at - b.at);
  for (let i = 0; i < music.length; i++) {
    const m = music[i], at = Math.max(0, m.at * beat - LEAD), until = i + 1 < music.length ? music[i + 1].at * beat - LEAD : len;
    const go = () => { mus.setState(m.state, m.state === 'none' ? 0.05 : 0.02); mus.advance(Math.max(until, at + 0.01)); };
    if (at <= 0) go();
    else void ctx.suspend(Math.round((at * SR) / 128) * 128 / SR).then(() => { go(); void ctx.resume(); });
  }
  const buf = await ctx.startRendering();
  // 16-bit PCM WAV
  const n = buf.length, L = buf.getChannelData(0), R = buf.getChannelData(1);
  const out = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, SR, true);
  out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 4, true);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i])), r = Math.max(-1, Math.min(1, R[i]));
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
    out.setInt16(44 + i * 4, l * 32767, true); out.setInt16(46 + i * 4, r * 32767, true);
  }
  await fetch(post, { method: 'POST', body: new Blob([out.buffer]) });
  return JSON.stringify({ seconds: len, peakDb: Math.round(200 * Math.log10(peak + 1e-9)) / 10, missing });
}

(window as unknown as { renderEdit: typeof renderEdit }).renderEdit = renderEdit;
