import type { ReactNode } from "react";

import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Date-range filter bar shared by the report pages (GET form). */
export function ReportFilter({
  action,
  from,
  to,
  children,
  exportHref,
}: {
  action: string;
  from: string;
  to: string;
  /** Extra filter fields rendered before the buttons. */
  children?: ReactNode;
  exportHref?: string;
}) {
  return (
    <form
      action={action}
      method="get"
      className="hris-card flex flex-col gap-3 rounded-[20px] border bg-card p-4 lg:flex-row lg:items-end"
    >
      <div className="space-y-2">
        <Label htmlFor={`${action}-from`}>Dari tanggal</Label>
        <Input id={`${action}-from`} type="date" name="from" defaultValue={from} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${action}-to`}>Sampai tanggal</Label>
        <Input id={`${action}-to`} type="date" name="to" defaultValue={to} />
      </div>
      {children}
      <div className="flex flex-wrap gap-2 lg:ml-auto">
        <button type="submit" className={buttonVariants({ variant: "secondary" })}>
          <HrisIcon name="search" className="size-4" />
          Tampilkan
        </button>
        <a href={action} className={buttonVariants({ variant: "ghost" })}>
          Reset
        </a>
        {exportHref ? (
          <a href={exportHref} className={buttonVariants({ variant: "outline" })}>
            <HrisIcon name="download" className="size-4" />
            Export Excel
          </a>
        ) : null}
      </div>
    </form>
  );
}
