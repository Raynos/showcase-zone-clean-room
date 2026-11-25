/**
 * Boot progress reporter. The asset loaders tell it what they download (and how far along each
 * file is); the game's boot tells it what it is building. The loading screen (src/ui/loading.ts)
 * subscribes and draws it. Nothing here changes how anything loads.
 *
 *   const t = loadstats.begin(url, 'models');  t.progress(loaded, total);  t.end(ok);
 *   const res = await loadstats.fetch(url, 'surfaces');   // fetch() that counts bytes as they stream
 *   loadstats.stage(0.4, 'PLANTING');                       // a build step, 0..1 overall
 *
 * Offline seam: a file whose Resource Timing shows no network transfer is marked `cached` (it came
 * from the HTTP cache, or later from the service worker). `offline` is where the service worker
 * registration (Phase 11, not built yet) reports its state for the loading screen to show.
 */
export type Group = 'engine' | 'models' | 'surfaces' | 'foliage';
export interface Download { url: string; group: Group; name: string; loaded: number; total: number; done: boolean; failed: boolean; cached: boolean }
export interface Ticket { progress(loaded: number, total?: number): void; end(ok?: boolean): void }

type Listener = () => void;

class LoadStats {
  readonly files = new Map<string, Download>();
  /** build progress 0..1 and what is being built right now */
  build = 0; label = 'Waking the yard';
  /** set when boot has finished */
  ready = false;
  /** the service worker's state, once one exists: 'none' until Phase 11 registers it */
  offline: 'none' | 'installing' | 'ready' = 'none';
  private subs = new Set<Listener>();
  private queued = false;

  subscribe(fn: Listener): () => void { this.subs.add(fn); return () => this.subs.delete(fn); }
  /** coalesced to one notification per frame however many chunks arrive */
  private changed() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; for (const f of this.subs) f(); });
  }

  begin(url: string, group: Group, name = url.split('/').pop() ?? url): Ticket {
    const abs = new URL(url, location.href).href;
    const d: Download = { url: abs, group, name, loaded: 0, total: 0, done: false, failed: false, cached: false };
    this.files.set(abs, d);
    this.changed();
    return {
      progress: (loaded, total) => { d.loaded = loaded; if (total && total > 0) d.total = Math.max(total, loaded); else d.total = Math.max(d.total, loaded); this.changed(); },
      end: (ok = true) => {
        d.done = true; d.failed = !ok;
        const rt = timing(abs);
        if (rt) {
          const size = rt.encodedBodySize || rt.decodedBodySize;
          if (size > 0) { d.total = Math.max(d.total, size); d.loaded = d.total; }
          d.cached = rt.transferSize === 0 && size > 0;
        }
        if (ok && d.total > 0) d.loaded = d.total;
        this.changed();
      },
    };
  }

  /** fetch() that reports bytes as they stream in. Returns an equivalent Response. */
  async fetch(url: string, group: Group, name?: string): Promise<Response> {
    const t = this.begin(url, group, name);
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) { t.end(res.ok); return res; }
      const total = +(res.headers.get('content-length') ?? 0);
      t.progress(0, total);
      const reader = res.body.getReader(), parts: Uint8Array[] = [];
      let n = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value); n += value.length;
        t.progress(n, total);
      }
      t.end(true);
      return new Response(new Blob(parts as BlobPart[], { type: res.headers.get('content-type') ?? '' }), { status: res.status, statusText: res.statusText, headers: res.headers });
    } catch (e) { t.end(false); throw e; }
  }

  /** The engine itself (scripts and styles) finished before any of this ran: count it from Resource Timing. */
  engine() {
    for (const e of performance.getEntriesByType('resource') as PerformanceResourceTiming[]) {
      if (!/\.(js|mjs|ts|css|wasm)(\?|$)/.test(e.name) || this.files.has(e.name)) continue;
      const size = e.encodedBodySize || e.decodedBodySize;
      if (!size) continue;
      this.files.set(e.name, { url: e.name, group: 'engine', name: e.name.split('/').pop()!, loaded: size, total: size, done: true, failed: false, cached: e.transferSize === 0 });
    }
    this.changed();
  }

  stage(p: number, label: string) { this.build = Math.max(this.build, Math.min(1, p)); this.label = label; if (p >= 1) this.ready = true; this.changed(); }

  /** totals for a group, or for everything */
  sum(group?: Group) {
    let files = 0, done = 0, loaded = 0, total = 0, known = true, cached = 0, failed = 0;
    for (const d of this.files.values()) {
      if (group && d.group !== group) continue;
      files++; if (d.done) done++; if (d.cached) cached++; if (d.failed) failed++;
      loaded += d.loaded; total += d.total;
      if (!d.done && !d.total) known = false;
    }
    return { files, done, loaded, total, known, cached, failed };
  }
}

function timing(abs: string): PerformanceResourceTiming | null {
  const list = performance.getEntriesByName(abs) as PerformanceResourceTiming[];
  return list.length ? list[list.length - 1] : null;
}

export const loadstats = new LoadStats();
