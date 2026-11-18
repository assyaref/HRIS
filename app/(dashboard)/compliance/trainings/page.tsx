import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  MasterCreateButton,
  MasterRowActions,
  RequirementForm,
  RequirementRemoveButton,
  TrainingCreateButton,
  TrainingRowActions,
} from "@/features/compliance/compliance-forms";
import { remainingLabel } from "@/features/compliance/contract-status";
import { computeMatrixCompliance } from "@/features/compliance/matrix";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { isComplianceModuleReady } from "@/features/compliance/module";
import {
  listActiveEmployeeOptions,
  listTrainingMasters,
  listTrainingRecords,
  listTrainingRequirements,
} from "@/features/compliance/records.queries";
import {
  isValidityStatus,
  TRAINING_TYPE_LABELS,
  VALIDITY_BADGE,
  VALIDITY_COLORS,
  VALIDITY_LABELS,
  VALIDITY_WINDOW_DAYS,
} from "@/features/compliance/validity";
import { pageParam, textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Training" };

const PAGE_SIZE = 25;
const TABS = ["records", "matrix", "master"] as const;
type Tab = (typeof TABS)[number];

/**
 * Training & certification: employee records with validity, the position ×
 * training matrix with compliance per employee, and the training catalog.
 * Employment data: viewing needs employees.view + employment.view, changes
 * need employment.update.
 */
export default async function TrainingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isComplianceModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Training" description="Sertifikat training karyawan, matriks training per jabatan, dan master training." />
        <ModuleNotReady module="Training" />
      </div>
    );
  }

  const [canManage, canExport] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EXPORT),
  ]);

  const params = await searchParams;
  const tabParam = textParam(params.tab);
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "records";
  const statusParam = textParam(params.status);
  const status = isValidityStatus(statusParam) ? statusParam : "";
  const q = textParam(params.q)?.toLowerCase() ?? "";

  const today = todayKey();
  const [records, masters, requirements, activeEmployees] = await Promise.all([
    listTrainingRecords(organizationId, today),
    listTrainingMasters(organizationId),
    listTrainingRequirements(organizationId),
    listActiveEmployeeOptions(organizationId),
  ]);
  const matrix = computeMatrixCompliance(activeEmployees, requirements, records);
  const counts = {
    expired: records.filter((r) => r.status === "expired").length,
    expiring: records.filter((r) => r.status === "expiring").length,
    valid: records.filter((r) => r.status === "valid").length,
    no_expiry: records.filter((r) => r.status === "no_expiry").length,
  };

  const employeeOptions = activeEmployees.map(({ id, employeeNumber, name }) => ({ id, employeeNumber, name }));
  const masterOptions = masters
    .filter((m) => m.active)
    .map(({ id, name, validityMonths }) => ({ id, name, validityMonths }));
  const positions = [
    ...new Set(activeEmployees.map((e) => e.position?.trim()).filter((p): p is string => Boolean(p))),
  ].sort((a, b) => a.localeCompare(b));

  const href = (next: { tab?: Tab; status?: string; page?: number }) => {
    const query = new URLSearchParams();
    const t = next.tab ?? tab;
    if (t !== "records") query.set("tab", t);
    const s = next.status ?? (next.tab ? "" : status);
    if (s && t === "records") query.set("status", s);
    if (q && t === "records" && !next.tab) query.set("q", q);
    if (next.page && next.page > 1) query.set("page", String(next.page));
    const text = query.toString();
    return `/compliance/trainings${text ? `?${text}` : ""}`;
  };

  const filtered = records.filter(
    (row) =>
      (!status || row.status === status) &&
      (!q ||
        row.employeeName.toLowerCase().includes(q) ||
        row.employeeNumber.toLowerCase().includes(q) ||
        row.title.toLowerCase().includes(q) ||
        (row.certificateNumber ?? "").toLowerCase().includes(q))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageParam(params.page), totalPages);
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const exportQuery = new URLSearchParams({ report: "trainings" });
  if (status) exportQuery.set("status", status);

  const byPosition = new Map<string, typeof requirements>();
  for (const req of requirements) {
    const list = byPosition.get(req.position) ?? [];
    list.push(req);
    byPosition.set(req.position, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        description={`Sertifikat training karyawan, matriks training per jabatan, dan master training. "Akan habis" = berakhir dalam ${VALIDITY_WINDOW_DAYS} hari.`}
        actions={
          <>
            {canExport && tab === "records" ? (
              <a href={`/api/reports/export?${exportQuery.toString()}`} className={buttonVariants({ variant: "outline" })}>
                <HrisIcon name="download" className="size-4" />
                Export Excel
              </a>
            ) : null}
            {canManage && tab === "master" ? <MasterCreateButton /> : null}
            {canManage && tab === "records" ? (
              <TrainingCreateButton employees={employeeOptions} masters={masterOptions} />
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="document" label="Sertifikat tercatat" value={records.length} hint={`${masters.length} master training`} tone="blue" />
        <StatCard icon="clock" label="Akan habis" value={counts.expiring} hint={`≤ ${VALIDITY_WINDOW_DAYS} hari lagi`} tone="amber" />
        <StatCard icon="alert-triangle" label="Kedaluwarsa" value={counts.expired} hint="Perlu diperbarui" tone="rose" />
        <StatCard
          icon="check"
          label="Kepatuhan matriks"
          value={`${matrix.percent}%`}
          hint={matrix.required ? `${matrix.fulfilled}/${matrix.required} kewajiban terpenuhi` : "Belum ada kewajiban"}
          tone="green"
        />
      </div>

      <StatusTabs
        label="Bagian"
        active={tab === "records" ? "" : tab}
        buildHref={(value) => href({ tab: (value || "records") as Tab })}
        tabs={[
          { value: "", label: "Data training", count: records.length },
          { value: "matrix", label: "Matriks per jabatan", count: matrix.rows.length },
          { value: "master", label: "Master training", count: masters.length },
        ]}
      />

      {tab === "records" ? (
        <>
          <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
            <StatusTabs
              active={status}
              buildHref={(value) => href({ status: value, page: 1 })}
              tabs={[
                { value: "", label: "Semua", count: records.length },
                { value: "expired", label: VALIDITY_LABELS.expired, count: counts.expired, tone: VALIDITY_COLORS.expired },
                { value: "expiring", label: VALIDITY_LABELS.expiring, count: counts.expiring, tone: VALIDITY_COLORS.expiring },
                { value: "valid", label: VALIDITY_LABELS.valid, count: counts.valid, tone: VALIDITY_COLORS.valid },
                { value: "no_expiry", label: VALIDITY_LABELS.no_expiry, count: counts.no_expiry, tone: VALIDITY_COLORS.no_expiry },
              ]}
            />
            <form action="/compliance/trainings" method="get" className="flex gap-2">
              {status ? <input type="hidden" name="status" value={status} /> : null}
              <Input name="q" defaultValue={q} placeholder="Cari nama, training, no. sertifikat" aria-label="Cari" className="w-72" />
              <button type="submit" className={buttonVariants({ variant: "secondary" })}>
                Cari
              </button>
            </form>
          </div>
          {rows.length === 0 ? (
            <EmptyState
              title={records.length === 0 ? "Belum ada data training" : "Tidak ada data yang cocok"}
              description={
                records.length === 0
                  ? canManage
                    ? "Tambahkan master training, lalu catat training / sertifikat karyawan."
                    : "Data training akan tampil setelah dicatat oleh HR."
                  : "Ubah filter atau kata kunci pencarian."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>No. sertifikat</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Berlaku sampai</TableHead>
                  <TableHead>Sisa</TableHead>
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
                    <TableCell>
                      <p className="text-sm font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">{row.issuer ?? ""}</p>
                    </TableCell>
                    <TableCell className="text-sm">{row.certificateNumber ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{row.trainingDate}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{row.validUntil ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{remainingLabel(row.daysRemaining)}</TableCell>
                    <TableCell>
                      <Badge variant={VALIDITY_BADGE[row.status]}>{VALIDITY_LABELS[row.status]}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <TrainingRowActions
                          employees={employeeOptions}
                          masters={masterOptions}
                          record={{
                            id: row.id,
                            employeeId: row.employeeId,
                            trainingMasterId: row.trainingMasterId,
                            title: row.title,
                            certificateNumber: row.certificateNumber,
                            issuer: row.issuer,
                            location: row.location,
                            trainingDate: row.trainingDate,
                            validUntil: row.validUntil,
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
        </>
      ) : null}

      {tab === "matrix" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[17px]">Kewajiban per jabatan</CardTitle>
              <CardDescription>Training yang wajib dimiliki setiap jabatan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage ? (
                masterOptions.length ? (
                  <RequirementForm positions={positions} masters={masterOptions} />
                ) : (
                  <p className="text-sm text-muted-foreground">Tambahkan master training terlebih dahulu.</p>
                )
              ) : null}
              {byPosition.size === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada kewajiban training.</p>
              ) : (
                <ul className="space-y-3">
                  {[...byPosition.entries()].map(([position, reqs]) => (
                    <li key={position} className="hris-card-level-2 rounded-xl p-3">
                      <p className="text-sm font-semibold">{position}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reqs.map((req) => (
                          <span key={req.id} className="inline-flex items-center rounded-full bg-surface-primary px-2.5 py-1 text-xs font-semibold text-primary">
                            {req.trainingName}
                            {canManage ? <RequirementRemoveButton id={req.id} label={`${req.trainingName} untuk ${position}`} /> : null}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[17px]">Kepatuhan karyawan</CardTitle>
              <CardDescription>
                Training wajib yang belum dimiliki (atau sudah kedaluwarsa), paling banyak kekurangan di atas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {matrix.rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Belum ada karyawan aktif dengan jabatan yang memiliki kewajiban training.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead>Jabatan</TableHead>
                      <TableHead className="text-right">Terpenuhi</TableHead>
                      <TableHead>Kurang</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matrix.rows.map((row) => (
                      <TableRow key={row.employee.id}>
                        <TableCell>
                          <Link href={`/employees/${row.employee.id}`} className="font-medium hover:text-primary">
                            {row.employee.name}
                          </Link>
                          <p className="font-mono text-xs text-muted-foreground">{row.employee.employeeNumber}</p>
                        </TableCell>
                        <TableCell className="text-sm">{row.employee.position}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">
                          {row.fulfilled}/{row.required}
                        </TableCell>
                        <TableCell>
                          {row.missing.length === 0 ? (
                            <Badge variant="success">Lengkap</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {row.missing.map((name) => (
                                <Badge key={name} variant="warning">
                                  {name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "master" ? (
        masters.length === 0 ? (
          <EmptyState
            title="Belum ada master training"
            description={canManage ? "Klik \"Tambah master\" untuk membuat katalog training (mis. K3 Umum, First Aid)." : "Master training dikelola oleh HR."}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Tipe</TableHead>
                <TableHead>Kategori</TableHead>
                <TableHead className="text-right">Durasi</TableHead>
                <TableHead>Masa berlaku</TableHead>
                <TableHead>Wajib</TableHead>
                <TableHead className="text-right">Dipakai</TableHead>
                <TableHead>Status</TableHead>
                {canManage ? <TableHead className="text-right">Aksi</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {masters.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-sm">{TRAINING_TYPE_LABELS[m.trainingType] ?? m.trainingType}</TableCell>
                  <TableCell className="text-sm">{m.category ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{m.durationHours ? `${m.durationHours} jam` : "—"}</TableCell>
                  <TableCell className="text-sm">{m.validityMonths ? `${m.validityMonths} bulan` : "Tidak kedaluwarsa"}</TableCell>
                  <TableCell>{m.isMandatory ? <Badge variant="info">Wajib</Badge> : <span className="text-sm text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{m.recordCount}</TableCell>
                  <TableCell>
                    <Badge variant={m.active ? "success" : "outline"}>{m.active ? "Aktif" : "Nonaktif"}</Badge>
                  </TableCell>
                  {canManage ? (
                    <TableCell>
                      <MasterRowActions master={m} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )
      ) : null}
    </div>
  );
}
