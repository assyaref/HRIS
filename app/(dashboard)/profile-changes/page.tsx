import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatusTabs } from "@/components/ui/status-tabs";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import {
  displayFieldValue,
  FIELD_GROUP_LABELS,
  fieldGroup,
  fieldLabel,
  groupsOf,
  maskValue,
  type FieldGroup,
} from "@/features/profile-changes/fields";
import {
  isProfileChangeModuleReady,
  PROFILE_CHANGE_GUIDE,
  PROFILE_CHANGE_MIGRATION,
} from "@/features/profile-changes/module";
import { ProfileChangeReviewActions } from "@/features/profile-changes/profile-change-forms";
import { listProfileChanges, PROFILE_CHANGE_LIST_LIMIT } from "@/features/profile-changes/queries";
import { textParam } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Perubahan Data Karyawan" };

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
const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/**
 * HR review of employee-submitted personal-data changes: old → new per
 * field, approve (applied to the profile) or reject with a reason. Viewing
 * needs employees.view + personal.view; deciding needs personal.update.
 */
export default async function ProfileChangesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_VIEW);
  if (!user.organizationId) forbidden();

  if (!(await isProfileChangeModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Perubahan Data Karyawan" description="Tinjau pengajuan perubahan data pribadi dari karyawan." />
        <ModuleNotReady module="Perubahan Data" migration={PROFILE_CHANGE_MIGRATION} guide={PROFILE_CHANGE_GUIDE} />
      </div>
    );
  }

  const [canPersonal, canAddressView, canAddress, canBankView, canBank] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_ADDRESS_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_BANK_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_BANK_UPDATE),
  ]);
  const canReviewGroup: Record<FieldGroup, boolean> = { personal: canPersonal, address: canAddress, bank: canBank };
  const canSeeGroup: Record<FieldGroup, boolean> = { personal: true, address: canAddressView, bank: canBankView };
  /** Value as this viewer may see it. */
  const shown = (field: string, value: string | null) => {
    const group = fieldGroup(field);
    if (canSeeGroup[group]) return displayFieldValue(field, value);
    if (value === null) return "—";
    return group === "bank" && field === "bankAccountNumber" ? (maskValue(value) ?? "—") : "(tersembunyi)";
  };
  const params = await searchParams;
  const statusParam = textParam(params.status);
  const status = statusParam && STATUS_LABEL[statusParam] ? statusParam : statusParam === "all" ? "" : "pending";
  const all = await listProfileChanges(user.organizationId);
  const count = (s: string) => all.filter((r) => r.status === s).length;
  const rows = status ? all.filter((r) => r.status === status) : all;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perubahan Data Karyawan"
        description="Karyawan mengajukan perubahan data pribadi dari menu Profil Saya. Setujui untuk langsung menerapkannya ke profil."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="clock" label="Menunggu" value={count("pending")} hint="Perlu ditinjau" tone="amber" />
        <StatCard icon="check" label="Disetujui" value={count("approved")} hint="Sudah diterapkan" tone="green" />
        <StatCard icon="alert" label="Ditolak" value={count("rejected")} hint="Dengan alasan" tone="rose" />
        <StatCard icon="clipboard" label="Total pengajuan" value={all.length} hint="Semua status" tone="blue" />
      </div>

      <StatusTabs
        active={status || "all"}
        buildHref={(value) => `/profile-changes?status=${value || "pending"}`}
        tabs={[
          { value: "pending", label: "Menunggu", count: count("pending"), tone: "#F59E0B" },
          { value: "approved", label: "Disetujui", count: count("approved"), tone: "#22C55E" },
          { value: "rejected", label: "Ditolak", count: count("rejected"), tone: "#EF4444" },
          { value: "cancelled", label: "Dibatalkan", count: count("cancelled"), tone: "#94A3B8" },
          { value: "all", label: "Semua", count: all.length },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={status === "pending" ? "Tidak ada pengajuan yang menunggu" : "Tidak ada pengajuan"}
          description="Pengajuan perubahan data dari karyawan akan tampil di sini."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((r) => (
            <section key={r.id} className="hris-card flex flex-col gap-3 rounded-[20px] border bg-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/employees/${r.employeeId}`} className="block truncate text-[16px] font-semibold hover:text-primary">
                    {r.employeeName}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{r.employeeNumber}</span> · {dateTime.format(r.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap justify-end gap-1">
                  {groupsOf(r.changes).map((g) => (
                    <span key={g} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {FIELD_GROUP_LABELS[g]}
                    </span>
                  ))}
                  <Badge variant={STATUS_BADGE[r.status] ?? "outline"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-[var(--card-border)]">
                <table className="w-full text-sm">
                  <thead className="bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Data</th>
                      <th className="px-3 py-2 text-left font-medium">Sebelumnya</th>
                      <th className="px-3 py-2 text-left font-medium">Diajukan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(r.changes).map(([field, change]) => (
                      <tr key={field}>
                        <td className="px-3 py-2 text-muted-foreground">{fieldLabel(field)}</td>
                        <td className="px-3 py-2 break-all text-muted-foreground line-through decoration-muted-foreground/50">
                          {shown(field, change.from)}
                        </td>
                        <td className="px-3 py-2 font-semibold break-all">{shown(field, change.to)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {r.note ? <p className="text-sm"><span className="text-muted-foreground">Keterangan:</span> {r.note}</p> : null}
              {r.reviewerNote && r.status !== "pending" ? (
                <p className="text-sm text-muted-foreground">
                  {r.reviewerName ? `${r.reviewerName}: ` : ""}
                  {r.reviewerNote}
                </p>
              ) : null}
              {r.status === "pending" ? (
                groupsOf(r.changes).every((g) => canReviewGroup[g]) ? (
                  <div className="mt-auto border-t border-[var(--card-border)] pt-3">
                    <ProfileChangeReviewActions id={r.id} employeeName={r.employeeName} />
                  </div>
                ) : (
                  <p className="mt-auto border-t border-[var(--card-border)] pt-3 text-xs text-muted-foreground">
                    Perlu peninjau dengan akses{" "}
                    {groupsOf(r.changes)
                      .filter((g) => !canReviewGroup[g])
                      .map((g) => FIELD_GROUP_LABELS[g].toLowerCase())
                      .join(" dan ")}
                    .
                  </p>
                )
              ) : null}
            </section>
          ))}
        </div>
      )}
      {all.length >= PROFILE_CHANGE_LIST_LIMIT ? (
        <p className="text-sm text-muted-foreground">Menampilkan {PROFILE_CHANGE_LIST_LIMIT} pengajuan terbaru.</p>
      ) : null}
    </div>
  );
}
