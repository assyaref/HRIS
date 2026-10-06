/**
 * Employee notification categories.
 *
 * There is no dedicated notifications table in this deployment. The employee
 * notification feed is a derived, org/employee-scoped read model over existing
 * records (announcements, leave/permission decisions, published payslips), so
 * it never fabricates data and stays server-authorised. Adding a real
 * notification backend later only requires changing `features/notifications`.
 */
export const NOTIFICATION_CATEGORIES = [
  "all",
  "announcement",
  "approval",
  "payroll",
  "attendance",
  "system",
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> =
  {
    all: "Semua",
    announcement: "Pengumuman",
    approval: "Persetujuan",
    payroll: "Payroll",
    attendance: "Attendance",
    system: "System",
  };

export function isNotificationCategory(
  value: string
): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}
