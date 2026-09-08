/**
 * PHASE 10.7C-55 — Attendance-photo end-of-day expiration tests (node:test).
 *
 * Pins the deterministic, DST-safe `endOfAttendanceDay` semantics:
 *   attendance day label + work-location IANA timezone
 *     → first instant of the NEXT local day (local next midnight)
 *   NOT capturedAt + 24h, NOT server/UTC midnight unless the zone is UTC.
 *
 * All dates are fixed; no reliance on the system clock.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  endOfAttendanceDay,
  parseAttendanceDate,
} from "../../lib/attendance/time.ts";
import {
  isAttendancePhotoActive,
  isAttendancePhotoExpired,
} from "../../lib/attendance/attendance-photo.ts";

const utcInstant = (iso: string): Date => new Date(iso);

describe("endOfAttendanceDay: Asia/Jakarta (UTC+7, no DST)", () => {
  it("maps 2026-09-08 to 2026-09-08T17:00:00.000Z", () => {
    const result = endOfAttendanceDay(parseAttendanceDate("2026-09-08"), "Asia/Jakarta");
    assert.equal(result.getTime(), utcInstant("2026-09-08T17:00:00.000Z").getTime());
  });

  it("handles a year-boundary day (2026-12-31)", () => {
    const result = endOfAttendanceDay(parseAttendanceDate("2026-12-31"), "Asia/Jakarta");
    assert.equal(result.getTime(), utcInstant("2026-12-31T17:00:00.000Z").getTime());
  });

  it("is ACTIVE at 23:59:59.999 local and EXPIRED exactly at local midnight", () => {
    const expiresAt = endOfAttendanceDay(parseAttendanceDate("2026-09-08"), "Asia/Jakarta");
    const justBefore = utcInstant("2026-09-08T16:59:59.999Z");
    const atMidnight = utcInstant("2026-09-08T17:00:00.000Z");
    assert.equal(isAttendancePhotoActive(expiresAt, justBefore), true);
    assert.equal(isAttendancePhotoExpired(expiresAt, justBefore), false);
    assert.equal(isAttendancePhotoActive(expiresAt, atMidnight), false);
    assert.equal(isAttendancePhotoExpired(expiresAt, atMidnight), true);
  });
});

describe("endOfAttendanceDay: UTC", () => {
  it("maps 2026-09-08 to 2026-09-09T00:00:00.000Z", () => {
    const result = endOfAttendanceDay(parseAttendanceDate("2026-09-08"), "UTC");
    assert.equal(result.getTime(), utcInstant("2026-09-09T00:00:00.000Z").getTime());
  });
});

describe("endOfAttendanceDay: America/New_York (DST aware)", () => {
  it("standard-time day: 2026-01-15 → 2026-01-16T05:00:00.000Z", () => {
    const result = endOfAttendanceDay(parseAttendanceDate("2026-01-15"), "America/New_York");
    assert.equal(result.getTime(), utcInstant("2026-01-16T05:00:00.000Z").getTime());
  });

  it("spring-forward DST day: 2026-03-08 → 2026-03-09T04:00:00.000Z (EDT)", () => {
    const result = endOfAttendanceDay(parseAttendanceDate("2026-03-08"), "America/New_York");
    assert.equal(result.getTime(), utcInstant("2026-03-09T04:00:00.000Z").getTime());
  });

  it("fall-back DST day: 2026-11-01 → 2026-11-02T05:00:00.000Z (EST)", () => {
    const result = endOfAttendanceDay(parseAttendanceDate("2026-11-01"), "America/New_York");
    assert.equal(result.getTime(), utcInstant("2026-11-02T05:00:00.000Z").getTime());
  });
});

describe("expiration must NOT be capturedAt + 24h", () => {
  it("does not equal capturedAt + 24h for an 08:30 WIB check-in", () => {
    const capturedAt = utcInstant("2026-09-08T01:30:00.000Z"); // 08:30 +07:00
    const capturedAtPlus24h = utcInstant("2026-09-09T01:30:00.000Z");
    const expiresAt = endOfAttendanceDay(parseAttendanceDate("2026-09-08"), "Asia/Jakarta");

    assert.notEqual(expiresAt.getTime(), capturedAtPlus24h.getTime());
    assert.equal(expiresAt.getTime() < capturedAtPlus24h.getTime(), true);
    assert.equal(capturedAt.getTime() < expiresAt.getTime(), true);
  });
});

describe("same attendance label, different timezones", () => {
  it("produces different expiration instants", () => {
    const label = parseAttendanceDate("2026-09-08");
    const jakarta = endOfAttendanceDay(label, "Asia/Jakarta").getTime();
    const newYork = endOfAttendanceDay(label, "America/New_York").getTime();
    assert.notEqual(jakarta, newYork);
    assert.equal(newYork, utcInstant("2026-09-09T04:00:00.000Z").getTime());
  });
});

describe("invalid/empty timezone falls back to UTC semantics", () => {
  it("empty string, whitespace, unknown zone, null and undefined match UTC next midnight", () => {
    const expected = utcInstant("2026-09-09T00:00:00.000Z").getTime();
    const label = parseAttendanceDate("2026-09-08");
    for (const zone of ["", "   ", "Invalid/Zone", "Not/AZone"]) {
      assert.equal(endOfAttendanceDay(label, zone).getTime(), expected, `zone=${zone}`);
    }
    assert.equal(endOfAttendanceDay(label, null).getTime(), expected);
    assert.equal(endOfAttendanceDay(label, undefined).getTime(), expected);
  });
});
