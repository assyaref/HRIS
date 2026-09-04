import { Badge } from "@/components/ui/badge";

import {
  PAYROLL_COMPONENT_TYPE_LABELS,
  PAYROLL_ITEM_STATUS_LABELS,
  PAYROLL_PERIOD_STATUS_LABELS,
  PAYROLL_RUN_STATUS_LABELS,
  PAYSLIP_STATUS_LABELS,
  type PayrollComponentType,
  type PayrollItemStatus,
  type PayrollPeriodStatus,
  type PayrollRunStatus,
  type PayslipStatus,
} from "./constants";

function statusVariant(status: string): "primary" | "secondary" | "outline" | "destructive" {
  if (
    status === "approved" ||
    status === "locked" ||
    status === "published" ||
    status === "included"
  ) {
    return "primary";
  }
  if (status === "cancelled" || status === "excluded") {
    return "secondary";
  }
  if (status === "rejected" || status === "revoked") {
    return "destructive";
  }
  return "outline";
}

export function PayrollPeriodStatusBadge({
  status,
}: {
  status: PayrollPeriodStatus;
}) {
  return (
    <Badge variant={statusVariant(status)}>
      {PAYROLL_PERIOD_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PayrollRunStatusBadge({
  status,
}: {
  status: PayrollRunStatus;
}) {
  return (
    <Badge variant={statusVariant(status)}>
      {PAYROLL_RUN_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PayrollItemStatusBadge({
  status,
}: {
  status: PayrollItemStatus;
}) {
  return (
    <Badge variant={statusVariant(status)}>
      {PAYROLL_ITEM_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PayslipStatusBadge({
  status,
}: {
  status: PayslipStatus;
}) {
  return (
    <Badge variant={statusVariant(status)}>
      {PAYSLIP_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PayrollComponentTypeBadge({
  type,
}: {
  type: PayrollComponentType;
}) {
  return (
    <Badge variant={type === "earning" ? "primary" : "secondary"}>
      {PAYROLL_COMPONENT_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}