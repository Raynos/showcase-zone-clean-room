import { loadstats, type Group } from '../core/loadstats';
import './loading.css';

/** Loading screen: named stages with honest bytes and files, zone lore and tips, and a crate stacker to play with. */

const LORE: Array<[string, string]> = [
  ['Zone lore', 'Brasswick was built to test the robots the yard makes. Then the robots started testing Brasswick.'],
  ['Zone lore', 'The Crate Titan was meant to stack pallets. It stacked itself instead, and it has not stopped.'],
  ['Zone lore', 'Each band past the blast wall is harder than the last: Crate Fields, Pallet Docks, Plumb Heights, the Slagworks, Rivet Row.'],
  ['Zone lore', 'Brass cogs stamped with the yard crest are hidden on rooftops, under decks and off the beaten track.'],
  ['Zone lore', 'When Storm Hour comes, Ines needs four beacons lit before the yard goes dark.'],
  ['Zone lore', 'Biscuit the horse knows the way home, even when you do not.'],
  ['Tip', 'Roll through a hit, not away from it. The dodge makes you untouchable for a moment.'],
  ['Tip', 'Elites wear a gold ring on the map. They hit harder and drop logic cores.'],
  ['Tip', 'Pim\'s forge tiers sharpen every weapon you own at once.'],
  ['Tip', 'A third skill slot opens at level 6, and Overdrive at level 10.'],
  ['Tip', 'Hold the bow or rifle attack to charge it, then drag from the button to aim.'],
  ['Tip', 'The contract board by the plaza pays for robots you were going to scrap anyway.'],
  ['Tip', 'Quest Log: tap Track on any active quest to pin it to the screen.'],
];
const STAGES: Array<{ id: string; name: string; groups: Group[] }> = [
  { id: 'engine', name: 'Engine', groups: ['engine'] },
  { id: 'models', name: 'Cast and robots', groups: ['models'] },
  { id: 'surfaces', name: 'Painted surfaces', groups: ['surfaces', 'foliage'] },
  { id: 'build', name: 'Building the zone', groups: [] },
];
const CRATE = `<svg viewBox="0 0 64 64" width="40" height="40" fill="none" stroke-linejoin="round" stroke-linecap="round"><path d="M8 20L32 8l24 12v26L32 58 8 46z" fill="#f28a2e" stroke="#2a1608" stroke-width="3"/><path d="M8 20l24 12 24-12M32 32v26" stroke="#2a1608" stroke-width="3"/><path d="M14 27l12 6v13l-12-6zM50 27l-12 6v13l12-6z" fill="#ffc46a" stroke="#2a1608" stroke-width="2.4"/><path d="M26 14l12 6" stroke="#5ef0ff" stroke-width="3.4"/></svg>`;
/** the device's own word for a press */
const TAP = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window ? 'Tap' : 'Click';
const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>';

const mb = (b: number) => b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
const NAMES = ['Brasswick', 'Rook', 'Titan', 'Slagworks', 'Rivet Row', 'Pallet Docks', 'Crate Fields', 'Plumb Heights'];
/** the boot's labels are shouted; say them in sentence case, keeping place names capitalised */
const sentence = (s: string) => NAMES.reduce((t, n) => t.replace(new RegExp(n, 'gi'), n), s.charAt(0) + s.slice(1).toLowerCase());

export interface Loading { done(): Promise<void>; fail(msg: string): void }

export function mountLoading(root: HTMLElement): Loading {
  root.className = 'ld';
  root.innerHTML = `<div class="ld-top"><div class="ld-crate">${CRATE}</div><div class="bt-word" data-w="CRATEFALL">CRATEFALL</div><div class="ld-sub">The Proving Yard</div></div>
    <div class="ld-toy"><canvas></canvas><div class="ld-score"><b>Stack 0</b><small>${TAP} to drop a crate</small></div></div>
    <div class="ld-lore bev"><small></small><p></p><div class="ld-dots">${LORE.map(() => '<i></i>').join('')}</div></div>
    <div class="ld-prog bev"><div class="ld-head"><b class="ld-pct">0%</b><span class="ld-now"></span></div><div class="pn-bar"><i></i></div>
      <div class="ld-stages">${STAGES.map((s) => `<div class="ld-st" data-s="${s.id}"><i class="ld-ic"></i><b>${s.name}</b><span></span><div class="pn-bar"><i></i></div></div>`).join('')}</div>
      <div class="ld-foot"></div></div>`;
  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  loadstats.engine();

  // ---- lore and tips: rotate, tap to advance
  let li = Math.floor(Math.random() * LORE.length), loreT = 0;
  const lore = q('.ld-lore'), loreK = lore.querySelector('small')!, loreP = lore.querySelector('p')!, dots = [...lore.querySelectorAll('.ld-dots i')];
  const showLore = () => {
    const [k, t] = LORE[li];
    loreK.textContent = k; loreK.className = k === 'Tip' ? 'tip' : '';
    loreP.textContent = t;
    lore.classList.remove('in'); void lore.offsetWidth; lore.classList.add('in');
    dots.forEach((d, i) => d.classList.toggle('on', i === li));
  };
  lore.addEventListener('pointerup', () => { li = (li + 1) % LORE.length; loreT = 0; showLore(); });
  showLore();

  // ---- progress
  const pct = q('.ld-pct'), now = q('.ld-now'), bar = q('.ld-prog > .pn-bar i'), foot = q('.ld-foot');
  const rows = Object.fromEntries(STAGES.map((s) => [s.id, root.querySelector(`[data-s="${s.id}"]`) as HTMLElement]));
  let shown = 0, target = 0;
  const paint = () => {
    let dlLoaded = 0, dlTotal = 0, files = 0, filesDone = 0, cached = 0, failed = 0;
    for (const s of STAGES) {
      const row = rows[s.id], span = row.querySelector('span')!, fill = row.querySelector('.pn-bar i') as HTMLElement;
      let f: number, text: string, done: boolean;
      if (s.id === 'build') {
        f = loadstats.build; done = loadstats.ready;
        text = done ? 'Ready' : `Terrain, town and grass · ${Math.round(f * 100)}%`;
      } else {
        const t = s.groups.map((gp) => loadstats.sum(gp)).reduce((a, b) => ({ files: a.files + b.files, done: a.done + b.done, loaded: a.loaded + b.loaded, total: a.total + b.total, known: a.known && b.known, cached: a.cached + b.cached, failed: a.failed + b.failed }));
        dlLoaded += t.loaded; dlTotal += t.total; files += t.files; filesDone += t.done; cached += t.cached; failed += t.failed;
        done = t.files > 0 && t.done === t.files;
        f = t.files ? (t.known && t.total ? t.loaded / t.total : t.done / t.files) : 0;
        text = !t.files ? 'Waiting' : done ? `${mb(t.total)} · ${t.files} file${t.files > 1 ? 's' : ''}${t.cached === t.files ? ' · saved on device' : ''}`
          : `${mb(t.loaded)}${t.known ? ` of ${mb(t.total)}` : ''} · ${t.done} of ${t.files} files`;
      }
      if (span.textContent !== text) span.textContent = text;
      fill.style.transform = `scaleX(${Math.min(1, f)})`;
      row.classList.toggle('done', done);
      row.classList.toggle('busy', !done && f > 0);
      const ic = row.querySelector('.ld-ic')!;
      if (done && !ic.innerHTML) ic.innerHTML = CHECK; else if (!done && ic.innerHTML) ic.innerHTML = '';
    }
    const dl = files ? (dlTotal ? dlLoaded / dlTotal : filesDone / files) : 0;
    target = loadstats.ready ? 1 : Math.min(0.99, 0.3 * dl + 0.7 * loadstats.build);
    now.textContent = loadstats.ready ? 'Ready' : sentence(loadstats.label);
    foot.textContent = `${mb(dlLoaded)} downloaded · ${filesDone} of ${files} files${cached ? ` · ${cached} from this device` : ''}${failed ? ` · ${failed} missing, using stand-ins` : ''}${loadstats.offline === 'ready' ? ' · saved for offline play' : ''}`;
  };
  const unsub = loadstats.subscribe(paint);
  paint();

  // ---- crate stacker
  const toy = new Stacker(q<HTMLCanvasElement>('.ld-toy canvas'), q('.ld-score'));
  q('.ld-toy').addEventListener('pointerdown', (e) => { e.preventDefault(); toy.drop(); });

  let raf = 0, last = performance.now(), alive = true;
  const frame = (t: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    shown += (target - shown) * Math.min(1, dt * 6);
    bar.style.transform = `scaleX(${shown})`;
    pct.textContent = Math.round(shown * 100) + '%';
    loreT += dt;
    if (loreT > 7) { loreT = 0; li = (li + 1) % LORE.length; showLore(); }
    toy.step(dt);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    done() {
      paint(); target = 1;
      return new Promise((res) => {
        setTimeout(() => {
          root.classList.add('out');
          setTimeout(() => { alive = false; cancelAnimationFrame(raf); unsub(); root.remove(); res(); }, 200);
        }, 350);
      });
    },
    fail(msg: string) { now.textContent = 'Could not start: ' + msg; root.classList.add('failed'); },
  };
}

/** Drop crates from a swinging hook onto a stack. Overhang more than half a crate and it topples. */
class Stacker {
  private ctx: CanvasRenderingContext2D;
  private w = 0; private h = 0; private dpr = 1;
  private stack: number[] = [];
  private t = 0; private hookX = 0;
  private fall: { x: number; y: number; vy: number } | null = null;
  private tumble: { x: number; y: number; vy: number; r: number; vr: number } | null = null;
  private cam = 0; private best = 0; private msg = '';
  private readonly W = 50; private readonly H = 38;
  constructor(private cv: HTMLCanvasElement, private score: HTMLElement) {
    this.ctx = cv.getContext('2d')!;
    try { this.best = +(localStorage.getItem('cf.stack.best') ?? 0) || 0; } catch { /* private mode */ }
    this.hud();
  }
  private fit() {
    const r = this.cv.getBoundingClientRect(), d = Math.min(2, devicePixelRatio || 1);
    if (r.width === this.w && r.height === this.h && d === this.dpr) return;
    this.w = r.width; this.h = r.height; this.dpr = d;
    this.cv.width = Math.round(r.width * d); this.cv.height = Math.round(r.height * d);
  }
  private hud() {
    const n = this.stack.length;
    this.score.innerHTML = `<b>${this.msg || `Stack ${n}`}</b><small>${this.best ? `Best ${this.best} · ` : ''}${TAP} to drop a crate</small>`;
  }
  private topY(i: number) { return this.h - 14 - (i + 1) * this.H; }
  drop() {
    if (this.fall || this.tumble || this.w === 0) return;
    this.fall = { x: this.hookX, y: 38 - this.cam, vy: 0 };
    this.msg = ''; this.hud();
  }
  step(dt: number) {
    this.fit();
    if (!this.w) return;
    const n = this.stack.length, speed = 1.3 + Math.min(2.2, n * 0.16);
    this.t += dt * speed;
    this.hookX = this.w / 2 + Math.sin(this.t) * (this.w / 2 - this.W * 0.7);
    // keep the top of the stack in view
    const want = Math.max(0, (n + 2) * this.H - (this.h - 90));
    this.cam += (want - this.cam) * Math.min(1, dt * 4);
    const f = this.fall;
    if (f) {
      f.vy += 1500 * dt; f.y += f.vy * dt;
      const land = this.topY(n);
      if (f.y >= land) {
        const below = n ? this.stack[n - 1] : this.w / 2, off = Math.abs(f.x - below);
        if (n ? off < this.W * 0.5 : off < 70 - this.W * 0.25) {
          this.stack.push(f.x); this.fall = null;
          if (this.stack.length > this.best) { this.best = this.stack.length; try { localStorage.setItem('cf.stack.best', String(this.best)); } catch { /* ignore */ } }
          this.hud();
        } else {
          this.tumble = { x: f.x, y: land, vy: -120, r: 0, vr: (f.x > below ? 1 : -1) * 5 };
          this.fall = null;
          this.msg = `Toppled at ${n}`; this.hud();
        }
      }
    }
    const tb = this.tumble;
    if (tb) {
      tb.vy += 1500 * dt; tb.y += tb.vy * dt; tb.x += tb.vr * 30 * dt; tb.r += tb.vr * dt;
      if (tb.y + this.cam > this.h + 80) { this.tumble = null; this.stack = []; this.hud(); }
    }
    this.draw();
  }
  private crate(x: number, y: number, r = 0, a = 1) {
    const c = this.ctx, W = this.W, H = this.H;
    c.save(); c.globalAlpha = a; c.translate(x, y + H / 2); c.rotate(r); c.translate(-W / 2, -H / 2);
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ffb45e'); gr.addColorStop(1, '#c9621a');
    c.fillStyle = gr; c.strokeStyle = '#2a1608'; c.lineWidth = 3; c.lineJoin = 'round';
    c.beginPath(); c.roundRect(0, 0, W, H, 4); c.fill(); c.stroke();
    c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(5, 5); c.lineTo(W - 5, H - 5); c.moveTo(W - 5, 5); c.lineTo(5, H - 5); c.stroke();
    c.strokeRect(5, 5, W - 10, H - 10);
    c.fillStyle = '#5ef0ff'; c.fillRect(W * 0.5 - 3, 1.5, 6, H - 3);
    c.restore();
  }
  private draw() {
    const c = this.ctx, d = this.dpr, w = this.w, h = this.h;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    c.save(); c.translate(0, this.cam);
    // plinth
    const py = h - 14;
    c.fillStyle = '#2a313b'; c.fillRect(w / 2 - 70, py, 140, 10);
    c.fillStyle = '#ff9a3c'; for (let i = 0; i < 7; i++) c.fillRect(w / 2 - 70 + i * 20, py, 10, 3);
    this.stack.forEach((x, i) => this.crate(x, this.topY(i)));
    if (this.fall) this.crate(this.fall.x, this.fall.y);
    if (this.tumble) this.crate(this.tumble.x, this.tumble.y, this.tumble.r);
    c.restore();
    // hook and rope
    const hx = this.hookX;
    c.strokeStyle = 'rgba(217,211,200,.55)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(hx, 0); c.lineTo(hx, 30); c.stroke();
    c.strokeStyle = '#d9d3c8'; c.lineWidth = 3;
    c.beginPath(); c.arc(hx, 34, 5, Math.PI * 1.1, Math.PI * 2.4); c.stroke();
    if (!this.fall && !this.tumble) this.crate(hx, 38, 0, 0.95);
  }
}
