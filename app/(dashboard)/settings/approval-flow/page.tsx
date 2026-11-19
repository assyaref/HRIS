import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { ApprovalSettingsForm } from "@/features/approval-chain/approval-forms";
import {
  APPROVAL_CHAIN_GUIDE,
  APPROVAL_CHAIN_MIGRATION,
  isApprovalChainReady,
  managerStepTypes,
} from "@/features/approval-chain/chain";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";

export const metadata: Metadata = { title: "Alur Persetujuan" };

/** Two-level approval settings (settings.manage). */
export default async function ApprovalFlowPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.SETTINGS_MANAGE);
  if (!user.organizationId) forbidden();
  const header = (
    <PageHeader
      title="Alur Persetujuan"
      description="Aktifkan persetujuan dua tingkat: atasan langsung (kolom Atasan di profil karyawan) menyetujui lebih dulu, kemudian HR. Default nonaktif — alur tetap satu tingkat seperti biasa."
    />
  );
  if (!(await isApprovalChainReady())) {
    return (
      <div className="space-y-6">
        {header}
        <ModuleNotReady module="Persetujuan bertingkat" migration={APPROVAL_CHAIN_MIGRATION} guide={APPROVAL_CHAIN_GUIDE} />
      </div>
    );
  }
  const enabled = [...(await managerStepTypes(user.organizationId))];
  return (
    <div className="space-y-6">
      {header}
      <section className="hris-card max-w-2xl space-y-4 rounded-[20px] border bg-card p-5">
        <ApprovalSettingsForm enabled={enabled} />
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Karyawan tanpa atasan langsung (atau atasannya belum punya akun) langsung ke HR.</li>
          <li>Penolakan oleh atasan langsung menolak pengajuan (saldo cuti dikembalikan).</li>
          <li>HR yang juga atasan langsung karyawan tersebut dapat langsung memutuskan.</li>
          <li>Atasan memutuskan di menu Persetujuan Tim.</li>
        </ul>
      </section>
    </div>
  );
}
