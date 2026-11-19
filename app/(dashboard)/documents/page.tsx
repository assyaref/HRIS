import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
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
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { listActiveEmployeeOptions } from "@/features/compliance/records.queries";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import {
  IssueNumberButton,
  PkwtButton,
  SeedTypesButton,
  TypeCreateButton,
  TypeRowActions,
  VoidDocumentButton,
} from "@/features/documents/document-forms";
import { DOCUMENTS_GUIDE, DOCUMENTS_MIGRATION, isDocumentsModuleReady } from "@/features/documents/module";
import { RESET_LABELS } from "@/features/documents/numbering";
import { DOCUMENT_LIST_LIMIT, listDocumentTypes, listIssuedDocuments } from "@/features/documents/queries";
import { dateParam, textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Surat & Nomor Surat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Outgoing-letter register: issue numbers per document type, void them,
 * generate PKWT contracts, and manage number formats. Viewing needs
 * employees.view + employees.document.view; changing needs
 * employees.document.upload (PKWT also employment view).
 */
export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isDocumentsModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Surat & Nomor Surat" description="Penomoran surat keluar dan pembuatan PKWT." />
        <ModuleNotReady module="Surat & Nomor Surat" migration={DOCUMENTS_MIGRATION} guide={DOCUMENTS_GUIDE} />
      </div>
    );
  }

  const [canManage, canPkwt, canUpdateContract] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE),
  ]);

  const params = await searchParams;
  const tab = textParam(params.tab) === "types" ? "types" : "register";
  const today = todayKey();
  const from = dateParam(params.from, `${today.slice(0, 4)}-01-01`);
  const to = dateParam(params.to, today);
  const typeParam = textParam(params.type);
  const typeId = typeParam && UUID.test(typeParam) ? typeParam : undefined;
  const q = textParam(params.q)?.toLowerCase() ?? "";

  const [types, documents, employees] = await Promise.all([
    listDocumentTypes(organizationId),
    listIssuedDocuments(organizationId, { from, to, typeId }),
    canManage ? listActiveEmployeeOptions(organizationId) : Promise.resolve([]),
  ]);
  const rows = q
    ? documents.filter(
        (d) =>
          d.documentNumber.toLowerCase().includes(q) ||
          d.subject.toLowerCase().includes(q) ||
          (d.employeeName ?? "").toLowerCase().includes(q) ||
          (d.recipient ?? "").toLowerCase().includes(q)
      )
    : documents;
  const active = documents.filter((d) => !d.voided);
  const activeTypes = types.filter((t) => t.active);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Surat & Nomor Surat"
        description="Register surat keluar dengan penomoran otomatis per jenis surat, dan pembuatan PKWT dari data karyawan."
        actions={
          canManage ? (
            <>
              <IssueNumberButton
                types={activeTypes.map(({ id, code, name }) => ({ id, code, name }))}
                employees={employees.map(({ id, employeeNumber, name }) => ({ id, employeeNumber, name }))}
                today={today}
              />
              {canPkwt ? (
                <PkwtButton
                  employees={employees.map(({ id, employeeNumber, name, position, department }) => ({ id, employeeNumber, name, position, department }))}
                  today={today}
                  defaultCity=""
                  canUpdateEmployee={canUpdateContract}
                />
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="document" label="Surat terbit" value={active.length} hint="Dalam rentang tanggal" tone="blue" />
        <StatCard icon="briefcase" label="PKWT" value={active.filter((d) => d.typeCode === "PKWT").length} hint="Kontrak dibuat" tone="green" />
        <StatCard icon="alert" label="Dibatalkan" value={documents.length - active.length} hint="Nomor tidak dipakai" tone="rose" />
        <StatCard icon="layers" label="Jenis surat aktif" value={activeTypes.length} hint={`${types.length} terdaftar`} tone="amber" />
      </div>

      <StatusTabs
        label="Bagian"
        active={tab === "types" ? "types" : ""}
        buildHref={(value) => (value ? `/documents?tab=${value}` : "/documents")}
        tabs={[
          { value: "", label: "Register surat", count: documents.length },
          { value: "types", label: "Jenis surat", count: types.length },
        ]}
      />

      {tab === "types" ? (
        <section className="space-y-4">
          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <TypeCreateButton today={today} />
              <SeedTypesButton />
            </div>
          ) : null}
          {types.length === 0 ? (
            <EmptyState title="Belum ada jenis surat" description="Tambahkan jenis surat standar (PKWT, SK, SKK, SP, ST) atau buat sendiri." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Format nomor</TableHead>
                  <TableHead>Reset</TableHead>
                  <TableHead>Terbit</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Aksi</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {types.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono font-semibold">{t.code}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="font-mono text-sm">{t.numberFormat}</TableCell>
                    <TableCell className="text-sm">{RESET_LABELS[t.resetPeriod] ?? t.resetPeriod}</TableCell>
                    <TableCell className="text-sm">{t.issuedCount}</TableCell>
                    <TableCell>
                      <Badge variant={t.active ? "success" : "outline"}>{t.active ? "Aktif" : "Nonaktif"}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <TypeRowActions
                          today={today}
                          active={t.active}
                          type={{
                            id: t.id,
                            code: t.code,
                            name: t.name,
                            numberFormat: t.numberFormat,
                            sequencePadding: t.sequencePadding,
                            resetPeriod: t.resetPeriod,
                          }}
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      ) : (
        <>
          <form
            action="/documents"
            method="get"
            className="hris-card grid gap-3 rounded-[20px] border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] xl:items-end"
          >
            <div className="space-y-2">
              <Label htmlFor="dc-from">Tanggal dari</Label>
              <Input id="dc-from" type="date" name="from" defaultValue={from} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-to">Sampai</Label>
              <Input id="dc-to" type="date" name="to" defaultValue={to} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-type">Jenis</Label>
              <NativeSelect id="dc-type" name="type" defaultValue={typeId ?? ""}>
                <option value="">Semua jenis</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dc-q">Cari</Label>
              <Input id="dc-q" name="q" defaultValue={q} placeholder="Nomor, perihal, nama" />
            </div>
            <button type="submit" className={buttonVariants({ variant: "secondary" })}>
              <HrisIcon name="search" className="size-4" />
              Terapkan
            </button>
          </form>

          {types.length === 0 && canManage ? (
            <EmptyState
              title="Mulai dengan jenis surat"
              description='Buka tab "Jenis surat" lalu tambahkan jenis surat standar untuk mulai menerbitkan nomor.'
            />
          ) : rows.length === 0 ? (
            <EmptyState title="Belum ada surat" description="Tidak ada surat pada rentang tanggal dan filter ini." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomor surat</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Perihal</TableHead>
                  <TableHead>Karyawan / tujuan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d) => (
                  <TableRow key={d.id} className={d.voided ? "opacity-60" : undefined}>
                    <TableCell>
                      <Link href={`/documents/${d.id}`} className={d.voided ? "font-mono text-sm line-through" : "font-mono text-sm font-semibold hover:text-primary"}>
                        {d.documentNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{d.issuedDate}</TableCell>
                    <TableCell className="text-sm">{d.typeCode}</TableCell>
                    <TableCell className="max-w-[300px] text-sm">
                      <p className="line-clamp-2">{d.subject}</p>
                      {d.voided && d.voidReason ? <p className="text-xs text-muted-foreground">Batal: {d.voidReason}</p> : null}
                    </TableCell>
                    <TableCell className="text-sm">
                      {d.employeeId ? (
                        <Link href={`/employees/${d.employeeId}`} className="hover:text-primary">
                          {d.employeeName}
                        </Link>
                      ) : (
                        (d.recipient ?? "—")
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.voided ? "danger" : "success"}>{d.voided ? "Dibatalkan" : "Terbit"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/documents/${d.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                          {d.hasContent ? "Lihat / cetak" : "Detail"}
                        </Link>
                        {canManage && !d.voided ? <VoidDocumentButton id={d.id} documentNumber={d.documentNumber} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {documents.length >= DOCUMENT_LIST_LIMIT ? (
            <p className="text-sm text-muted-foreground">Menampilkan {DOCUMENT_LIST_LIMIT} surat terbaru. Persempit rentang tanggal.</p>
          ) : null}
        </>
      )}
    </div>
  );
}
