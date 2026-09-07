# Face Verification — Calibration, Liveness, Face+Geofence & Security Status (Phases 10.4–10.6)

Applies to the face-enrollment/verification feature introduced in Phases 10.1
through 10.3, calibrated/hardened in Phase 10.4, extended with a liveness
provider boundary in Phase 10.5, and a Face + Geofence composite foundation in
Phase 10.6.

## Engine

| Item | Value |
| --- | --- |
| Engine | `@vladmandic/human` (self-hosted, in-process, MIT) |
| Engine version | 3.3.6 |
| Runtime | TensorFlow.js WASM backend (no GPU / native toolchain) |
| Embedding | 1024 × float32 (`human-faceres-v1`), 4096 bytes serialized |
| Matching metric | Human-native `similarity` — normalized 0..1, higher = closer (identical = 1). Human-native `distance` is returned for diagnostics only. |
| Threshold comparison | `score >= threshold` using the SAME similarity metric end-to-end |

The repository does not implement, invent, or substitute a custom similarity
formula; verification always uses Human's native matching functions.

## Threshold policy

- Configuration: `FACE_VERIFY_THRESHOLD` (server-only env).
- Valid range: `(0, 1]`. Invalid or out-of-range values **fail closed** —
  verification refuses to run rather than silently using a weaker threshold.
- Current value: **0.5** — this is the documented **ENGINE BASELINE and is
  NOT production calibrated**.
- Calibration status: **INSUFFICIENT DATA**. The repository contains no
  genuine labelled cross-identity dataset (the fixture `two-faces.jpg` is two
  near-duplicate captures of one subject, not two identities). No empirical
  FAR/FRR calibration was possible in this environment.
- Consequence: attendance enforcement MUST NOT use threshold 0.5 (or any
  uncalibrated value) until a labelled dataset has been evaluated.

## Calibration tooling

`scripts/face-calibration.mjs` consumes a labelled dataset
(`dataset/<subject>/*.jpg`, see `dataset/README.md`) and reports:

- genuine (same-identity) and impostor (cross-identity) similarity
  distributions;
- candidate thresholds with FAR/FRR;
- a balanced operating point only when the dataset meets documented minimums
  (5+ subjects, 50+ genuine and 50+ impostor pairs).

With insufficient data it prints `CALIBRATION STATUS: INSUFFICIENT DATA` and
no fabricated recommendation. To run:

```bash
npm run test:face-calibration
node scripts/face-calibration.mjs <dataset-path>
```

## Rate limiting

- Existing abstraction: none generic. The only precedent is the in-process
  login throttle in `features/auth/actions.ts` (per-process, documented as
  consistent with the single-`next start` production layout).
- Phase 10.4 implementation: `lib/security/face-verification-rate-limit.ts`
  (isolated, bounded, testable).
- Mechanism: production-only, per-actor, per-organization budget. Key =
  `organizationId:userId`; the target `employeeId` is not part of the key, so
  rotating employees cannot bypass the limit.
- Limits: 10 attempts per 15-minute window per key; hard cap 5,000 tracked
  keys; stale windows pruned. No image/embedding/template/score stored.
- Response: safe `RATE_LIMITED` code + Indonesian message; no counters,
  infrastructure, or biometric detail exposed.
- Limitation: in-process only. A shared Redis/PostgreSQL store is required
  before the deployment scales horizontally.

## Liveness / anti-spoof status (Phase 10.5)

- **Status: NOT_CONFIGURED (Outcome B).** No real liveness/anti-spoof mechanism
  is implemented and no `live=true` value is ever produced or trusted.
- Engine audit: `@vladmandic/human` 3.3.6 ships two single-frame classifiers in
  `node_modules/@vladmandic/human/models`:
  - `antispoof` (~0.85 MB) — "fake-face-detection" CNN (Kaggle:
    anku420/fake-face-detection), 128×128×3 input, sigmoid output;
  - `liveness` (~0.59 MB) — "LivenessNet" (https://github.com/leokwu/livenessnet),
    32×32×3 input, 2-class softmax.
  Both are single-frame presentation-attack classifiers with provenance/licence
  that cannot be verified offline. A single-frame classifier is NOT temporal
  liveness and gives no defensible evidence against video replay, masks,
  deepfakes, or 3D presentation attacks, so they are deliberately NOT wired.
- Architecture: the single future integration point is the liveness provider
  seam in `lib/attendance/face-recognition.ts` (`isFaceLivenessConfigured()`
  returns `false`; `assessFaceLiveness()` returns `not_configured`).
  `features/employees/face-liveness.ts` defines the pure contract (status
  vocabulary, safe Indonesian messages, strict input schema, independent-signal
  rule). No separate liveness action, UI, or camera sequence was added.
- Camera behaviour: no multi-frame sequence is captured. The existing one-shot
  camera rules remain unchanged (explicit gesture, bounded single JPEG,
  visibilitychange/cancel/unmount stop tracks, Indonesian permission errors).
- Identity separation: face identity matching and liveness are independent
  signals. A future attendance decision must require `IDENTITY_MATCH AND
  LIVENESS_PASS AND GEOFENCE_PASS`; a face match alone never implies "the
  person is live", and a liveness pass alone never confirms identity.
- Audit: no liveness audit events exist because liveness never runs. If a real
  provider is added later, audit events would carry only employee id, actor id,
  organization, outcome category, operation and timestamp — never frames,
  embeddings, tensors, raw scores, or image payloads.
- Rate limiting: no separate liveness limiter was created. A future liveness
  action must reuse the existing `faceVerificationRateLimiter`
  (org + authenticated-user key; employee id cannot bypass it).

## Attendance enforcement

- Face verification is **not integrated** into attendance check-in/check-out.
  Face + Geofence enforcement is a later phase and must re-evaluate this
  calibration/rate-limit state before enabling.

## Security invariants (Phase 10.4 tests)

- The client cannot supply a threshold, `matched`, score, template, embedding,
  or `organizationId` (strict input schema + server-only config).
- Invalid threshold configuration fails closed.
- Corrupt templates, wrong template versions, and wrong embedding dimensions
  fail safely (never silently compared).
- Rate-limit behaviour is covered by unit tests.
- No biometric payload appears in errors, logs, or audit metadata.
- The client code uses no browser storage and no URL image payload.

## Face + Geofence integration foundation (Phase 10.6)

Architecture only — **attendance enforcement is still disabled**. No
check-in/check-out event is written and no attendance decision chain was
modified. The composite boundary is a PURE domain model:

- `features/attendance/attendance-presence.ts`
- `evaluateAttendancePresence(signals)` → `PRESENCE_VALID` only when ALL of the
  following independent server-derived signals pass:
  - identity match (Phase 10.3 face verification result — server decision only);
  - liveness = `pass` (Phase 10.5 seam; **`not_configured` is a hard fail**);
  - geofence pass (reuses the existing `lib/attendance/geofence.evaluateGeofence`
    — the server computes the distance, the client never sends a distance or an
    `insideGeofence` flag);
  - assignment valid (org-scoped employee → project → work-location chain);
  - employee active.
- `evaluateAttendanceReadiness(...)` → production readiness gate:
  - `PRODUCTION_READY` only with a validated face calibration, a configured +
    validated real liveness provider, a valid geofence/assignment chain,
    production-safe rate limiting and all security conditions met;
  - `READY_FOR_CONTROLLED_TEST` only with an explicit, server-side operator
    authorization (supervised experiments — the composite decision still
    returns `PRESENCE_INVALID` whenever liveness is NOT_CONFIGURED);
  - otherwise `NOT_READY`.

Because the face threshold (0.5) is NOT production-calibrated and liveness is
NOT_CONFIGURED, the current readiness state is **NOT_READY** and attendance
enforcement must remain disabled. The composite layer does not create a second
rate limiter — any future composite/attendance action must reuse
`faceVerificationRateLimiter` (org + authenticated-user key).
