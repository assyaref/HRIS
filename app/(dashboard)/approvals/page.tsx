import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTabs } from "@/components/ui/status-tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import {
  APPROVAL_LIST_LIMIT,
  listApprovalInbox,
  type ApprovalKind,
} from "@/features/approvals/queries";
import { PERMISSION_TYPE_LABELS } from "@/features/permission/constants";
import { dateParam, textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Persetujuan" };

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
const STATUS_BADGE: Record<string, "warning" | "success" | "danger" | "outline"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "outline",
};

const KIND_LABEL: Record<ApprovalKind, string> = {
  leave: "Cuti",
  permission: "Izin",
  overtime: "Lembur",
  profile: "Perubahan data",
  timesheet: "Timesheet",
};

function shiftDays(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/**
 * Executive approval inbox: every leave and permission request in a
 * submission window, with status counts. Items open their own detail page,
 * where the existing approve / reject actions (and their guards) apply.
 * Shown to anyone who may approve or manage at least one request type.
 */
export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const authorization = await getUserAuthorization(user.id);
  const granted = new Set(authorization.permissionCodes);
  const canLeave =
    granted.has(PERMISSIONS.LEAVE_APPROVE) || granted.has(PERMISSIONS.LEAVE_MANAGE);
  const canPermission =
    granted.has(PERMISSIONS.PERMISSION_APPROVE) ||
    granted.has(PERMISSIONS.PERMISSION_MANAGE);
  const canOvertime =
    granted.has(PERMISSIONS.ATTENDANCE_APPROVE) ||
    granted.has(PERMISSIONS.ATTENDANCE_MANAGE);
  const canProfile =
    authorization.isSuperAdmin ||
    (granted.has(PERMISSIONS.EMPLOYEES_VIEW) && granted.has(PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE));
  if (!canLeave && !canPermission && !canOvertime && !canProfile) forbidden();

  const params = await searchParams;
  const today = todayKey();
  const from = dateParam(params.from, shiftDays(today, -30));
  const to = dateParam(params.to, today);
  const requestedKind = textParam(params.type);
  const status = textParam(params.status) ?? "";
  const available: ApprovalKind[] = [
    ...(canLeave ? (["leave"] as const) : []),
    ...(canPermission ? (["permission"] as const) : []),
    ...(canOvertime ? (["overtime", "timesheet"] as const) : []),
    ...(canProfile ? (["profile"] as const) : []),
  ];
  const kinds = available.filter((k) => !requestedKind || k === requestedKind);

  const { items, counts } = await listApprovalInbox(user.organizationId, {
    from,
    to,
    kinds: kinds.length ? kinds : available,
    status: status || undefined,
  });

  const href = (next: { status?: string }) => {
    const query = new URLSearchParams({ from, to });
    if (requestedKind) query.set("type", requestedKind);
    const s = next.status ?? status;
    if (s) query.set("status", s);
    return `/approvals?${query.toString()}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Persetujuan"
        description="Kotak masuk semua pengajuan cuti, izin, lembur, timesheet, dan perubahan data yang perlu ditinjau. Buka pengajuan untuk menyetujui atau menolak."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="clipboard" label="Total pengajuan" value={counts.total} hint="Dalam rentang tanggal" tone="blue" />
        <StatCard icon="clock" label="Menunggu" value={counts.pending} hint="Perlu keputusan" tone="amber" />
        <StatCard icon="check" label="Disetujui" value={counts.approved} hint="Sudah diproses" tone="green" />
        <StatCard icon="alert" label="Ditolak" value={counts.rejected} hint="Sudah diproses" tone="rose" />
      </div>

      <form
        action="/approvals"
        method="get"
        className="hris-card grid gap-3 rounded-[20px] border bg-card p-4 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end"
      >
        {status ? <input type="hidden" name="status" value={status} /> : null}
        <div className="space-y-2">
          <Label htmlFor="ap-from">Diajukan dari</Label>
          <Input id="ap-from" type="date" name="from" defaultValue={from} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ap-to">Sampai</Label>
          <Input id="ap-to" type="date" name="to" defaultValue={to} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ap-type">Jenis</Label>
          <NativeSelect id="ap-type" name="type" defaultValue={requestedKind ?? ""}>
            <option value="">Semua jenis</option>
            {canLeave ? <option value="leave">Cuti</option> : null}
            {canPermission ? <option value="permission">Izin</option> : null}
            {canOvertime ? <option value="overtime">Lembur</option> : null}
            {canOvertime ? <option value="timesheet">Timesheet</option> : null}
            {canProfile ? <option value="profile">Perubahan data</option> : null}
          </NativeSelect>
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <HrisIcon name="search" className="size-4" />
          Terapkan
        </button>
      </form>

      <StatusTabs
        active={status}
        buildHref={(value) => href({ status: value })}
        tabs={[
          { value: "", label: "Semua", count: counts.total },
          { value: "pending", label: "Menunggu", count: counts.pending, tone: "#F59E0B" },
          { value: "approved", label: "Disetujui", count: counts.approved, tone: "#22C55E" },
          { value: "rejected", label: "Ditolak", count: counts.rejected, tone: "#EF4444" },
        ]}
      />

      {items.length === 0 ? (
        <EmptyState
          title="Tidak ada pengajuan"
          description="Tidak ada pengajuan yang cocok dengan rentang tanggal dan filter ini."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Periode</TableHead>
              <TableHead>Diajukan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.kind}-${item.id}`}>
                <TableCell>
                  <p className="font-medium text-foreground">{item.employeeName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.employeeNumber}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{KIND_LABEL[item.kind]}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.kind === "permission"
                      ? (PERMISSION_TYPE_LABELS as Record<string, string>)[item.subject] ?? item.subject
                      : item.subject}
                  </p>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{item.period}</TableCell>
                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                  {new Intl.DateTimeFormat("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }).format(item.submittedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE[item.status] ?? "outline"}>
                    {STATUS_LABEL[item.status] ?? item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Link href={item.href} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                    {item.status === "pending" ? "Tinjau" : "Detail"}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {items.length >= APPROVAL_LIST_LIMIT ? (
        <p className="text-sm text-muted-foreground">
          Menampilkan {APPROVAL_LIST_LIMIT} pengajuan terbaru. Persempit rentang tanggal untuk melihat lainnya.
        </p>
      ) : null}
    </div>
  );
}
