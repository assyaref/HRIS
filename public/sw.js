/**
 * Minimal safe service worker (Phase 9.7).
 *
 * Strategy: NETWORK-ONLY.
 * - Registers a fetch handler so browsers can treat the app as installable.
 * - Never caches authentication, attendance, assignment, work-location,
 *   payroll, or any private/authenticated response.
 * - No offline attendance queue: every request stays network-authoritative and
 *   the full server validation chain (auth → RBAC → assignment → project →
 *   work location → geofence) is always required.
 * - If the network is unavailable, fetches fail and the UI surfaces the
 *   Indonesian "koneksi internet diperlukan" guidance with a retry.
 */

/* global self */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-only passthrough. Nothing is read from or written to a cache.
  event.respondWith(fetch(event.request));
});
