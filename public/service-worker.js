/* public/service-worker.js */
/* CRA build offline support (app shell + hashed assets) */

const CACHE_NAME = "du-estimator-shell-v3"; // bump this when you deploy changes

// Always cache these
const CORE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/asset-manifest.json",
];

// Helper: add URLs safely (some may not exist in dev)
async function safeAddAll(cache, urls) {
  const results = await Promise.allSettled(
    urls.map((u) => cache.add(u))
  );
  // ignore failures (ex: manifest missing)
  return results;
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // 1) Cache core files
    await safeAddAll(cache, CORE_URLS);

    // 2) Cache CRA build assets from asset-manifest.json
    try {
      const res = await fetch("/asset-manifest.json", { cache: "no-store" });
      if (res.ok) {
        const manifest = await res.json();

        // CRA manifest has "files" and optionally "entrypoints"
        const files = manifest.files ? Object.values(manifest.files) : [];
        const entrypoints = manifest.entrypoints || [];

        const all = [...files, ...entrypoints]
          .filter(Boolean)
          .map((p) => (typeof p === "string" ? p : ""))
          .filter((p) => p.startsWith("/"));

        // Cache them all
        await safeAddAll(cache, Array.from(new Set(all)));
      }
    } catch {
      // ignore
    }

    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only same-origin
  if (url.origin !== self.location.origin) return;

  // SPA navigations: network-first, fallback to cached index.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Static: cache-first, then network
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const res = await fetch(req);
      if (req.method === "GET" && res && res.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, res.clone());
      }
      return res;
    } catch {
      // If offline and not cached, just fail normally
      return cached;
    }
  })());
});
