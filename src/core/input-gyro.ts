/**
 * Gyroscope aiming (Settings, off by default). Turning the phone turns the view: the device's
 * rotation rate, mapped to the screen's axes for the way the phone is held, added to the look.
 *
 * iOS only delivers motion events after `DeviceMotionEvent.requestPermission()` resolves, and that
 * call must come from a tap: Settings calls `request()` from the toggle's own click.
 */
type PermFn = () => Promise<'granted' | 'denied'>;
const DEG = Math.PI / 180;

export class Gyro {
  /** listening, and whether this device has ever sent a reading */
  private on = false; seen = false;
  /** rotation accumulated since the last take, radians around the screen's up and right axes */
  private yaw = 0; private pitch = 0;
  private lastT = 0;
  denied = false;

  /** Ask for motion events (from a user gesture on iOS). Resolves true when they will come. */
  async request(): Promise<boolean> {
    const DM = (globalThis as { DeviceMotionEvent?: { requestPermission?: PermFn } }).DeviceMotionEvent;
    if (!DM) return false;
    try {
      if (typeof DM.requestPermission === 'function') {
        const r = await DM.requestPermission();
        if (r !== 'granted') { this.denied = true; return false; }
      }
    } catch { this.denied = true; return false; }
    this.listen();
    return true;
  }
  private listen() {
    if (this.on) return;
    this.on = true;
    window.addEventListener('devicemotion', (e) => {
      const r = e.rotationRate;
      if (!r || r.alpha === null) return;
      this.seen = true;
      const now = performance.now(), dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : (e.interval || 16) / 1000;
      this.lastT = now;
      // rotation rates are deg/s about the device's x (beta), y (gamma) and z (alpha) axes; map them
      // to the screen's up (yaw) and right (pitch) axes for the current orientation
      const ang = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) % 360;
      const b = (r.beta ?? 0) * DEG, gm = (r.gamma ?? 0) * DEG;
      let yaw: number, pitch: number;
      if (ang === 90) { yaw = b; pitch = -gm; }
      else if (ang === 270 || ang === -90) { yaw = -b; pitch = gm; }
      else if (ang === 180) { yaw = -gm; pitch = -b; }
      else { yaw = gm; pitch = b; }
      this.yaw += yaw * dt; this.pitch += pitch * dt;
    });
  }
  /** The rotation since the last call, as look input (x: + turns left, y: + looks up). Zero when off. */
  take(enabled: boolean, _dt: number): { x: number; y: number } {
    if (enabled && !this.on && !this.denied) this.listen();
    const x = enabled ? this.yaw : 0, y = enabled ? this.pitch : 0;
    this.yaw = 0; this.pitch = 0;
    return { x, y };
  }
}
