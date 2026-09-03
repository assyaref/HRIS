import { Badge } from "@/components/ui/badge";
import {
  EMPLOYEE_STATUS_LABELS,
  type EmployeeStatus,
} from "./constants";

/** Renders an employee's employment status as a badge. */
export function EmployeeStatusBadge({
  status,
}: {
  status: EmployeeStatus;
}) {
  const label = EMPLOYEE_STATUS_LABELS[status] ?? status;
  if (status === "inactive") {
    return <Badge variant="secondary">{label}</Badge>;
  }
  return <Badge variant="primary">{label}</Badge>;
}
