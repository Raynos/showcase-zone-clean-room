import type { Game } from '../game';

/**
 * Performance overlay. Always installed: by default a compact frame-rate readout (frames per second
 * and frame time) tucked under the player frame, hidden by the Settings switch. With ?perf in the URL
 * it is the full one-line strip under the notch, as before. Either way a tap opens the detail,
 * a 30 second recording and a copyable report. The text is rewritten twice a second, never per frame.
 */
export function installPerf(game: Game, full = true) {
  const css = document.createElement('style');
  css.textContent = `
  #perf { position: fixed; left: 50%; top: calc(2px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 70; font: 600 10px/1.25 ui-monospace, Menlo, monospace; color: #dff6ff; pointer-events: auto; text-align: left; -webkit-user-select: none; user-select: none; }
  #perf.mini { transform: none; font: 800 12px/1 "Avenir Next Condensed", "Roboto Condensed", "Arial Narrow", system-ui, sans-serif; font-variant-numeric: tabular-nums; letter-spacing: .04em; }
  #perf.mini .pbar { display: flex; align-items: center; gap: 5px; height: 20px; padding: 0 8px; border-radius: 10px; color: #a9b0ba; background: rgba(10, 13, 17, .72); border: 1px solid rgba(255, 255, 255, .16); box-shadow: 0 1px 3px rgba(0, 0, 0, .6); }
  #perf.mini .pbar b { color: #7dffb0; font-weight: 800; } #perf.mini .pbar b.warn { color: #ffc46a; } #perf.mini .pbar b.bad { color: #ff6a4a; }
  #perf.mini .pbar i { font-style: normal; color: #d9d3c8; }
  #perf.mini::before { content: ''; position: absolute; inset: -12px -6px; }
  #perf.mini .pp { font: 600 10px/1.25 ui-monospace, Menlo, monospace; letter-spacing: 0; }
  #perf.off { display: none; }
  #perf .pbar { background: #000b; border: 1px solid #7ff0ff44; border-radius: 7px; padding: 3px 7px; white-space: nowrap; }
  #perf .pbar b { color: #7ff0ff; font-weight: 700; } #perf .pbar b.warn { color: #ffb04a; } #perf .pbar b.bad { color: #ff5a3c; }
  #perf .pp { display: none; margin-top: 4px; background: #0b0f14f2; border: 1px solid #ffffff22; border-radius: 9px; padding: 8px 9px; width: min(86vw, 330px); }
  #perf.open .pp { display: block; }
  #perf pre { margin: 0 0 7px; font: inherit; white-space: pre-wrap; color: #cfe3ee; -webkit-user-select: text; user-select: text; }
  #perf .row { display: flex; gap: 6px; }
  #perf button { flex: 1; background: #1c232c; color: #e8eef4; border: 1px solid #ffffff22; border-radius: 7px; padding: 8px 6px; font: inherit; }
  #perf button.on { background: #f28a2e; color: #15171a; }`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'perf';
  if (!full) { root.className = 'mini'; root.setAttribute('role', 'button'); root.setAttribute('aria-label', 'Frame rate; tap for detail'); }
  const bar = document.createElement('div'); bar.className = 'pbar';
  const pp = document.createElement('div'); pp.className = 'pp';
  const pre = document.createElement('pre');
  const row = document.createElement('div'); row.className = 'row';
  const recBtn = document.createElement('button'); recBtn.textContent = 'Record 30 s';
  const copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy report';
  row.append(recBtn, copyBtn); pp.append(pre, row); root.append(bar, pp); document.body.appendChild(root);
  bar.onclick = () => { root.classList.toggle('open'); paint(); };
  // taps on the readout must not reach the look and stick handlers under it
  for (const t of ['pointerdown', 'touchstart'] as const) root.addEventListener(t, (e) => e.stopPropagation(), { passive: true });

  const N = 360, ring = new Float32Array(N);
  let head = 0, filled = 0, last = performance.now(), long25 = 0, long50 = 0, frames = 0;
  const started = performance.now();
  interface Rec { t0: number; ms: number[]; calls: number; tris: number; minScale: number; from: string }
  let rec: Rec | null = null;
  let report = '';

  const gl = game.renderer.gl, info = gl.info;
  const where = () => { const p = game.player?.pos; return p ? `${p.x.toFixed(0)},${p.z.toFixed(0)}` : '?'; };
  const pct = (sorted: number[] | Float32Array, q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : 0;
  const k = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(n));
  const heap = () => { const m = (performance as any).memory; return m ? Math.round(m.usedJSHeapSize / 1048576) + ' MB' : 'n/a'; };
  const device = () => `${innerWidth}x${innerHeight} css @${(devicePixelRatio || 1).toFixed(2)} · buffer ${gl.domElement.width}x${gl.domElement.height}`;
  const cls = (ms: number) => (ms > 25 ? 'bad' : ms > 18.5 ? 'warn' : '');

  const frame = (now: number) => {
    const ms = now - last; last = now;
    if (ms < 1000) {
      ring[head] = ms; head = (head + 1) % N; filled = Math.min(N, filled + 1); frames++;
      if (ms > 25) long25++; if (ms > 50) long50++;
      if (rec) {
        rec.ms.push(ms); rec.calls = Math.max(rec.calls, info.render.calls); rec.tris = Math.max(rec.tris, info.render.triangles);
        rec.minScale = Math.min(rec.minScale, game.renderer.resScale);
        if (now - rec.t0 >= 30000) finish(now);
      }
    }
    requestAnimationFrame(frame);
  };
  const finish = (now: number) => {
    if (!rec) return;
    const s = rec.ms.slice().sort((a, b) => a - b), sum = s.reduce((a, b) => a + b, 0);
    const q = game.renderer.quality;
    report = [
      `CRATEFALL perf report`,
      `${new Date().toISOString()} · ${((now - rec.t0) / 1000).toFixed(0)} s · ${s.length} frames`,
      `avg ${(1000 * s.length / sum).toFixed(1)} fps · frame ms p50 ${pct(s, 0.5).toFixed(1)} p95 ${pct(s, 0.95).toFixed(1)} p99 ${pct(s, 0.99).toFixed(1)} max ${s[s.length - 1].toFixed(0)}`,
      `long frames >25 ms ${s.filter((v) => v > 25).length} · >50 ms ${s.filter((v) => v > 50).length}`,
      `quality ${q.name} · res scale min ${rec.minScale.toFixed(2)} now ${game.renderer.resScale.toFixed(2)} · pixel ratio ${game.renderer.pixelRatio.toFixed(2)}`,
      `peak draw calls ${rec.calls} · peak triangles ${k(rec.tris)}`,
      `programs ${info.programs?.length ?? 0} · geometries ${info.memory.geometries} · textures ${info.memory.textures} · heap ${heap()}`,
      `${device()}`,
      `from ${rec.from} to ${where()} · ${game.interior || 'outdoors'}`,
      navigator.userAgent,
    ].join('\n');
    rec = null; recBtn.classList.remove('on'); recBtn.textContent = 'Record 30 s';
    root.classList.add('open'); paint();
  };
  recBtn.onclick = () => {
    if (rec) { finish(performance.now()); return; }
    rec = { t0: performance.now(), ms: [], calls: 0, tris: 0, minScale: 1, from: where() };
    report = ''; recBtn.classList.add('on'); recBtn.textContent = 'Recording… tap to stop';
    root.classList.remove('open');
  };
  copyBtn.onclick = () => {
    const text = report || pre.textContent || '';
    const done = () => { copyBtn.textContent = 'Copied'; setTimeout(() => (copyBtn.textContent = 'Copy report'), 1400); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => { copyBtn.textContent = 'Select the text above'; });
    else copyBtn.textContent = 'Select the text above';
  };

  const paint = () => {
    const s = Array.from(ring.subarray(0, filled)).sort((a, b) => a - b);
    const p50 = pct(s, 0.5), p95 = pct(s, 0.95), q = game.renderer.quality;
    const left = rec ? ` · REC ${Math.max(0, 30 - Math.round((performance.now() - rec.t0) / 1000))}s` : '';
    if (!full) {
      // compact: hidden by the Settings switch; sits in the free strip under the player frame
      const on = game.state.d.settings.fps !== false || root.classList.contains('open') || !!rec;
      root.classList.toggle('off', !on);
      if (!on) return;
      const pf = document.querySelector('#ui .pframe') as HTMLElement | null, r = pf?.getBoundingClientRect();
      const placed = !!(r && r.width && !game.hideHud);
      const lx = placed ? `${r!.left + 58}px` : 'calc(10px + env(safe-area-inset-left, 0px))';
      // the open detail is wider than the readout: keep it on screen
      root.style.left = root.classList.contains('open') ? `max(6px, min(${lx}, calc(100vw - min(86vw, 330px) - 26px - env(safe-area-inset-right, 0px))))` : lx;
      root.style.top = placed ? `${r!.bottom + 3}px` : 'calc(6px + env(safe-area-inset-top, 0px))';
      if (!root.classList.contains('open')) { bar.innerHTML = `<b class="${cls(p50)}">${Math.round(game.fps)}</b>FPS<i>${p50.toFixed(1)} ms</i>${rec ? `<b class="bad">${left.slice(3)}</b>` : ''}`; return; }
    }
    bar.innerHTML = `<b class="${cls(p50)}">${Math.round(game.fps)}</b> fps · <b class="${cls(p95)}">${p50.toFixed(1)}/${p95.toFixed(1)}</b> ms · <b>${game.renderer.resScale.toFixed(2)}×</b> · ${info.render.calls} dc · ${k(info.render.triangles)}${left}`;
    if (!root.classList.contains('open')) return;
    pre.textContent = report || [
      `frame ms p50 ${p50.toFixed(1)} · p95 ${p95.toFixed(1)} · max ${(s[s.length - 1] ?? 0).toFixed(0)} (last ${filled} frames)`,
      `long frames >25 ms ${long25} · >50 ms ${long50} of ${frames} in ${((performance.now() - started) / 1000).toFixed(0)} s`,
      `quality ${q.name} · res scale ${game.renderer.resScale.toFixed(2)} · pixel ratio ${game.renderer.pixelRatio.toFixed(2)}`,
      `draw calls ${info.render.calls} · triangles ${k(info.render.triangles)}`,
      `programs ${info.programs?.length ?? 0} · geometries ${info.memory.geometries} · textures ${info.memory.textures} · heap ${heap()}`,
      `${device()}`,
      `at ${where()} · ${game.interior || 'outdoors'}`,
    ].join('\n');
  };
  requestAnimationFrame(frame);
  setInterval(paint, 500);
}
