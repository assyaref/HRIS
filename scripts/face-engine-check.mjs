// PHASE 10.2 — REAL face-engine validation (opt-in, not part of `npm test`).
//
// Proves @vladmandic/human + tfjs WASM genuinely detect faces and produce
// 1024-d embeddings on real fixtures in this runtime. Run manually or in CI
// where the engine is expected to be available:
//
//   node scripts/face-engine-check.mjs
//
// It performs no faking: the assertions fail unless the engine truly returns
// 1 face (portrait), 0 faces (no-face), and >= 2 faces (two-faces).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";

import jpeg from "jpeg-js";

const require = createRequire(import.meta.url);

function fail(message) {
  console.error(`FACE ENGINE CHECK FAILED: ${message}`);
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

if (!readFileSync || !modelsPath || !wasmDir || !humanDist || !fixtures) {
  fail("engine paths could not be resolved");
}

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
      minSize: 32,
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

await human.load();

async function analyze(file) {
  const buffer = readFileSync(path.join(fixtures, file));
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
    return {
      faces: (result?.face ?? []).map((face) => ({
        score: face.score,
        embeddingLength: (face.embedding ?? []).length,
      })),
    };
  } finally {
    human.tf.dispose(tensor);
  }
}

console.log("Human version:", human.version);

// 1) portrait: exactly one face with a non-empty 1024-d embedding.
const portrait = await analyze("portrait.jpg");
if (portrait.faces.length !== 1) {
  fail(`portrait.jpg expected 1 face, got ${portrait.faces.length}`);
}
const embeddingLength = portrait.faces[0]?.embeddingLength ?? 0;
if (embeddingLength !== 1024) {
  fail(`portrait.jpg expected a 1024-d embedding, got ${embeddingLength}`);
}
if (portrait.faces[0].score < 0.5) {
  fail(`portrait.jpg face score too low: ${portrait.faces[0].score}`);
}
console.log("portrait.jpg: 1 face, 1024-d embedding — OK");

// 2) no-face: a synthetic gradient must yield zero faces.
const noFace = await analyze("no-face.jpg");
if (noFace.faces.length !== 0) {
  fail(`no-face.jpg expected 0 faces, got ${noFace.faces.length}`);
}
console.log("no-face.jpg: 0 faces — OK");

// 3) two-faces: two stitched portraits must yield at least two detections.
const twoFaces = await analyze("two-faces.jpg");
if (twoFaces.faces.length < 2) {
  fail(`two-faces.jpg expected >= 2 faces, got ${twoFaces.faces.length}`);
}
console.log("two-faces.jpg: >= 2 faces — OK");

console.log("FACE ENGINE CHECK PASSED");
process.exit(0);
