import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { CUSTOM_FILTER_PARAM_PREFIX } from "@/features/employee-fields/filtering";
import type { CustomFieldFilterSpec } from "@/features/employee-fields/filtering";

/**
 * Employee list search/filter bar.
 *
 * A plain `GET` form targeting `/employees`: values land in the URL query
 * string so results are shareable and bookmarkable. All filtering happens
 * server-side against the caller's organization.
 *
 * Core filters (search + status) keep their exact behavior. On top of them,
 * ACTIVE custom fields visible to the caller are rendered dynamically from
 * the field definitions (single source of truth) using the `cf:<fieldKey>`
 * query convention. Select/radio/multiselect render as dropdowns of their
 * defined options; text-ish/number/date/checkbox render the matching input.
 * There are no hard-coded field names: an admin creating "Shirt Size" makes a
 * Shirt Size filter appear without any source change.
 */
const OPTION_FIELD_TYPES = new Set(["select", "radio", "multiselect"]);

export function EmployeeFilters({
  search,
  status,
  customFieldSpecs = [],
  selectedCustomValues = {},
}: {
  search: string;
  status: string;
  customFieldSpecs?: CustomFieldFilterSpec[];
  selectedCustomValues?: Record<string, string>;
}) {
  const hasCustomFilters = customFieldSpecs.length > 0;
  return (
    <form
      action="/employees"
      method="get"
      className="flex flex-col gap-3"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
        {search || status || Object.keys(selectedCustomValues).length > 0 ? (
          <Link href="/employees" className={buttonVariants({ variant: "ghost" })}>
            Clear
          </Link>
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
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
