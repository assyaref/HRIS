"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { EmployeeDeleteDialog } from "./employee-delete-dialog";
import { EmployeePermanentDeleteDialog } from "./delete-employee-dialog";
import { EmployeeBulkDeleteDialog } from "./employee-bulk-delete-dialog";
import { EmployeeStatusBadge } from "./employee-status-badge";
import type { EmployeeListItem } from "./queries";

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function rowActions({
  employee,
  organizationId,
  canEdit,
  canDelete,
  canPermanentDelete,
  detailContext,
}: {
  employee: EmployeeListItem;
  organizationId: string;
  canEdit: boolean;
  canDelete: boolean;
  canPermanentDelete: boolean;
  /** Query string (no leading `?`) carrying the active org/project scope. */
  detailContext?: string;
}) {
  const detailHref = detailContext
    ? `/employees/${employee.id}?${detailContext}`
    : `/employees/${employee.id}`;
  return (
    <>
      <Link
        href={detailHref}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        View
      </Link>
      {canEdit ? (
        <Link
          href={detailHref}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Edit
        </Link>
      ) : null}
      {canDelete && employee.employmentStatus === "active" ? (
        <EmployeeDeleteDialog employee={employee} />
      ) : null}
      {/* Permanent deletion is a SEPARATE, higher-privilege capability
          (`employees.permanent_delete`, Super Administrator only) and is
          available for active AND inactive records. Deactivate above keeps its
          own `employees.delete` gate and its own status guard, so no other
          role's behavior changes. The server action re-authorizes regardless;
          hiding the row action is UX, not security. */}
      {canPermanentDelete ? (
        <EmployeePermanentDeleteDialog
          employee={employee}
          organizationId={organizationId}
        />
      ) : null}
    </>
  );
}

/**
 * Org-scoped employee table (client component). Rows carry View | Edit |
 * Deactivate | Permanent Delete actions; every destination/action is
 * independently protected server-side. The destructive Deactivate action is
 * rendered for callers holding `employees.delete`, and Permanent Delete only
 * for callers holding `employees.permanent_delete`. On small screens the table
 * collapses into stacked cards with the same action set.
 *
 * Selection state lives here: the header checkbox toggles every displayed row,
 * individual checkboxes toggle specific employees, and the bulk "Delete
 * Selected Employees" action (Super Administrator only) applies only to
 * explicitly selected employees. Selection never survives a change of
 * organization, project, search, status filter or page — stale ids are dropped
 * whenever the displayed list changes, so a hidden employee can never be
 * deleted by accident.
 */
export function EmployeeTable({
  employees,
  organizationId,
  canEdit = false,
  canDelete = false,
  canPermanentDelete = false,
  detailContext,
  organizationName,
}: {
  employees: EmployeeListItem[];
  /**
   * The organization whose rows are listed. Threaded into the permanent-delete
   * dialog and re-validated against the record's owner server-side.
   */
  organizationId: string;
  canEdit?: boolean;
  canDelete?: boolean;
  canPermanentDelete?: boolean;
  /**
   * Active organization + project scope (as a query string) forwarded to the
   * View/Edit targets so the detail page and its "back" control keep the
   * filters the user was browsing.
   */
  detailContext?: string;
  /** Display name of the listed organization (Super Administrator only). */
  organizationName?: string;
}) {
  const [rawSelectedIds, setRawSelectedIds] = useState<string[]>([]);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const employeeIds = useMemo(
    () => new Set(employees.map((employee) => employee.id)),
    [employees]
  );

  // Selection only ever refers to employees currently displayed. When the
  // organization, project, search, status filter or page changes, ids that are
  // no longer displayed drop out automatically — previously hidden selections
  // are never acted on.
  const selectedIds = useMemo(
    () => rawSelectedIds.filter((id) => employeeIds.has(id)),
    [rawSelectedIds, employeeIds]
  );

  const isSelected = useCallback(
    (id: string) => selectedIds.includes(id),
    [selectedIds]
  );
  const toggle = (id: string) => {
    setRawSelectedIds((current) =>
      current.includes(id) ? current.filter((existing) => existing !== id) : [...current, id]
    );
  };
  const toggleAll = useCallback(() => {
    const allDisplayed = employees.map((employee) => employee.id);
    const allSelected = allDisplayed.length > 0 && allDisplayed.every((id) => isSelected(id));
    setRawSelectedIds(allSelected ? [] : allDisplayed);
  }, [employees, isSelected]);

  const selectedCount = selectedIds.length;
  const selectedEmployees = employees.filter((employee) => isSelected(employee.id));
  const canBulkDelete = canPermanentDelete && selectedCount > 0;

  const handleBulkDelete = async () => {
    setBulkDialogOpen(true);
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      {canBulkDelete ? (
        <div className="border-b border-border p-3 flex items-center justify-between gap-2 bg-muted/40">
          <div className="flex items-center gap-2 text-sm font-medium">
            {selectedCount} employee{selectedCount === 1 ? "" : "s"} selected
          </div>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleBulkDelete}
            data-testid="bulk-delete-selected-employees"
          >
            Delete Selected Employees ({selectedCount})
          </Button>
        </div>
      ) : null}

      <EmployeeBulkDeleteDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        employees={selectedEmployees}
        organizationId={organizationId}
        organizationName={organizationName}
      />

      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <label className="flex items-center">
                <span className="sr-only">Select all employees on this page</span>
                <input
                  type="checkbox"
                  checked={employees.length > 0 && selectedCount === employees.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-input"
                />
              </label>
            </TableHead>
            <TableHead>Employee No.</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Hire date</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {employees.map((employee) => (
            <TableRow key={employee.id}>
              <TableCell>
                <label className="flex items-center">
                  <span className="sr-only">
                    Select {employee.firstName} {employee.lastName}
                  </span>
                  <input
                    type="checkbox"
                    data-employee-select
                    name="employee"
                    value={employee.id}
                    checked={isSelected(employee.id)}
                    onChange={() => toggle(employee.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                </label>
              </TableCell>
              <TableCell className="font-mono text-xs">
                {employee.employeeNumber}
              </TableCell>
              <TableCell className="font-medium">
                {employee.firstName} {employee.lastName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {employee.email ?? employee.linkedUserEmail ?? "—"}
              </TableCell>
              <TableCell>
                <EmployeeStatusBadge status={employee.employmentStatus} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(employee.hireDate)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex flex-wrap justify-end gap-1">
                  {rowActions({
                    employee,
                    organizationId,
                    canEdit,
                    canDelete,
                    canPermanentDelete,
                    detailContext,
                  })}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ul className="divide-y divide-border md:hidden">
        {employees.map((employee) => (
          <li key={employee.id} className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {employee.firstName} {employee.lastName}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {employee.employeeNumber}
                </p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {employee.email ?? employee.linkedUserEmail ?? "—"}
                </p>
              </div>
              <EmployeeStatusBadge status={employee.employmentStatus} />
            </div>
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>Hired {formatDate(employee.hireDate)}</span>
              <div className="flex flex-wrap justify-end gap-1">
                {rowActions({
                  employee,
                  organizationId,
                  canEdit,
                  canDelete,
                  canPermanentDelete,
                  detailContext,
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
