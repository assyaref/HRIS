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

import {
  CONTRACT_STATUS_BADGE,
  CONTRACT_STATUS_LABELS,
  EXPIRING_WINDOW_DAYS,
  isContractStatus,
  remainingLabel,
} from "@/features/compliance/contract-status";
import {
  countByStatus,
  listContractRows,
  sortByUrgency,
} from "@/features/compliance/queries";
import { pageParam, textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Monitoring Kontrak" };

const PAGE_SIZE = 25;

/**
 * Contract monitoring (Document Control): every employee's contract end
 * date classified as Kedaluwarsa / Akan habis (≤ 30 hari) / Berlaku /
 * Tanpa batas / Nonaktif, most urgent first, with search and Excel export.
 */
export default async function ContractMonitoringPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  // Contract dates are employment data: same rule as the profile's tab.
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW);
  if (!user.organizationId) forbidden();
  const canExport = await hasPermission(user.id, PERMISSIONS.EMPLOYEES_EXPORT);

  const params = await searchParams;
  const statusParam = textParam(params.status);
  const status = isContractStatus(statusParam) ? statusParam : "";
  const q = textParam(params.q)?.toLowerCase() ?? "";
  const requestedPage = pageParam(params.page);

  const today = todayKey();
  const all = await listContractRows(user.organizationId, today);
  const counts = countByStatus(all);
  const filtered = sortByUrgency(
    all.filter(
      (row) =>
        (!status || row.status === status) &&
        (!q ||
          row.name.toLowerCase().includes(q) ||
          row.employeeNumber.toLowerCase().includes(q) ||
          (row.position ?? "").toLowerCase().includes(q))
    )
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const href = (next: { status?: string; page?: number }) => {
    const query = new URLSearchParams();
    const s = next.status ?? status;
    if (s) query.set("status", s);
    if (q) query.set("q", q);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const text = query.toString();
    return `/monitoring/contracts${text ? `?${text}` : ""}`;
  };
  const exportQuery = new URLSearchParams({ report: "contracts" });
  if (status) exportQuery.set("status", status);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monitoring Kontrak"
        description={`Pantau masa berlaku kontrak karyawan. "Akan habis" berarti berakhir dalam ${EXPIRING_WINDOW_DAYS} hari ke depan.`}
        actions={
          canExport ? (
            <a
              href={`/api/reports/export?${exportQuery.toString()}`}
              className={buttonVariants({ variant: "outline" })}
            >
              <HrisIcon name="download" className="size-4" />
              Export Excel
            </a>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="alert-triangle" label="Kedaluwarsa" value={counts.expired} hint="Perlu diperpanjang segera" tone="rose" />
        <StatCard icon="clock" label="Akan habis" value={counts.expiring} hint={`≤ ${EXPIRING_WINDOW_DAYS} hari lagi`} tone="amber" />
        <StatCard icon="check" label="Berlaku" value={counts.active} hint="Masih aman" tone="green" />
        <StatCard icon="document" label="Tanpa batas" value={counts.no_end} hint="Tanpa tanggal akhir" tone="blue" />
      </div>

      <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <StatusTabs
          active={status}
          buildHref={(value) => href({ status: value })}
          tabs={[
            { value: "", label: "Semua", count: all.length },
            { value: "expired", label: CONTRACT_STATUS_LABELS.expired, count: counts.expired, tone: "#EF4444" },
            { value: "expiring", label: CONTRACT_STATUS_LABELS.expiring, count: counts.expiring, tone: "#F59E0B" },
            { value: "active", label: CONTRACT_STATUS_LABELS.active, count: counts.active, tone: "#22C55E" },
            { value: "no_end", label: CONTRACT_STATUS_LABELS.no_end, count: counts.no_end, tone: "#0EA5E9" },
            { value: "inactive", label: CONTRACT_STATUS_LABELS.inactive, count: counts.inactive, tone: "#94A3B8" },
          ]}
        />
        <form action="/monitoring/contracts" method="get" className="flex gap-2">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Input
            name="q"
            defaultValue={q}
            placeholder="Cari nama, nomor, jabatan"
            aria-label="Cari karyawan"
            className="w-64"
          />
          <button type="submit" className={buttonVariants({ variant: "secondary" })}>
            Cari
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Tidak ada data kontrak"
          description="Tidak ada karyawan yang cocok dengan filter ini. Tanggal kontrak diisi di tab Employment pada profil karyawan."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Jabatan</TableHead>
              <TableHead>Lokasi</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Mulai</TableHead>
              <TableHead>Berakhir</TableHead>
              <TableHead>Sisa</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Link href={`/employees/${row.id}`} className="font-medium text-foreground hover:text-primary">
                    {row.name}
                  </Link>
                  <p className="font-mono text-xs text-muted-foreground">{row.employeeNumber}</p>
                </TableCell>
                <TableCell className="text-sm">{row.position ?? "—"}</TableCell>
                <TableCell className="text-sm">{row.workLocation ?? "—"}</TableCell>
                <TableCell className="text-sm">{row.employmentType ?? "—"}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{row.contractStart ?? "—"}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{row.contractEnd ?? "—"}</TableCell>
                <TableCell className="text-sm whitespace-nowrap">{remainingLabel(row.daysRemaining)}</TableCell>
                <TableCell>
                  <Badge variant={CONTRACT_STATUS_BADGE[row.status]}>
                    {CONTRACT_STATUS_LABELS[row.status]}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages} · {filtered.length} karyawan
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
    </div>
  );
}
