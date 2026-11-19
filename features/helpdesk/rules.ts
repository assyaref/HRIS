/**
 * Pure helpdesk rules (labels, ticket numbers, status flow, unread logic).
 * No framework imports — unit-tested directly.
 */

export const PRIORITY_LABELS: Record<string, string> = {
  low: "Rendah",
  normal: "Normal",
  high: "Tinggi",
};
export const PRIORITY_COLORS: Record<string, string> = {
  low: "#94A3B8",
  normal: "#3B82F6",
  high: "#EF4444",
};

export const STATUS_LABELS: Record<string, string> = {
  open: "Baru",
  in_progress: "Diproses",
  resolved: "Selesai",
  closed: "Ditutup",
};
export const STATUS_BADGE: Record<string, "warning" | "info" | "success" | "outline"> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "outline",
};
export const STATUS_COLORS: Record<string, string> = {
  open: "#F59E0B",
  in_progress: "#3B82F6",
  resolved: "#22C55E",
  closed: "#94A3B8",
};

/** Default categories offered when an organization has none yet. */
export const DEFAULT_CATEGORIES = [
  "Absensi & Jadwal",
  "Cuti & Izin",
  "Gaji & Slip Gaji",
  "Data Karyawan",
  "Akun & Aplikasi",
  "Lainnya",
] as const;

/** "TKT-2611-0007" for the 7th ticket of November 2026. */
export function formatTicketNumber(day: string, sequence: number): string {
  const yymm = `${day.slice(2, 4)}${day.slice(5, 7)}`;
  return `TKT-${yymm}-${String(Math.max(1, sequence)).padStart(4, "0")}`;
}

/** Prefix shared by every ticket number of the month containing `day`. */
export function ticketPrefix(day: string): string {
  return formatTicketNumber(day, 1).slice(0, -4);
}

/** Next sequence from the highest existing number of the month (or 1). */
export function nextSequence(existing: string[], prefix: string): number {
  let max = 0;
  for (const value of existing) {
    if (!value.startsWith(prefix)) continue;
    const n = Number.parseInt(value.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** Whether the status counts as finished (no more replies expected). */
export function isFinished(status: string): boolean {
  return status === "resolved" || status === "closed";
}

/**
 * Status after a new message. An employee writing on a finished ticket
 * reopens it; an agent reply moves a new ticket to "in progress".
 */
export function statusAfterMessage(current: string, fromAgent: boolean, internal: boolean): string {
  if (internal) return current;
  if (!fromAgent) return isFinished(current) ? "open" : current;
  return current === "open" ? "in_progress" : current;
}

/** The employee has an unseen HR reply. */
export function hasUnreadReply(ticket: {
  lastMessageFromAgent: boolean;
  lastMessageAt: Date;
  employeeLastReadAt: Date | null;
}): boolean {
  if (!ticket.lastMessageFromAgent) return false;
  return !ticket.employeeLastReadAt || ticket.employeeLastReadAt < ticket.lastMessageAt;
}
