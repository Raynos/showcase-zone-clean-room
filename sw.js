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
const VERSION = "e5f66ab6b2ed";
/** [path relative to this worker, content hash] */
const FILES = [["index.html","a2220fac10ab"],["assets/BufferGeometryUtils-CUvBX7BK.js","84199e91a161"],["assets/arena-CNGGL0qw.js","eed6905ccf8a"],["assets/audio-BsQMRA5W.js","fa5304c864e3"],["assets/balance-D9qqppOk.js","13688aa62110"],["assets/bosses-BAXBrqB6.js","306c09fc939f"],["assets/botdata-CWwZMapm.js","619e4eada094"],["assets/climb-71_BjJov.js","8cca56c8a401"],["assets/content-CI9gSWgx.js","829d976a58a4"],["assets/dev-DKYKbVYZ.js","777d9f504678"],["assets/dressing-B32ikNSE.js","1d6cbaf9c6f7"],["assets/east-BKCNZcCF.js","8275a359f69b"],["assets/emitters-CUMMrBJm.js","c9a88512d985"],["assets/encounters-Bqgo2Gox.js","96e698a31eef"],["assets/energy-CqD5nHcl.js","4f59a4fe3edf"],["assets/grapple-B8uT7p77.js","6bd3ea80b30c"],["assets/hover-tW6n7Izf.js","94ec85655fc1"],["assets/humanoid-vSZVjzFH.js","aa1c03fed745"],["assets/index-CsCCpqJ1.js","4bfb0afa7e15"],["assets/index-jfa6XocJ.css","4bd46b27dcb7"],["assets/kit-W9LpTOZk.js","f16af43bb05c"],["assets/kitA-D4ZBTpSl.js","ec5b582b64c5"],["assets/kitB-Du7aGifu.js","401cd2ffdf65"],["assets/layout-8tg6ovfT.js","8e7663db15c8"],["assets/living-Bn1IYBuh.js","56db887df3da"],["assets/living-WBBBFcTP.css","3c0ddce63541"],["assets/material-DrZpcpOX.js","77c0ce4c77a7"],["assets/models-CXBlm3b2.js","c31ea21c3a8a"],["assets/mounts-BQUJBmci.js","688d6f30a100"],["assets/mounts-Dp-Crc2M.js","a60a696b728b"],["assets/moversrun-C6hePCyQ.js","0e4e39c3cd1f"],["assets/npcs-Bj7qrIle.js","949ad03b82f3"],["assets/outposts-D-xojc0Y.js","0897dc153f15"],["assets/outposts-dUmHT0T_.js","c3824ff61170"],["assets/overtime-CezvlMXY.js","84ae12f314ed"],["assets/panels-BFdshKXm.css","7201f3d11948"],["assets/panels-VBFoAJro.js","b858ec09538c"],["assets/perf-B2aEsrAw.js","eb99c74d47ca"],["assets/physics-DP4_zqs_.js","026b7a265e09"],["assets/range-Dc5V6rmK.js","419c95a510d6"],["assets/rapier_wasm3d_bg-C6GCbKVJ.wasm","b12026183f82"],["assets/riding-40nn9EFN.js","13722bc67f39"],["assets/roads-C9ljB_70.js","dae1e147e1e0"],["assets/robots-C7Uzjl11.js","7f3ee77ff459"],["assets/rock-BbQBsHBh.js","804b7d9177d9"],["assets/rolldown-runtime-DK3Fl9T5.js","ff766b79e249"],["assets/save-CVQQKdoX.js","2ce083cd3638"],["assets/save-CwsOncbp.js","30c735ea4f4d"],["assets/skyline-x5Td64Au.js","ec366c360819"],["assets/speech-BcMMlAsQ.js","fd40b9df2179"],["assets/tally-BTttGau0.css","c10670cc6cf9"],["assets/tally-Dfl_Eirj.js","a15077de86b5"],["assets/textures-CjF1RtfX.js","aef568c4d5f4"],["assets/three.core-BO6tKqzc.js","7bfe72da41c9"],["assets/town-BKwKUyAc.js","dce620d63671"],["assets/trailer-DgwBi-jx.js","bd6582db3f98"],["assets/vault-BPOn9MAJ.js","2fc29bffbf8c"],["assets/vista-bd2ZyxX_.js","1b86f516cf36"],["basis/basis_transcoder.js","25247a30572a"],["basis/basis_transcoder.wasm","cdc7dfe89378"],["draco/draco_decoder.wasm","11866a8962e6"],["draco/draco_wasm_wrapper.js","94c57ad1f8ec"],["icons/app-180.png","a3dbdb43e2c2"],["icons/app-192.png","4b1580c3e9b4"],["icons/app-512.png","2f0b6e5838ab"],["icons/app-maskable-512.png","220751b18577"],["icons/favicon-32.png","675808ed54db"],["icons/gear.webp","86bea97b3b84"],["icons/items.webp","071bcde669ab"],["manifest.webmanifest","65a0cfb5262b"],["models/adv.glb","2e1316144f62"],["models/adv.webp","af15f851f5b8"],["models/board.glb","0ef1dea63298"],["models/board.webp","2a67201001b1"],["models/bows.glb","aa7485caf3dd"],["models/bows.webp","a6df7daaffb7"],["models/drone.glb","c84b67d807f1"],["models/drone.webp","96b2eb63f209"],["models/folk.glb","f607b1fb89e6"],["models/folk.webp","a1287eac4510"],["models/foreman.glb","693f56622ad7"],["models/foreman.webp","4ba5b7b1e387"],["models/fparms.glb","cb7f9a03a4a3"],["models/fparms.webp","d959c16510f3"],["models/guns.glb","0aae2b0fbc4a"],["models/guns.webp","6e5c71255a33"],["models/mite.glb","d6bd16fb4d8f"],["models/mite.webp","890e0a292029"],["models/pallet.glb","bfa0fd17ba4e"],["models/pallet.webp","19a1d60215fc"],["models/riveter.glb","8a9a560673d8"],["models/riveter.webp","f7a8edc15104"],["models/rook.glb","06abe99ae9b7"],["models/rook.webp","68685891044c"],["models/sentry.glb","369b27d1cc55"],["models/sentry.webp","a0ef30b83a5d"],["models/spears.glb","e955f9717830"],["models/spears.webp","c7336a8cced1"],["models/swords.glb","2d69fd4796ee"],["models/swords.webp","4b1544b8ffce"],["models/titan.glb","30815536f43f"],["models/titan.webp","c1a270afb52c"],["models/warden.glb","2dcddce8e000"],["models/warden.webp","93972c440829"],["models/welder.glb","2e4803f22e4d"],["models/welder.webp","64890d050ca5"],["models/world/kit.glb","6d49989dc11c"],["tex/k/albedo-256.ktx2","255d0b193dfe"],["tex/k/normal-256.ktx2","39c99c6b53b8"],["ui/robot-drone.webp","27650ae5d2f4"],["ui/robot-foreman.webp","9ed68166c696"],["ui/robot-mite.webp","d7be89d15672"],["ui/robot-pallet.webp","21fc67ccd8b6"],["ui/robot-riveter.webp","999753edf645"],["ui/robot-sentry.webp","4668c6476ec3"],["ui/robot-titan.webp","d02d23879deb"],["ui/robot-warden.webp","202362b0ee64"],["ui/robot-welder.webp","1ba4739f5325"],["ui/rook.webp","439a1a76b077"]];
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
