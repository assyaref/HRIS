import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { SectionHeader } from "@/components/employee/section-header";
import { StatusBadge, type StatusTone } from "@/components/employee/status-badge";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { getEmployeeByUserId } from "@/features/employees/queries";
import { CreateTicketButton } from "@/features/helpdesk/helpdesk-forms";
import { HELPDESK_GUIDE, HELPDESK_MIGRATION, isHelpdeskModuleReady } from "@/features/helpdesk/module";
import { listCategories, listTickets } from "@/features/helpdesk/queries";
import { hasUnreadReply, STATUS_LABELS } from "@/features/helpdesk/rules";

export const metadata: Metadata = { title: "Tanya Admin" };

const TONES: Record<string, StatusTone> = {
  open: "warning",
  in_progress: "info",
  resolved: "success",
  closed: "neutral",
};
const when = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Employee helpdesk: own tickets, newest activity first. */
export default async function HelpdeskPage() {
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isHelpdeskModuleReady())) {
    return (
      <div className="space-y-6">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tanya Admin</h1>
        </div>
        <ModuleNotReady module="Tanya Admin" migration={HELPDESK_MIGRATION} guide={HELPDESK_GUIDE} />
      </div>
    );
  }

  const authorization = await getUserAuthorization(user.id);
  const granted = new Set<string>(authorization.permissionCodes);
  const isAgent =
    authorization.isSuperAdmin ||
    (granted.has(PERMISSIONS.EMPLOYEES_VIEW) && granted.has(PERMISSIONS.EMPLOYEES_UPDATE));
  const employee = await getEmployeeByUserId(user.id, organizationId);

  const manageLink = isAgent ? (
    <Link href="/helpdesk/management" className={buttonVariants({ variant: "outline", size: "sm" })}>
      Kelola tiket
    </Link>
  ) : null;

  if (!employee) {
    return (
      <div className="space-y-6">
        {manageLink}
        <EmployeeEmptyState
          icon="profile"
          title="Profil karyawan belum tertaut"
          description="Akun Anda belum ditautkan ke data karyawan. Hubungi administrator."
        />
      </div>
    );
  }

  const [tickets, categories] = await Promise.all([
    listTickets(organizationId, { employeeId: employee.id }),
    listCategories(organizationId),
  ]);
  const open = tickets.filter((t) => t.status === "open" || t.status === "in_progress").length;
  const unread = tickets.filter(hasUnreadReply).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Tanya Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">Pertanyaan dan kendala Anda ke HR.</p>
        </div>
        <div className="flex gap-2">
          {manageLink}
          <CreateTicketButton categories={categories.filter((c) => c.active).map(({ id, name }) => ({ id, name }))} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Masih berjalan</p>
          <p className="mt-1 text-xl font-semibold">{open}</p>
        </div>
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Balasan baru</p>
          <p className="mt-1 text-xl font-semibold">{unread}</p>
        </div>
        <div className="hris-card rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Total tiket</p>
          <p className="mt-1 text-xl font-semibold">{tickets.length}</p>
        </div>
      </div>

      <section className="space-y-3">
        <SectionHeader title="Tiket Saya" />
        {tickets.length === 0 ? (
          <EmployeeEmptyState
            icon="help"
            title="Belum ada tiket"
            description='Tekan "Buat tiket" untuk bertanya soal absensi, cuti, gaji, atau data Anda.'
          />
        ) : (
          <div className="hris-card divide-y divide-border">
            {tickets.map((t) => {
              const unseen = hasUnreadReply(t);
              return (
                <Link
                  key={t.id}
                  href={`/helpdesk/${t.id}`}
                  className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-accent dark:hover:bg-muted/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="hris-chip-blue relative flex size-10 shrink-0 items-center justify-center rounded-xl">
                      <HrisIcon name="help" className="size-5" />
                      {unseen ? <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-[#EF4444] ring-2 ring-card" aria-label="Balasan baru" /> : null}
                    </span>
                    <div className="min-w-0">
                      <p className={unseen ? "truncate text-sm font-bold text-foreground" : "truncate text-sm font-semibold text-foreground"}>{t.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t.ticketNumber} · {t.categoryName ?? "Umum"} · {when.format(t.lastMessageAt)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge tone={TONES[t.status] ?? "neutral"}>{STATUS_LABELS[t.status] ?? t.status}</StatusBadge>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
