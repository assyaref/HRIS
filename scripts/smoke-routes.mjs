#!/usr/bin/env node
/**
 * Route smoke test: signs in and opens every page of the app, reporting
 * server errors (HTTP 5xx), the Next.js error UI and browser console errors.
 * 403 / "Akses ditolak" is a pass — RBAC decides who may open what.
 *
 * Requires Playwright (not a project dependency):
 *   npx playwright install chromium   # once, if no browser is available
 *
 * Usage:
 *   SMOKE_BASE_URL=http://localhost:3000 \
 *   SMOKE_USER=admin@example.test SMOKE_PASSWORD=... \
 *   node scripts/smoke-routes.mjs [--id employeeId=<uuid> --id leaveId=<uuid> ...]
 *
 * Detail routes whose id is not supplied are skipped. Exit code 1 when any
 * route fails, so it can gate a deploy.
 */
import { createRequire } from "node:module";

// Playwright is optional: load it through require() so a global install
// (NODE_PATH) works as well as a local one, with a clear message if absent.
let chromium;
try {
  ({ chromium } = createRequire(import.meta.url)("playwright"));
} catch {
  console.error("Playwright is not installed: npm i -D playwright (or install it globally).");
  process.exit(2);
}

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const USER = process.env.SMOKE_USER;
const PASSWORD = process.env.SMOKE_PASSWORD;
if (!USER || !PASSWORD) {
  console.error("Set SMOKE_USER and SMOKE_PASSWORD.");
  process.exit(2);
}

const ids = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--id" && argv[i + 1]) {
    const [key, value] = argv[++i].split("=");
    ids[key] = value;
  }
}

/** Every page route; `:name` segments are filled from --id name=<uuid>. */
const ROUTES = [
  "/dashboard", "/notifications", "/employees", "/employees/:employeeId",
  "/attendance", "/attendance/:attendanceId", "/attendance/management",
  "/attendance/readiness", "/attendance/recap", "/attendance/recap/:employeeId",
  "/face-id", "/leave", "/leave/:leaveId", "/leave/balances",
  "/leave/management", "/leave/types", "/permission", "/permission/:permissionId",
  "/permission/management", "/payroll", "/payroll/:periodId",
  "/payroll/components", "/payroll/payslips", "/payroll/payslips/upload",
  "/payroll/payslips/bulk-upload", "/payslip", "/announcements",
  "/announcements/:announcementId", "/announcements/management",
  "/announcements/management/new",
  "/announcements/management/:announcementId/edit", "/projects",
  "/projects/:projectId", "/settings/account", "/settings/employee-fields",
  "/settings/organizations", "/settings/organizations/:organizationId",
  "/settings/permissions", "/settings/roles", "/settings/roles/:roleId",
  "/settings/test-data", "/settings/users", "/settings/work-locations",
  "/settings/work-locations/:locationId", "/change-password",
  "/approvals", "/monitoring/contracts", "/reports/employees", "/reports/leave",
  "/settings/audit-trail", "/organization/chart",
  "/compliance/mcu", "/compliance/trainings", "/compliance/trainings?tab=matrix",
  "/compliance/trainings?tab=master",
  "/time/calendar", "/time/calendar?month=2026-08", "/time/shifts", "/time/shifts?tab=groups",
  "/overtime", "/overtime/management", "/approvals?type=overtime",
  "/profile-changes", "/profile-changes?status=all", "/approvals?type=profile",
  "/helpdesk", "/helpdesk/management", "/helpdesk/management?status=all",
  "/helpdesk/management?tab=categories", "/notifications",
  "/documents", "/documents?tab=types", "/documents?tab=templates",
  "/organization/master", "/organization/master?tab=positions", "/organization/master?tab=grades",
  "/agenda", "/agenda?view=past", "/team-approvals", "/settings/approval-flow",
  "/timesheet", "/timesheet?week=2026-11-09", "/timesheet/management", "/timesheet/management?status=submitted", "/approvals?type=timesheet",
  "/time/schedule-report", "/time/schedule-report?view=matrix", "/payroll/components", "/time/schedule-report?month=2026-02&grace=0",
];

const ERROR_UI =
  /Application error|Unhandled Runtime Error|Internal Server Error|This page couldn.t load/i;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let consoleErrors = [];
page.on("console", (message) => {
  // Third-party widgets (weather / prayer) may be offline: not an app error.
  if (message.type() === "error" && !/Failed to load resource/.test(message.text())) {
    consoleErrors.push(message.text().slice(0, 200));
  }
});
page.on("pageerror", (error) => consoleErrors.push(`pageerror: ${error.message}`));

await page.goto(`${BASE}/login`);
await page.fill("input[name=identifier]", USER);
await page.fill("input[type=password]", PASSWORD);
await Promise.all([
  page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 60_000 }),
  page.click("button[type=submit]"),
]);

let failures = 0;
for (const pattern of ROUTES) {
  const missing = [...pattern.matchAll(/:(\w+)/g)].map((m) => m[1]).filter((k) => !ids[k]);
  if (missing.length) {
    console.log(`skip  ${pattern} (no --id ${missing.join(", ")})`);
    continue;
  }
  const route = pattern.replace(/:(\w+)/g, (_, key) => ids[key]);
  consoleErrors = [];
  try {
    const response = await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 120_000 });
    const status = response?.status() ?? 0;
    const errorUi = ERROR_UI.test(await page.locator("body").innerText());
    const failed = status >= 500 || errorUi || consoleErrors.length > 0;
    if (failed) failures++;
    console.log(`${failed ? "FAIL" : "ok  "}  ${status}  ${route}${errorUi ? "  [error UI]" : ""}${consoleErrors.length ? `  ${consoleErrors.join(" | ")}` : ""}`);
  } catch (error) {
    failures++;
    console.log(`FAIL  timeout  ${route}  ${String(error).slice(0, 120)}`);
  }
}
await browser.close();
console.log(failures ? `\n${failures} route(s) failed.` : "\nAll routes passed.");
process.exit(failures ? 1 : 0);
