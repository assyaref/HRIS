/**
 * ABSEN button + attendance flow wiring tests (node:test, source-invariant).
 *
 * Repository convention for suites without a live browser: the button is a
 * Next.js `<Link>` (client navigation), so its contract is pinned from source.
 * Covers the bottom-navigation ABSEN action, permission gating, active state,
 * safe-area/stacking, desktop hand-off, and the check-in / check-out page
 * wiring (loading + error handling). No liveness detection is present.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const button = readRepoFile("components/employee/floating-attendance-button.tsx");
const bottomNav = readRepoFile("components/employee/employee-bottom-navigation.tsx");
const layout = readRepoFile("app/(dashboard)/layout.tsx");
const page = readRepoFile("app/(dashboard)/attendance/page.tsx");
const panel = readRepoFile("features/attendance/attendance-panel.tsx");
const panelCode = stripComments(panel);

describe("ABSEN bottom-navigation button", () => {
  it("is an interactive link to the attendance page", () => {
    assert.equal(button.includes('from "next/link"'), true);
    assert.equal(button.includes("<Link"), true);
    assert.equal(button.includes('href = "/attendance"'), true);
    assert.equal(button.includes("<Link"), true);
  });

  it("has an accessible name and a visible label", () => {
    assert.equal(button.includes('aria-label="ABSEN"'), true);
    assert.equal(button.includes(">ABSEN<"), true);
  });

  it("has an interaction indicator and focus ring", () => {
    assert.equal(button.includes("active:scale-95"), true);
    assert.equal(button.includes("focus-visible:ring"), true);
  });

  it("is the centre element of the bottom navigation", () => {
    assert.equal(bottomNav.includes("grid-cols-5"), true);
    assert.equal(bottomNav.includes("<FloatingAttendanceButton"), true);
    assert.equal(bottomNav.includes('href="/attendance"'), true);
  });

  it("is the primary action and reflects the active route", () => {
    assert.equal(bottomNav.includes("const presensiActive = pathname === \"/attendance\""), true);
    assert.ok(/<FloatingAttendanceButton[^>]*active=\{presensiActive\}/.test(bottomNav));
  });

  it("is fixed, safe-area aware and stacked above content", () => {
    assert.equal(bottomNav.includes("fixed inset-x-0 bottom-0 z-40"), true);
    assert.equal(bottomNav.includes("emp-safe-bottom"), true);
  });

  it("falls back to a clearly-disabled control without attendance permission", () => {
    assert.equal(bottomNav.includes("canAttendance ? ("), true);
    assert.equal(bottomNav.includes('aria-label="ABSEN tidak tersedia"'), true);
  });
});

describe("ABSEN wiring in the authenticated shell", () => {
  it("renders the employee bottom navigation for self-service users", () => {
    assert.equal(layout.includes('import { EmployeeBottomNavigation }'), true);
    assert.equal(layout.includes("<EmployeeBottomNavigation canAttendance={canAttendance} />"), true);
  });

  it("gates the ABSEN action on attendance.view (server-resolved)", () => {
    assert.ok(
      /canAttendance\s*=\s*authorization\.permissionCodes\.includes\(\s*PERMISSIONS\.ATTENDANCE_VIEW\s*\)/.test(
        layout
      )
    );
  });

  it("hands desktop users to the existing sidebar attendance entry", () => {
    const navigation = readRepoFile("components/layout/navigation.ts");
    assert.equal(navigation.includes('title: "Attendance"'), true);
    assert.equal(navigation.includes('href: "/attendance"'), true);
    // The mobile bottom bar intentionally yields to the desktop shell.
    assert.equal(bottomNav.includes("lg:hidden"), true);
  });
});

describe("attendance page exposes Check-in / Check-out from backend state", () => {
  it("renders the check-out panel with no location options", () => {
    assert.equal(page.includes('<AttendancePanel mode="check_out" options={[]} />'), true);
  });

  it("renders the check-in panel with eligible options", () => {
    assert.equal(page.includes('<AttendancePanel mode="check_in" options={options} />'), true);
  });

  it("reads today's status from the server, not the client", () => {
    for (const token of [
      "findOpenAttendance(",
      "findAttendanceForDate(",
      "listEligibleAttendanceOptions(",
    ]) {
      assert.equal(page.includes(token), true, `page must call ${token}`);
    }
  });
});

describe("attendance panel loading, error and double-submit handling", () => {
  it("shows a loading label while the request is in flight", () => {
    assert.equal(panelCode.includes('pending ? "Processing…" : actionLabel'), true);
    assert.equal(panelCode.includes("useTransition"), true);
  });

  it("renders a clear error/success message with ARIA roles", () => {
    assert.ok(/role=\{message\.tone === "error" \? "alert" : "status"\}/.test(panelCode));
  });

  it("guards against double submission", () => {
    assert.equal(panelCode.includes("if (disabled || pending) return;"), true);
    assert.equal(panelCode.includes("isAttendanceSubmitEnabled"), true);
  });

  it("submits through the server-authoritative actions only", () => {
    assert.equal(panelCode.includes("checkInAction("), true);
    assert.equal(panelCode.includes("checkOutAction("), true);
  });

  it("does not introduce liveness detection into the flow", () => {
    assert.equal(/liveness/i.test(panel), false);
  });
});
