/**
 * ABSEN button + attendance flow wiring tests (node:test, source-invariant).
 *
 * Repository convention for suites without a live browser: the contract is
 * pinned from source. Inside the app shell the ABSEN button opens the
 * face-attendance sheet (a client dialog over the EXISTING check-in /
 * check-out server actions); outside the shell it degrades to a Next.js
 * `<Link>` into the attendance page. Covers the bottom-navigation ABSEN
 * action, permission gating, active state, safe-area/stacking, desktop
 * hand-off, the sheet's server-authoritative wiring and the check-in /
 * check-out page wiring (loading + error handling). No liveness detection is
 * present.
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
const sheet = readRepoFile("features/attendance/attendance-sheet.tsx");
const sheetCode = stripComments(sheet);
const sheetAction = readRepoFile("features/attendance/sheet.actions.ts");
const shell = readRepoFile("components/layout/app-shell.tsx");

describe("ABSEN bottom-navigation button", () => {
  it("opens the face-attendance sheet inside the shell", () => {
    assert.equal(button.includes("useOptionalShell"), true);
    assert.equal(button.includes("<button"), true);
    assert.equal(button.includes('type="button"'), true);
    assert.equal(button.includes("onClick={shell.openAttendanceSheet}"), true);
    assert.equal(button.includes('aria-haspopup="dialog"'), true);
    assert.equal(button.includes('<HrisIcon name="face"'), true);
    assert.equal(button.includes('"qr-scan"'), false);
  });

  it("degrades to a link to the attendance page outside the shell", () => {
    assert.equal(button.includes('from "next/link"'), true);
    assert.equal(button.includes("<Link"), true);
    assert.equal(button.includes('href = "/attendance"'), true);
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

  it("keeps the unavailable control non-navigating (never a Link)", () => {
    const ternaryIndex = bottomNav.indexOf("canAttendance ? (");
    const elseIndex = bottomNav.indexOf(") : (", ternaryIndex);
    assert.ok(
      ternaryIndex > 0 && elseIndex > ternaryIndex,
      "unavailable ABSEN branch not found"
    );
    // Slice strictly INSIDE the `) : (` fallback branch so the enabled
    // <FloatingAttendanceButton> element is never part of the window.
    const unavailableBranch = bottomNav.slice(
      elseIndex,
      bottomNav.indexOf("{notificationCount > 0 ?")
    );
    assert.equal(unavailableBranch.includes("<button"), true);
    assert.equal(unavailableBranch.includes('type="button"'), true);
    assert.equal(unavailableBranch.includes('aria-disabled="true"'), true);
    assert.equal(unavailableBranch.includes("<Link"), false);
    assert.equal(
      unavailableBranch.includes("FloatingAttendanceButton"),
      false
    );
  });

  it("explains WHY attendance is unavailable when tapped", () => {
    assert.equal(
      bottomNav.includes("ABSEN_UNAVAILABLE_NOTICE"),
      true,
      "the unavailable ABSEN control must surface an explanation"
    );
    assert.match(bottomNav, /role="status"/);
    assert.match(bottomNav, /Hubungi administrator/);
    assert.match(bottomNav, /aria-expanded=\{absenNotice\}/);
  });
});

describe("face-attendance sheet (ABSEN dialog)", () => {
  it("is mounted once in the authenticated shell", () => {
    assert.equal(shell.includes('from "@/features/attendance/attendance-sheet"'), true);
    assert.equal(shell.includes("<AttendanceSheet />"), true);
  });

  it("is an accessible modal dialog with Escape and focus trap", () => {
    assert.equal(sheet.includes('role="dialog"'), true);
    assert.equal(sheet.includes('aria-modal="true"'), true);
    assert.equal(sheet.includes('event.key === "Escape"'), true);
    assert.equal(sheet.includes("createTabTrap("), true);
  });

  it("loads today's state and the eligible locations from the server", () => {
    assert.equal(sheet.includes("loadAttendanceSheetAction()"), true);
    assert.equal(sheetAction.startsWith('"use server"'), true);
    for (const token of [
      "requireUser()",
      "PERMISSIONS.ATTENDANCE_VIEW",
      "PERMISSIONS.ATTENDANCE_CHECK_IN",
      "PERMISSIONS.ATTENDANCE_CHECK_OUT",
      "getEmployeeForUser(",
      "findOpenAttendance(",
      "findAttendanceForDate(",
      "listEligibleAttendanceOptions(",
    ]) {
      assert.equal(sheetAction.includes(token), true, `loader must call ${token}`);
    }
  });

  it("submits through the server-authoritative actions only", () => {
    assert.equal(sheetCode.includes("checkInAction("), true);
    assert.equal(sheetCode.includes("checkOutAction("), true);
    // Same FormData boundary as the attendance page: the photo is a file part.
    assert.equal(sheetCode.includes('formData.append("photo", photo, ATTENDANCE_PHOTO_CAPTURE_FILENAME)'), true);
    assert.equal(sheetCode.includes('formData.append("location", JSON.stringify(locationPayload))'), true);
    assert.equal(/employeeId|organizationId|attendanceDate/.test(sheetCode.replace(/openLocationName/g, "")), false);
  });

  it("requires the live camera for check-in and only GPS for check-out", () => {
    assert.equal(sheetCode.includes('(mode === "check_out" || camera === "active")'), true);
    assert.equal(sheetCode.includes("await checkOutAction({ location: locationPayload })"), true);
  });

  it("guards against double submission and offline submits", () => {
    assert.equal(sheetCode.includes("if (!mode || pending) return;"), true);
    assert.equal(sheetCode.includes("useTransition"), true);
    assert.equal(sheetCode.includes("isBrowserOffline(navigator.onLine)"), true);
  });

  it("stops the camera when hidden and on unmount, and never persists the frame", () => {
    assert.equal(sheetCode.includes('document.addEventListener("visibilitychange"'), true);
    assert.equal(sheetCode.includes("getTracks().forEach((track) => track.stop())"), true);
    assert.equal(/toDataURL|createObjectURL|localStorage|sessionStorage/.test(sheetCode), false);
  });

  it("does not introduce liveness detection or claim identity verification", () => {
    assert.equal(/liveness/i.test(sheet), false);
    assert.equal(sheetCode.includes("verifyFaceAction"), false);
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
    assert.equal(navigation.includes('title: "Absensi Saya"'), true);
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

  it("does not render the dev-phase identity-verification pre-flight", () => {
    // The ABSEN flow must not look like a Face ID step: the camera
    // pre-flight block contributed nothing to the server decision and is
    // not required for submission. Presence evidence stays with the
    // required attendance photo capture (check-in only).
    assert.equal(
      panel.includes("Identity verification is not configured"),
      false
    );
    assert.equal(panel.includes("<AttendanceCamera"), false);
    assert.equal(panel.includes("AttendancePhotoCapture"), true);
  });
});
