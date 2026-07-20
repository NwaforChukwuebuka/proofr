/**
 * Shell-only service worker. Must NOT intercept Next.js navigations, RSC
 * payloads, HMR, or API routes — doing so causes infinite document reload
 * loops in App Router (especially when a fetch fails and we return the
 * wrong cached HTML).
 */
const CACHE_NAME = "proofr-shell-v2";
const SHELL_URLS = ["/manifest.json", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Same-origin only; never touch Supabase or other third parties.
  if (url.origin !== self.location.origin) return;

  // Let the browser/network handle Next internals, APIs, and page navigations.
  if (
    url.pathname.startsWith("/_next/")
    || url.pathname.startsWith("/api/")
    || event.request.mode === "navigate"
    || event.request.headers.get("RSC") === "1"
    || event.request.headers.get("Next-Router-Prefetch") === "1"
  ) {
    return;
  }

  // Cache-first only for known static shell assets.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
