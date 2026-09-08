#!/usr/bin/env node
/**
 * PHASE 10.7C-58 — Attendance photo expiration purge (standalone maintenance).
 *
 * Operational runner intended to be invoked by systemd timer / cron on the
 * single-VPS `hris.service` deployment:
 *
 *   npm run purge:attendance-photos
 *   node scripts/attendance-photo-purge.mjs
 *
 * Behaviour:
 *   - Deletes ONLY expired attendance photos: `expires_at <= now()`.
 *   - Idempotent: re-running deletes nothing new (deleted_count = 0).
 *   - Never touches attendance_records, employees, face data, or any other
 *     table. Purge is CLEANUP ONLY — it is NOT the security boundary. The
 *     read-time guard `expires_at > now()` (getActiveAttendancePhoto) keeps
 *     expired photos unreadable even when this script has not yet run.
 *   - Mirrors the DAL predicate exactly (deleteExpiredAttendancePhotos in
 *     features/attendance/attendance-photo.queries.ts). The DAL lives behind
 *     a `server-only` module that cannot be imported by a plain-node runner,
 *     so this script executes the identical single SQL statement.
 *
 * Output contract (operational, machine-parseable; NO photo bytes, NO Base64,
 * NO data URLs, NO employee identifiers, NO photo ids):
 *   ATTENDANCE_PHOTO_PURGE started_at=...
 *   ATTENDANCE_PHOTO_PURGE deleted_count=N finished_at=... duration_ms=...
 *
 * Failure contract: missing configuration or a database error exits non-zero
 * so an operator/monitor notices. Errors are never silently swallowed.
 */
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv({ path: ".env.production" });
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const connectionString = process.env.DATABASE_URL;

function operational(line) {
  console.log(`ATTENDANCE_PHOTO_PURGE ${line}`);
}

const startedAt = new Date();

if (!connectionString) {
  operational(`failed_reason=database_url_not_configured started_at=${startedAt.toISOString()}`);
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 6000,
  statement_timeout: 30000,
});

try {
  await client.connect();
} catch (error) {
  operational(
    `failed_reason=connection_failure error_code=${
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code ?? "unknown")
        : "unknown"
    }`
  );
  process.exit(1);
}

try {
  operational(`started_at=${startedAt.toISOString()}`);

  const result = await client.query(
    'DELETE FROM "attendance_photos" WHERE "expires_at" <= now()'
  );
  const deletedCount = result.rowCount ?? 0;

  const finishedAt = new Date();
  operational(
    `deleted_count=${deletedCount} finished_at=${finishedAt.toISOString()} duration_ms=${finishedAt.getTime() - startedAt.getTime()}`
  );
  process.exitCode = 0;
} catch (error) {
  operational(
    `failed_reason=purge_query_error error_detail=${String(
      typeof error === "object" && error !== null && "message" in error
        ? error.message
        : error
    ).slice(0, 500)}`
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
