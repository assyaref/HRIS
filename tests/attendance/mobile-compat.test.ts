/**
 * PHASE 9.7 — Mobile/PWA compatibility pure-logic tests (node:test).
 *
 * Exercises `features/attendance/mobile-compat.ts`: camera error
 * classification, offline/network presentation, and transient GPS state
 * reset. No browser APIs, no GPS hardware, no camera.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  NETWORK_REQUIRED_MESSAGE,
  classifyCameraErrorName,
  isBrowserOffline,
  shouldResetGpsStateOnHidden,
} from "../../features/attendance/mobile-compat.ts";

describe("classifyCameraErrorName", () => {
  it("classifies camera permission denial", () => {
    assert.equal(classifyCameraErrorName("NotAllowedError"), "denied");
    assert.equal(classifyCameraErrorName("PermissionDeniedError"), "denied");
  });

  it("classifies camera unavailable states", () => {
    assert.equal(classifyCameraErrorName("NotFoundError"), "unavailable");
    assert.equal(classifyCameraErrorName("DevicesNotFoundError"), "unavailable");
    assert.equal(classifyCameraErrorName("NotReadableError"), "unavailable");
    assert.equal(classifyCameraErrorName("TrackStartError"), "unavailable");
  });

  it("degrades unknown/unexpected camera errors safely", () => {
    assert.equal(classifyCameraErrorName("SomeInternalError"), "unknown");
    assert.equal(classifyCameraErrorName(undefined), "unknown");
    assert.equal(classifyCameraErrorName(null), "unknown");
    assert.equal(classifyCameraErrorName(""), "unknown");
  });

  it("is deterministic for identical input", () => {
    const names = ["NotAllowedError", "NotFoundError", "NotReadableError", "x"];
    for (const name of names) {
      assert.equal(classifyCameraErrorName(name), classifyCameraErrorName(name));
    }
  });
});

describe("network availability", () => {
  it("reports offline only when the browser says it is offline", () => {
    assert.equal(isBrowserOffline(false), true);
    assert.equal(isBrowserOffline(true), false);
    assert.equal(isBrowserOffline(undefined), false);
    assert.equal(isBrowserOffline(null), false);
  });

  it("keeps the offline attendance message in Indonesian and never queues", () => {
    assert.match(NETWORK_REQUIRED_MESSAGE, /koneksi internet/i);
    assert.match(NETWORK_REQUIRED_MESSAGE, /absensi/i);
    // No offline queue wording: attendance always needs the server chain.
    assert.doesNotMatch(NETWORK_REQUIRED_MESSAGE, /terkirim kemudian|antre/i);
  });
});

describe("transient state reset", () => {
  it("resets requesting/retrying GPS states when hidden", () => {
    assert.equal(shouldResetGpsStateOnHidden("requesting"), true);
    assert.equal(shouldResetGpsStateOnHidden("retrying"), true);
  });

  it("keeps terminal or settled states untouched", () => {
    assert.equal(shouldResetGpsStateOnHidden("idle"), false);
    assert.equal(shouldResetGpsStateOnHidden("acquired"), false);
    assert.equal(shouldResetGpsStateOnHidden("denied"), false);
    assert.equal(shouldResetGpsStateOnHidden("timeout"), false);
    assert.equal(shouldResetGpsStateOnHidden("unavailable"), false);
  });
});
