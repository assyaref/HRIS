"use client";

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/sw.js";

/**
 * Minimal, safe service-worker registration (Phase 9.7).
 *
 * Registered ONLY in production builds on secure contexts (HTTPS or
 * localhost). The service worker itself is network-only: it never caches
 * authenticated, private, or attendance responses. Dynamic data stays
 * network-authoritative; offline attendance is never queued.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    navigator.serviceWorker.register(SERVICE_WORKER_PATH).catch(() => {
      // Registration is best-effort. Installability where unsupported must
      // never block the responsive web app or attendance.
    });
  }, []);

  return null;
}
