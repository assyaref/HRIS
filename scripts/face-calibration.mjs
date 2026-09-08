// PHASE 10.4 — REAL face-verification calibration tool (opt-in).
//
// Consumes a LABELLED dataset of real face captures and reports genuine vs
// impostor similarity distributions so an operator can choose a threshold
// with evidence instead of guessing. It NEVER fabricates subjects, embeddings,
// or similarity values.
//
// Dataset layout (see /dataset/README.md):
//   dataset/
//     subject-A/
//       genuine-01.jpg
//       genuine-02.jpg
//       ...
//     subject-B/
//       ...
//
// Usage:
//   node scripts/face-calibration.mjs [dataset-path]
//
// Dataset path defaults to the `FACE_CALIBRATION_DATASET` environment variable
// and then to ./dataset at the repository root.
//
// Output contract:
//   - ENGINE / TEMPLATE / METRIC lines;
//   - GENUINE and IMPOSTOR sample counts;
//   - DISTRIBUTION summaries (no statistical claims);
//   - CANDIDATE THRESHOLDS with FAR/FRR;
//   - RECOMMENDATION only when the dataset is large enough to support one;
//   - otherwise: CALIBRATION STATUS: INSUFFICIENT DATA.
//
// The Phase 10.4 policy: with no sufficient labelled dataset the application
// threshold remains the documented NON-PRODUCTION baseline (0.5) and this tool
// never emits a fabricated recommendation.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import jpeg from "jpeg-js";
import {
  percentile,
  evaluateThreshold,
  selectBalancedOperatingPoint,
  canRecommend,
  MIN_SUBJECTS_FOR_REPORT,
  MIN_IMAGES_PER_SUBJECT,
  MIN_PAIRS_FOR_STATS,
  MIN_SUBJECTS_FOR_RECOMMENDATION,
  MIN_PAIRS_FOR_RECOMMENDATION,
  MAX_COMPARISONS,
} from "../lib/attendance/calibration.ts";

const require = createRequire(import.meta.url);

const MODELS_PATH = path.resolve("node_modules/@vladmandic/human/models");
const WASM_DIR = path.resolve(
  "node_modules/@tensorflow/tfjs-backend-wasm/wasm-out"
);
const HUMAN_DIST = path.resolve(
  path.dirname(require.resolve("@vladmandic/human")),
  "human.node-wasm.js"
);

const IMAGE_EXTENSION = /\.jpe?g$/i;

function resolveDatasetPath() {
  const cli = process.argv[2];
  if (cli) return path.resolve(cli);
  const envPath = process.env.FACE_CALIBRATION_DATASET;
  if (envPath) return path.resolve(envPath);
  return path.resolve(process.cwd(), "dataset");
}

function isDirectory(dir) {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function listImageFiles(dir) {
  try {
    return readdirSync(dir)
      .filter((name) => IMAGE_EXTENSION.test(name))
      .sort()
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

function fail(message) {
  console.error(`FACE CALIBRATION FAILED: ${message}`);
  process.exit(1);
}

function insufficient(message) {
  console.log("CALIBRATION STATUS: INSUFFICIENT DATA");
  if (message) console.log(message);
  console.log(
    "RECOMMENDATION: none — keep FACE_VERIFY_THRESHOLD at the NON-PRODUCTION baseline (0.5)."
  );
  process.exit(0);
}

function summarize(label, values) {
  const sorted = [...values].sort((x, y) => x - y);
  const sum = values.reduce((a, b) => a + b, 0);
  console.log(`${label}: N=${values.length}`);
  console.log(
    `  min=${sorted[0].toFixed(4)} p25=${percentile(sorted, 0.25).toFixed(4)} ` +
      `median=${percentile(sorted, 0.5).toFixed(4)} ` +
      `p75=${percentile(sorted, 0.75).toFixed(4)} max=${sorted[sorted.length - 1].toFixed(4)}`
  );
  console.log(`  mean=${(sum / values.length).toFixed(4)}`);
}

const datasetPath = resolveDatasetPath();
if (!isDirectory(datasetPath)) {
  insufficient(`Dataset not found at: ${datasetPath}`);
}

const subjectDirs = readdirSync(datasetPath)
  .map((name) => path.join(datasetPath, name))
  .filter(isDirectory)
  .sort();

if (subjectDirs.length < MIN_SUBJECTS_FOR_REPORT) {
  insufficient(
    `Dataset at ${datasetPath} must contain at least ${MIN_SUBJECTS_FOR_REPORT} subject folders.`
  );
}
// Load subjects and require at least two usable images per subject for genuine pairs.
const subjects = [];
for (const dir of subjectDirs) {
  const files = listImageFiles(dir);
  if (files.length >= MIN_IMAGES_PER_SUBJECT) {
    subjects.push({ name: path.basename(dir), files });
  }
}
if (subjects.length < MIN_SUBJECTS_FOR_REPORT) {
  insufficient(
    `At least ${MIN_SUBJECTS_FOR_REPORT} subjects with ${MIN_IMAGES_PER_SUBJECT}+ images are required.`
  );
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

const { Human } = require(HUMAN_DIST);
const human = new Human({
  backend: "wasm",
  wasmPath: WASM_DIR.replace(/\\/g, "/") + "/",
  modelBasePath: "file://" + MODELS_PATH.replace(/\\/g, "/"),
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

await human.load();
if (
  typeof human.match?.similarity !== "function" ||
  typeof human.match?.distance !== "function"
) {
  fail("human.match similarity/distance functions are not available");
}

async function detectEmbedding(buffer) {
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
    const faces = result?.face ?? [];
    if (faces.length !== 1) return null;
    const embedding = faces[0]?.embedding;
    if (!embedding || embedding.length !== 1024) return null;
    let sum = 0;
    for (const value of embedding) sum += value * value;
    if (!Number.isFinite(sum) || sum === 0) return null;
    return embedding;
  } catch {
    return null;
  } finally {
    try {
      human.tf.dispose(tensor);
    } catch {
      // best-effort disposal
    }
  }
}

const usable = [];
let skipped = 0;
for (const subject of subjects) {
  const embeddings = [];
  for (const file of subject.files) {
    let buffer;
    try {
      buffer = readFileSync(file);
    } catch {
      skipped += 1;
      continue;
    }
    const embedding = await detectEmbedding(buffer);
    if (embedding) {
      embeddings.push(embedding);
    } else {
      skipped += 1;
    }
  }
  usable.push({ name: subject.name, embeddings });
  if (embeddings.length === 0) {
    console.log(`subject ${subject.name}: 0 usable images (skipped)`);
  }
}
if (skipped > 0) {
  console.log(`images skipped (no single usable face): ${skipped}`);
}
const usableSubjects = usable.filter((s) => s.embeddings.length > 0);
if (usableSubjects.length < MIN_SUBJECTS_FOR_REPORT) {
  insufficient(
    "Fewer than two subjects produced usable single-face embeddings."
  );
}

// GENUINE pairs: two DIFFERENT captures of the SAME subject (i < j).
// IMPOSTOR pairs: captures of DIFFERENT subjects.
const genuine = [];
const impostor = [];
let totalPairs = 0;
for (const subject of usableSubjects) {
  const emb = subject.embeddings;
  for (let i = 0; i < emb.length && totalPairs < MAX_COMPARISONS; i += 1) {
    for (let j = i + 1; j < emb.length && totalPairs < MAX_COMPARISONS; j += 1) {
      genuine.push(human.match.similarity(emb[i], emb[j]));
      totalPairs += 1;
    }
  }
}
for (let a = 0; a < usableSubjects.length && totalPairs < MAX_COMPARISONS; a += 1) {
  for (let b = a + 1; b < usableSubjects.length && totalPairs < MAX_COMPARISONS; b += 1) {
    for (const ea of usableSubjects[a].embeddings) {
      for (const eb of usableSubjects[b].embeddings) {
        if (totalPairs >= MAX_COMPARISONS) break;
        impostor.push(human.match.similarity(ea, eb));
        totalPairs += 1;
      }
    }
  }
}

console.log("ENGINE");
console.log("Human", human.version);
console.log("");
console.log("TEMPLATE");
console.log("human-faceres-v1");
console.log("");
console.log("METRIC");
console.log("similarity (0..1, higher = closer match)");
console.log("");
console.log("DATASET");
console.log(`path: ${datasetPath}`);
console.log(`subjects (usable): ${usableSubjects.length}`);
console.log(`images (usable): ${usable.reduce((n, s) => n + s.embeddings.length, 0)}`);
console.log(`genuine pairs: ${genuine.length}`);
console.log(`impostor pairs: ${impostor.length}`);
console.log("");

if (genuine.length === 0 || impostor.length === 0) {
  insufficient(
    "Both genuine and impostor pairs are required (>= 2 usable images per subject, >= 2 subjects)."
  );
}

console.log("DISTRIBUTION");
summarize("GENUINE", genuine);
summarize("IMPOSTOR", impostor);
console.log("");

const doStats = genuine.length >= MIN_PAIRS_FOR_STATS && impostor.length >= MIN_PAIRS_FOR_STATS;
if (!doStats) {
  insufficient(
    `FAR/FRR require >= ${MIN_PAIRS_FOR_STATS} genuine and impostor pairs ` +
      `(got ${genuine.length}/${impostor.length}).`
  );
}

// Candidate thresholds: evenly spaced points plus every observed score, so the
// reported FAR/FRR always include the empirical operating points.
const candidates = new Set([0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.99]);
for (const score of [...genuine, ...impostor]) {
  candidates.add(Number(score.toFixed(4)));
}
const sortedCandidates = [...candidates].sort((x, y) => x - y);

console.log("CANDIDATE THRESHOLDS");
console.log("threshold, FAR, FRR");
const rows = [];
for (const t of sortedCandidates) {
  const { far, frr } = evaluateThreshold(genuine, impostor, t);
  rows.push({ t, far, frr });
  console.log(
    `${t.toFixed(4)}, ${(far * 100).toFixed(2)}%, ${(frr * 100).toFixed(2)}%`
  );
}
console.log("");

// Balanced operating point: minimise the absolute FAR-FRR gap; tie-break toward
// lower FAR. Reported as a candidate, NOT automatically the deployed value.
const balanced = selectBalancedOperatingPoint(rows);

const canRecommendThis = canRecommend(usableSubjects.length, genuine.length, impostor.length);

console.log("FAR");
console.log(`at balanced operating point (${balanced.t.toFixed(4)}): ${(balanced.far * 100).toFixed(2)}%`);
console.log("");
console.log("FRR");
console.log(`at balanced operating point (${balanced.t.toFixed(4)}): ${(balanced.frr * 100).toFixed(2)}%`);
console.log("");

if (canRecommendThis) {
  console.log("RECOMMENDATION");
  console.log(
    `Dataset supports a preliminary operating point: threshold=${balanced.t.toFixed(4)} ` +
      `(FAR=${(balanced.far * 100).toFixed(2)}%, FRR=${(balanced.frr * 100).toFixed(2)}%). ` +
      `Subjects=${usableSubjects.length}, genuine=${genuine.length}, impostor=${impostor.length}. ` +
      "This is a candidate from labelled data, not a statistical guarantee; " +
      "confirm with a held-out set before enabling attendance enforcement."
  );
  console.log(
    "To apply: set FACE_VERIFY_THRESHOLD to the selected value on the server."
  );
} else {
  console.log("CALIBRATION STATUS: INSUFFICIENT DATA FOR PRODUCTION");
  console.log(
    `More labelled data is required for a recommendation (need >= ${MIN_SUBJECTS_FOR_RECOMMENDATION} ` +
      `subjects and >= ${MIN_PAIRS_FOR_RECOMMENDATION} genuine/impostor pairs).`
  );
  console.log(
    "RECOMMENDATION: none — keep FACE_VERIFY_THRESHOLD at the NON-PRODUCTION baseline (0.5)."
  );
}
process.exit(0);