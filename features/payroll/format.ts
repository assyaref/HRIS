/** Payroll display helpers (Phase 8). */

export function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toISOString().replace("T", " ").slice(0, 16);
}

/** Payroll period code with the `PS-` payslip prefix convention. */
export function buildPayslipNumberPrefix(periodCode: string): string {
  return `PS-${periodCode}`;
}
