"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export interface SuperAdminOrganizationOption {
  id: string;
  code: string;
  name: string;
  status: string;
}

export function SuperAdminOrganizationSelector({
  organizations,
  selectedOrganizationId,
}: {
  organizations: readonly SuperAdminOrganizationOption[];
  selectedOrganizationId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="space-y-2">
      <label
        htmlFor="superadmin-organization"
        className="text-sm font-medium"
      >
        Organization
      </label>

      <select
        id="superadmin-organization"
        value={selectedOrganizationId}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("organizationId", event.target.value);
          router.push(`${pathname}?${next.toString()}`);
        }}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring sm:max-w-xl"
      >
        {organizations.map((organization) => (
          <option
            key={organization.id}
            value={organization.id}
            disabled={organization.status !== "active"}
          >
            {organization.code} — {organization.name}
            {organization.status !== "active" ? ` (${organization.status})` : ""}
          </option>
        ))}
      </select>

      <p className="text-xs text-muted-foreground">
        SUPERADMIN can administer roles across organizations. The selected
        organization determines which role catalog is displayed.
      </p>
    </div>
  );
}
