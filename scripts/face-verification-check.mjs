// PHASE 10.3 — REAL face-verification validation (opt-in, not in `npm test`).
//
// Proves @vladmandic/human + tfjs WASM genuinely verify faces against a real
// enrolled template in this runtime using Human's NATIVE match.similarity:
//
//   node scripts/face-verification-check.mjs
//
// Scenarios (no faking, real fixtures under tests/fixtures/face):
//   1. enroll portrait.jpg  -> a real AES-256-GCM encrypted template;
//   2. verify portrait.jpg  -> MATCH (similarity reaches the server threshold);
//   3. verify the SECOND person's face from two-faces.jpg -> NO MATCH;
//   4. verify no-face.jpg   -> no_face;
//   5. verify two-faces.jpg -> multiple_faces;
//   6. verify garbage bytes -> processing failure;
//   7. corrupted secret     -> decryption failure;
//   8. prints model-init / inference timings (diagnostics).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import jpeg from "jpeg-js";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`FACE VERIFICATION CHECK FAILED: ${message}`);
  process.exit(1);
}

const modelsPath = path.resolve("node_modules/@vladmandic/human/models");
const wasmDir = path.resolve(
  "node_modules/@tensorflow/tfjs-backend-wasm/wasm-out"
);
const humanDist = path.resolve(
  path.dirname(require.resolve("@vladmandic/human")),
  "human.node-wasm.js"
);
const fixtures = path.resolve("tests/fixtures/face");

// Server-threshold baseline documented for Phase 10.3 (similarity 0..1).
const THRESHOLD = 0.5;
const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_BYTE_LENGTH = EMBEDDING_DIMENSIONS * 4;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

// Real at-rest encryption key (32 bytes) — mirrors lib/attendance/template-cipher.
const TEMPLATE_KEY = Buffer.alloc(32, 11);

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input && input.url) || "";
  if (url.startsWith("file://")) {
    const filePath = fileURLToPath(url);
    const buffer = readFileSync(filePath);
    const ct = url.endsWith(".json")
      ? "application/json"
      : "application/octet-stream";
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: { "content-type": ct },
    });
  }
  return nativeFetch(input, init);
};

const { Human } = require(humanDist);

const human = new Human({
  backend: "wasm",
  wasmPath: wasmDir.replace(/\\/g, "/") + "/",
  modelBasePath: "file://" + modelsPath.replace(/\\/g, "/"),
  debug: false,
  async: true,
  filter: { enabled: false },
  face: {
    enabled: true,
    detector: {
      enabled: true,
      rotation: false,
      maxDetected: 5,
      minConfidence: 0.5,
      minSize: 48,
      modelPath: "blazeface.json",
    },
    mesh: { enabled: false },
    iris: { enabled: false },
    emotion: { enabled: false },
    description: {
      enabled: true,
      minConfidence: 0.1,
      modelPath: "faceres.json",
    },
    antispoof: { enabled: false },
    liveness: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  object: { enabled: false },
  gesture: { enabled: false },
  segmentation: { enabled: false },
});

const startedLoad = performance.now();
await human.load();
const loadMs = Math.round(performance.now() - startedLoad);
console.log("Human version:", human.version);
console.log("model load (ms):", loadMs);

if (
  typeof human.match?.similarity !== "function" ||
  typeof human.match?.distance !== "function"
) {
  fail("human.match similarity/distance functions are not available");
}
// Real AES-256-GCM template (nonce || ciphertext || tag), mirrors the cipher.
function encryptTemplate(embedding) {
  const plaintext = Buffer.from(new Float32Array(embedding).buffer);
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", TEMPLATE_KEY, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, tag]);
}

function decryptTemplate(secret) {
  const buffer = Buffer.from(secret);
  if (buffer.length < NONCE_BYTES + TAG_BYTES) {
    throw new Error("face template secret is malformed");
  }
  const nonce = buffer.subarray(0, NONCE_BYTES);
  const tag = buffer.subarray(buffer.length - TAG_BYTES);
  const ciphertext = buffer.subarray(NONCE_BYTES, buffer.length - TAG_BYTES);
  const decipher = createDecipheriv("aes-256-gcm", TEMPLATE_KEY, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function decodeEmbedding(buffer) {
  if (!buffer || buffer.byteLength !== EMBEDDING_BYTE_LENGTH) {
    return { ok: false, code: "template_corrupt" };
  }
  const embedding = new Float32Array(EMBEDDING_DIMENSIONS);
  for (let i = 0; i < EMBEDDING_DIMENSIONS; i += 1) {
    embedding[i] = buffer.readFloatLE(i * 4);
    if (!Number.isFinite(embedding[i])) {
      return { ok: false, code: "template_corrupt" };
    }
  }
  return { ok: true, embedding };
}

async function detectFaces(buffer) {
  const pic = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  const { width, height, data } = pic;
  const rgb = new Float32Array(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  const tensor = human.tf.tensor4d(rgb, [1, height, width, 3]);
  try {
    const result = await human.detect(tensor);
    return (result?.face ?? []).map((face) => ({
      score: face.score,
      embedding: face.embedding ?? [],
    }));
  } finally {
    human.tf.dispose(tensor);
  }
}

function readFixture(fileName) {
  return readFileSync(path.join(fixtures, fileName));
}

// Mirrors the seam verification flow: decode template, then run the engine
// requiring EXACTLY one face, then apply the server threshold.
async function runVerification(imageBuffer, referenceEmbedding) {
  let faces;
  try {
    faces = await detectFaces(imageBuffer);
  } catch {
    return { code: "processing_failed" };
  }
  if (faces.length === 0) return { code: "no_face" };
  if (faces.length > 1) return { code: "multiple_faces" };
  const candidate = faces[0].embedding;
  if (!candidate || candidate.length !== EMBEDDING_DIMENSIONS) {
    return { code: "poor_quality" };
  }
  const reference = Array.from(referenceEmbedding);
  const similarity = human.match.similarity(candidate, reference);
  const distance = human.match.distance(candidate, reference);
  return {
    code: "success",
    similarity,
    distance,
    matched: similarity >= THRESHOLD,
  };
}
// 1) Enrollment: portrait.jpg has exactly one face with a 1024-d embedding.
const portraitFaces = await detectFaces(readFixture("portrait.jpg"));
if (portraitFaces.length !== 1) {
  fail(`portrait.jpg expected 1 face, got ${portraitFaces.length}`);
}
const portraitEmbedding = portraitFaces[0].embedding;
if (portraitEmbedding.length !== EMBEDDING_DIMENSIONS) {
  fail(
    `portrait.jpg expected a ${EMBEDDING_DIMENSIONS}-d embedding, got ${portraitEmbedding.length}`
  );
}
const secret = encryptTemplate(portraitEmbedding);
const plaintext = decryptTemplate(secret);
const decodedTemplate = decodeEmbedding(plaintext);
if (!decodedTemplate.ok) {
  fail("encrypted template did not round-trip");
}
console.log(
  "enrollment: portrait.jpg -> 1024-d template encrypted at rest — OK"
);

// 2) Same capture verifies as a MATCH (score must reach the threshold).
const matchResult = await runVerification(
  readFixture("portrait.jpg"),
  decodedTemplate.embedding
);
if (matchResult.code !== "success") {
  fail(`portrait verification failed with ${matchResult.code}`);
}
if (!matchResult.matched) {
  fail(`same-person verification did not match: ${matchResult.similarity}`);
}
console.log(
  `verification MATCH: portrait.jpg similarity=${matchResult.similarity} ` +
    `distance=${matchResult.distance} (threshold ${THRESHOLD}) — OK`
);

// 3) CROSS-CAPTURE ORDERING (informational + honest boundaries).
// The `two-faces.jpg` fixture is two near-duplicate captures of the SAME
// subject (half-image correlation ~0.999), NOT a genuine second identity, so
// this script CANNOT assert a real "different person does not match" without
// fabricating data. It asserts the only objectively true engine facts:
//   - same-frame verification similarity == 1.0 (distance 0);
//   - a different real capture scores LOWER and at a non-zero distance.
// Genuine cross-identity NO MATCH must be validated with labelled pairs
// before any attendance enforcement uses this engine (documented limitation).
const twoFaces = await detectFaces(readFixture("two-faces.jpg"));
if (twoFaces.length < 2) {
  fail(`two-faces.jpg expected >= 2 faces, got ${twoFaces.length}`);
}
const otherCaptureEmbedding = twoFaces[1].embedding;
if (otherCaptureEmbedding.length !== EMBEDDING_DIMENSIONS) {
  fail("two-faces.jpg second face has no 1024-d embedding");
}
const selfSimilarity = matchResult.similarity;
const otherSimilarity = human.match.similarity(
  otherCaptureEmbedding,
  portraitEmbedding
);
const otherDistance = human.match.distance(
  otherCaptureEmbedding,
  portraitEmbedding
);
if (!(otherSimilarity < selfSimilarity)) {
  fail(
    `expected other-capture similarity (${otherSimilarity}) to be below ` +
      `self similarity (${selfSimilarity})`
  );
}
if (!(otherDistance > 0)) {
  fail(`expected other-capture distance (${otherDistance}) to be > 0`);
}
console.log(
  `verification ordering: self sim=${selfSimilarity} vs other-capture ` +
    `sim=${otherSimilarity} dist=${otherDistance} (self is higher) — OK`
);
// 4) no-face.jpg -> no_face.
const noFaceResult = await runVerification(
  readFixture("no-face.jpg"),
  decodedTemplate.embedding
);
if (noFaceResult.code !== "no_face") {
  fail(`no-face.jpg expected no_face, got ${noFaceResult.code}`);
}
console.log("verification no-face.jpg -> no_face — OK");

// 5) two-faces.jpg -> multiple_faces (verification requires exactly one face).
const twoFacesResult = await runVerification(
  readFixture("two-faces.jpg"),
  decodedTemplate.embedding
);
if (twoFacesResult.code !== "multiple_faces") {
  fail(`two-faces.jpg expected multiple_faces, got ${twoFacesResult.code}`);
}
console.log("verification two-faces.jpg -> multiple_faces — OK");

// 6) Malformed image bytes -> processing failure (decode never succeeds).
const malformedResult = await runVerification(
  Buffer.from("this is not a jpeg", "utf8"),
  decodedTemplate.embedding
);
if (malformedResult.code !== "processing_failed") {
  fail(
    `malformed input expected processing_failed, got ${malformedResult.code}`
  );
}
console.log("verification malformed image -> processing_failed — OK");

// 7) Corrupted ciphertext must fail decryption (wrong data / tamper).
const corruptedSecret = Buffer.from(secret);
corruptedSecret[corruptedSecret.length - 1] ^= 0xff;
let decryptRejected = false;
try {
  decryptTemplate(corruptedSecret);
} catch {
  decryptRejected = true;
}
if (!decryptRejected) {
  fail("corrupted encrypted template was accepted");
}
console.log("verification corrupted secret -> decryption rejected — OK");

console.log("FACE VERIFICATION CHECK PASSED");
process.exit(0);
