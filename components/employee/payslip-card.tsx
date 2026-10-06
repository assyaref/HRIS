import Link from "next/link";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

import { StatusBadge, statusTone } from "./status-badge";

/**
 * Employee payslip list item. `downloadHref` points at the EXISTING payslip
 * detail/PDF flow — the encryption/password contract is untouched.
 */
export function PayslipCard({
  periodLabel,
  payslipNumber,
  statusLabel,
  status,
  issuedLabel,
  href,
  downloadHref,
  className,
}: {
  periodLabel: string;
  payslipNumber: string;
  statusLabel: string;
  status: string;
  issuedLabel: string;
  href: string;
  downloadHref?: string;
  className?: string;
}) {
  return (
    <div className={cn("emp-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600"
          >
            <HrisIcon name="payslip" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#172554]">
              {periodLabel}
            </p>
            <p className="text-xs text-[#64748b]">Slip Gaji · {payslipNumber}</p>
            <p className="mt-0.5 text-xs text-[#94a3b8]">{issuedLabel}</p>
          </div>
        </div>
        <StatusBadge tone={statusTone(status)}>{statusLabel}</StatusBadge>
      </div>

      <div className="mt-3 flex gap-2">
        <Link
          href={href}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-50 px-3 text-sm font-semibold text-[#1677e8] transition-colors hover:bg-blue-100 focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:outline-none"
        >
          <HrisIcon name="document" className="size-4" />
          Lihat
        </Link>
        {downloadHref ? (
          <a
            href={downloadHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#1677e8] px-3 text-sm font-semibold text-white transition-colors hover:bg-[#0f63c9] focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <HrisIcon name="download" className="size-4" />
            Unduh
          </a>
        ) : null}
      </div>
    </div>
  );
}
