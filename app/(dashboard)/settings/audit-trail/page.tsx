import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/ui/page-header";
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
import { APP_TIME_ZONE } from "@/lib/utils/greeting";

import { listAuditEntityTypes, listAuditTrail } from "@/features/audit/queries";
import { pageParam, textParam } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Audit Trail" };

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** "employee.personal.updated" → "Employee Personal Updated". */
function humanize(action: string): string {
  return action.replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short, safe one-line summary of the metadata object (never secrets). */
function metadataSummary(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata as Record<string, unknown>)) {
    if (/password|hash|token|secret|template|embedding/i.test(key)) continue;
    if (value === null || value === undefined || typeof value === "object") continue;
    parts.push(`${key}: ${String(value)}`);
    if (parts.length === 3) break;
  }
  return parts.join(" · ");
}

/** Read-only audit trail of the active organization (audit.view). */
export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.AUDIT_VIEW);
  if (!user.organizationId) forbidden();

  const params = await searchParams;
  const q = textParam(params.q);
  const entityType = textParam(params.entity);
  const fromRaw = textParam(params.from);
  const toRaw = textParam(params.to);
  const from = fromRaw && DATE_KEY.test(fromRaw) ? fromRaw : undefined;
  const to = toRaw && DATE_KEY.test(toRaw) ? toRaw : undefined;

  const [entityTypes, result] = await Promise.all([
    listAuditEntityTypes(user.organizationId),
    listAuditTrail(user.organizationId, {
      q,
      entityType,
      from,
      to,
      page: pageParam(params.page),
    }),
  ]);
  const { rows, total, page, totalPages } = result;

  const href = (nextPage: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (entityType) query.set("entity", entityType);
    if (from) query.set("from", from);
    if (to) query.set("to", to);
    if (nextPage > 1) query.set("page", String(nextPage));
    const text = query.toString();
    return `/settings/audit-trail${text ? `?${text}` : ""}`;
  };
  const when = new Intl.DateTimeFormat("id-ID", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Trail"
        description={`Jejak aktivitas pengguna di organisasi ini. ${total} entri.`}
      />

      <form
        action="/settings/audit-trail"
        method="get"
        className="hris-card grid gap-3 rounded-[20px] border bg-card p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end"
      >
        <div className="space-y-2">
          <Label htmlFor="at-q">Cari aksi atau pelaku</Label>
          <Input id="at-q" name="q" defaultValue={q ?? ""} placeholder="mis. employee.created atau email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="at-entity">Modul</Label>
          <NativeSelect id="at-entity" name="entity" defaultValue={entityType ?? ""}>
            <option value="">Semua modul</option>
            {entityTypes.map((type) => (
              <option key={type} value={type}>
                {humanize(type)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="at-from">Dari</Label>
          <Input id="at-from" type="date" name="from" defaultValue={from ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="at-to">Sampai</Label>
          <Input id="at-to" type="date" name="to" defaultValue={to ?? ""} />
        </div>
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <HrisIcon name="search" className="size-4" />
          Cari
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState title="Belum ada entri" description="Tidak ada aktivitas yang cocok dengan filter ini." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Waktu</TableHead>
              <TableHead>Pelaku</TableHead>
              <TableHead>Aksi</TableHead>
              <TableHead>Modul</TableHead>
              <TableHead>Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                  {when.format(row.createdAt)}
                </TableCell>
                <TableCell className="max-w-56 truncate text-sm">{row.actorEmail ?? "Sistem"}</TableCell>
                <TableCell className="text-sm font-medium">{humanize(row.action)}</TableCell>
                <TableCell>
                  <Badge variant="tonal">{humanize(row.entityType)}</Badge>
                </TableCell>
                <TableCell className="max-w-80 truncate text-xs text-muted-foreground">
                  {metadataSummary(row.metadata) || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {totalPages > 1 ? (
        <nav aria-label="Halaman" className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Halaman {page} dari {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Sebelumnya
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Berikutnya
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
