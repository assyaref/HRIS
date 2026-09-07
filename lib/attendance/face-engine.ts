import "server-only";

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import jpeg from "jpeg-js";

import {
  FACE_EMBEDDING_DIMENSIONS,
  FACE_EMBEDDING_VERSION,
} from "./face-template";

export { FACE_EMBEDDING_VERSION };

/**
 * @vladmandic/human engine adapter (Phase 10.2 + 10.3) — server-only.
 *
 * Engine: @vladmandic/human 3.3.6 (MIT, self-hosted) on the @tensorflow/tfjs
 * WASM backend. The WASM route is used instead of the native `tfjs-node`
 * route so no platform C++ toolchain is required.
 *
 * Runtime requirements (operator-supplied, all optional):
 *   FACE_PROVIDER=human                      enable the engine
 *   FACE_MODEL_BASE_PATH=<dir>               override model folder
 *   FACE_ENGINE_DIST_PATH=<file>             override human dist file
 *   FACE_ENGINE_WASM_PATH=<dir>              override tfjs wasm-out folder
 *
 * Defaults resolve the dist/model/wasm folders inside `node_modules` relative
 * to `process.cwd()`, matching the self-hosted `next start` layout.
 *
 * Privacy/security:
 * - Processing is in-process on the HRIS server; no image or embedding ever
 *   leaves for a third party.
 * - The input JPEG is decoded in memory only and is never persisted or logged.
 * - Output is a 1024-d float embedding returned to the server-authoritative
 *   seam, which encrypts it before storage.
 * - Human's loader always uses `fetch`; a wrapper maps `file://` model URLs to
 *   local disk reads so model weights never leave the server.
 */
export const FACE_PROVIDER_ENV = "FACE_PROVIDER";
export const FACE_MODEL_BASE_PATH_ENV = "FACE_MODEL_BASE_PATH";
export const FACE_ENGINE_DIST_PATH_ENV = "FACE_ENGINE_DIST_PATH";
export const FACE_ENGINE_WASM_PATH_ENV = "FACE_ENGINE_WASM_PATH";
export const FACE_PROVIDER_HUMAN = "human";

export type FaceEngineFailureCode =
  | "not_configured"
  | "invalid_input"
  | "no_face"
  | "multiple_faces"
  | "poor_quality"
  | "processing_failed";

export type FaceEngineOutcome =
  | { ok: true; embedding: number[]; templateVersion: string }
  | { ok: false; code: FaceEngineFailureCode };

/**
 * Verification engine outcome: a fresh embedding plus Human's NATIVE
 * comparison scores against the enrolled reference embedding. The score is
 * consumed only by the server-authoritative seam — it is never returned to
 * the browser. `score` is the normalized similarity (0..1, higher is better);
 * `distance` is Human's Euclidean-derived distance for diagnostics.
 */
export type FaceEngineVerificationOutcome =
  | {
      ok: true;
      embedding: number[];
      /** Human-native normalized similarity (0..1, higher is better). */
      score: number;
      /** Human-native distance (lower is closer) — diagnostics only. */
      distance: number;
      templateVersion: string;
    }
  | { ok: false; code: FaceEngineFailureCode };

export interface FaceEngineConfig {
  configured: boolean;
  reason: string;
  distPath: string;
  modelBasePath: string;
  wasmPath: string;
}

interface FaceEngineRuntimeConfig {
  distPath: string;
  modelBasePath: string;
  wasmPath: string;
}

function dirExists(filePath: string): boolean {
  try {
    return existsSync(filePath);
  } catch {
    return false;
  }
}

function defaultDistPath(): string {
  return path.resolve(
    process.cwd(),
    "node_modules/@vladmandic/human/dist/human.node-wasm.js"
  );
}

function defaultModelPath(): string {
  return path.resolve(
    process.cwd(),
    "node_modules/@vladmandic/human/models"
  );
}

function defaultWasmPath(): string {
  return path.resolve(
    process.cwd(),
    "node_modules/@tensorflow/tfjs-backend-wasm/wasm-out"
  );
}

function readOptional(
  env: NodeJS.ProcessEnv,
  name: string
): string | undefined {
  const value = env[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Resolve the engine's runtime paths and whether it can be used. */
export function resolveFaceEngineConfig(
  env: NodeJS.ProcessEnv = process.env
): FaceEngineConfig {
  if ((env[FACE_PROVIDER_ENV] ?? "").toLowerCase() !== FACE_PROVIDER_HUMAN) {
    return {
      configured: false,
      reason: "FACE_PROVIDER is not set to 'human'",
      distPath: "",
      modelBasePath: "",
      wasmPath: "",
    };
  }

  const distPath =
    readOptional(env, FACE_ENGINE_DIST_PATH_ENV) ?? defaultDistPath();
  const modelBasePath =
    readOptional(env, FACE_MODEL_BASE_PATH_ENV) ?? defaultModelPath();
  const wasmPath =
    readOptional(env, FACE_ENGINE_WASM_PATH_ENV) ?? defaultWasmPath();

  if (!dirExists(distPath)) {
    return {
      configured: false,
      reason: "human engine dist not found",
      distPath,
      modelBasePath,
      wasmPath,
    };
  }
  if (!dirExists(modelBasePath)) {
    return {
      configured: false,
      reason: "human model folder not found",
      distPath,
      modelBasePath,
      wasmPath,
    };
  }
  if (!dirExists(wasmPath)) {
    return {
      configured: false,
      reason: "tfjs wasm folder not found",
      distPath,
      modelBasePath,
      wasmPath,
    };
  }

  return {
    configured: true,
    reason: "ok",
    distPath,
    modelBasePath,
    wasmPath,
  };
}

/**
 * Install a global `fetch` wrapper that serves `file://` URLs from disk.
 * Human's model loader always calls global `fetch`, and Node's native fetch
 * does not support `file://`. Non-file requests are delegated unchanged.
 */
function installFileUrlFetchShim(): void {
  const nativeFetch = globalThis.fetch;
  if (
    typeof nativeFetch !== "function" ||
    (globalThis.fetch as unknown as { __faceEngineFileShim?: boolean })
      .__faceEngineFileShim
  ) {
    return;
  }
  const shim = async (
    input: Parameters<typeof fetch>[0],
    init?: RequestInit
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input && input.url) || "";
    if (url.startsWith("file://")) {
      const filePath = fileURLToPath(url);
      const buffer = readFileSync(filePath);
      const contentType = url.endsWith(".json")
        ? "application/json"
        : "application/octet-stream";
      return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: { "content-type": contentType },
      });
    }
    return nativeFetch(input, init);
  };
  (shim as unknown as { __faceEngineFileShim?: boolean }).__faceEngineFileShim =
    true;
  globalThis.fetch = shim as typeof fetch;
}

interface HumanLikeInstance {
  version: string;
  tf: {
    tensor4d: (
      values: ArrayLike<number>,
      shape: number[]
    ) => { dispose(): void };
    dispose: (tensor: unknown) => void;
  };
  load(): Promise<unknown>;
  detect(
    input: unknown,
    userConfig?: Record<string, unknown>
  ): Promise<{
    face?: {
      score: number;
      boxScore: number;
      embedding?: number[];
    }[];
  }>;
  /**
   * Human's native face-descriptor matching namespace (Phase 10.3). We use
   * these exact functions — never a locally-invented similarity formula.
   */
  match?: {
    /** Euclidean distance (order 2) between two descriptors. */
    distance: (descriptor1: number[], descriptor2: number[]) => number;
    /** Normalized similarity 0..1 between two descriptors (higher is closer). */
    similarity: (descriptor1: number[], descriptor2: number[]) => number;
  };
}

let humanSingleton: HumanLikeInstance | null = null;
let humanSingletonError: string | null = null;

async function getHumanInstance(
  config: FaceEngineRuntimeConfig
): Promise<HumanLikeInstance> {
  if (humanSingleton) return humanSingleton;
  if (humanSingletonError) throw new Error(humanSingletonError);

  installFileUrlFetchShim();

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const humanModule = require(config.distPath) as {
    Human: new (config: Record<string, unknown>) => HumanLikeInstance;
    default?: new (config: Record<string, unknown>) => HumanLikeInstance;
  };
  const Human = humanModule.Human ?? humanModule.default;

  const instance = new Human({
    backend: "wasm",
    wasmPath: config.wasmPath.replace(/\\/g, "/") + "/",
    modelBasePath: "file://" + config.modelBasePath.replace(/\\/g, "/"),
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

  try {
    await instance.load();
  } catch (error) {
    humanSingletonError =
      error instanceof Error ? error.message : "human engine load failed";
    throw error;
  }
  humanSingleton = instance;
  return instance;
}

/** Decode a JPEG buffer into a normalized float [1, h, w, 3] tensor. */
function decodeJpegToTensor(
  imageBuffer: Buffer,
  human: HumanLikeInstance
): { tensor: unknown; width: number; height: number } {
  const decoded = jpeg.decode(imageBuffer, {
    useTArray: true,
    formatAsRGBA: true,
  });
  const { width, height } = decoded;
  if (width <= 0 || height <= 0 || width * height > 2048 * 2048) {
    throw new Error("invalid image dimensions");
  }
  const data = decoded.data as Uint8Array;
  const rgb = new Float32Array(width * height * 3);
  // Human expects the same 0..255 float range the official tfjs-node demo
  // produces (`decodeImage` cast to float32 without normalization).
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  const tensor = human.tf.tensor4d(rgb, [1, height, width, 3]);
  return { tensor, width, height };
}

function isDegenerateEmbedding(embedding: number[]): boolean {
  let sum = 0;
  for (const value of embedding) sum += value * value;
  return sum === 0 || Number.isNaN(sum);
}

type SingleFaceEmbeddingResult =
  | { ok: true; embedding: number[] }
  | { ok: false; code: FaceEngineFailureCode };

/**
 * Decode one transient JPEG and return the embedding of the SINGLE detected
 * face. Shared by enrollment and verification so both flows enforce identical
 * image/face rules:
 * - empty/unsupported input         -> invalid_input
 * - zero faces                      -> no_face
 * - more than one face              -> multiple_faces
 * - missing/degenerate embedding    -> poor_quality
 * - decode/engine exception         -> processing_failed
 *
 * The JPEG is never persisted or logged; the tensor is disposed afterwards.
 */
async function extractSingleFaceEmbedding(
  human: HumanLikeInstance,
  imageBuffer: Buffer,
  mimeType: string
): Promise<SingleFaceEmbeddingResult> {
  if (!imageBuffer || imageBuffer.length === 0) {
    return { ok: false, code: "invalid_input" };
  }
  if (!mimeType || mimeType !== "image/jpeg") {
    return { ok: false, code: "invalid_input" };
  }

  let tensor: unknown;
  try {
    const decoded = decodeJpegToTensor(imageBuffer, human);
    tensor = decoded.tensor;
    const result = await human.detect(tensor);

    const faces = result?.face ?? [];
    if (faces.length === 0) {
      return { ok: false, code: "no_face" };
    }
    if (faces.length > 1) {
      return { ok: false, code: "multiple_faces" };
    }
    const embedding = faces[0]?.embedding;
    if (
      !embedding ||
      embedding.length === 0 ||
      isDegenerateEmbedding(embedding)
    ) {
      return { ok: false, code: "poor_quality" };
    }
    return { ok: true, embedding };
  } catch {
    // Never expose engine internals to the caller; safe generic failure.
    return { ok: false, code: "processing_failed" };
  } finally {
    if (tensor && human.tf.dispose) {
      try {
        human.tf.dispose(tensor);
      } catch {
        // best-effort disposal
      }
    }
  }
}

/**
 * Process one transient JPEG capture and produce a face embedding (Phase
 * 10.2 enrollment). Exactly one detectable face is required.
 */
export async function processFaceEnrollmentCapture(
  imageBuffer: Buffer,
  mimeType: string
): Promise<FaceEngineOutcome> {
  const engineConfig = resolveFaceEngineConfig();
  if (!engineConfig.configured) {
    return { ok: false, code: "not_configured" };
  }

  let human: HumanLikeInstance;
  try {
    human = await getHumanInstance({
      distPath: engineConfig.distPath,
      modelBasePath: engineConfig.modelBasePath,
      wasmPath: engineConfig.wasmPath,
    });
  } catch {
    // Engine present but not usable in this runtime (e.g. bundler/runtime
    // limitation). Fail safe: no enrollment is written and nothing is faked.
    return { ok: false, code: "not_configured" };
  }

  const detection = await extractSingleFaceEmbedding(
    human,
    imageBuffer,
    mimeType
  );
  if (!detection.ok) {
    return detection;
  }
  return {
    ok: true,
    embedding: detection.embedding,
    templateVersion: FACE_EMBEDDING_VERSION,
  };
}

/**
 * Process one transient JPEG capture and compare it against an enrolled
 * reference embedding using Human's NATIVE `match.similarity` / `match.distance`
 * (Phase 10.3 verification).
 *
 * - The reference embedding must be a validated 1024-d vector (the caller —
 *   the server seam — has already decrypted and dimension-checked it).
 * - The candidate capture must contain EXACTLY one detectable face.
 * - The returned `score` (similarity) is engine output only; the seam applies
 *   the server threshold and decides `matched`. Scores never reach the browser.
 * - The JPEG is never persisted or logged.
 */
export async function processFaceVerificationCapture(
  imageBuffer: Buffer,
  mimeType: string,
  referenceEmbedding: Float32Array
): Promise<FaceEngineVerificationOutcome> {
  const engineConfig = resolveFaceEngineConfig();
  if (!engineConfig.configured) {
    return { ok: false, code: "not_configured" };
  }
  if (
    !referenceEmbedding ||
    referenceEmbedding.length !== FACE_EMBEDDING_DIMENSIONS
  ) {
    // A reference that is not a genuine 1024-d embedding is never compared.
    return { ok: false, code: "processing_failed" };
  }

  let human: HumanLikeInstance;
  try {
    human = await getHumanInstance({
      distPath: engineConfig.distPath,
      modelBasePath: engineConfig.modelBasePath,
      wasmPath: engineConfig.wasmPath,
    });
  } catch {
    return { ok: false, code: "not_configured" };
  }

  const detection = await extractSingleFaceEmbedding(
    human,
    imageBuffer,
    mimeType
  );
  if (!detection.ok) {
    return detection;
  }
  if (detection.embedding.length !== referenceEmbedding.length) {
    // Model drift/corruption guard: a candidate that is not the same
    // dimensionality as the enrolled reference can never be compared safely.
    return { ok: false, code: "processing_failed" };
  }

  const matcher = human.match;
  if (
    !matcher ||
    typeof matcher.similarity !== "function" ||
    typeof matcher.distance !== "function"
  ) {
    return { ok: false, code: "processing_failed" };
  }

  const reference = Array.from(referenceEmbedding);
  let score: number;
  let distance: number;
  try {
    score = matcher.similarity(detection.embedding, reference);
    distance = matcher.distance(detection.embedding, reference);
  } catch {
    return { ok: false, code: "processing_failed" };
  }
  if (!Number.isFinite(score) || !Number.isFinite(distance)) {
    return { ok: false, code: "processing_failed" };
  }

  return {
    ok: true,
    embedding: detection.embedding,
    score,
    distance,
    templateVersion: FACE_EMBEDDING_VERSION,
  };
}
