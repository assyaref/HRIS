/**
 * Payroll module constants (Phase 8).
 */

export const PAYROLL_PERIOD_STATUSES = [
  "draft",
  "processing",
  "pending_approval",
  "approved",
  "locked",
  "cancelled",
] as const;
export type PayrollPeriodStatus =
  (typeof PAYROLL_PERIOD_STATUSES)[number];

export const PAYROLL_PERIOD_STATUS_LABELS: Record<
  PayrollPeriodStatus,
  string
> = {
  draft: "Draft",
  processing: "Processing",
  pending_approval: "Pending approval",
  approved: "Approved",
  locked: "Locked",
  cancelled: "Cancelled",
};

export const PAYROLL_RUN_STATUSES = [
  "draft",
  "calculated",
  "submitted",
  "approved",
  "locked",
  "rejected",
  "cancelled",
] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const PAYROLL_RUN_STATUS_LABELS: Record<PayrollRunStatus, string> = {
  draft: "Draft",
  calculated: "Calculated",
  submitted: "Submitted",
  approved: "Approved",
  locked: "Locked",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const PAYROLL_COMPONENT_TYPES = ["earning", "deduction"] as const;
export type PayrollComponentType =
  (typeof PAYROLL_COMPONENT_TYPES)[number];

export const PAYROLL_COMPONENT_TYPE_LABELS: Record<
  PayrollComponentType,
  string
> = {
  earning: "Earning",
  deduction: "Deduction",
};

export const PAYROLL_COMPONENT_METHODS = [
  "fixed",
  "percentage",
  "manual",
] as const;
export type PayrollComponentMethod =
  (typeof PAYROLL_COMPONENT_METHODS)[number];

export const PAYROLL_COMPONENT_METHOD_LABELS: Record<
  PayrollComponentMethod,
  string
> = {
  fixed: "Fixed amount",
  percentage: "Percentage of fixed earnings",
  manual: "Manual",
};

export const PAYROLL_ITEM_STATUSES = ["processing", "included", "excluded"] as const;
export type PayrollItemStatus = (typeof PAYROLL_ITEM_STATUSES)[number];

export const PAYROLL_ITEM_STATUS_LABELS: Record<PayrollItemStatus, string> = {
  processing: "Processing",
  included: "Included",
  excluded: "Excluded",
};

export const PAYSLIP_STATUSES = [
  "generated",
  "published",
  "revoked",
] as const;
export type PayslipStatus = (typeof PAYSLIP_STATUSES)[number];

export const PAYSLIP_STATUS_LABELS: Record<PayslipStatus, string> = {
  generated: "Generated",
  published: "Published",
  revoked: "Revoked",
};

export const PAYROLL_EVENT_TYPES = [
  "payroll.period_created",
  "payroll.calculated",
  "payroll.submitted",
  "payroll.approved",
  "payroll.rejected",
  "payroll.locked",
  "payroll.cancelled",
  "payslip.generated",
  "payslip.published",
] as const;
export type PayrollEventType = (typeof PAYROLL_EVENT_TYPES)[number];

/** Default working days per week used for absence-day counting. */
export const WORKING_DAY_COUNT_PER_WEEK = 5;

/** States that are immutable (no recalculation or edits allowed). */
export const IMMUTABLE_PAYROLL_STATUSES: readonly PayrollPeriodStatus[] = [
  "locked",
];