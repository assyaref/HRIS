# Attendance — Phase 6

This document records the attendance foundation: architecture, routes,
permissions, geofencing, camera/verification boundaries, privacy and known
limitations. It is a companion to `docs/architecture.md`, `docs/rbac.md` and
`docs/employees.md`.

## 1. Architecture overview

Attendance is an explicit, server-validated action. The client contributes only
a project/work-location selection, a one-shot GPS fix (or an explicit
location-issue), and optional notes. The server resolves the employee from the
authenticated user, derives the organization, validates ownership, recomputes
the geofence, stamps the official time, creates immutable events and audits the
mutation.

| Concern | Location |
| --- | --- |
| Geofence math (server) | `lib/attendance/geofence.ts` |
| Date/time (timezone-aware) | `lib/attendance/time.ts` |
| Identity verification seam | `lib/attendance/verification.ts` |
| Constants/statuses | `features/attendance/constants.ts` |
| Zod validation | `features/attendance/schemas.ts` |
| Org-scoped DAL | `features/attendance/queries.ts` |
| Server actions | `features/attendance/actions.ts` |
| Camera / GPS / panel (client) | `features/attendance/attendance-camera.tsx` · `location-capture.tsx` · `attendance-panel.tsx` |
| Routes | `/attendance` · `/attendance/management` · `/attendance/[attendanceId]` |
| DB tables | `employee_project_assignments`, `attendance_records`, `attendance_events` |

## 2. Routes & permissions

| Route | Purpose | Guard |
| --- | --- | --- |
| `/attendance` | Employee self-service (today + history) | `attendance.view`; employee resolved from the session user link |
| `/attendance/management` | Org-wide view + filters | `attendance.manage` (EMPLOYEE denied) |
| `/attendance/[attendanceId]` | Detail + immutable events | `attendance.view`; org-scoped; employees may only open their own record |

Role semantics (seed): SUPERADMIN all; ADMIN view/manage/check-in/check-out; HR
view/manage; MANAGEMENT view/manage; SUPERVISOR view (approval reserved);
FINANCE none; EMPLOYEE view (own) + check-in + check-out.

`attendance.view` never grants org-wide visibility by itself — employee queries
pin `employees.user_id = currentUser.id`.

## 3. Project assignment

`employee_project_assignments` connects employees to projects. An employee may
have several *active* assignments (one per project, enforced by a partial
unique index). Check-in eligibility = active assignment + active project +
active work location, all in the employee's organization. An employee cannot
submit an arbitrary project: the server re-validates the pair against the
employee's active assignments.

## 4. Attendance flow

**Check-in**
1. Authenticate; require `attendance.check_in`.
2. Resolve the linked employee (org + active) — never a client employee id.
3. Zod-validate project/location/GPS.
4. Append `check_in_attempt` event.
5. Reject (with event + audit) on: location denied/unavailable, ineligible
   project/location, inactive employee, or failed geofence/accuracy.
6. Server-side geofence evaluation (`evaluateGeofence`).
7. Identity verification seam (Phase 6 = `not_configured`; recorded as
   `unavailable`, never claimed as biometric proof).
8. Transaction: duplicate/open-record guards → insert `attendance_records`
   (`present`) + `check_in_success` event. Unique (employee, date) index is the
   final guard. Server timestamp + work-location-timezone date.

**Check-out**
1. Authenticate; require `attendance.check_out`.
2. Load the employee's open record inside a transaction.
3. Append `check_out_attempt`; reject (event + audit) when no open record,
   GPS denied/unavailable, outside geofence of the recorded work location, or
   verification failed.
4. Update the record (`completed`, check-out fields) + `check_out_success`
   event. Server timestamp.

**Rules enforced:** no double check-in, no double check-out, no arbitrary
attendance date/timestamp from the client, no cross-employee/cross-org
manipulation, no `organization_id` from the browser.

## 5. Statuses (typed)

- Record status: `present | completed | incomplete | rejected`.
- Location: `valid | outside_geofence | unavailable | denied`.
- Verification: `pending | verified | failed | unavailable`.
- Method: `face | camera | manual`.
- Events: `check_in_attempt|success|rejected`, `check_out_attempt|success|rejected`,
  `verification_failed`, `location_rejected`.
- Employee "today" presentation: `NOT_CHECKED_IN | CHECKED_IN | CHECKED_OUT |
  REJECTED | UNAVAILABLE`.

## 6. GPS / geofence

The browser supplies latitude/longitude/accuracy once per action. The server:
- validates ranges and non-negative accuracy;
- rejects malformed values;
- treats missing/zero accuracy as unavailable;
- compares accuracy against the location's `max_gps_accuracy_meters`
  (default 100 m when unset);
- computes the Haversine distance to the work-location center;
- decides `valid` (≤ radius) vs `outside_geofence`, and rejects otherwise.

Client fields such as `insideGeofence` or `distance` are never accepted.

## 7. Camera & identity verification

`attendance-camera.tsx` only verifies device/permission availability, on an
explicit click, and never records/uploads/persists video. It is NOT proof of
identity. `lib/attendance/verification.ts` is the server seam where a future
biometric engine plugs in; Phase 6 returns `not_configured` and records
`verification_status = unavailable` with the reason
`identity_verification_not_configured`. **Face recognition is NOT implemented
or claimed in Phase 6.**

## 8. Privacy

- GPS is captured only during an explicit check-in/out; no background tracking.
- The camera stream is live-only and stopped on unmount; nothing is persisted.
- No raw frames/photos/biometric templates are stored in the attendance tables.
- Coordinates/distance/accuracy are retained because geofenced attendance and
  its audit trail require them; `attendance_events` is append-only.
- Audit (`audit_logs`) records events/employee number/reason, not coordinates,
  biometrics or secrets.
- Attendance data is organization-scoped; employees see only their own records.

## 9. Database & migration

New tables: `employee_project_assignments`, `attendance_records`,
`attendance_events`. Migration `db/migrations/0002_busy_banshee.sql` was
generated and reviewed. `work_locations` already contains lat/long/radius/
accuracy/timezone — no change was needed there.

## 10. Known limitations / deferred (Phase 7+)

- No shift/schedule, overtime, or attendance reconciliation.
- No `rejected`/`incomplete` workflow UI yet (fields reserved).
- Open sessions from a previous day are completed via the normal check-out
  flow before a new check-in is allowed.
- Time display uses the recorded work-location timezone.
- Identity verification engine, liveness, enrolment and approval workflows are
  explicitly not implemented.

## 11. Database validation status

No reachable PostgreSQL was available during Phase 6 (no `.env`/`DATABASE_URL`).
The migration was generated and reviewed but **not applied**; live attendance
CRUD and the manual validation checklist were not executed. `npm run lint`,
`npx tsc --noEmit` and `npm run build` pass.

