import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { isSuperAdmin } from "@/lib/auth/rbac";
import { SYSTEM_ORGANIZATION_CODE } from "@/lib/auth/roles";

import { listOrganizations } from "@/features/organizations/queries";
import {
  ORGANIZATION_STATUSES,
  ORGANIZATION_STATUS_LABELS,
  isOrganizationStatus,
} from "@/features/organizations/constants";
import { OrganizationsManager } from "@/features/organizations/organizations-manager";
import { CreateOrganizationDialog } from "@/features/organizations/organization-create-dialog";

export const metadata: Metadata = {
  title: "Organizations",
};

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Organization administration (R19 — SUPERADMIN ONLY).
 *
 * The page gate is `isSuperAdmin` — the system-level role resolved from
 * PostgreSQL against the reserved SYSTEM organization — NOT a permission
 * code: the requirement is "organization CRUD is Super Administrator only",
 * and that guarantee must not be dilutable by granting a code to any tenant
 * role. Non-superadmin users (including tenant ADMINs) get 403 even when the
 * URL is typed manually. Every mutation repeats the same check in the server
 * actions, so direct action calls are structurally blocked too.
 */
export default async function OrganizationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!(await isSuperAdmin(user.id))) {
    forbidden();
  }

  const params = await searchParams;
  const search = readParam(params.q) ?? null;
  const statusParam = readParam(params.status);
  const status =
    statusParam && isOrganizationStatus(statusParam) ? statusParam : null;

  const organizations = await listOrganizations({ search, status });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Organizations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Create and manage tenant organizations. Reserved for Super
            Administrators.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="flex items-center gap-2"
            action="/settings/organizations"
          >
            {status ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <input
              type="search"
              name="q"
              defaultValue={search ?? ""}
              placeholder="Search name or code"
              className="border-input bg-background h-9 w-44 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:w-56"
            />
            {search ? (
              <button
                type="submit"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Search
              </button>
            ) : null}
          </form>
          <CreateOrganizationDialog />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/settings/organizations${
            search ? `?q=${encodeURIComponent(search)}` : ""
          }`}
          className={buttonVariants({
            variant: status === null ? "primary" : "outline",
            size: "sm",
          })}
        >
          All
        </Link>
        {ORGANIZATION_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/settings/organizations?status=${value}${
              search ? `&q=${encodeURIComponent(search)}` : ""
            }`}
            className={buttonVariants({
              variant: status === value ? "primary" : "outline",
              size: "sm",
            })}
          >
            {ORGANIZATION_STATUS_LABELS[value]}
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {organizations.length === 0 ? (
            <EmptyState
              title="No organizations found"
              description="Adjust the search or status filter, or create the first tenant organization."
            />
          ) : (
            <OrganizationsManager
              organizations={organizations}
              reservedSystemCode={SYSTEM_ORGANIZATION_CODE}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
