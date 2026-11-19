import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { requireUser } from "@/lib/auth/auth";

import { ManagerDecisionButtons } from "@/features/approval-chain/approval-forms";
import { APPROVAL_CHAIN_GUIDE, APPROVAL_CHAIN_MIGRATION, isApprovalChainReady } from "@/features/approval-chain/chain";
import { REQUEST_TYPE_LABELS } from "@/features/approval-chain/rules";
import { listTeamRequests } from "@/features/approval-chain/team.queries";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { PERMISSION_TYPE_LABELS } from "@/features/permission/constants";

export const metadata: Metadata = { title: "Persetujuan Tim" };

/**
 * Direct managers decide their team's leave / permission / overtime
 * requests first when the two-level approval is on. Each decision is
 * re-authorized server-side (only the employee's direct manager).
 */
export default async function TeamApprovalsPage() {
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  if (!(await isApprovalChainReady())) {
    return (
      <div className="space-y-6">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Persetujuan Tim</h1>
        </div>
        <ModuleNotReady module="Persetujuan bertingkat" migration={APPROVAL_CHAIN_MIGRATION} guide={APPROVAL_CHAIN_GUIDE} />
      </div>
    );
  }
  const { enabled, reports, items } = await listTeamRequests(user.organizationId, user.id);
  const waiting = items.filter((i) => !i.managerDecision);
  const forwarded = items.filter((i) => i.managerDecision === "approved");

  return (
    <div className="space-y-6">
      <div className="emp-page-title">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Persetujuan Tim</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {reports} anggota tim langsung
          {enabled.length ? ` · persetujuan atasan aktif untuk ${enabled.map((t) => REQUEST_TYPE_LABELS[t].toLowerCase()).join(", ")}` : ""}
        </p>
      </div>

      {reports === 0 ? (
        <EmployeeEmptyState icon="users" title="Belum ada anggota tim" description='Karyawan yang kolom "Atasan"-nya adalah Anda akan tampil di sini.' />
      ) : enabled.length === 0 ? (
        <EmployeeEmptyState icon="shield" title="Persetujuan atasan belum aktif" description="HR dapat mengaktifkannya di Pengaturan → Alur Persetujuan." />
      ) : (
        <>
          <section className="space-y-3">
            <SectionHeader title={`Menunggu keputusan Anda (${waiting.length})`} />
            {waiting.length === 0 ? (
              <EmployeeEmptyState icon="check" title="Semua sudah diputuskan" description="Pengajuan baru dari tim Anda akan muncul di sini." />
            ) : (
              <ul className="hris-card divide-y divide-border">
                {waiting.map((r) => (
                  <li key={`${r.type}-${r.id}`} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {r.employeeName} <span className="font-mono text-xs font-normal text-muted-foreground">{r.employeeNumber}</span>
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">{REQUEST_TYPE_LABELS[r.type]}</span> ·{" "}
                        {r.type === "permission" ? ((PERMISSION_TYPE_LABELS as Record<string, string>)[r.subject] ?? r.subject) : r.subject}
                      </p>
                      <p className="text-xs text-muted-foreground">{r.period}</p>
                    </div>
                    <ManagerDecisionButtons type={r.type} id={r.id} employeeName={r.employeeName} />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {forwarded.length > 0 ? (
            <section className="space-y-3">
              <SectionHeader title={`Sudah Anda setujui, menunggu HR (${forwarded.length})`} />
              <ul className="hris-card divide-y divide-border">
                {forwarded.map((r) => (
                  <li key={`${r.type}-${r.id}`} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{r.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {REQUEST_TYPE_LABELS[r.type]} · {r.period}
                      </p>
                    </div>
                    <StatusBadge tone="info">Menunggu HR</StatusBadge>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
