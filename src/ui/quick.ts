import { icon } from './icons';

/**
 * The quick wheel (docs/HUD.md): the things a player does less than once a minute, behind one
 * chip. It opens as a fan on the inward side of the chip, under the thumb that is holding it:
 * slide to an item and let go, or let go first and tap one. A tap anywhere else closes it. Items
 * can open a second fan in place (emotes).
 */
export interface QuickItem {
  id: string; icon: string; label: string;
  /** printed on the item (kits left) */
  count?: number;
  /** cannot be used now: drawn dim, refuses with a shake */
  off?: boolean;
  /** return items to stay open with them as a second fan */
  run: () => QuickItem[] | void;
}
const R = 102, ARC = 0.72, DEAD = 26;

export class QuickWheel {
  readonly root: HTMLElement;
  private name: HTMLElement;
  private items: QuickItem[] = []; private els: HTMLElement[] = [];
  private cx = 0; private cy = 0; private ox = 0; private oy = 0; private dir = -1; private hot = -1;
  isOpen = false;
  /** a sound and a tick for the HUD to play: 'open', 'close', 'hot', 'pick', 'deny' */
  onFx: (kind: string) => void = () => {};

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'qw';
    this.root.innerHTML = '<i class="qw-arc"></i><b class="qw-name"></b>';
    this.name = this.root.querySelector('.qw-name')!;
    // tap mode: an item picks, anywhere else closes
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const b = (e.target as Element).closest('.qw-i') as HTMLElement | null;
      if (b) this.pick(this.els.indexOf(b)); else this.close();
    });
    for (const k of ['pointerup', 'pointermove', 'touchstart', 'touchmove'] as const) this.root.addEventListener(k, (e) => e.stopPropagation(), { passive: true });
    parent.appendChild(this.root);
  }

  /** Open at a point; `dir` is -1 when the fan opens leftward (the chip is on the right edge), 1 rightward. */
  open(cx: number, cy: number, dir: number, items: QuickItem[]) {
    const H = innerHeight, W = innerWidth;
    // the fan is centred on the chip where it fits, and slid along the edge where it does not; the finger's
    // own start stays the origin its direction is read from
    this.ox = cx; this.oy = cy;
    const reach = Math.sin(ARC * Math.PI / 2) * R + 34;
    this.cx = Math.max(24, Math.min(W - 24, cx)); this.cy = Math.max(reach, Math.min(H - reach, cy)); this.dir = dir;
    this.fill(items);
    if (!this.isOpen) { this.isOpen = true; this.onFx('open'); }
    this.root.classList.add('on');
  }
  private fill(items: QuickItem[]) {
    this.items = items; this.hot = -1;
    for (const e of this.els) e.remove();
    this.els = [];
    const n = items.length, st = this.root.style;
    st.setProperty('--qx', this.cx + 'px'); st.setProperty('--qy', this.cy + 'px');
    this.root.dataset.dir = this.dir < 0 ? 'l' : 'r';
    items.forEach((it, i) => {
      // a half circle on the inward side, top to bottom
      const a = n === 1 ? 0 : (-0.5 + i / (n - 1)) * Math.PI * ARC;
      const x = this.cx + this.dir * Math.cos(a) * R, y = this.cy + Math.sin(a) * R;
      const b = document.createElement('button');
      b.className = 'qw-i' + (it.off ? ' off' : '');
      b.innerHTML = `<span>${icon(it.icon, 22, 2.1)}</span>${it.count !== undefined ? `<b>${it.count}</b>` : ''}<small>${it.label}</small>`;
      b.style.left = x + 'px'; b.style.top = y + 'px';
      b.style.transitionDelay = i * 14 + 'ms';
      this.root.appendChild(b); this.els.push(b);
    });
    this.name.textContent = '';
    // let the first frame lay them at the centre, then fan them out
    this.root.classList.remove('fan'); void this.root.offsetWidth; this.root.classList.add('fan');
  }
  /** The finger that opened the wheel moved (held mode): light the item it points at. */
  move(x: number, y: number) {
    if (!this.isOpen) return;
    // the item the finger points at from where it started; it need not travel all the way there
    const dx = x - this.ox, dy = y - this.oy;
    let hot = -1;
    if (Math.hypot(dx, dy) > DEAD) {
      const a = Math.atan2(dy, dx);
      let best = 0.42;
      this.els.forEach((e, i) => {
        const b = Math.atan2(parseFloat(e.style.top) - this.oy, parseFloat(e.style.left) - this.ox);
        const d = Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
        if (d < best) { best = d; hot = i; }
      });
    }
    if (hot === this.hot) return;
    this.hot = hot;
    this.els.forEach((e, i) => e.classList.toggle('hot', i === hot));
    this.name.textContent = hot >= 0 ? this.items[hot].label : '';
    if (hot >= 0) this.onFx('hot');
  }
  /** The finger that opened the wheel lifted: pick what it points at, or stay open for a tap. */
  release() {
    if (!this.isOpen || this.hot < 0) return;
    const off = this.items[this.hot]?.off;
    this.pick(this.hot);
    // an item that cannot be used refuses, and the wheel does not hang open over the fight
    if (off) setTimeout(() => this.close(), 240);
  }
  private pick(i: number) {
    const it = this.items[i], e = this.els[i];
    if (!it) return;
    if (it.off) { e.classList.remove('deny'); void e.offsetWidth; e.classList.add('deny'); this.onFx('deny'); return; }
    this.onFx('pick');
    const next = it.run();
    if (next && next.length) this.fill(next); else this.close();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; this.hot = -1;
    this.root.classList.remove('on', 'fan');
    this.onFx('close');
  }
}
