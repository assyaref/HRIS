import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
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
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { remainingLabel } from "@/features/compliance/contract-status";
import { McuCreateButton, McuRowActions } from "@/features/compliance/compliance-forms";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { isComplianceModuleReady } from "@/features/compliance/module";
import {
  latestPerEmployee,
  listActiveEmployeeOptions,
  listMcuRecords,
} from "@/features/compliance/records.queries";
import {
  isValidityStatus,
  MCU_RESULT_LABELS,
  VALIDITY_BADGE,
  VALIDITY_COLORS,
  VALIDITY_LABELS,
  VALIDITY_WINDOW_DAYS,
} from "@/features/compliance/validity";
import { pageParam, textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Medical Check Up" };

const PAGE_SIZE = 25;

/**
 * Medical check-up monitoring: the latest MCU of every employee (or every
 * record), classified by validity, plus employees without any MCU. Health
 * data is personal data: viewing needs employees.view + personal.view,
 * recording needs personal.update.
 */
export default async function McuPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isComplianceModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Medical Check Up" description="Monitoring hasil dan masa berlaku MCU karyawan." />
        <ModuleNotReady module="Medical Check Up" />
      </div>
    );
  }

  const [canManage, canExport] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EXPORT),
  ]);

  const params = await searchParams;
  const view = textParam(params.view) === "all" ? "all" : "latest";
  const statusParam = textParam(params.status);
  const status = isValidityStatus(statusParam) ? statusParam : "";
  const q = textParam(params.q)?.toLowerCase() ?? "";

  const today = todayKey();
  const [records, activeEmployees] = await Promise.all([
    listMcuRecords(organizationId, today),
    listActiveEmployeeOptions(organizationId),
  ]);
  const latest = latestPerEmployee(records);
  const counted = view === "all" ? records : latest;
  const counts = {
    expired: counted.filter((r) => r.status === "expired").length,
    expiring: counted.filter((r) => r.status === "expiring").length,
    valid: counted.filter((r) => r.status === "valid").length,
    no_expiry: counted.filter((r) => r.status === "no_expiry").length,
  };
  const withMcu = new Set(records.map((r) => r.employeeId));
  const withoutMcu = activeEmployees.filter((e) => !withMcu.has(e.id));

  const filtered = counted.filter(
    (row) =>
      (!status || row.status === status) &&
      (!q ||
        row.employeeName.toLowerCase().includes(q) ||
        row.employeeNumber.toLowerCase().includes(q) ||
        (row.provider ?? "").toLowerCase().includes(q))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageParam(params.page), totalPages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (next: { status?: string; view?: string; page?: number }) => {
    const query = new URLSearchParams();
    const v = next.view ?? view;
    if (v === "all") query.set("view", "all");
    const s = next.status ?? status;
    if (s) query.set("status", s);
    if (q) query.set("q", q);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const text = query.toString();
    return `/compliance/mcu${text ? `?${text}` : ""}`;
  };
  const employeeOptions = activeEmployees.map(({ id, employeeNumber, name }) => ({ id, employeeNumber, name }));
  const exportQuery = new URLSearchParams({ report: "mcu" });
  if (status) exportQuery.set("status", status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medical Check Up"
        description={`Monitoring hasil dan masa berlaku MCU karyawan. "Akan habis" berarti berakhir dalam ${VALIDITY_WINDOW_DAYS} hari.`}
        actions={
          <>
            {canExport ? (
              <a href={`/api/reports/export?${exportQuery.toString()}`} className={buttonVariants({ variant: "outline" })}>
                <HrisIcon name="download" className="size-4" />
                Export Excel
              </a>
            ) : null}
            {canManage ? <McuCreateButton employees={employeeOptions} /> : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="alert-triangle" label="Kedaluwarsa" value={counts.expired} hint="Perlu MCU ulang" tone="rose" />
        <StatCard icon="clock" label="Akan habis" value={counts.expiring} hint={`≤ ${VALIDITY_WINDOW_DAYS} hari lagi`} tone="amber" />
        <StatCard icon="check" label="Berlaku" value={counts.valid} hint="MCU masih berlaku" tone="green" />
        <StatCard icon="user" label="Belum MCU" value={withoutMcu.length} hint="Karyawan aktif tanpa data" tone="slate" />
      </div>

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <StatusTabs
            label="Tampilan"
            active={view === "all" ? "all" : ""}
            buildHref={(value) => href({ view: value || "latest", page: 1 })}
            tabs={[
              { value: "", label: "Terbaru per karyawan", count: latest.length },
              { value: "all", label: "Semua catatan", count: records.length },
            ]}
          />
        </div>
        <form action="/compliance/mcu" method="get" className="flex gap-2">
          {view === "all" ? <input type="hidden" name="view" value="all" /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Input name="q" defaultValue={q} placeholder="Cari nama, nomor, provider" aria-label="Cari" className="w-64" />
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Cari
          </button>
        </form>
      </div>

      <StatusTabs
        active={status}
        buildHref={(value) => href({ status: value, page: 1 })}
        tabs={[
          { value: "", label: "Semua", count: counted.length },
          { value: "expired", label: VALIDITY_LABELS.expired, count: counts.expired, tone: VALIDITY_COLORS.expired },
          { value: "expiring", label: VALIDITY_LABELS.expiring, count: counts.expiring, tone: VALIDITY_COLORS.expiring },
          { value: "valid", label: VALIDITY_LABELS.valid, count: counts.valid, tone: VALIDITY_COLORS.valid },
          { value: "no_expiry", label: VALIDITY_LABELS.no_expiry, count: counts.no_expiry, tone: VALIDITY_COLORS.no_expiry },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          title={records.length === 0 ? "Belum ada data MCU" : "Tidak ada data yang cocok"}
          description={
            records.length === 0
              ? canManage
                ? "Klik \"Catat MCU\" untuk mencatat hasil medical check-up karyawan."
                : "Data MCU akan tampil setelah dicatat oleh HR."
              : "Ubah filter atau kata kunci pencarian."
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Tanggal MCU</TableHead>
              <TableHead>Berlaku sampai</TableHead>
              <TableHead>Sisa</TableHead>
              <TableHead>Hasil</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              {canManage ? <TableHead className="text-right">Aksi</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/employees/${row.employeeId}`} className="font-medium hover:text-primary">
                    {row.employeeName}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{row.employeeNumber}</p>
                </TableCell>
                <TableCell className="text-sm whitespace-nowrap">{row.checkupDate}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{row.validUntil ?? "—"}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{remainingLabel(row.daysRemaining)}</TableCell>
                <TableCell className="text-sm">{MCU_RESULT_LABELS[row.result] ?? row.result}</TableCell>
                <TableCell className="text-sm">{row.provider ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={VALIDITY_BADGE[row.status]}>{VALIDITY_LABELS[row.status]}</Badge>
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <McuRowActions
                      employees={employeeOptions}
                      record={{
                        id: row.id,
                        employeeId: row.employeeId,
                        checkupDate: row.checkupDate,
                        validUntil: row.validUntil,
                        provider: row.provider,
                        location: row.location,
                        doctor: row.doctor,
                        result: row.result,
                        notes: row.notes,
                      }}
                    />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages} · {filtered.length} data
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={href({ page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Sebelumnya
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={href({ page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Berikutnya
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}

      {withoutMcu.length > 0 ? (
        <section className="hris-card rounded-[20px] border bg-card p-5">
          <h2 className="text-[17px] font-semibold">Karyawan aktif tanpa data MCU</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">{withoutMcu.length} karyawan</p>
          <div className="flex flex-wrap gap-2">
            {withoutMcu.slice(0, 60).map((e) => (
              <Link
                key={e.id}
                href={`/employees/${e.id}`}
                className="rounded-full border border-[var(--card-border)] bg-muted px-3 py-1 text-xs font-medium hover:text-primary"
              >
                {e.name} · {e.employeeNumber}
              </Link>
            ))}
            {withoutMcu.length > 60 ? (
              <span className="px-2 py-1 text-xs text-muted-foreground">+{withoutMcu.length - 60} lainnya</span>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
