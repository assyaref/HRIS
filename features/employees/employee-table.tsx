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

import { EmployeeStatusBadge } from "./employee-status-badge";
import type { EmployeeListItem } from "./queries";

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

/**
 * Org-scoped employee table (server component). Rows link to the employee
 * detail route; every destination is independently protected server-side.
 */
export function EmployeeTable({
  employees,
}: {
  employees: EmployeeListItem[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
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
                <Link
                  href={`/employees/${employee.id}`}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
