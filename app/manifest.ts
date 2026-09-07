import type { MetadataRoute } from "next";

import { buildWebManifest } from "@/features/pwa/manifest";

/**
 * PWA web manifest (Phase 9.7). Served by Next.js at /manifest.webmanifest.
 * The object comes from the pure PWA module so it can be validated by tests.
 */
export default function manifest(): MetadataRoute.Manifest {
  // buildWebManifest() keeps a looser `display: string` for the pure validator;
  // the generated manifest is statically "standalone".
  return buildWebManifest() as MetadataRoute.Manifest;
}
