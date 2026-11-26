/* CRATEFALL service worker. Built by tools/release/pwa.ts, which replaces the two values below.
 *
 * One cache per deploy, filled completely before the deploy is used: install fetches every file in
 * FILES (copying any whose content hash matches a file the previous deploy already cached) and
 * fails as a whole if one file fails, so no launch ever starts on half of a deploy.
 *
 * Every page stays on the deploy it was launched from. A new worker takes over as soon as its
 * cache is complete, but a page that was already open keeps being served from its own deploy's
 * cache (the previous one is kept for that), so a lazily loaded chunk or model never comes from a
 * different deploy. The next launch, or a tap on the page's update notice (src/core/sw.ts), starts
 * the new deploy. Files outside FILES (the 512 surface arrays on desktop tiers, the WebP stand-in
 * tiles) join the page's deploy cache the first time they load.
 */
const VERSION = '__VERSION__';
/** [path relative to this worker, content hash] */
const FILES = __FILES__;
const PREFIX = 'cratefall-';
const CACHE = PREFIX + VERSION;
/** which deploy each open page was launched from, kept across worker restarts */
const CLIENTS = 'cratefall:clients';
const INDEX = '__index__';
const BASE = new URL('./', self.location.href).href;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // what earlier deploys hold, by content hash, so unchanged files are not downloaded again
    const old = new Map();
    for (const k of await caches.keys()) {
      if (!k.startsWith(PREFIX) || k === CACHE) continue;
      const c = await caches.open(k), ix = await c.match(INDEX);
      if (!ix) continue;
      for (const [p, h] of await ix.json()) old.set(p + '#' + h, c);
    }
    let i = 0;
    const next = async () => {
      while (i < FILES.length) {
        const [p, h] = FILES[i++], url = BASE + p;
        const prev = old.get(p + '#' + h);
        const hit = prev && await prev.match(url);
        if (hit) { await cache.put(url, hit); continue; }
        // no-cache: revalidate, so a copy in the HTTP cache from the previous deploy is never reused
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`precache ${p}: ${res.status}`);
        await cache.put(url, res);
      }
    };
    await Promise.all(Array.from({ length: 6 }, next));
    // written last: a cache without its index is an unfinished install and is never served
    await cache.put(INDEX, new Response(JSON.stringify(FILES), { headers: { 'Content-Type': 'application/json' } }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // keep this deploy and the newest earlier complete one (pages still open on it are served from it)
    const keys = (await caches.keys()).filter((k) => k.startsWith(PREFIX) && k !== CACHE);
    let kept = null;
    for (let i = keys.length - 1; i >= 0; i--) {
      const done = !kept && await (await caches.open(keys[i])).match(INDEX);
      if (done) kept = keys[i]; else await caches.delete(keys[i]);
    }
    await self.clients.claim();
    await pruneClients();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ version: VERSION });
});

// ---- which deploy serves which page
let clientMap = null;
async function clientDeploys() {
  if (clientMap) return clientMap;
  try { const r = await (await caches.open(CLIENTS)).match(BASE + '__clients__'); clientMap = new Map(r ? await r.json() : []); } catch { clientMap = new Map(); }
  return clientMap;
}
async function saveClients() {
  try { await (await caches.open(CLIENTS)).put(BASE + '__clients__', new Response(JSON.stringify([...clientMap]))); } catch { /* best effort */ }
}
async function pruneClients() {
  const m = await clientDeploys(), live = new Set((await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).map((c) => c.id));
  for (const id of m.keys()) if (!live.has(id)) m.delete(id);
  await saveClients();
}
/** the caches to look in for a request from this page: its own deploy first */
async function cachesFor(clientId) {
  const mine = clientId ? (await clientDeploys()).get(clientId) : null;
  const names = (await caches.keys()).filter((k) => k.startsWith(PREFIX)).reverse();
  const order = mine && names.includes(mine) ? [mine, ...names.filter((n) => n !== mine)] : names.includes(CACHE) ? [CACHE, ...names.filter((n) => n !== CACHE)] : names;
  return order;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(BASE)) return;
  // every page in scope is the one game page, whatever its query (?dev, ?q=...): a launch gets the newest deploy
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = (await cache.match(INDEX)) && ((await cache.match(BASE + 'index.html')) ?? (await cache.match(BASE)));
      if (hit) {
        if (event.resultingClientId) { (await clientDeploys()).set(event.resultingClientId, CACHE); void saveClients(); }
        return hit;
      }
      return fetch(req);
    })());
    return;
  }
  event.respondWith((async () => {
    const order = await cachesFor(event.clientId);
    for (const name of order) {
      const hit = await (await caches.open(name)).match(req, { ignoreVary: true });
      if (hit) return hit;
    }
    const res = await fetch(req);
    // late files join the page's deploy cache; partial responses and errors never do
    if (res.ok && res.status === 200 && !req.headers.has('range') && order.length) {
      try { await (await caches.open(order[0])).put(req, res.clone()); } catch { /* quota: serve it anyway */ }
    }
    return res;
  })());
});
