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

import { isHelpdeskModuleReady } from "@/features/helpdesk/module";
import { listTickets } from "@/features/helpdesk/queries";
import { hasUnreadReply, STATUS_LABELS as HELPDESK_STATUS_LABELS } from "@/features/helpdesk/rules";
import { fieldLabel } from "@/features/profile-changes/fields";
import { isProfileChangeModuleReady } from "@/features/profile-changes/module";
import { listProfileChanges } from "@/features/profile-changes/queries";
import { isTimeModuleReady } from "@/features/time/module";
import { isAgendaReady } from "@/features/agenda/module";
import { listAgenda, listMyResponses } from "@/features/agenda/queries";
import { isForDepartment, whenLabel } from "@/features/agenda/rules";
import { isTimesheetModuleReady } from "@/features/timesheets/module";
import { listMyDecidedWeeks } from "@/features/timesheets/queries";
import { hhmm, weekLabel } from "@/features/timesheets/rules";
import { listOvertime } from "@/features/time/queries";
import { formatDuration, OVERTIME_STATUS_LABELS } from "@/features/time/rules";

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

  // Modules from additive migrations (0024–0026) join the feed once their
  // tables exist; before that they simply contribute nothing.
  const [timeReady, profileReady, helpdeskReady, timesheetReady, agendaReady] = await Promise.all([
    isTimeModuleReady(),
    isProfileChangeModuleReady(),
    isHelpdeskModuleReady(),
    isTimesheetModuleReady(),
    isAgendaReady(),
  ]);
  const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [announcements, leave, permissions, payslips, overtime, profileChanges, tickets, timesheetWeeks] = await Promise.all([
    listMyAnnouncements({ organizationId, employeeId: employee.id }),
    listMyLeaveRequests(organizationId, employee.id),
    listMyPermissionRequests(organizationId, employee.id),
    listMyPublishedPayslips(organizationId, employee.id),
    timeReady
      ? listOvertime(organizationId, { employeeId: employee.id, from: yearAgo, to: farFuture })
      : Promise.resolve([]),
    profileReady ? listProfileChanges(organizationId, { employeeId: employee.id }) : Promise.resolve([]),
    helpdeskReady ? listTickets(organizationId, { employeeId: employee.id }) : Promise.resolve([]),
    timesheetReady ? listMyDecidedWeeks(organizationId, employee.id) : Promise.resolve([]),
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

  for (const request of overtime) {
    // Only decisions are news; a pending request is the employee's own action.
    if (request.status !== "approved" && request.status !== "rejected") continue;
    items.push({
      id: `overtime-${request.id}`,
      category: "approval",
      title: `Lembur ${request.overtimeDate}`,
      description: `Status: ${OVERTIME_STATUS_LABELS[request.status] ?? request.status} · ${formatDuration(request.totalMinutes)}`,
      time: request.reviewedAt ?? request.createdAt,
      unread: false,
      href: "/overtime",
    });
  }

  for (const request of profileChanges) {
    if (request.status !== "approved" && request.status !== "rejected") continue;
    const fields = Object.keys(request.changes ?? {}).map(fieldLabel).join(", ");
    items.push({
      id: `profile-change-${request.id}`,
      category: "approval",
      title: request.status === "approved" ? "Perubahan data disetujui" : "Perubahan data ditolak",
      description: request.reviewerNote ? `${fields} · ${request.reviewerNote}` : fields,
      time: request.reviewedAt ?? request.createdAt,
      unread: false,
      href: "/settings/account",
    });
  }

  // Agenda: events in the next 7 days the employee is invited to; unread
  // while an RSVP is asked and not answered yet.
  if (agendaReady) {
    const now = new Date();
    const soon = (await listAgenda(organizationId, now, new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000))).filter(
      (e) => !e.cancelled && isForDepartment(e.audienceDepartments, employee.department ?? null)
    );
    const answered = await listMyResponses(organizationId, employee.id, soon.map((e) => e.id));
    for (const event of soon) {
      items.push({
        id: `agenda-${event.id}`,
        category: "announcement",
        title: `Agenda: ${event.title}`,
        description: whenLabel(event.startAt, event.endAt, event.allDay) + (event.location ? ` · ${event.location}` : ""),
        time: event.startAt,
        unread: event.requireRsvp && !answered.has(event.id),
        href: `/agenda/${event.id}`,
      });
    }
  }

  for (const week of timesheetWeeks) {
    items.push({
      id: `timesheet-${week.weekStart}`,
      category: "approval",
      title: week.status === "approved" ? "Timesheet disetujui" : "Timesheet ditolak",
      description: `${weekLabel(week.weekStart)} · ${hhmm(week.minutes)} jam${week.reviewerNote ? ` · ${week.reviewerNote}` : ""}`,
      time: week.reviewedAt,
      unread: false,
      href: `/timesheet?week=${week.weekStart}`,
    });
  }

  for (const ticket of tickets) {
    if (!ticket.lastMessageFromAgent) continue;
    items.push({
      id: `helpdesk-${ticket.id}`,
      category: "system",
      title: `Balasan HR: ${ticket.subject}`,
      description: `${ticket.ticketNumber} · ${HELPDESK_STATUS_LABELS[ticket.status] ?? ticket.status}`,
      time: ticket.lastMessageAt,
      unread: hasUnreadReply(ticket),
      href: `/helpdesk/${ticket.id}`,
    });
  }

  items.sort((a, b) => b.time.getTime() - a.time.getTime());

  return {
    items,
    unreadCount: items.filter((item) => item.unread).length,
  };
}
