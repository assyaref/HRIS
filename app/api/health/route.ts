import { sql } from "drizzle-orm";

import { db } from "@/db";

export const dynamic = "force-dynamic";

const HEADERS = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

/**
 * GET /api/health — liveness + database readiness for the deploy health
 * check and uptime monitors. Public and detail-free: 200 {"status":"ok"} when
 * PostgreSQL answers `SELECT 1` within 5 s, otherwise 503
 * {"status":"degraded","database":"unavailable"}. The underlying error is
 * logged server-side only.
 */
export async function GET(): Promise<Response> {
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("database health check timed out")), 5_000)
      ),
    ]);
    return new Response(JSON.stringify({ status: "ok", database: "ok" }), {
      status: 200,
      headers: HEADERS,
    });
  } catch (error) {
    console.error("[health] database check failed", error);
    return new Response(
      JSON.stringify({ status: "degraded", database: "unavailable" }),
      { status: 503, headers: HEADERS }
    );
  }
}
