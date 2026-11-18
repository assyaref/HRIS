import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { initialsOf } from "@/lib/utils/greeting";

import { buildOrgChart, type OrgChartNode } from "@/features/org-chart/build-tree";
import { PrintButton } from "@/features/org-chart/print-button";
import { listOrgChartPeople } from "@/features/org-chart/queries";

export const metadata: Metadata = { title: "Struktur Organisasi" };

function PersonCard({ node }: { node: OrgChartNode }) {
  return (
    <Link
      href={`/employees/${node.id}`}
      className="hris-card hris-card-hover flex min-w-0 items-center gap-3 rounded-2xl border bg-card px-3.5 py-3"
    >
      <span
        aria-hidden="true"
        className="hris-chip-blue flex size-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
      >
        {initialsOf(node.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{node.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[node.position, node.department].filter(Boolean).join(" · ") || node.employeeNumber}
        </span>
      </span>
      {node.descendantCount > 0 ? (
        <span className="shrink-0 rounded-full bg-surface-primary px-2 py-0.5 text-[11px] font-semibold text-primary">
          {node.descendantCount} tim
        </span>
      ) : null}
    </Link>
  );
}

/** Nested tree with connector lines; deep levels stay readable on phones. */
function Branch({ nodes, depth = 0 }: { nodes: OrgChartNode[]; depth?: number }) {
  return (
    <ul className={depth === 0 ? "space-y-3" : "mt-2 space-y-2 border-l-2 border-[var(--card-border)] pl-4 sm:pl-6"}>
      {nodes.map((node) => (
        <li key={node.id} className="relative">
          {depth > 0 ? (
            <span
              aria-hidden="true"
              className="absolute top-7 -left-4 h-0.5 w-4 bg-[var(--card-border)] sm:-left-6 sm:w-6"
            />
          ) : null}
          <div className="max-w-md">
            <PersonCard node={node} />
          </div>
          {node.children.length > 0 ? <Branch nodes={node.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Organization chart built from each employee's Manager (Employment tab).
 * Employees without a manager start their own branch; reporting cycles are
 * broken so everyone appears exactly once.
 */
export default async function OrgChartPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  if (!user.organizationId) forbidden();

  const people = await listOrgChartPeople(user.organizationId);
  const tree = buildOrgChart(people);
  const withManager = people.filter((p) => p.managerId).length;
  const teams = tree.filter((n) => n.descendantCount > 0);
  const solo = tree.filter((n) => n.descendantCount === 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Struktur Organisasi"
        description={`${people.length} karyawan aktif · ${withManager} memiliki atasan. Atur atasan di tab Employment pada profil karyawan.`}
        actions={people.length > 0 ? <PrintButton /> : null}
      />
      {people.length === 0 ? (
        <EmptyState title="Belum ada karyawan aktif" description="Struktur organisasi muncul setelah karyawan ditambahkan." />
      ) : (
        <>
          {teams.length > 0 ? (
            <section className="hris-card rounded-[20px] border bg-card p-4 sm:p-6">
              <h2 className="mb-4 text-[17px] font-semibold">Hierarki tim</h2>
              <Branch nodes={teams} />
            </section>
          ) : null}
          {solo.length > 0 ? (
            <section className="hris-card rounded-[20px] border bg-card p-4 sm:p-6">
              <h2 className="text-[17px] font-semibold">Belum memiliki atasan</h2>
              <p className="mt-1 mb-4 text-sm text-muted-foreground">
                {solo.length} karyawan tanpa atasan dan tanpa bawahan.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {solo.map((node) => (
                  <PersonCard key={node.id} node={node} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
