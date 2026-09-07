import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import {
  RECONCILIATION_REASON_LABELS,
  RECONCILIATION_STATUSES,
  filterReconciliationRows,
  summarizeReconciliation,
  type ReconciliationRow,
  type ReconciliationStatus,
} from "@/features/attendance/reconciliation";
import { getOrganizationAttendanceReadiness } from "@/features/attendance/reconciliation.queries";

export const metadata: Metadata = {
  title: "Attendance readiness",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function parseStatus(
  value: string | string[] | undefined
): ReconciliationStatus | undefined {
  const raw = readParam(value);
  if (!raw) return undefined;
  return RECONCILIATION_STATUSES.includes(
    raw as ReconciliationStatus
  )
    ? (raw as ReconciliationStatus)
    : undefined;
}

function parseUuidParam(
  value: string | string[] | undefined
): string | undefined {
  const raw = readParam(value);
  if (!raw || !UUID_PATTERN.test(raw)) return undefined;
  return raw;
}


function ReadinessBadge({ status }: { status: ReconciliationStatus }) {
  if (status === "READY") {
    return <Badge variant="primary">READY</Badge>;
  }
  if (status === "WARNING") {
    return <Badge variant="secondary">WARNING</Badge>;
  }
  return <Badge variant="destructive">NOT READY</Badge>;
}

function AssignmentBadge({ assignment }: { assignment: "Active" | "None" }) {
  if (assignment === "Active") {
    return <Badge variant="primary">Active</Badge>;
  }
  return <Badge variant="outline">None</Badge>;
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "ready" | "warning" | "danger";
}) {
  const valueClass =
    tone === "ready"
      ? "text-emerald-700"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card>
      <CardHeader>
        <CardTitle className={`text-3xl tabular-nums ${valueClass}`}>
          {value}
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
    </Card>
  );
}

/**
 * Management attendance-readiness view (Phase 9.6) — READ-ONLY diagnostic.
 *
 * This page never requests GPS, never invokes the camera / Face Recognition
 * and never submits attendance. It only reconciles existing configuration.
 * Server-side authorization: `attendance.manage`.
 */
export default async function AttendanceReadinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = parseStatus(params.status);
  const projectId = parseUuidParam(params.projectId);
  const employeeId = parseUuidParam(params.employeeId);
  const workLocationId = parseUuidParam(params.workLocationId);

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const data = await getOrganizationAttendanceReadiness(organizationId);
  const rows = filterReconciliationRows(data.rows, {
    status,
    projectId,
    employeeId,
    workLocationId,
  });
  const summary = summarizeReconciliation(rows);

  const hasFilters = Boolean(
    status || projectId || employeeId || workLocationId
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Attendance readiness
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Operational readiness of employees, project assignments, and work
            locations for attendance. Read-only diagnostic.
          </p>
        </div>
        <Link
          href="/attendance/management"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to attendance management
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          label="Ready employees"
          value={summary.readyEmployees}
          tone="ready"
        />
        <SummaryCard
          label="Not ready employees"
          value={summary.notReadyEmployees}
          tone="danger"
        />
        <SummaryCard
          label="Warning conditions"
          value={summary.warningConditions}
          tone="warning"
        />
        <SummaryCard
          label="Projects without active location"
          value={summary.projectsWithoutActiveWorkLocation}
          tone="warning"
        />
        <SummaryCard
          label="Work locations without active assignment"
          value={summary.workLocationsWithoutActiveEmployeeAssignment}
          tone="warning"
        />
      </div>

      <form
        action="/attendance/readiness"
        method="get"
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-end"
      >
        <div className="space-y-2">
          <label htmlFor="readiness-status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="readiness-status"
            name="status"
            defaultValue={status ?? ""}
            className="flex h-10 w-full min-w-36 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All statuses</option>
            <option value="READY">READY</option>
            <option value="WARNING">WARNING</option>
            <option value="NOT_READY">NOT READY</option>
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="readiness-project" className="text-sm font-medium">
            Project
          </label>
          <select
            id="readiness-project"
            name="projectId"
            defaultValue={projectId ?? ""}
            className="flex h-10 w-full min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All projects</option>
            {data.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="readiness-employee" className="text-sm font-medium">
            Employee
          </label>
          <select
            id="readiness-employee"
            name="employeeId"
            defaultValue={employeeId ?? ""}
            className="flex h-10 w-full min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All employees</option>
            {data.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="readiness-location" className="text-sm font-medium">
            Work location
          </label>
          <select
            id="readiness-location"
            name="workLocationId"
            defaultValue={workLocationId ?? ""}
            className="flex h-10 w-full min-w-44 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All work locations</option>
            {data.workLocations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="inline-flex h-10 items-center justify-center rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
        >
          Filter
        </button>
        {hasFilters ? (
          <Link
            href="/attendance/readiness"
            className={buttonVariants({ variant: "ghost" })}
          >
            Clear
          </Link>
        ) : null}
      </form>


      {rows.length === 0 ? (
        <EmptyState
          title="No readiness results"
          description="No employees, projects, or work locations match the current filters."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Work location</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Readiness</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <ReadinessTableRow key={readinessRowKey(row)} row={row} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function readinessRowKey(row: ReconciliationRow): string {
  return [
    row.kind,
    row.employeeId ?? "",
    row.projectId ?? "",
    row.workLocationId ?? "",
    row.reason,
  ].join(":");
}

function ReadinessTableRow({ row }: { row: ReconciliationRow }) {
  return (
    <TableRow>
      <TableCell>
        {row.employeeName ? (
          <>
            <span className="font-medium">{row.employeeName}</span>
            {row.employeeNumber ? (
              <span className="block font-mono text-xs text-muted-foreground">
                {row.employeeNumber}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.projectName ? (
          <span className="text-sm">{row.projectName}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {row.workLocationName ? (
          <span className="text-sm">{row.workLocationName}</span>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <AssignmentBadge assignment={row.assignment} />
      </TableCell>
      <TableCell>
        <ReadinessBadge status={row.status} />
      </TableCell>
      <TableCell>
        <span className="text-sm">
          {RECONCILIATION_REASON_LABELS[row.reason] ?? row.reason}
        </span>
      </TableCell>
    </TableRow>
  );
}
