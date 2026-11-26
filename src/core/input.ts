import { clamp } from './util';

export type Btn =
  | 'attack' | 'skill1' | 'skill2' | 'dodge' | 'jump' | 'interact' | 'swap' | 'sprint' | 'mount'
  | 'potion' | 'target' | 'menu' | 'map' | 'bag' | 'quests' | 'char' | 'tally'
  | 'skill3' | 'overdrive' | 'fire2' | 'aim' | 'reload';

interface BtnState { down: boolean; pressed: boolean; released: boolean; heldFor: number; downAt: number }

const KEYMAP: Record<string, Btn> = {
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'interact', KeyQ: 'skill1', KeyR: 'skill2',
  KeyF: 'swap', Tab: 'target', KeyX: 'mount', KeyH: 'potion', ControlLeft: 'dodge', KeyC: 'dodge',
  KeyM: 'map', KeyI: 'bag', KeyB: 'bag', KeyL: 'quests', KeyJ: 'quests', KeyP: 'char', KeyK: 'tally', Escape: 'menu',
  Digit1: 'skill1', Digit2: 'skill2', Digit3: 'potion', Digit4: 'swap',
  KeyT: 'skill3', KeyG: 'overdrive',
};

const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * One input surface for touch and desktop. Gameplay reads: move (camera-relative stick), look
 * deltas, and edge-triggered buttons. Touch: floating stick bottom-left, drag elsewhere to look,
 * DOM buttons call press()/release().
 */
export class Input {
  /** stick: x right, y forward; magnitude 0..1 */
  moveX = 0; moveY = 0;
  /** accumulated look delta in radians since last frame */
  lookX = 0; lookY = 0;
  /** pinch / wheel zoom delta */
  zoom = 0;
  isTouch = false;
  /** true while UI wants the pointer (panels open): gameplay input is suppressed */
  uiCapture = false;
  /** screen-space taps on the 3D view this frame (for target selection) */
  taps: Array<{ x: number; y: number }> = [];
  /** live joystick visual state for the HUD */
  stick = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  lookSensitivity = 1;
  invertY = false;
  /** left-handed layout: the stick lives on the right half of the screen and the buttons on the left */
  mirror = false;
  /**
   * Where a touch takes the stick, set by the HUD layout: the stick-side `x` fraction of the width,
   * below the `y` fraction of the height. Null: no stick (desktop).
   */
  stickZone: { x: number; y: number } | null = { x: 0.5, y: 0.42 };
  /** the shooter stance (systems/stance.ts): R reloads, the left mouse button fires, the right one aims */
  shooter = false;
  private btn = new Map<Btn, BtnState>();
  private keys = new Set<string>();
  private stickId = -1;
  /** the thumb that was on the stick when a menu took the screen: it takes the stick up again if it is still down when the menu goes */
  private heldStick = -1;
  private lookIds = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: number }>();
  private pinchDist = 0;
  private mouseLook = false;
  pointerLocked = false;
  private el: HTMLElement;
  /** fires on the very first user gesture (audio unlock etc.) */
  onFirstGesture: (() => void) | null = null;
  private gestured = false;

  constructor(el: HTMLElement) {
    this.el = el;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); for (const b of this.btn.values()) if (b.down) { b.down = false; b.released = true; } this.endStick(); });
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
    el.addEventListener('wheel', (e) => { this.zoom += e.deltaY * 0.002; e.preventDefault(); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === this.el; });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
  }

  private first() { if (!this.gestured) { this.gestured = true; this.onFirstGesture?.(); } }

  private st(b: Btn): BtnState {
    let s = this.btn.get(b);
    if (!s) this.btn.set(b, (s = { down: false, pressed: false, released: false, heldFor: 0, downAt: 0 }));
    return s;
  }
  /** Programmatic press (HUD buttons). */
  press(b: Btn) { this.first(); const s = this.st(b); if (!s.down) { s.down = true; s.pressed = true; s.heldFor = 0; s.downAt = performance.now(); } }
  release(b: Btn) { const s = this.st(b); if (s.down) { s.down = false; s.released = true; } }
  down(b: Btn) { return this.st(b).down; }
  pressed(b: Btn) { return this.st(b).pressed; }
  released(b: Btn) { return this.st(b).released; }
  heldFor(b: Btn) { return this.st(b).heldFor; }
  /** Consume a press so nothing else reacts to it this frame. */
  consume(b: Btn) { const s = this.st(b); const p = s.pressed; s.pressed = false; return p; }

  private onKey(e: KeyboardEvent, down: boolean) {
    if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    this.first();
    if (down) this.keys.add(e.code); else this.keys.delete(e.code);
    const b = this.shooter && e.code === 'KeyR' ? 'reload' : KEYMAP[e.code];
    if (b) { if (down) this.press(b); else this.release(b); e.preventDefault(); }
  }

  private onDown(e: PointerEvent) {
    this.first();
    if (this.uiCapture) return;
    if (e.pointerType === 'mouse') {
      this.isTouch = false;
      if (e.button === 0 || e.button === 2) {
        // A click on the game view takes the mouse and does what the button does: nobody clicks once for nothing.
        // Left attacks (fires, or starts the draw); right aims with a ranged weapon, and rolls once the mouse is held.
        const had = this.pointerLocked;
        if (!had) this.takeMouse();
        if (e.button === 0) {
          this.press('attack');
          // until the browser grants the mouse (or where it will not), a drag still turns the view
          if (!had) { this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 }); this.mouseLook = true; }
        } else if (this.shooter) this.press('aim');
        else if (had) this.press('dodge');
      }
      return;
    }
    this.isTouch = true;
    const w = window.innerWidth, h = window.innerHeight;
    const z = this.stickZone;
    const inStickZone = !!z && (this.mirror ? e.clientX > w * (1 - z.x) : e.clientX < w * z.x) && e.clientY > h * z.y;
    if (inStickZone && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.stick.active = true; this.stick.ox = e.clientX; this.stick.oy = e.clientY; this.stick.x = 0; this.stick.y = 0;
    } else {
      this.lookIds.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: 0 });
      if (this.lookIds.size === 2) { const p = [...this.lookIds.values()]; this.pinchDist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
    }
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  }

  private onMove(e: PointerEvent) {
    if (this.pointerLocked && e.pointerType === 'mouse') {
      // a second button pressed or let go while one is held arrives as a move (chorded buttons): fire while aiming
      if (this.shooter && (e.button === 0 || e.button === 2)) {
        const b = e.button === 0 ? 'attack' : 'aim';
        if (e.buttons & (e.button === 0 ? 1 : 2)) this.press(b); else this.release(b);
      }
      this.lookX -= e.movementX * 0.0024 * this.lookSensitivity;
      this.lookY -= e.movementY * 0.0024 * this.lookSensitivity * (this.invertY ? -1 : 1);
      return;
    }
    if (e.pointerId === this.heldStick && this.stickId < 0 && !this.uiCapture) { this.stickId = e.pointerId; this.heldStick = -1; this.stick.active = true; }
    if (e.pointerId === this.stickId) {
      const R = 58;
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        // drag the base along so the thumb never runs off the stick
        this.stick.ox += (dx / d) * (d - R); this.stick.oy += (dy / d) * (d - R);
        dx = (dx / d) * R; dy = (dy / d) * R;
      }
      this.stick.x = dx / R; this.stick.y = dy / R;
      return;
    }
    const l = this.lookIds.get(e.pointerId);
    if (!l) return;
    const dx = e.clientX - l.x, dy = e.clientY - l.y;
    l.x = e.clientX; l.y = e.clientY; l.moved += Math.abs(dx) + Math.abs(dy);
    if (this.lookIds.size >= 2 && e.pointerType !== 'mouse') {
      const p = [...this.lookIds.values()];
      const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (this.pinchDist > 0) this.zoom -= (d - this.pinchDist) * 0.006;
      this.pinchDist = d;
      return;
    }
    const k = (e.pointerType === 'mouse' ? 0.0042 : 0.0052) * this.lookSensitivity;
    this.lookX -= dx * k;
    this.lookY -= dy * k * (this.invertY ? -1 : 1);
  }

  private onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      // (not only while the mouse is held: the click that took it pressed too, and the grant may not have come)
      if (e.button === 0) this.release('attack');
      if (e.button === 2) { this.release('dodge'); this.release('aim'); }
    }
    if (e.pointerId === this.heldStick) this.heldStick = -1;
    if (e.pointerId === this.stickId) { this.endStick(); return; }
    const l = this.lookIds.get(e.pointerId);
    if (l) {
      if (l.moved < 9 && performance.now() - l.t < 320 && !this.uiCapture) this.taps.push({ x: e.clientX, y: e.clientY });
      this.lookIds.delete(e.pointerId);
      this.pinchDist = 0;
      if (e.pointerType === 'mouse') this.mouseLook = false;
    }
  }
  /**
   * Look by a drag that began on a HUD button (steering the aim with the finger that holds the
   * attack button). Same scale as a look-drag on the view.
   */
  dragLook(dx: number, dy: number) {
    const k = 0.0052 * this.lookSensitivity;
    this.lookX -= dx * k;
    this.lookY -= dy * k * (this.invertY ? -1 : 1);
  }
  /** true while a finger rests on the stick or a movement key is down (a scripted `stick` does not count) */
  get holdingMove() {
    if (this.stickId >= 0) return true;
    for (const k of MOVE_KEYS) if (this.keys.has(k)) return true;
    return false;
  }
  /** Forget every finger on the stick and the view (a layout change moved the controls; nothing may stay held). */
  cancelTouches() { if (this.stickId >= 0) this.heldStick = this.stickId; this.endStick(); this.lookIds.clear(); this.pinchDist = 0; this.mouseLook = false; }
  private endStick() { this.stickId = -1; this.stick.active = false; this.stick.x = 0; this.stick.y = 0; }

  /** Call at the start of each frame, after reading the previous frame's edges is done. */
  update(dt: number) {
    // keyboard move
    let kx = 0, ky = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) ky += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) ky -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) kx += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) kx -= 1;
    if (kx || ky) { const l = Math.hypot(kx, ky); this.moveX = kx / l; this.moveY = ky / l; }
    else if (this.stick.active) {
      let x = this.stick.x, y = -this.stick.y;
      const m = Math.hypot(x, y), dead = 0.14;
      if (m < dead) { x = 0; y = 0; } else { const k = clamp((m - dead) / (1 - dead), 0, 1) / m; x *= k; y *= k; }
      this.moveX = x; this.moveY = y;
    } else { this.moveX = 0; this.moveY = 0; }
    if (this.uiCapture) { this.moveX = 0; this.moveY = 0; this.lookX = 0; this.lookY = 0; }
    for (const s of this.btn.values()) if (s.down) s.heldFor += dt;
  }
  /** Call at the very end of the frame: clears edge flags and per-frame deltas. */
  endFrame() {
    for (const s of this.btn.values()) { s.pressed = false; s.released = false; }
    this.lookX = 0; this.lookY = 0; this.zoom = 0; this.taps.length = 0;
  }
  exitPointerLock() { if (this.pointerLocked) document.exitPointerLock?.(); }
  /** Ask the browser for the mouse (Esc gives it back). A refusal is not an error: a drag still looks. */
  private takeMouse() {
    try { const p = this.el.requestPointerLock?.() as unknown as Promise<void> | undefined; p?.catch?.(() => { /* refused: too soon after Esc, or not allowed here */ }); } catch { /* ignore */ }
  }
}
