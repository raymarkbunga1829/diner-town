/**
 * Offline cache for Diner Town.
 *
 * Vite fingerprints its output, which splits every URL this site serves into two
 * kinds. `assets/index-DlPaTXX-.js` is a promise about its bytes: the name
 * changes when the contents do, so it can be answered from the cache forever and
 * never touch the network. The shell (`./`, `index.html`), this worker and the
 * web manifest keep the same URL across every deploy, so a cached copy of one of
 * those is how a browser ends up running last week's bundle. Those go to the
 * network first and only fall back to the cache when there is no network at all.
 *
 * Bump CACHE whenever this file changes. `activate` deletes every other cache,
 * so the bump is what evicts a shell an older worker had cached.
 */

const CACHE = 'diner-town-v2';

/** Directory this worker is scoped to: `/` on a domain root, `/diner-town/` on Pages. */
const SCOPE = new URL('./', self.location.href).pathname;

/** Scope-relative paths whose contents change without their URL changing. */
const SHELL = ['', 'index.html', 'sw.js', 'manifest.webmanifest'];

/** `assets/index-DlPaTXX-.js`, `assets/index-a1b2c3d4.css`: hashed, so disposable. */
const FINGERPRINTED = /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

function scopeRelative(pathname, scope) {
  return pathname.startsWith(scope) ? pathname.slice(scope.length) : pathname.replace(/^\/+/, '');
}

/**
 * Which strategy a same-origin GET gets. A plain function of its arguments so
 * `tools/checks.ts` can assert the routing table without a browser.
 */
function strategyFor(pathname, mode, scope = SCOPE) {
  if (mode === 'navigate') return 'network-first';
  const path = scopeRelative(pathname, scope);
  if (SHELL.includes(path)) return 'network-first';
  return FINGERPRINTED.test(path) ? 'cache-first' : 'network-first';
}

/**
 * The fingerprinted, same-origin files a built `index.html` points at. Their
 * names are only known after a build, so the precache list is read off the shell
 * instead of being written down here.
 */
function shellAssets(html, base = self.location.href) {
  const origin = new URL(base).origin;
  const scope = new URL('./', base).pathname;
  const found = new Set();
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    let url;
    try {
      url = new URL(match[1], base);
    } catch {
      continue;
    }
    if (url.origin !== origin) continue;
    if (strategyFor(url.pathname, 'no-cors', scope) === 'cache-first') found.add(url.pathname);
  }
  return [...found];
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(warmCache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    strategyFor(url.pathname, request.mode) === 'cache-first'
      ? cacheFirst(event)
      : networkFirst(event),
  );
});

/**
 * Take a fresh shell and the assets it names, bypassing the HTTP cache, so a new
 * worker starts from the deploy that installed it rather than inheriting whatever
 * the last one happened to have kept.
 */
async function warmCache() {
  const cache = await caches.open(CACHE);
  let html;
  try {
    const response = await fetch('./', { cache: 'reload' });
    // A response that arrived via a redirect cannot be replayed for a navigation.
    if (!response.ok || response.redirected) return;
    html = await response.clone().text();
    await cache.put('./index.html', response.clone());
    await cache.put('./', response);
  } catch {
    // Installed with no network. The fetch handler fills the cache in later.
    return;
  }
  await Promise.all(shellAssets(html).map((path) => warmAsset(cache, path)));
}

async function warmAsset(cache, path) {
  try {
    const response = await fetch(path, { cache: 'reload' });
    if (response.ok && !response.redirected) await cache.put(path, response);
  } catch {
    // Best effort: a missed asset is fetched on demand instead.
  }
}

/** Hashed assets: the cache is authoritative, so the network is a last resort. */
async function cacheFirst(event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(event.request);
  if (hit) return hit;

  const response = await fetch(event.request);
  if (response.ok) event.waitUntil(cache.put(event.request, response.clone()));
  return response;
}

/** Everything else: the network decides, and the cache is the offline fallback. */
async function networkFirst(event) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(event.request);
    if (response.ok && !response.redirected) {
      event.waitUntil(cache.put(event.request, response.clone()));
    }
    return response;
  } catch (offline) {
    const hit = await cache.match(event.request);
    if (hit) return hit;
    if (event.request.mode === 'navigate') {
      const shell = (await cache.match('./index.html')) ?? (await cache.match('./'));
      if (shell) return shell;
    }
    throw offline;
  }
}
