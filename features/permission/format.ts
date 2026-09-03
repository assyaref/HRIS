/** Permission request display helpers (Phase 7). */

export function formatDateTime(value: Date | null): string {
  if (!value) return "—";
  // Keep output stable/UTC; UI uses server-rendered values.
  return value.toISOString().replace("T", " ").slice(0, 16);
}

export function formatDateTimeLocal(value: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate()
  )}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}
