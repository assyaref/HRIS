import type { Metadata } from "next";
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
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { isOrgMasterReady, ORG_MASTER_GUIDE, ORG_MASTER_MIGRATION } from "@/features/org-master/module";
import {
  DepartmentCreateButton,
  DepartmentRowActions,
  GradeCreateButton,
  GradeRowActions,
  ImportButton,
  PositionCreateButton,
  PositionRowActions,
  UnifyButton,
} from "@/features/org-master/org-master-forms";
import { listDepartments, listEmployeeValues, listGrades, listPositions } from "@/features/org-master/queries";
import { groupValues, inconsistent, unregistered, usageCount, type ValueGroup } from "@/features/org-master/rules";
import { textParam } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Master Organisasi" };

function CleanupPanel({
  kind,
  label,
  missing,
  mismatched,
  canManage,
}: {
  kind: "department" | "position";
  label: string;
  missing: ValueGroup[];
  mismatched: { master: string; spellings: { value: string; count: number }[] }[];
  canManage: boolean;
}) {
  const mismatchCount = mismatched.reduce((s, m) => s + m.spellings.reduce((x, y) => x + y.count, 0), 0);
  if (missing.length === 0 && mismatchCount === 0) {
    return (
      <p className="rounded-2xl border border-[var(--card-border)] bg-card px-4 py-3 text-sm text-muted-foreground">
        ✓ Semua {label} di data karyawan sudah sesuai master.
      </p>
    );
  }
  return (
    <section className="hris-attention space-y-3 rounded-[20px] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold text-foreground">Rapikan data karyawan</h2>
          <p className="text-sm text-foreground/80">
            {missing.length > 0 ? `${missing.length} ${label} di data karyawan belum terdaftar di master. ` : ""}
            {mismatchCount > 0 ? `${mismatchCount} data karyawan memakai ejaan berbeda dari master.` : ""}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            {missing.length > 0 ? <ImportButton kind={kind} count={missing.length} /> : null}
            {mismatchCount > 0 ? <UnifyButton kind={kind} count={mismatchCount} /> : null}
          </div>
        ) : null}
      </div>
      {missing.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {missing.slice(0, 40).map((g) => (
            <span key={g.key} className="rounded-full bg-white/80 px-2.5 py-1 text-xs dark:bg-black/20" title={g.spellings.map((s) => `"${s.value}" (${s.count})`).join(", ")}>
              {g.preferred} · {g.total}
              {g.spellings.length > 1 ? ` · ${g.spellings.length} ejaan` : ""}
            </span>
          ))}
        </div>
      ) : null}
      {mismatched.length > 0 ? (
        <ul className="space-y-0.5 text-xs text-foreground/80">
          {mismatched.slice(0, 10).map((m) => (
            <li key={m.master}>
              {m.spellings.map((s) => `"${s.value}" (${s.count})`).join(", ")} → <span className="font-semibold">{m.master}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Organization master: departments, job positions (job description, grade)
 * and grades, with tools to align employees' free-text department /
 * position with the master. View: employees.view; change:
 * employees.employment.update.
 */
export default async function OrgMasterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isOrgMasterReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Master Organisasi" description="Departemen, jabatan, dan grade." />
        <ModuleNotReady module="Master Organisasi" migration={ORG_MASTER_MIGRATION} guide={ORG_MASTER_GUIDE} />
      </div>
    );
  }

  const params = await searchParams;
  const tabParam = textParam(params.tab);
  const tab = tabParam === "positions" || tabParam === "grades" ? tabParam : "departments";
  const [canManage, depts, positions, grades, deptValues, positionValues, divisionValues] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE),
    listDepartments(organizationId),
    listPositions(organizationId),
    listGrades(organizationId),
    listEmployeeValues(organizationId, "department"),
    listEmployeeValues(organizationId, "position"),
    listEmployeeValues(organizationId, "division"),
  ]);
  const deptGroups = groupValues(deptValues);
  const positionGroups = groupValues(positionValues);
  const divisions = [...new Set([...groupValues(divisionValues).map((g) => g.preferred), ...depts.map((d) => d.division).filter((d): d is string => Boolean(d))])].sort();
  const deptNames = depts.map((d) => d.name);
  const positionNames = positions.map((p) => p.name);
  const deptOptions = depts.filter((d) => d.active).map((d) => ({ id: d.id, label: d.name }));
  const gradeOptions = grades.filter((g) => g.active).map((g) => ({ id: g.id, label: `${g.code} — ${g.name}` }));
  const coverage = (groups: ValueGroup[], names: string[]) => {
    const total = groups.reduce((s, g) => s + g.total, 0);
    const matched = total - unregistered(groups, names).reduce((s, g) => s + g.total, 0);
    return total > 0 ? Math.round((matched / total) * 100) : 100;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Organisasi"
        description="Daftar baku departemen, jabatan (dengan job description dan grade), dan grade. Dipakai sebagai saran isian di form karyawan."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="building" label="Departemen" value={depts.filter((d) => d.active).length} hint={`${coverage(deptGroups, deptNames)}% data karyawan sesuai master`} tone="blue" />
        <StatCard icon="briefcase" label="Jabatan" value={positions.filter((p) => p.active).length} hint={`${coverage(positionGroups, positionNames)}% data karyawan sesuai master`} tone="green" />
        <StatCard icon="layers" label="Grade" value={grades.filter((g) => g.active).length} hint={`${positions.filter((p) => p.gradeId).length} jabatan sudah ber-grade`} tone="amber" />
        <StatCard icon="document" label="Job description" value={positions.filter((p) => p.jobDescription).length} hint={`dari ${positions.length} jabatan`} tone="rose" />
      </div>

      <StatusTabs
        label="Bagian"
        active={tab === "departments" ? "" : tab}
        buildHref={(value) => (value ? `/organization/master?tab=${value}` : "/organization/master")}
        tabs={[
          { value: "", label: "Departemen", count: depts.length },
          { value: "positions", label: "Jabatan", count: positions.length },
          { value: "grades", label: "Grade", count: grades.length },
        ]}
      />

      {tab === "departments" ? (
        <section className="space-y-4">
          <CleanupPanel kind="department" label="departemen" missing={unregistered(deptGroups, deptNames)} mismatched={inconsistent(deptGroups, deptNames)} canManage={canManage} />
          {canManage ? <DepartmentCreateButton divisions={divisions} /> : null}
          {depts.length === 0 ? (
            <EmptyState title="Belum ada departemen" description="Tambahkan departemen, atau impor dari data karyawan dengan tombol di atas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departemen</TableHead>
                  <TableHead>Divisi</TableHead>
                  <TableHead className="text-right">Karyawan</TableHead>
                  <TableHead className="text-right">Jabatan</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Aksi</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {depts.map((d) => {
                  const usage = usageCount(deptGroups, d.name);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="font-medium">{d.name}</span>
                        {d.description ? <p className="text-xs text-muted-foreground">{d.description}</p> : null}
                      </TableCell>
                      <TableCell className="text-sm">{d.division ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{usage}</TableCell>
                      <TableCell className="text-right text-sm">{d.positionCount}</TableCell>
                      <TableCell>
                        <Badge variant={d.active ? "success" : "outline"}>{d.active ? "Aktif" : "Nonaktif"}</Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <DepartmentRowActions item={{ id: d.id, name: d.name, division: d.division, description: d.description }} active={d.active} usage={usage} divisions={divisions} />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      ) : tab === "positions" ? (
        <section className="space-y-4">
          <CleanupPanel kind="position" label="jabatan" missing={unregistered(positionGroups, positionNames)} mismatched={inconsistent(positionGroups, positionNames)} canManage={canManage} />
          {canManage ? <PositionCreateButton departments={deptOptions} grades={gradeOptions} /> : null}
          {positions.length === 0 ? (
            <EmptyState title="Belum ada jabatan" description="Tambahkan jabatan, atau impor dari data karyawan dengan tombol di atas." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jabatan</TableHead>
                  <TableHead>Departemen</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Karyawan</TableHead>
                  <TableHead>Job description</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Aksi</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((p) => {
                  const usage = usageCount(positionGroups, p.name);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm">{p.departmentName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{p.gradeCode ? `${p.gradeCode} · ${p.gradeName}` : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{usage}</TableCell>
                      <TableCell className="max-w-[320px] text-sm">
                        {p.jobDescription ? (
                          <details>
                            <summary className="cursor-pointer text-primary">Lihat</summary>
                            <p className="mt-1 whitespace-pre-line text-muted-foreground">{p.jobDescription}</p>
                          </details>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.active ? "success" : "outline"}>{p.active ? "Aktif" : "Nonaktif"}</Badge>
                      </TableCell>
                      {canManage ? (
                        <TableCell>
                          <PositionRowActions
                            item={{ id: p.id, name: p.name, departmentId: p.departmentId, gradeId: p.gradeId, jobDescription: p.jobDescription }}
                            active={p.active}
                            usage={usage}
                            departments={deptOptions}
                            grades={gradeOptions}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          {canManage ? <GradeCreateButton /> : null}
          {grades.length === 0 ? (
            <EmptyState title="Belum ada grade" description="Buat jenjang grade (mis. G1 Staf … G6 Manajer) lalu tetapkan pada jabatan." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead className="text-right">Tingkat</TableHead>
                  <TableHead className="text-right">Jabatan</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage ? <TableHead className="text-right">Aksi</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono font-semibold">{g.code}</TableCell>
                    <TableCell>
                      {g.name}
                      {g.description ? <p className="text-xs text-muted-foreground">{g.description}</p> : null}
                    </TableCell>
                    <TableCell className="text-right text-sm">{g.level}</TableCell>
                    <TableCell className="text-right text-sm">{g.positionCount}</TableCell>
                    <TableCell>
                      <Badge variant={g.active ? "success" : "outline"}>{g.active ? "Aktif" : "Nonaktif"}</Badge>
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <GradeRowActions item={{ id: g.id, code: g.code, name: g.name, level: g.level, description: g.description }} active={g.active} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
