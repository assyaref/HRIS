import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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

import { listActiveEmployeeOptions } from "@/features/compliance/records.queries";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { textParam } from "@/features/reference-shared";
import { isTimeModuleReady, TIME_GUIDE, TIME_MIGRATION } from "@/features/time/module";
import { listShifts, listWorkGroups } from "@/features/time/queries";
import { formatDuration, shiftWorkMinutes, workingDaysLabel } from "@/features/time/rules";
import {
  ShiftCreateButton,
  ShiftRowActions,
  WorkGroupCreateButton,
  WorkGroupRowActions,
} from "@/features/time/time-forms";

export const metadata: Metadata = { title: "Shift & Grup Kerja" };

/**
 * Shift master (working hours, break, working days) and work groups that tie
 * employees to a shift. Attendance managers only.
 */
export default async function ShiftsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isTimeModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Shift & Grup Kerja" description="Jam kerja dan pengelompokan karyawan." />
        <ModuleNotReady module="Shift & Grup Kerja" migration={TIME_MIGRATION} guide={TIME_GUIDE} />
      </div>
    );
  }

  const params = await searchParams;
  const tab = textParam(params.tab) === "groups" ? "groups" : "shifts";
  const [shiftRows, groups, activeEmployees] = await Promise.all([
    listShifts(organizationId),
    listWorkGroups(organizationId),
    listActiveEmployeeOptions(organizationId),
  ]);

  const memberCount = groups.reduce((sum, g) => sum + g.members.length, 0);
  const shiftOptions = shiftRows
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.name, hours: `${s.startTime}–${s.endTime}` }));
  const employeeOptions = activeEmployees.map(({ id, employeeNumber, name }) => ({ id, employeeNumber, name }));
  const groupOf: Record<string, { id: string; name: string }> = {};
  for (const g of groups) for (const m of g.members) groupOf[m.employeeId] = { id: g.id, name: g.name };
  const unassigned = activeEmployees.filter((e) => !groupOf[e.id]).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shift & Grup Kerja"
        description="Atur jam kerja (shift) dan kelompokkan karyawan ke grup kerja dengan shift yang sama."
        actions={tab === "shifts" ? <ShiftCreateButton /> : <WorkGroupCreateButton shifts={shiftOptions} />}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="clock" label="Shift aktif" value={shiftOptions.length} hint={`${shiftRows.length} shift terdaftar`} tone="blue" />
        <StatCard icon="users-cog" label="Grup kerja" value={groups.length} hint="Kelompok jadwal" tone="green" />
        <StatCard icon="user" label="Karyawan terjadwal" value={memberCount} hint="Sudah masuk grup" tone="amber" />
        <StatCard icon="alert-triangle" label="Belum ada grup" value={unassigned} hint="Karyawan aktif" tone="rose" />
      </div>

      <StatusTabs
        label="Bagian"
        active={tab === "groups" ? "groups" : ""}
        buildHref={(value) => (value ? `/time/shifts?tab=${value}` : "/time/shifts")}
        tabs={[
          { value: "", label: "Shift", count: shiftRows.length },
          { value: "groups", label: "Grup kerja", count: groups.length },
        ]}
      />

      {tab === "shifts" ? (
        shiftRows.length === 0 ? (
          <EmptyState title="Belum ada shift" description='Klik "Tambah shift" untuk membuat jam kerja pertama, mis. Pagi 08:00–17:00.' />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Shift</TableHead>
                <TableHead>Jam kerja</TableHead>
                <TableHead>Istirahat</TableHead>
                <TableHead>Durasi efektif</TableHead>
                <TableHead>Hari kerja</TableHead>
                <TableHead>Grup</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shiftRows.map((s) => {
                const work = shiftWorkMinutes(s.startTime, s.endTime, s.breakMinutes);
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span className="size-3 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
                        {s.name}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-sm whitespace-nowrap">
                      {s.startTime}–{s.endTime}
                      {s.endTime <= s.startTime ? <span className="ml-1 text-xs text-muted-foreground">(+1 hari)</span> : null}
                    </TableCell>
                    <TableCell className="text-sm">{s.breakMinutes} menit</TableCell>
                    <TableCell className="text-sm">{work === null ? "—" : formatDuration(work)}</TableCell>
                    <TableCell className="text-sm">{workingDaysLabel(s.workingDays)}</TableCell>
                    <TableCell className="text-sm">{s.groupCount}</TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "success" : "outline"}>{s.active ? "Aktif" : "Nonaktif"}</Badge>
                    </TableCell>
                    <TableCell>
                      <ShiftRowActions shift={s} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )
      ) : groups.length === 0 ? (
        <EmptyState
          title="Belum ada grup kerja"
          description={shiftOptions.length === 0 ? "Buat shift terlebih dahulu, lalu tambahkan grup kerja." : 'Klik "Tambah grup" lalu atur anggotanya.'}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const assigned: Record<string, string> = {};
            for (const [employeeId, other] of Object.entries(groupOf)) {
              if (other.id !== g.id) assigned[employeeId] = other.name;
            }
            return (
              <section key={g.id} className="hris-card flex flex-col gap-3 rounded-[20px] border bg-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-semibold">{g.name}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">{g.description ?? "Tanpa keterangan"}</p>
                  </div>
                  {g.shiftName ? (
                    <span
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                      style={{ backgroundColor: `${g.shiftColor ?? "#3B82F6"}1A`, color: g.shiftColor ?? "#3B82F6" }}
                    >
                      {g.shiftName} · {g.shiftHours}
                    </span>
                  ) : (
                    <Badge variant="outline">Tanpa shift</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {g.members.length === 0 ? (
                    <span className="text-sm text-muted-foreground">Belum ada anggota.</span>
                  ) : (
                    <>
                      {g.members.slice(0, 12).map((m) => (
                        <Link
                          key={m.employeeId}
                          href={`/employees/${m.employeeId}`}
                          className="rounded-full border border-[var(--card-border)] bg-muted px-2.5 py-1 text-xs font-medium hover:text-primary"
                        >
                          {m.name}
                        </Link>
                      ))}
                      {g.members.length > 12 ? (
                        <span className="px-1 py-1 text-xs text-muted-foreground">+{g.members.length - 12} lainnya</span>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--card-border)] pt-3">
                  <span className="text-sm text-muted-foreground">{g.members.length} anggota</span>
                  <WorkGroupRowActions
                    group={{
                      id: g.id,
                      name: g.name,
                      shiftId: g.shiftId,
                      description: g.description,
                      memberIds: g.members.map((m) => m.employeeId),
                    }}
                    shifts={shiftOptions}
                    employees={employeeOptions}
                    assigned={assigned}
                  />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
