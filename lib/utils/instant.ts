/**
 * Normalize a timestamp from any data path into a `Date` (or `null`).
 *
 * Drizzle's query builder returns `Date` for `timestamptz`, but raw
 * `db.execute(sql…)` rows come back as PostgreSQL text
 * ("2026-11-18 01:48:00.123+00"). Code that formats or compares instants
 * should pass values through here so either shape works and a malformed
 * value degrades to `null` instead of throwing during render.
 */
export function toInstant(
  value: Date | string | number | null | undefined
): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  // PostgreSQL text form → ISO 8601: "YYYY-MM-DD HH:MM:SS(.fff)±HH[:MM]".
  let text = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T");
  text = text.replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}
