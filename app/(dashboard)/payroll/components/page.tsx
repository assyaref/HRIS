import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/rbac";

import { PayrollComponentManager } from "@/features/payroll/payroll-component-manager";
import { listAllPayrollComponents } from "@/features/payroll/queries";

export const metadata: Metadata = {
  title: "Payroll components",
};

export default async function PayrollComponentsPage() {
  const user = await requireUser();
  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYROLL_UPDATE,
  ]);
  if (!user.organizationId) forbidden();

  const components = await listAllPayrollComponents(user.organizationId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payroll components
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Organization-wide earning and deduction definitions.
          </p>
        </div>
        <Link
          href="/payroll"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to payroll
        </Link>
      </div>

      <PayrollComponentManager components={components} />
    </div>
  );
}