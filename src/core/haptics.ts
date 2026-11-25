/**
 * Haptic ticks on touch devices.
 *
 * Android and other browsers with the Vibration API get `navigator.vibrate`. iOS Safari has no
 * such API, but it plays the system "switch" tick whenever an `<input type="checkbox" switch>`
 * is toggled, including through its label from script. So on iOS a hidden switch is flipped once
 * per tick, and a heavier impact is a short run of ticks. This is a side effect of the control,
 * not a documented API: it cannot be tested off a real iPhone and a Safari update may end it.
 *
 * `fire(ms)` takes the durations the game already passes to `game.haptic`: under 15 ms is a light
 * tick (a hit landing, a button press), 15 to 44 a firmer double, 45 and over a heavy triple
 * (slams, boss beats).
 */
export type HapticMode = 'vibrate' | 'switch' | 'none';

export class Haptics {
  readonly mode: HapticMode;
  enabled = true;
  private last = 0;
  /** ticks actually sent, for checking from a console that the path is live */
  sent = 0;

  constructor() {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.vibrate === 'function') this.mode = 'vibrate';
    else if (typeof document !== 'undefined' && nav && ('switch' in document.createElement('input') || /iP(hone|ad|od)/.test(nav.userAgent) || (/Mac/.test(nav.userAgent) && nav.maxTouchPoints > 1))) this.mode = 'switch';
    else this.mode = 'none';
  }

  /** One system tick: a throwaway switch, toggled through its label, never shown. */
  private tick() {
    this.sent++;
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox'; input.setAttribute('switch', '');
    label.appendChild(input);
    // the click must not reach the game's own listeners
    label.addEventListener('click', (e) => e.stopPropagation());
    document.head.appendChild(label);
    label.click();
    document.head.removeChild(label);
  }

  /** One light tick. */
  light() { this.fire(8); }
  /** A stronger pattern for heavy impacts. */
  heavy() { this.fire(60); }

  fire(ms: number) {
    if (!this.enabled || this.mode === 'none' || ms <= 0) return;
    const now = performance.now();
    // a burst of hits in one frame is one tick, not a buzz
    if (ms < 15 && now - this.last < 35) return;
    this.last = now;
    try {
      if (this.mode === 'vibrate') {
        this.sent++;
        navigator.vibrate(ms < 15 ? ms : ms < 45 ? [ms, 24, Math.round(ms * 0.6)] : [Math.min(ms, 70), 28, 34, 28, 22]);
      } else {
        this.tick();
        if (ms >= 15) setTimeout(() => this.tick(), 34);
        if (ms >= 45) setTimeout(() => this.tick(), 78);
      }
    } catch { /* unsupported or blocked: stay silent */ }
  }
}
