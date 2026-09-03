import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Employee list search/filter bar.
 *
 * A plain `GET` form targeting `/employees`: values land in the URL query
 * string so results are shareable and bookmarkable. All filtering happens
 * server-side against the caller's organization.
 */
export function EmployeeFilters({
  search,
  status,
}: {
  search: string;
  status: string;
}) {
  return (
    <form
      action="/employees"
      method="get"
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
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
      {search || status ? (
        <Link
          href="/employees"
          className={buttonVariants({ variant: "ghost" })}
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}
