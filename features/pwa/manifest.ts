/**
 * PWA manifest configuration (PHASE 9.7) — PURE module.
 *
 * No Next.js/server/browser imports: both the `app/manifest.ts` metadata route
 * and the `node:test` suite import this module.
 *
 * Branding reuses the application's existing identity: the sidebar wordmark
 * ("Enterprise HRIS") and the brand tile color from `app/globals.css`
 * (`--primary: #18181b`, `--background: #ffffff`).
 *
 * `start_url` is intentionally `/` so the same manifest works for local
 * development, a sub-path production deployment that keeps the app at its
 * origin root, and Vercel-style deployments. No environment path is hardcoded.
 */

export const PWA_APP_NAME = "Enterprise HRIS";
export const PWA_APP_SHORT_NAME = "HRIS";
export const PWA_APP_DESCRIPTION =
  "Enterprise HRIS — a human resource information system for employee records, attendance, leave, and payroll.";
export const PWA_THEME_COLOR = "#18181b";
export const PWA_BACKGROUND_COLOR = "#ffffff";
export const PWA_START_URL = "/";
export const PWA_DISPLAY = "standalone";

export interface PwaIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

export interface PwaManifest {
  name: string;
  short_name: string;
  description?: string;
  start_url: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: PwaIcon[];
}

/** Manifest icons referenced from the app origin (`/icons/...`). */
export const PWA_ICONS: readonly PwaIcon[] = [
  {
    src: "/icons/icon-192.png",
    sizes: "192x192",
    type: "image/png",
    purpose: "any",
  },
  {
    src: "/icons/icon-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "any maskable",
  },
];

/** Deterministic web manifest used by the metadata route. */
export function buildWebManifest(): PwaManifest {
  return {
    name: PWA_APP_NAME,
    short_name: PWA_APP_SHORT_NAME,
    description: PWA_APP_DESCRIPTION,
    start_url: PWA_START_URL,
    display: PWA_DISPLAY,
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [...PWA_ICONS],
  };
}

/**
 * Validate a manifest object and return human-readable problems.
 *
 * Installability requirements (where the browser supports install) need at
 * least a 192px and a 512px icon and a resolvable absolute-or-root start URL.
 * Missing optional fields are not problems; required fields are.
 */
export function validateWebManifest(
  manifest: Partial<PwaManifest>
): string[] {
  const problems: string[] = [];

  if (!manifest.name || manifest.name.trim() === "") {
    problems.push("Manifest `name` is required.");
  }
  if (!manifest.short_name || manifest.short_name.trim() === "") {
    problems.push("Manifest `short_name` is required.");
  }
  if (!manifest.start_url || manifest.start_url.trim() === "") {
    problems.push("Manifest `start_url` is required.");
  } else if (!/^\/(?!\/)/.test(manifest.start_url)) {
    // Must be a root-relative URL (e.g. "/") or an absolute http(s) URL.
    const isAbsoluteUrl = /^https?:\/\//i.test(manifest.start_url);
    if (!isAbsoluteUrl) {
      problems.push("Manifest `start_url` must be a valid absolute or root-relative URL.");
    }
  }
  if (!manifest.display || manifest.display.trim() === "") {
    problems.push("Manifest `display` is required.");
  }
  if (!manifest.background_color || manifest.background_color.trim() === "") {
    problems.push("Manifest `background_color` is required.");
  }
  if (!manifest.theme_color || manifest.theme_color.trim() === "") {
    problems.push("Manifest `theme_color` is required.");
  }

  const icons = manifest.icons ?? [];
  const sizes = icons.map((icon) => icon.sizes);
  if (!sizes.some((size) => size === "192x192")) {
    problems.push("Manifest requires an icon sized 192x192.");
  }
  if (!sizes.some((size) => size === "512x512")) {
    problems.push("Manifest requires an icon sized 512x512.");
  }

  return problems;
}
