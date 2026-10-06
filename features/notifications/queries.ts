import "server-only";

import { getEmployeeByUserId } from "@/features/employees/queries";
import { listMyAnnouncements } from "@/features/announcements/queries";
import {
  LEAVE_REQUEST_STATUS_LABELS,
  type LeaveRequestStatus,
} from "@/features/leave/constants";
import { listMyLeaveRequests } from "@/features/leave/queries";
import {
  PERMISSION_REQUEST_STATUS_LABELS,
  PERMISSION_TYPE_LABELS,
  type PermissionRequestStatus,
} from "@/features/permission/constants";
import { listMyPermissionRequests } from "@/features/permission/queries";
import { listMyPublishedPayslips } from "@/features/payroll/queries";

import type { NotificationCategory } from "./constants";

export interface EmployeeNotification {
  id: string;
  category: Exclude<NotificationCategory, "all">;
  title: string;
  description: string;
  time: Date;
  unread: boolean;
  href: string | null;
}

export interface MyNotificationsResult {
  items: EmployeeNotification[];
  unreadCount: number;
}

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function monthLabel(value: Date | null): string {
  if (!value) return "Periode tidak diketahui";
  return `${MONTHS_ID[value.getUTCMonth()]} ${value.getUTCFullYear()}`;
}

/**
 * Employee notification feed, derived from real records for the signed-in
 * employee only. Every source query is already organization- and
 * employee-scoped; no client-supplied identifiers are accepted.
 */
export async function listMyNotifications(
  userId: string,
  organizationId: string
): Promise<MyNotificationsResult> {
  const employee = await getEmployeeByUserId(userId, organizationId);
  if (!employee) {
    return { items: [], unreadCount: 0 };
  }

  const [announcements, leave, permissions, payslips] = await Promise.all([
    listMyAnnouncements({ organizationId, employeeId: employee.id }),
    listMyLeaveRequests(organizationId, employee.id),
    listMyPermissionRequests(organizationId, employee.id),
    listMyPublishedPayslips(organizationId, employee.id),
  ]);

  const items: EmployeeNotification[] = [];

  for (const announcement of announcements) {
    items.push({
      id: `announcement-${announcement.id}`,
      category: "announcement",
      title: announcement.title,
      description:
        announcement.content.length > 160
          ? `${announcement.content.slice(0, 157)}…`
          : announcement.content,
      time:
        announcement.publishedAt ??
        announcement.createdAt,
      unread: !announcement.isRead,
      href: `/announcements/${announcement.id}`,
    });
  }

  for (const request of leave) {
    const statusLabel =
      LEAVE_REQUEST_STATUS_LABELS[request.status as LeaveRequestStatus] ??
      request.status;
    items.push({
      id: `leave-${request.id}`,
      category: "approval",
      title: `Pengajuan ${request.leaveTypeName}`,
      description: `Status: ${statusLabel} · ${request.totalDays} hari`,
      time: request.reviewedAt ?? request.submittedAt,
      unread: false,
      href: `/leave/${request.id}`,
    });
  }

  for (const request of permissions) {
    const statusLabel =
      PERMISSION_REQUEST_STATUS_LABELS[
        request.status as PermissionRequestStatus
      ] ?? request.status;
    const typeLabel =
      PERMISSION_TYPE_LABELS[
        request.permissionType as keyof typeof PERMISSION_TYPE_LABELS
      ] ?? request.permissionType;
    items.push({
      id: `permission-${request.id}`,
      category: "approval",
      title: `Pengajuan ${typeLabel}`,
      description: `Status: ${statusLabel}`,
      time: request.submittedAt,
      unread: false,
      href: `/permission/${request.id}`,
    });
  }

  for (const payslip of payslips) {
    items.push({
      id: `payslip-${payslip.id}`,
      category: "payroll",
      title: `Slip Gaji ${monthLabel(payslip.issuedAt)}`,
      description: `Payslip ${payslip.payslipNumber} telah tersedia.`,
      time: payslip.issuedAt,
      unread: false,
      href: `/payroll/payslips/${payslip.id}`,
    });
  }

  items.sort((a, b) => b.time.getTime() - a.time.getTime());

  return {
    items,
    unreadCount: items.filter((item) => item.unread).length,
  };
}
