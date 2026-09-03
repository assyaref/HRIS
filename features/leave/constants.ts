/**
 * Leave module constants (Phase 7).
 */

export const LEAVE_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type LeaveRequestStatus = (typeof LEAVE_REQUEST_STATUSES)[number];

export const LEAVE_REQUEST_STATUS_LABELS: Record<
  LeaveRequestStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Default number of rows shown in leave lists. */
export const LEAVE_PAGE_SIZE = 20;

/** The year bucket used for balances, derived from the request start date. */
export function yearFromDateString(value: string): string {
  return value.slice(0, 4);
}
