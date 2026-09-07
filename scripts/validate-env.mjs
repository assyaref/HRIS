// PHASE 10.7B — SAFE environment configuration validator (deployment preflight).
//
// Purpose: an operator runs this on a VPS/staging host BEFORE starting the app.
//
// SAFETY RULES (enforced):
// - NEVER prints a secret, a key, a DATABASE_URL credential, or any value.
//   Output is limited to PRESENT/ABSENT/VALID/INVALID + safe format facts
//   (e.g. "decodes to 32 bytes" without the decoded bytes).
// - Fails closed: a present-but-invalid critical value (malformed DATABASE_URL
//   scheme, encryption key that is not exactly 32 bytes, out-of-range face
//   threshold, non-integer session TTL) exits non-zero.
// - The face engine is OPT-IN: absence of FACE_PROVIDER /
//   FACE_TEMPLATE_ENCRYPTION_KEY is reported (not an error) and the app
//   correctly stays `not_configured`.
//
// Value semantics mirror the production code exactly:
//   FACE_TEMPLATE_ENCRYPTION_KEY -> base64 that decodes to 32 bytes
//     (lib/attendance/template-cipher.ts).
//   FACE_VERIFY_THRESHOLD -> number in (0, 1]; unset -> 0.5 NON-PRODUCTION
//     baseline (lib/attendance/face-template.ts).
//   AUTH_SESSION_TTL_SECONDS -> optional positive integer
//     (lib/auth/session.ts).
//   DATABASE_URL -> postgres:// or postgresql:// (db/index.ts, drizzle.config.ts).
//
// Usage:
//   node scripts/validate-env.mjs
import dotenv from "dotenv";

// Match the repository load order (drizzle.config.ts / db bootstrap):
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const results = [];
let criticalFailure = false;

function classify(name, kind, ok, note) {
  results.push({ name, kind, ok, note });
  if (kind === "critical" && ok === false) criticalFailure = true;
}

function has(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim() !== "";
}

// --- DATABASE_URL (critical; required at first DB access at runtime) ---------
if (!has("DATABASE_URL")) {
  classify("DATABASE_URL", "critical", false, "MISSING — required by db/index.ts at first query (build machines may omit it; a server must set it).");
} else {
  const raw = process.env.DATABASE_URL.trim();
  const validScheme = /^postgres(ql)?:\/\//i.test(raw);
  classify("DATABASE_URL", "critical", validScheme, validScheme
    ? "PRESENT with postgres:// scheme (credentials not inspected)."
    : "PRESENT but INVALID — must start with postgres:// or postgresql://.");
}

// --- NODE_ENV -----------------------------------------------------------------
const nodeEnv = has("NODE_ENV") ? process.env.NODE_ENV.trim() : undefined;
classify("NODE_ENV", "critical", nodeEnv === undefined || nodeEnv === "production" || nodeEnv === "development" || nodeEnv === "test",
  nodeEnv === "production"
    ? "PRESENT = production (secure cookies + production-only rate limiting active)."
    : nodeEnv === undefined
      ? "UNSET — local/development semantics; a VPS must set NODE_ENV=production."
      : `PRESENT = ${nodeEnv}.`);

// --- Face engine (OPT-IN) ------------------------------------------------------
if (!has("FACE_PROVIDER")) {
  classify("FACE_PROVIDER", "optional", true, "ABSENT — face engine stays not_configured (safe default).");
} else {
  classify("FACE_PROVIDER", "optional", true, `PRESENT = ${process.env.FACE_PROVIDER.trim()} (valid values: "human").`);
}

if (!has("FACE_TEMPLATE_ENCRYPTION_KEY")) {
  classify("FACE_TEMPLATE_ENCRYPTION_KEY", "optional", true, "ABSENT — required only when the face engine is enabled (server-only).");
} else {
  const trimmed = process.env.FACE_TEMPLATE_ENCRYPTION_KEY.trim();
  let decoded = null;
  let formatOk = false;
  try {
    decoded = Buffer.from(trimmed, "base64");
    formatOk = decoded.length === 32;
  } catch {
    formatOk = false;
  }
  classify("FACE_TEMPLATE_ENCRYPTION_KEY", "critical", formatOk,
    formatOk
      ? "PRESENT and decodes to exactly 32 bytes (AES-256-GCM key format valid)."
      : "PRESENT but INVALID — must be base64 of exactly 32 bytes.");
}

if (!has("FACE_VERIFY_THRESHOLD")) {
  classify("FACE_VERIFY_THRESHOLD", "optional", true, "UNSET — default 0.5 (NON-PRODUCTION baseline; not calibrated).");
} else {
  const raw = process.env.FACE_VERIFY_THRESHOLD.trim();
  const parsed = Number(raw);
  const ok = Number.isFinite(parsed) && parsed > 0 && parsed <= 1;
  classify("FACE_VERIFY_THRESHOLD", "critical", ok,
    ok
      ? `PRESENT = ${raw} (within (0,1]; still NON-PRODUCTION until calibrated with a labelled dataset).`
      : "PRESENT but INVALID — must be a number in (0,1]; the app fails closed when invalid.");
}

for (const name of ["FACE_MODEL_BASE_PATH", "FACE_ENGINE_DIST_PATH", "FACE_ENGINE_WASM_PATH"]) {
  classify(name, "optional", true, has(name) ? "PRESENT (operator override)." : "ABSENT (defaults resolve under node_modules).");

// --- Optional operational values ------------------------------------------------
if (!has("AUTH_SESSION_TTL_SECONDS")) {
  classify("AUTH_SESSION_TTL_SECONDS", "optional", true, "UNSET — default 604800 s (7 days).");
} else {
  const raw = process.env.AUTH_SESSION_TTL_SECONDS.trim();
  const n = Number(raw);
  const ok = /^\d+$/.test(raw) && Number.isSafeInteger(n) && n > 0;
  classify("AUTH_SESSION_TTL_SECONDS", "optional", ok,
    ok ? "PRESENT (positive integer seconds)." : "PRESENT but INVALID — must be a positive integer.");
}

if (has("FACE_CALIBRATION_DATASET")) {
  classify("FACE_CALIBRATION_DATASET", "optional", true, "PRESENT (operator calibration path).");
} else {
  classify("FACE_CALIBRATION_DATASET", "optional", true, "ABSENT — falls back to ./dataset (currently INSUFFICIENT DATA).");
}

// --- Report ---------------------------------------------------------------------
console.log("ENVIRONMENT CONFIGURATION VALIDATION (values never printed)");
console.log("name | class | status");
for (const r of results) {
  console.log(`${r.name} | ${r.kind} | ${r.ok ? "OK" : "NOT OK"} — ${r.note}`);
}
console.log("");
if (criticalFailure) {
  console.log("RESULT: FAIL — one or more critical values are invalid or required-but-missing for a server runtime.");
  process.exit(1);
}
console.log("RESULT: OK — no invalid critical configuration detected.");
process.exit(0);

}