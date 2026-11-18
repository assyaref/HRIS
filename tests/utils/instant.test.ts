import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toInstant } from "../../lib/utils/instant.ts";
import { formatDate, formatTime } from "../../features/attendance/format.ts";

describe("toInstant", () => {
  it("keeps valid Date values", () => {
    const date = new Date("2026-11-18T01:48:00.000Z");
    assert.equal(toInstant(date), date);
  });

  it("parses PostgreSQL timestamptz text from raw execute() rows", () => {
    assert.equal(
      toInstant("2026-11-18 01:48:00+00")?.toISOString(),
      "2026-11-18T01:48:00.000Z"
    );
    assert.equal(
      toInstant("2026-11-18 08:48:00.5+07")?.toISOString(),
      "2026-11-18T01:48:00.500Z"
    );
    assert.equal(
      toInstant("2026-11-18T01:48:00.000Z")?.toISOString(),
      "2026-11-18T01:48:00.000Z"
    );
  });

  it("returns null for empty or malformed input", () => {
    assert.equal(toInstant(null), null);
    assert.equal(toInstant(undefined), null);
    assert.equal(toInstant(""), null);
    assert.equal(toInstant("not a date"), null);
    assert.equal(toInstant(new Date("bad")), null);
  });
});

describe("attendance formatters tolerate raw values", () => {
  it("formats text timestamps instead of throwing", () => {
    assert.equal(formatTime("2026-11-18 01:48:00+00", "Asia/Jakarta"), "08:48");
    assert.equal(formatDate("2026-11-18 01:48:00+00"), "2026-11-18");
  });

  it("renders a dash for missing or invalid values", () => {
    assert.equal(formatTime(null), "—");
    assert.equal(formatTime("garbage"), "—");
    assert.equal(formatDate(new Date("bad")), "—");
  });
});
