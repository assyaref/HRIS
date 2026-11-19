import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { requirePermission } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import {
  CategoryActiveToggle,
  CategoryCreateForm,
  SeedCategoriesButton,
} from "@/features/helpdesk/helpdesk-forms";
import { HELPDESK_GUIDE, HELPDESK_MIGRATION, isHelpdeskModuleReady } from "@/features/helpdesk/module";
import { listCategories, listTickets, TICKET_LIST_LIMIT } from "@/features/helpdesk/queries";
import {
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_BADGE,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/features/helpdesk/rules";
import { textParam } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Kelola Tiket Helpdesk" };

const STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
const when = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/**
 * Helpdesk desk for HR: every ticket with status / search filters, "waiting
 * for HR" first, and category management. employees.view + employees.update.
 */
export default async function HelpdeskManagementPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isHelpdeskModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kelola Tiket Helpdesk" description="Pertanyaan dan kendala karyawan." />
        <ModuleNotReady module="Tanya Admin" migration={HELPDESK_MIGRATION} guide={HELPDESK_GUIDE} />
      </div>
    );
  }

  const params = await searchParams;
  const tab = textParam(params.tab) === "categories" ? "categories" : "tickets";
  const statusParam = textParam(params.status) ?? "";
  const status = (STATUSES as readonly string[]).includes(statusParam) ? statusParam : statusParam === "all" ? "" : "active";
  const q = textParam(params.q)?.toLowerCase() ?? "";

  const [all, categories] = await Promise.all([listTickets(organizationId), listCategories(organizationId)]);
  const searched = q
    ? all.filter(
        (t) =>
          t.subject.toLowerCase().includes(q) ||
          t.ticketNumber.toLowerCase().includes(q) ||
          t.employeeName.toLowerCase().includes(q) ||
          t.employeeNumber.toLowerCase().includes(q)
      )
    : all;
  const count = (s: string) => searched.filter((t) => t.status === s).length;
  const waiting = searched.filter((t) => !t.lastMessageFromAgent && (t.status === "open" || t.status === "in_progress"));
  const rows = (
    status === "active"
      ? searched.filter((t) => t.status === "open" || t.status === "in_progress")
      : status
        ? searched.filter((t) => t.status === status)
        : searched
  ).sort((a, b) => {
    // Waiting for HR first, then high priority, then latest activity.
    const wa = !a.lastMessageFromAgent && !["resolved", "closed"].includes(a.status) ? 0 : 1;
    const wb = !b.lastMessageFromAgent && !["resolved", "closed"].includes(b.status) ? 0 : 1;
    if (wa !== wb) return wa - wb;
    const pa = a.priority === "high" ? 0 : 1;
    const pb = b.priority === "high" ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return b.lastMessageAt.getTime() - a.lastMessageAt.getTime();
  });

  const href = (next: { status?: string }) => {
    const query = new URLSearchParams();
    const s = next.status ?? status;
    if (s && s !== "active") query.set("status", s);
    if (q) query.set("q", q);
    const text = query.toString();
    return `/helpdesk/management${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Tiket Helpdesk"
        description='Pertanyaan dan kendala karyawan dari menu "Tanya Admin". Tiket yang menunggu balasan HR tampil paling atas.'
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="alert" label="Menunggu balasan" value={waiting.length} hint="Pesan terakhir dari karyawan" tone="rose" />
        <StatCard icon="help" label="Baru" value={count("open")} hint="Belum ditangani" tone="amber" />
        <StatCard icon="clock" label="Diproses" value={count("in_progress")} hint="Sedang ditangani" tone="blue" />
        <StatCard icon="check" label="Selesai / ditutup" value={count("resolved") + count("closed")} hint="Semua waktu" tone="green" />
      </div>

      <StatusTabs
        label="Bagian"
        active={tab === "categories" ? "categories" : ""}
        buildHref={(value) => (value ? `/helpdesk/management?tab=${value}` : "/helpdesk/management")}
        tabs={[
          { value: "", label: "Tiket", count: all.length },
          { value: "categories", label: "Kategori", count: categories.length },
        ]}
      />

      {tab === "categories" ? (
        <section className="hris-card space-y-4 rounded-[20px] border bg-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[17px] font-semibold">Kategori tiket</h2>
              <p className="text-sm text-muted-foreground">Dipilih karyawan saat membuat tiket.</p>
            </div>
            <SeedCategoriesButton />
          </div>
          <CategoryCreateForm />
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada kategori. Tambahkan kategori standar untuk memulai.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-[var(--card-border)]">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="min-w-0">
                    <span className="font-medium">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{c.ticketCount} tiket</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={c.active ? "success" : "outline"}>{c.active ? "Aktif" : "Nonaktif"}</Badge>
                    <CategoryActiveToggle id={c.id} active={c.active} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <>
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <StatusTabs
              active={status}
              buildHref={(value) => href({ status: value })}
              tabs={[
                { value: "active", label: "Aktif", count: count("open") + count("in_progress") },
                { value: "open", label: STATUS_LABELS.open, count: count("open"), tone: STATUS_COLORS.open },
                { value: "in_progress", label: STATUS_LABELS.in_progress, count: count("in_progress"), tone: STATUS_COLORS.in_progress },
                { value: "resolved", label: STATUS_LABELS.resolved, count: count("resolved"), tone: STATUS_COLORS.resolved },
                { value: "closed", label: STATUS_LABELS.closed, count: count("closed"), tone: STATUS_COLORS.closed },
                { value: "all", label: "Semua", count: searched.length },
              ]}
            />
            <form action="/helpdesk/management" method="get" className="flex gap-2">
              {status && status !== "active" ? <input type="hidden" name="status" value={status} /> : null}
              <Input name="q" defaultValue={q} placeholder="Cari tiket, karyawan" aria-label="Cari" className="w-64" />
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                Cari
              </button>
            </form>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title={all.length === 0 ? "Belum ada tiket" : "Tidak ada tiket yang cocok"}
              description={all.length === 0 ? 'Tiket dari menu "Tanya Admin" karyawan akan tampil di sini.' : "Ubah filter atau kata kunci."}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tiket</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Prioritas</TableHead>
                  <TableHead>Petugas</TableHead>
                  <TableHead>Aktivitas</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => {
                  const waitingHr = !t.lastMessageFromAgent && !["resolved", "closed"].includes(t.status);
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="max-w-[320px]">
                        <Link href={`/helpdesk/${t.id}`} className="block truncate font-medium hover:text-primary">
                          {t.subject}
                        </Link>
                        <p className="font-mono text-xs text-muted-foreground">
                          {t.ticketNumber} · {t.messageCount} pesan
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="font-medium">{t.employeeName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{t.employeeNumber}</p>
                      </TableCell>
                      <TableCell className="text-sm">{t.categoryName ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <span className="size-2 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[t.priority] }} />
                          {PRIORITY_LABELS[t.priority] ?? t.priority}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{t.assigneeName ?? "—"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">
                        {when.format(t.lastMessageAt)}
                        {waitingHr ? <p className="text-xs font-semibold text-[#E11D48]">Menunggu HR</p> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_BADGE[t.status] ?? "outline"}>{STATUS_LABELS[t.status] ?? t.status}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {all.length >= TICKET_LIST_LIMIT ? (
            <p className="text-sm text-muted-foreground">Menampilkan {TICKET_LIST_LIMIT} tiket dengan aktivitas terbaru.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
