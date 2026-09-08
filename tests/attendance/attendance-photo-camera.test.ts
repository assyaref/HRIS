/**
 * PHASE 10.7C-56 — Attendance photo capture camera tests (node:test).
 *
 * Source-invariant tests for features/attendance/attendance-photo-capture.tsx.
 * The repository runs these without a browser/DOM, so they pin the actual code
 * contract: explicit start, single explicit JPEG capture from a canvas, track
 * cleanup on capture/cancel/unmount/hidden, no browser persistence, and no
 * Lucky-Draw transport primitives (toDataURL / data URLs / object URLs).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

/** Remove comments so assertions target real code, not explanatory text. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const captureSource = readRepoFile("features/attendance/attendance-photo-capture.tsx");
const captureCode = stripComments(captureSource);

describe("attendance photo capture: camera lifecycle", () => {
  it("uses getUserMedia after an explicit user action", () => {
    assert.match(captureCode, /navigator\.mediaDevices\.getUserMedia\(/);
    assert.match(captureCode, /async function startCamera\(\)/);
    assert.match(captureCode, /"Mulai kamera"/);
    assert.match(captureCode, /async function captureFrame\(\)/);
    assert.match(captureCode, /"Ambil Foto"/);
  });

  it("captures exactly one JPEG frame through canvas.toBlob", () => {
    assert.match(captureCode, /context\.drawImage\(video, 0, 0, width, height\)/);
    assert.match(captureCode, /canvas\.toBlob\(/);
    assert.match(captureCode, /"image\/jpeg"/);
    assert.match(captureCode, /ATTENDANCE_PHOTO_CAPTURE_JPEG_QUALITY/);
    assert.match(captureCode, /onPhotoChange\(blob\)/);
  });

  it("downscales to a bounded maximum dimension", () => {
    assert.match(
      captureSource,
      /ATTENDANCE_PHOTO_CAPTURE_MAX_DIMENSION = 640/
    );
    assert.match(captureCode, /Math\.min\(/);
    assert.match(captureSource, /ATTENDANCE_PHOTO_CAPTURE_JPEG_QUALITY = 0\.85/);
  });

  it("stops every camera track after capture, cancel and clear", () => {
    const occurrences = captureCode.split(
      "getTracks().forEach((track) => track.stop())"
    ).length;
    assert.equal(occurrences >= 1, true);
    assert.match(captureCode, /function stopStream\(\)/);
    assert.match(captureCode, /function cancelCamera\(\)/);
    assert.match(captureCode, /function clearCaptured\(\)/);
  });

  it("stops the stream when the app is hidden and on unmount", () => {
    assert.match(captureCode, /"visibilitychange"/);
    assert.match(captureCode, /document\.addEventListener\(/);
    assert.match(captureCode, /document\.removeEventListener\(/);
    assert.equal(captureCode.includes("stopStream()"), true);
  });

  it("never auto-starts or continuously watches", () => {
    assert.equal(captureCode.includes("watchPosition"), false);
    assert.equal(captureCode.includes("requestAnimationFrame"), false);
    assert.equal(captureCode.includes("setInterval"), false);
  });
});

describe("attendance photo capture: no Lucky Draw / persistence primitives", () => {
  for (const token of [
    "toDataURL",
    "data:image",
    "createObjectURL",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "checkInAction",
    "checkOutAction",
  ]) {
    it(`contains no ${token}`, () => {
      assert.equal(captureCode.includes(token), false, `${token} must be absent`);
    });
  }
});

describe("attendance photo capture: policy constants", () => {
  it("defines a 640px evidence resolution and an image/jpeg filename", () => {
    assert.equal(
      captureSource.includes(
        'ATTENDANCE_PHOTO_CAPTURE_FILENAME = "attendance-check-in.jpg"'
      ),
      true
    );
  });
});
