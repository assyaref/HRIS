import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
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
import { EmployeeStatusBadge } from "./employee-status-badge";
import { SelectAllEmployees } from "./export/select-all-checkbox";
import type { EmployeeListItem } from "./queries";

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function rowActions({
  employee,
  canEdit,
  canDelete,
  canPermanentDelete,
}: {
  employee: EmployeeListItem;
  canEdit: boolean;
  canDelete: boolean;
  canPermanentDelete: boolean;
}) {
  return (
    <>
      <Link
        href={`/employees/${employee.id}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        View
      </Link>
      {canEdit ? (
        <Link
          href={`/employees/${employee.id}`}
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
        <EmployeePermanentDeleteDialog employee={employee} />
      ) : null}
    </>
  );
}

/**
 * Org-scoped employee table (server component). Rows carry View | Edit |
 * Deactivate | Permanent Delete actions; every destination/action is
 * independently protected server-side. The destructive Deactivate action is
 * rendered for callers holding `employees.delete`, and Permanent Delete only
 * for callers holding `employees.permanent_delete`. On small screens the table
 * collapses into stacked cards with the same action set.
 */
export function EmployeeTable({
  employees,
  canEdit = false,
  canDelete = false,
  canPermanentDelete = false,
}: {
  employees: EmployeeListItem[];
  canEdit?: boolean;
  canDelete?: boolean;
  canPermanentDelete?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table className="hidden md:table">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <SelectAllEmployees />
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
                  {rowActions({ employee, canEdit, canDelete, canPermanentDelete })}
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
                {rowActions({ employee, canEdit, canDelete, canPermanentDelete })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
