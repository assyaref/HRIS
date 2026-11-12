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
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
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
  personal: "Keperluan Pribadi",
  errand: "Urusan di Luar",
  home_office: "Kerja dari Rumah",
  official_business: "Dinas",
  other: "Lainnya",
};

export const PERMISSION_PAGE_SIZE = 20;
