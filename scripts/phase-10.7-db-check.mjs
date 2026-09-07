// PHASE 10.7 — READ-ONLY database readiness validation.
// Loads DATABASE_URL from .env.local (never prints it), then runs SELECT-only
// checks so no production/dev data is ever modified:
//   1. connection reachability + current database name;
//   2. presence of the two Phase 10.5 face tables;
//   3. migration journal records for 0005 / 0006;
// Output is limited to safe metadata. On any failure it reports BLOCKED.
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const connectionString = process.env.DATABASE_URL;

function report(rows) {
  for (const row of rows) console.log(row);
}

if (!connectionString) {
  report(["LIVE DB VALIDATION: BLOCKED — DATABASE_URL is not configured."]);
  process.exit(0);
}

const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 6000,
  statement_timeout: 8000,
});

try {
  await client.connect();
} catch (error) {
  report([
    "LIVE DB VALIDATION: BLOCKED / NOT AVAILABLE",
    `connection_failure_code=${typeof error === "object" && error !== null && "code" in error ? String((error).code ?? "unknown") : "unknown"}`,
    "No schema/migration claims are made from this check.",
  ]);
  process.exit(0);
}

try {
  const dbResult = await client.query("select current_database() as db");
  const dbName = dbResult.rows[0]?.db ?? "unknown";
  report(["LIVE DB VALIDATION: CONNECTION OK", `database=${dbName}`]);

  const publicCount = await client.query(
    `select count(*)::int as n from information_schema.tables where table_schema = 'public'`
  );
  report([`public_table_count=${publicCount.rows[0]?.n ?? -1}`]);
  const publicTables = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public' order by table_name`
  );
  report([`public_tables=${publicTables.rows.map((r) => r.table_name).join(",")}`]);

  const tables = await client.query(
    `select table_name from information_schema.tables
     where table_schema = 'public'
       and table_name in ('employee_face_enrollments','face_enrollment_templates')
     order by table_name`
  );
  const existing = tables.rows.map((r) => r.table_name);
  for (const t of ["employee_face_enrollments", "face_enrollment_templates"]) {
    report([`table ${t}=${existing.includes(t) ? "PRESENT" : "MISSING"}`]);
  }

  // Drizzle journal: try both the classic (drizzle schema) and default table.
  let journal = { rows: [] };
  for (const [schema, table] of [
    ["drizzle", "__drizzle_migrations"],
    ["public", "__drizzle_migrations"],
    ["drizzle", "drizzle_migrations"],
  ]) {
    try {
      journal = await client.query(
        `select id, created_at from "${schema}"."${table}" order by created_at`
      );
      report([`journal_table=${schema}.${table} FOUND`]);
      break;
    } catch {
      // try the next candidate
    }
  }
  const journalIds = journal.rows.map((r) => String(r.id));
  for (const id of ["0000", "0001", "0002", "0003", "0004", "0005", "0006"]) {
    report([`migration ${id}=${journalIds.includes(id) ? "RECORDED" : "NOT_RECORDED"}`]);
  }
} catch (error) {
  report([
    "LIVE DB VALIDATION: QUERY CHECK FAILED (read-only)",
    `error_detail=${String(typeof error === "object" && error !== null && "message" in error ? error.message : error).slice(0, 300)}`,
  ]);
} finally {
  await client.end();
}