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
# Face Verification Privacy & Operational Policy

Applies to the face-enrollment and face-verification implementation described
above (engine: @vladmandic/human 3.3.6, WASM; template: human-faceres-v1).
This section is operational documentation only; it is not legal advice and must
be reviewed/approved by the company before biometric processing begins with
real employee data.

## 1. Purpose
Face biometrics are processed solely to support employee identity verification
for attendance-related identity checks. The feature remains an opt-in,
server-side capability; attendance enforcement is NOT enabled until the
production prerequisites below are satisfied.

## 2. Scope
This policy covers the enrollment, storage, verification, revocation and
deletion of employee face templates in this HRIS deployment. It does not cover
raw photographs (none are stored), payroll, leave or other HR data.

## 3. Biometric Data Handling
A one-shot JPEG capture is decoded in memory and never persisted, logged or
sent to a third party. Only the resulting 1024-d embedding (template version
human-faceres-v1) is retained, encrypted, in the face template vault.

## 4. Enrollment
Enrollment is performed by an authorized operator (HR/Admin with the
employees.update permission) for an ACTIVE employee inside the operator's own
organization. Duplicate ACTIVE enrollment is prevented by a partial unique
index; replacing an existing enrollment is explicit (reenroll) and
transactional.

## 5. Consent
Enrollment requires an explicit, unchecked-by-default operator acknowledgement
(consent checkbox). A missing consent acknowledgement fails closed on the
server. Consent is a privacy safeguard only and is never an authorization or
security boundary; requireUser/requirePermission and org-scoped guards remain
authoritative.

## 6. Verification
Face verification is server-authoritative: the server decrypts the reference
template, runs the engine locally (exactly one face required), applies the
server-side threshold and returns only a safe matched/not-matched result. No
score, threshold, embedding or template is returned to the browser.

## 7. Storage Protection
Templates are stored only as encrypted blobs in the face_enrollment_templates
vault row, linked 1:1 to an ACTIVE enrollment. Raw images, base64 frames and
camera frames are never stored.

## 8. Encryption at Rest
AES-256-GCM (node:crypto) with a server-only 32-byte key supplied via
FACE_TEMPLATE_ENCRYPTION_KEY. Layout: nonce(12) || ciphertext || authTag(16).
Wrong key, tampering and malformed blobs are rejected; ciphertext never leaves
the server.

## 9. Access Control
Only authenticated users with the required RBAC permission can manage face
data. Employee-facing pages never expose templates or scores.

## 10. Organization Isolation
All face rows are organization-scoped. Cross-organization employees resolve to
the same generic safe response; organizationId is never accepted from the
client.
## 11. Retention
Retention period: TO BE DEFINED BY COMPANY POLICY.
PRODUCTION PREREQUISITE: a documented retention period and enforcement must be
approved before production activation.

## 12. Revocation
Replacement revokes the previous ACTIVE enrollment (status=revoked,
revoked_by/revoked_at recorded) and deletes its encrypted template row in the
same transaction, so the old ciphertext is never used again. A standalone
revoke-without-replace server action + UI (Phase 10.7C-44) lets an authorized
operator (EMPLOYEES_UPDATE) revoke the ACTIVE enrollment of an employee in the
operator's own organization without enrolling a new one. It is strict-input
(only employeeId), org-scoped, and only ever revokes an ACTIVE enrollment.
The transaction re-selects the ACTIVE row(s) under its own read snapshot, then
flips status=revoked + revoked_by/revoked_at and deletes the vault ciphertext
row atomically in the same transaction. A second revoke that finds no ACTIVE
enrollment under that snapshot becomes a safe no-op with a generic message; if
a concurrent replacement has already committed before the revoke transaction's
SELECT snapshot, the revoke may legitimately operate on the newly-created
ACTIVE enrollment instead — both outcomes remain fail-closed and never create a
verification bypass. A face_enrollment.revoked audit event with only scalar
metadata is recorded. Revocation removes face-verification
capability only — it can never grant or bypass one — and it deliberately does
not depend on the employee's employment status so a departed employee's
biometric record can still be deleted.

## 13. Re-enrollment
Re-enrollment is explicit (reenroll=true) and results in exactly one ACTIVE
enrollment after the old one is revoked.

## 14. Deletion
Deleting a template occurs on replacement (old ciphertext removed). Physical
employee deletion is intentionally not implemented (deactivation instead), so a
dedicated biometric deletion/retention job is part of the retention policy that
must be defined by the company. PRODUCTION PREREQUISITE.

## 15. Audit Trail
Audit events (face_enrollment.created, face_enrollment.replaced,
face_enrollment.revoked, face_verification.*) store only scalar identifiers and
outcome/status metadata. No image, embedding, score, threshold, ciphertext or
key is logged.

## 16. Rate Limiting
face verification is rate limited server-side (faceVerificationRateLimiter:
10 attempts / 15 minutes per organizationId + authenticatedUserId, production
only). The limiter is in-process; a shared store is required before horizontal
scaling.

## 17. Failure Handling
All biometric failures map to generic Indonesian messages. No internal detail,
model output, score or template state is revealed to the browser.

## 18. Incident Handling
Because no raw images or plaintext templates are stored, the incident surface
is limited to ciphertext at rest and in-memory captures. Suspected key
compromise requires rotating FACE_TEMPLATE_ENCRYPTION_KEY and re-enrolling
employees; report to the operator per company incident policy. TO BE EXTENDED
BY COMPANY POLICY.

## 19. Data Subject / Employee Request Handling
Requests about face data (access, correction, revocation, deletion) are
handled by the HR/Admin operator through the existing employee management flow.
A formal subject-request procedure must be defined by the company before
production. TO BE DEFINED BY COMPANY POLICY.

## 20. Production Activation Prerequisites
Face production activation is BLOCKED until ALL of the following hold:
1. A labelled calibration dataset exists (>= 5 subjects, >= 50 genuine and >=
   50 impostor pairs) and scripts/face-calibration.mjs produced an
   evidence-based threshold; the 0.5 baseline is NON-PRODUCTION.
2. FACE_PROVIDER, FACE_TEMPLATE_ENCRYPTION_KEY (32-byte base64) and the chosen
   FACE_VERIFY_THRESHOLD are configured server-side only; validate with
   scripts/validate-env.mjs.
3. A real, validated liveness mechanism is configured (NOT_CONFIGURED today).
4. Consent UI, this policy (incl. retention/deletion and subject-request
   procedure) are approved by the company.
5. Deployment database migrations 0005/0006 are applied and verified.
6. Physical-device (Android/PWA) controlled tests pass.
The production readiness gate (evaluateAttendanceReadiness) remains NOT_READY
until these are satisfied.
