import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("database outage is reported as an outage, not as bad credentials", () => {
  it("authenticateUser maps a failed lookup to service_unavailable", () => {
    const auth = read("lib/auth/auth.ts");
    const catchBlock = auth.slice(auth.indexOf('console.error("[auth] identifier lookup failed"'));
    assert.match(catchBlock.slice(0, 300), /reason: "service_unavailable"/);
    assert.match(read("lib/auth/types.ts"), /\| "service_unavailable"/);
  });

  it("the login action never counts an outage as a failed attempt", () => {
    const action = read("features/auth/actions.ts");
    const outage = action.indexOf('result.reason === "service_unavailable"');
    const failure = action.indexOf("recordLoginFailure(parsed.data.identifier");
    assert.ok(outage > 0 && outage < failure, "outage branch must return before the failure counter");
  });

  it("/api/health checks the database and answers 503 when it is down", () => {
    const route = read("app/api/health/route.ts");
    assert.match(route, /SELECT 1/);
    assert.match(route, /status: 503/);
    assert.doesNotMatch(route, /error\.message|String\(error\)/, "no error details in the response");
  });

  it("the deploy health check uses /api/health, not /", () => {
    const workflow = read(".github/workflows/deploy.yml");
    assert.match(workflow, /http:\/\/127\.0\.0\.1:3000\/api\/health/);
  });

  it("the pool fails fast instead of hanging", () => {
    assert.match(read("db/index.ts"), /connectionTimeoutMillis:/);
  });
});
