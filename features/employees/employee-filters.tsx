"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CUSTOM_FILTER_PARAM_PREFIX } from "@/features/employee-fields/filtering";
import type { CustomFieldFilterSpec } from "@/features/employee-fields/filtering";

/**
 * Employee list filter bar.
 *
 * Layout: `[Organization ▼] [Project ▼] [Search ____] [Status ▼] [Search]`,
 * followed by the dynamic custom-field filters.
 *
 * The search/status/custom controls are a plain `GET` form targeting
 * `/employees`, so results stay shareable and bookmarkable and filtering
 * always runs server-side. The Organization and Project selects navigate
 * immediately on change so the Project options can be re-fetched for the
 * newly selected Organization: changing the Organization drops the current
 * Project selection (`projectId`) before navigating, which is exactly the
 * "reset a project that does not belong to the new organization" contract.
 *
 * The Organization select is only rendered for a Super Administrator
 * (`canSwitchOrganization`); for everyone else the active organization is
 * shown read-only. The server independently enforces the same rule, so the
 * UI can never be the thing that grants cross-tenant access.
 */
const OPTION_FIELD_TYPES = new Set(["select", "radio", "multiselect"]);

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export interface EmployeeFilterOrganization {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeFilterProject {
  id: string;
  code: string;
  name: string;
}

export function EmployeeFilters({
  search,
  status,
  customFieldSpecs = [],
  selectedCustomValues = {},
  organizations = [],
  selectedOrganizationId = "",
  activeOrganizationName = null,
  canSwitchOrganization = false,
  projects = [],
  selectedProjectId = "",
}: {
  search: string;
  status: string;
  customFieldSpecs?: CustomFieldFilterSpec[];
  selectedCustomValues?: Record<string, string>;
  organizations?: EmployeeFilterOrganization[];
  selectedOrganizationId?: string;
  activeOrganizationName?: string | null;
  canSwitchOrganization?: boolean;
  projects?: EmployeeFilterProject[];
  selectedProjectId?: string;
}) {
  const router = useRouter();
  const hasCustomFilters = customFieldSpecs.length > 0;

  function navigate(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(window.location.search);
    mutate(params);
    params.delete("page");
    const query = params.toString();
    router.push(query ? `/employees?${query}` : "/employees");
  }

  function onOrganizationChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    navigate((params) => {
      if (value) params.set("org", value);
      else params.delete("org");
      // A project belongs to one organization: drop it when the tenant changes.
      params.delete("projectId");
    });
  }

  function onProjectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    navigate((params) => {
      if (value) params.set("projectId", value);
      else params.delete("projectId");
    });
  }

  function onClear() {
    navigate((params) => {
      params.delete("q");
      params.delete("status");
      for (const key of [...params.keys()]) {
        if (key.startsWith(CUSTOM_FILTER_PARAM_PREFIX)) params.delete(key);
      }
      // Organization and project stay selected: "Clear" resets the search
      // filters, not the tenant the Super Administrator is inspecting.
    });
  }

  const hasActiveSearch = Boolean(
    search || status || Object.keys(selectedCustomValues).length > 0
  );

  return (
    <form action="/employees" method="get" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-2 sm:min-w-56">
          <Label htmlFor="employee-org-filter">Organization</Label>
          {canSwitchOrganization ? (
            <select
              id="employee-org-filter"
              name="org"
              value={selectedOrganizationId}
              onChange={onOrganizationChange}
              className={SELECT_CLASS}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          ) : (
            <p
              id="employee-org-filter"
              className="border-input bg-muted/40 flex h-10 items-center rounded-md border px-3 text-sm text-muted-foreground"
            >
              {activeOrganizationName ?? "Your organization"}
            </p>
          )}
        </div>

        <div className="space-y-2 sm:min-w-44">
          <Label htmlFor="employee-project-filter">Project</Label>
          <select
            id="employee-project-filter"
            name="projectId"
            value={selectedProjectId}
            onChange={onProjectChange}
            className={SELECT_CLASS}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 space-y-2">
          <Label htmlFor="employee-search">Search</Label>
          <Input
            id="employee-search"
            name="q"
            type="search"
            defaultValue={search}
            placeholder="Name, employee number or email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="employee-status-filter">Status</Label>
          <select
            id="employee-status-filter"
            name="status"
            defaultValue={status}
            className="flex h-10 w-full min-w-40 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <Button type="submit" variant="secondary">
          Search
        </Button>
        {hasActiveSearch ? (
          <Button type="button" variant="ghost" onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>

      {hasCustomFilters ? (
        <div className="grid gap-3 rounded-md border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-3">
          <p className="text-xs font-medium text-muted-foreground sm:col-span-full">
            Custom field filters
          </p>
          {customFieldSpecs.map((spec) => (
            <CustomFilterControl
              key={spec.fieldDefinitionId}
              spec={spec}
              value={selectedCustomValues[spec.fieldKey] ?? ""}
            />
          ))}
        </div>
      ) : null}
    </form>
  );
}

function CustomFilterControl({
  spec,
  value,
}: {
  spec: CustomFieldFilterSpec;
  value: string;
}) {
  const name = `${CUSTOM_FILTER_PARAM_PREFIX}${spec.fieldKey}`;
  const id = `employee-custom-${spec.fieldKey}`;

  if (OPTION_FIELD_TYPES.has(spec.fieldType)) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{spec.label}</Label>
        <select
          id={id}
          name={name}
          defaultValue={value}
          className={SELECT_CLASS}
        >
          <option value="">All</option>
          {spec.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (spec.fieldType === "checkbox") {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>{spec.label}</Label>
        <select
          id={id}
          name={name}
          defaultValue={value}
          className={SELECT_CLASS}
        >
          <option value="">All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  }

  const type =
    spec.fieldType === "number" || spec.fieldType === "currency"
      ? "number"
      : spec.fieldType === "date"
        ? "date"
        : spec.fieldType === "datetime"
          ? "datetime-local"
          : spec.fieldType === "email"
            ? "email"
            : spec.fieldType === "url"
              ? "url"
              : "text";

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{spec.label}</Label>
      <Input id={id} name={name} type={type} defaultValue={value} />
    </div>
  );
}
