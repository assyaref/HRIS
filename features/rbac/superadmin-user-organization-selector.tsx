"use client";

import { useRouter } from "next/navigation";

interface SuperAdminUserOrganizationSelectorProps {
  organizations: Array<{
    id: string;
    code: string;
    name: string;
  }>;
  selectedOrganizationId: string;
}

export function SuperAdminUserOrganizationSelector({
  organizations,
  selectedOrganizationId,
}: SuperAdminUserOrganizationSelectorProps) {
  const router = useRouter();

  function handleChange(
    event: React.ChangeEvent<HTMLSelectElement>
  ) {
    const params = new URLSearchParams(window.location.search);

    params.set("organizationId", event.target.value);
    params.delete("userId");

    router.push(`/settings/users?${params.toString()}`);
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor="organizationId"
        className="block text-sm font-medium"
      >
        Organization
      </label>

      <select
        id="organizationId"
        name="organizationId"
        value={selectedOrganizationId}
        onChange={handleChange}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
      >
        {organizations.map((organization) => (
          <option
            key={organization.id}
            value={organization.id}
          >
            {organization.code} — {organization.name}
          </option>
        ))}
      </select>
    </div>
  );
}
