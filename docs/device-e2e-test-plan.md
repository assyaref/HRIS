# Phase 10.7 / 10.7A - Controlled Android / PWA Device Test Matrix

**Status: DOCUMENTED ONLY - NOT EXECUTED.**

This checklist is the controlled-test contract for real Android devices. No row
in this matrix has been executed on a physical device in Phase 10.7 or 10.7A
(the development environment is headless). Every cell must be performed and
recorded by an operator on a real device before any "device E2E validated"
claim may be made.

## Preconditions and invariant states

- App served over HTTPS (or localhost) so navigator.geolocation,
  navigator.mediaDevices.getUserMedia, and the PWA install flow are available.
- Test organization with an ACTIVE employee, ACTIVE project, ACTIVE work
  location with a real geofence, and an ACTIVE assignment chain.
- Server environment: FACE_PROVIDER, FACE_TEMPLATE_ENCRYPTION_KEY,
  FACE_VERIFY_THRESHOLD (see .env.example). Do not copy development secrets to
  the staging environment.
- One enrolled real employee face is a prerequisite; do NOT fake enrollment.
- Invariant states that MUST hold for every scenario:
  * Attendance enforcement = DISABLED (check-in/check-out NOT activated; no
    attendance event path consumes the face/geofence composite).
  * Liveness = NOT_CONFIGURED (never treated as PASS).
  * FACE_VERIFY_THRESHOLD = 0.5 NON-PRODUCTION baseline (unchanged).
- Result vocabulary: PASS = matches Expected behaviour; FAIL = security /
  integrity-relevant divergence; N/A = cannot be produced on the device.

## A. Authentication

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| A1 | Login with valid user credentials | Login succeeds; redirected to dashboard |
| A2 | Login with invalid credentials | Rejected with a generic error; server throttle engaged; no account enumeration |
| A3 | Session expiry / no session | Protected routes reject and redirect to /login; server actions return requireUser failure |

## B. RBAC / Authorization

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| B1 | Authorized HR/Admin (employees.update) opens enrollment/verification | Allowed to reach and run the face flows |
| B2 | Unauthorized user attempts face actions | Forbidden / generic denied; action never runs |
| B3 | Actor submits a cross-organization employee id | Identical generic "employee unavailable" response; no existence leak |

## C. Camera lifecycle (foundation)

| # | Scenario | How to produce | Expected behaviour |
|---|----------|----------------|--------------------|
| C1 | Explicit-gesture start | Tap "Mulai kamera" / "Gunakan kamera" | No automatic camera start before the explicit user action |
| C2 | Permission granted | Allow the prompt | Live preview starts; never recorded/uploaded continuously |
| C3 | Permission denied | Deny the prompt | State denied + safe Indonesian message; no track is started |
| C4 | Camera unavailable | Device without a camera (NotFoundError) | State unavailable; safe message; no retry loop |
| C5 | Camera read failure | Camera busy/locked (NotReadableError) | State unavailable or generic safe error |
| C6 | Cancel | Start, then press "Batal" | All tracks stopped; srcObject cleared; idle |
| C7 | One-shot capture | Press "Ambil foto" | Exactly one bounded JPEG Blob; stream stopped immediately after capture |
| C8 | Background app | Start camera then switch apps | visibilitychange stops tracks; state idle |
| C9 | Resume after background | Return to the app | Stays idle; NO automatic restart; explicit retry required |
| C10 | Repeated attempts | Start/capture/cancel in a loop | No leaked MediaStream handles |
| C11 | Unsupported browser | getUserMedia absent | State unsupported; safe message |

While performing C verify no localStorage / sessionStorage / IndexedDB writes,
no data-URL or object-URL persistence, no query-string image, and no raw frame
persistence.

## D. Face enrollment (technical)

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| D1 | Employee not yet enrolled | Presentation status NOT_ENROLLED |
| D2 | Start enrollment | Camera permission requested only after the explicit user action |
| D3 | Enrollment with permission denied | Safe Indonesian message; nothing persisted |
| D4 | Exactly one face, good quality | Technical enrollment succeeds; embedding encrypted and stored in the vault row |
| D5 | No face | NO_FACE; nothing persisted |
| D6 | Multiple faces | MULTIPLE_FACES; nothing persisted |
| D7 | Poor quality | Safe failure; nothing persisted |
| D8 | Successful enrollment | ACTIVE enrollment + encrypted template row exist; providerTemplateRef is opaque |
| D9 | Re-enrollment | Previous ACTIVE enrollment revoked; new ACTIVE enrollment created; old ciphertext deleted |
| D10 | Duplicate ACTIVE enrollment attempt | Impossible (partial unique index + transactional replacement) |

Verify for D: no raw image is persisted or logged; no embedding, template,
ciphertext or score is returned to the browser; the database never returns the
encrypted secret to a client query.

## E. Face verification

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| E1 | Correct enrolled face | Server decides matched (server-authoritative; score/threshold never shown) |
| E2 | Incorrect face | Server decides not matched; safe message |
| E3 | No face | NO_FACE; safe message |
| E4 | Multiple faces | MULTIPLE_FACES; safe message |
| E5 | Malformed image | INVALID_INPUT / PROCESSING_FAILED; never a match |
| E6 | Corrupted ciphertext / wrong key | template_corrupt path; safe failure |
| E7 | Revoked or never-enrolled employee | IDENTICAL ENROLLMENT_UNAVAILABLE response (no state leak) |
| E8 | Rate limit exceeded (10 attempts / 15 min per org + user) | RATE_LIMITED; changing the target employee cannot bypass the limit |

Do NOT claim calibrated FAR/FRR or a production threshold from these tests. The
current 0.5 threshold is a NON-PRODUCTION baseline.

## F. Liveness

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| F1 | Any attempt while liveness is NOT_CONFIGURED | Fails closed: isFaceLivenessConfigured() is false, assessFaceLiveness() returns not_configured, and NOT_CONFIGURED is NEVER treated as PASS. No fallback "face matched therefore live" exists. No bundled single-frame classifier is enabled. |

## G. GPS

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| G1 | GPS disabled | Safe "location unavailable" state; no attendance write |
| G2 | GPS permission denied | Safe denied state; terminal (no auto-retry prompt loop) |
| G3 | Poor accuracy | Server rejects with poor_accuracy when above the location threshold |
| G4 | Valid GPS fix | Raw latitude/longitude/accuracy only; server evaluates |
| G5 | Stale reading | maximumAge=0 means cached fixes are not accepted |

Client never submits insideGeofence or distance; the server computes the
geofence decision.

## H. Geofence

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| H1 | Inside the configured location | Server distance within radius; geofence signal valid |
| H2 | Outside the location | Server distance beyond radius; geofence signal invalid |
| H3 | Invalid / missing radius or coordinates | geofence_not_configured / invalid_coordinates configuration failure |
| H4 | Wrong project for the location | Eligible-assignment chain fails; safe rejection |
| H5 | No active assignment | Assignment signal invalid; safe rejection |

## I. Organization isolation

| # | Scenario | Expected behaviour |
|---|----------|--------------------|
| I1 | Valid organization | Full chain resolves only inside the authenticated organization |
| I2 | Cross-org employee id | Identical generic unavailable response; existence never revealed |
| I3 | Cross-org project / work-location id | Generic not-found / not-eligible; no existence leak |

## J. Security tampering (API-level adversarial checks)

Use a raw HTTP client against the server actions while authenticated. Each
client-supplied field must be rejected by strict Zod schemas or ignored by the
server:

| # | Attempted client-controlled field | Expected behaviour |
|---|----------------------------------|--------------------|
| J1 | organizationId | Rejected (org comes only from the session) |
| J2 | matched | Rejected |
| J3 | live / livenessScore | Rejected (liveness is server-side only; NOT_CONFIGURED) |
| J4 | score | Rejected |
| J5 | threshold | Rejected (server config only) |
| J6 | embedding | Rejected |
| J7 | template / providerTemplateRef | Rejected |
| J8 | distanceMeters | Rejected (server computes distance) |
| J9 | insideGeofence / geofenceResult | Rejected (server computes the geofence) |
| J10 | assignment / employeeStatus | Rejected (server derives both from org-scoped rows) |

The client MUST NOT be able to manufacture a valid presence/attendance result.
Attendance enforcement stays DISABLED for the entire test window.

## Phase 10.7B enumerated scenario register (A-X)

The operator runs each scenario below and records TEST / EXPECTED / ACTUAL /
RESULT with RESULT in { PASS, FAIL, BLOCKED, NOT TESTED }. BLOCKED must never
be converted into PASS. The matrix rows above give the detailed "How to
produce" and "Expected behaviour" for each item.

| ID | Scenario | Location in this matrix | RESULT |
|----|----------|------------------------|--------|
| A | Login | A1 | |
| B | Logout | A1 (reverse), then protected route rejected | |
| C | RBAC | B1-B2 | |
| D | Employee page | B1 (employee detail reachable) | |
| E | Face enrollment UI | D1-D3 | |
| F | Camera permission | C1-C3 | |
| G | Face enrollment capture | D4-D7 | |
| H | Server-side face template generation | D8-D10 + DB check note | |
| I | Face verification | E1-E8 | |
| J | GPS permission | G1-G2 | |
| K | GPS acquisition | G3-G5 | |
| L | Work location | Preconditions + H1 | |
| M | Assignment | Preconditions + H4-H5 | |
| N | Geofence (valid) | H1 | |
| O | Invalid geofence | H2-H3 | |
| P | Face mismatch | E2 | |
| Q | Multiple faces | E4 | |
| R | No face | E3 | |
| S | Poor camera input | C5 / E-series poor quality | |
| T | Background/resume | C8-C9 | |
| U | PWA install | Preconditions (HTTPS) + manifest/service worker checks | |
| V | Refresh | Any authenticated page after F5 | |
| W | Network interruption | Offline -> online retry (no offline queue) | |
| X | Cross-organization access attempt | I2-I3 + J1 | |

Attendance enforcement must remain DISABLED, liveness NOT_CONFIGURED, and
FACE_VERIFY_THRESHOLD 0.5 (NON-PRODUCTION) throughout the run.

## Recording the run

For each executed cell record: date, device model + OS version, browser name +
version, PWA installed (Y/N), server build commit, network payload evidence
(har/log excerpt), PASS/FAIL/N/A, and any divergence from Expected behaviour.
Do not include secrets or real biometric images in the record. Return the
completed sheet to the operator before any "device E2E validated" claim is
accepted.
