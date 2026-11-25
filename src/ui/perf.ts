import type { Game } from '../game';

/**
 * On-device performance overlay, shown with ?perf in the URL.
 * A one-line strip under the notch; tap it for detail, a 30 second recording and a copyable report.
 */
export function installPerf(game: Game) {
  const css = document.createElement('style');
  css.textContent = `
  #perf { position: fixed; left: 50%; top: calc(2px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 70; font: 600 10px/1.25 ui-monospace, Menlo, monospace; color: #dff6ff; pointer-events: auto; text-align: left; -webkit-user-select: none; user-select: none; }
  #perf .bar { background: #000b; border: 1px solid #7ff0ff44; border-radius: 7px; padding: 3px 7px; white-space: nowrap; }
  #perf .bar b { color: #7ff0ff; font-weight: 700; } #perf .bar b.warn { color: #ffb04a; } #perf .bar b.bad { color: #ff5a3c; }
  #perf .pp { display: none; margin-top: 4px; background: #0b0f14f2; border: 1px solid #ffffff22; border-radius: 9px; padding: 8px 9px; width: min(86vw, 330px); }
  #perf.open .pp { display: block; }
  #perf pre { margin: 0 0 7px; font: inherit; white-space: pre-wrap; color: #cfe3ee; -webkit-user-select: text; user-select: text; }
  #perf .row { display: flex; gap: 6px; }
  #perf button { flex: 1; background: #1c232c; color: #e8eef4; border: 1px solid #ffffff22; border-radius: 7px; padding: 8px 6px; font: inherit; }
  #perf button.on { background: #f28a2e; color: #15171a; }`;
  document.head.appendChild(css);
  const root = document.createElement('div'); root.id = 'perf';
  const bar = document.createElement('div'); bar.className = 'bar';
  const pp = document.createElement('div'); pp.className = 'pp';
  const pre = document.createElement('pre');
  const row = document.createElement('div'); row.className = 'row';
  const recBtn = document.createElement('button'); recBtn.textContent = 'Record 30 s';
  const copyBtn = document.createElement('button'); copyBtn.textContent = 'Copy report';
  row.append(recBtn, copyBtn); pp.append(pre, row); root.append(bar, pp); document.body.appendChild(root);
  bar.onclick = () => root.classList.toggle('open');

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
