/**
 * PHASE 9.7 — PWA manifest configuration tests (node:test).
 *
 * Exercises the PURE manifest module (`features/pwa/manifest.ts`): the
 * generated manifest is valid, required-field validation behaves predictably,
 * and start-URL handling never hardcodes an environment path.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildWebManifest,
  validateWebManifest,
  PWA_APP_NAME,
  PWA_APP_SHORT_NAME,
  type PwaManifest,
} from "../../features/pwa/manifest.ts";

describe("buildWebManifest", () => {
  it("produces a valid PWA configuration", () => {
    const manifest = buildWebManifest();
    assert.deepEqual(validateWebManifest(manifest), []);
    assert.equal(manifest.name, PWA_APP_NAME);
    assert.equal(manifest.short_name, PWA_APP_SHORT_NAME);
    assert.equal(manifest.display, "standalone");
    assert.equal(manifest.start_url, "/");
    assert.equal(manifest.theme_color, "#18181b");
  });

  it("includes 192x192 and 512x512 icons", () => {
    const manifest = buildWebManifest();
    const sizes = manifest.icons.map((icon) => icon.sizes);
    assert.ok(sizes.includes("192x192"));
    assert.ok(sizes.includes("512x512"));
  });

  it("is deterministic: identical input produces identical output", () => {
    assert.deepEqual(buildWebManifest(), buildWebManifest());
  });
});

describe("validateWebManifest", () => {
  it("reports missing required fields safely", () => {
    const problems = validateWebManifest({});
    assert.ok(problems.some((problem) => /`name` is required/.test(problem)));
    assert.ok(
      problems.some((problem) => /`short_name` is required/.test(problem))
    );
    assert.ok(
      problems.some((problem) => /`start_url` is required/.test(problem))
    );
  });

  it("rejects an invalid start URL", () => {
    const base = buildWebManifest();
    const problems = validateWebManifest({
      ...base,
      start_url: "not-a-url",
    });
    assert.ok(
      problems.some((problem) => /`start_url`/.test(problem))
    );
  });

  it("accepts an absolute HTTPS start URL (environment-independent)", () => {
    const base = buildWebManifest();
    const problems = validateWebManifest({
      ...base,
      start_url: "https://hris.example.com/",
    });
    assert.equal(problems.length, 0);
  });

  it("requires both 192x192 and 512x512 icons", () => {
    const base = buildWebManifest();
    const only192: PwaManifest = {
      ...base,
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    };
    const only512: PwaManifest = {
      ...base,
      icons: [{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }],
    };
    const missing192 = validateWebManifest(only512);
    const missing512 = validateWebManifest(only192);
    assert.ok(missing192.some((problem) => /192x192/.test(problem)));
    assert.ok(missing512.some((problem) => /512x512/.test(problem)));
  });
});
