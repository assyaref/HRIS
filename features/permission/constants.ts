/**
 * Permission (absence) request constants (Phase 7).
 */

export const PERMISSION_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;
export type PermissionRequestStatus =
  (typeof PERMISSION_REQUEST_STATUSES)[number];

export const PERMISSION_REQUEST_STATUS_LABELS: Record<
  PermissionRequestStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Controlled permission/absence categories. */
export const PERMISSION_TYPES = [
  "personal",
  "errand",
  "home_office",
  "official_business",
  "other",
] as const;
export type PermissionType = (typeof PERMISSION_TYPES)[number];

export const PERMISSION_TYPE_LABELS: Record<PermissionType, string> = {
  personal: "Personal",
  errand: "Errand",
  home_office: "Home office",
  official_business: "Official business",
  other: "Other",
};

export const PERMISSION_PAGE_SIZE = 20;
