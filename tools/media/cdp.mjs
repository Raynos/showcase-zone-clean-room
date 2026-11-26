// A small Chrome DevTools Protocol client for the media shoot (tools/media/shoot.mjs).
//
// The browser is the agent-browser session named in MEDIA_SESSION (default "media"); this only
// attaches to its page over the CDP socket, so screenshots and evals skip the CLI's per-call cost.
// Node 22+ (global WebSocket).
import { execFileSync } from 'node:child_process';

export function browserUrl(session) {
  const env = { ...process.env, AGENT_BROWSER_SESSION: session };
  delete env.AGENT_BROWSER_INIT_SCRIPTS;
  const ab = (...a) => execFileSync('agent-browser', a, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try { ab('get', 'cdp-url'); } catch { ab('open', 'about:blank'); }
  return ab('get', 'cdp-url').split('\n').pop().trim();
}

export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('cannot open ' + wsUrl)); });
  let id = 0;
  const wait = new Map();
  const handlers = [];
  // the browser went away (closed or crashed): fail every call still waiting instead of hanging
  ws.onclose = () => { for (const w of wait.values()) w.bad(new Error('browser connection closed')); wait.clear(); };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) {
      const w = wait.get(m.id); wait.delete(m.id);
      if (m.error) w.bad(new Error(w.method + ': ' + m.error.message)); else w.ok(m.result);
    } else if (m.method) for (const h of handlers) h(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, bad) => {
    if (ws.readyState !== 1) { bad(new Error('browser connection closed')); return; }
    const i = ++id;
    wait.set(i, { ok, bad, method });
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetInfos } = await send('Target.getTargets');
  let page = targetInfos.find((t) => t.type === 'page' && !t.url.startsWith('chrome')) || targetInfos.find((t) => t.type === 'page');
  if (!page) page = { targetId: (await send('Target.createTarget', { url: 'about:blank' })).targetId };
  const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s('Page.enable'); await s('Runtime.enable');
  // a hidden tab gets no requestAnimationFrame, and the game would never step
  await s('Page.bringToFront');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  const P = {
    send: s,
    on(fn) { handlers.push(fn); },
    close() { try { ws.close(); } catch { /* gone */ } },
    /** evaluate an expression in the page; promises are awaited; the value comes back by JSON */
    async eval(expr, timeoutMs = 600000) {
      const r = await Promise.race([
        s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
        new Promise((_, bad) => setTimeout(() => bad(new Error('eval timed out: ' + expr.slice(0, 80))), timeoutMs)),
      ]);
      if (r.exceptionDetails) throw new Error('page: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async viewport(w, h, dpr) {
      await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
    },
    async initScript(src) { await s('Page.addScriptToEvaluateOnNewDocument', { source: src }); },
    async open(url) {
      await s('Page.navigate', { url });
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => setTimeout(r, 100));
        try { if ((await P.eval('document.readyState', 5000)) === 'complete') return; } catch { /* navigating */ }
      }
      throw new Error('page did not load: ' + url);
    },
    /** a JPEG of the viewport, scaled by `scale` from CSS pixels times the device ratio */
    async shot(w, h, scale = 1, quality = 80) {
      const r = await s('Page.captureScreenshot', { format: 'jpeg', quality, clip: { x: 0, y: 0, width: w, height: h, scale }, captureBeyondViewport: false });
      return Buffer.from(r.data, 'base64');
    },
  };
  return P;
}
