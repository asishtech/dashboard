/*
 * V-TAPP service worker.
 *
 * The fest runs in halls where the network is unreliable, and the one
 * thing that cannot wait for a signal is admitting somebody at a gate
 * with a queue behind them.
 *
 * Two jobs:
 *
 *   1. Keep the app openable with no network. The shell and the built
 *      assets are cached, so the scanner loads rather than showing a
 *      dinosaur.
 *
 *   2. Never cache anything that would be wrong later. API responses
 *      are registration data; serving a stale one would tell a
 *      volunteer somebody had not collected merchandise they had.
 *      Those go to the network only.
 */

const VERSION = "vtapp-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

/* Opened first so the scanner works from a cold start on no network. */
const PRECACHE = ["/volunteer", "/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) =>
        /*
         * addAll rejects the whole batch if any one request fails, and
         * a proxy redirect on one route would then leave nothing
         * cached at all.
         */
        Promise.allSettled(
          PRECACHE.map((url) =>
            fetch(url, { credentials: "same-origin" }).then((response) =>
              response.ok ? cache.put(url, response) : null
            )
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/*
 * Cache-first is only safe for a URL that can never mean something
 * different later. Build output under /_next/static is content-hashed,
 * so it qualifies. A bare *.css match did not: in development
 * Turbopack reuses one filename across edits, and the worker pinned a
 * stale stylesheet that no restart could shift.
 */
function isAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    /\.(woff2?|png|svg|ico|jpg|jpeg|webp)$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  /*
   * Anything under /api is live data. A cached answer here is not
   * stale, it is wrong: it would show a pass as uncollected after it
   * had been handed over. The app has its own offline handling for
   * these, which needs the request to genuinely fail.
   */
  if (url.pathname.startsWith("/api/")) return;

  /* Auth must never be served from a cache. */
  if (
    url.pathname.startsWith("/auth/") ||
    url.pathname === "/login"
  ) {
    return;
  }

  /*
   * Build output is content-hashed, so a cache hit can never be the
   * wrong version. Cache first: this is most of what a page load
   * costs on a slow connection.
   */
  if (isAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }

            return response;
          })
      )
    );

    return;
  }

  /*
   * Pages: network first, so a working connection always wins and
   * nobody sees yesterday's screen. The cache is the fallback, and the
   * offline page is the fallback to that.
   */
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL).then((c) => c.put(request, copy));
        }

        return response;
      })
      .catch(() =>
        caches
          .match(request)
          .then((hit) => hit || caches.match("/offline"))
          .then(
            (hit) =>
              hit ||
              new Response(
                "<h1>Offline</h1><p>No cached copy of this page.</p>",
                { headers: { "Content-Type": "text/html" } }
              )
          )
      )
  );
});
