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
}: {
  employee: EmployeeListItem;
  canEdit: boolean;
  canDelete: boolean;
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
    </>
  );
}

/**
 * Org-scoped employee table (server component). Rows link to the employee
 * detail route; every destination is independently protected server-side.
 */
export function EmployeeTable({
  employees,
  canEdit = false,
  canDelete = false,
}: {
  employees: EmployeeListItem[];
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
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
                <div className="flex justify-end gap-1">
                  {rowActions({ employee, canEdit, canDelete })}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
