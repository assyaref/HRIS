/**
 * Pure helper: turn a client-supplied path into a safe, same-origin landing
 * page after an organization switch.
 *
 * - Only absolute in-app paths are accepted (no scheme, no `//host`).
 * - Everything from the first record-id-like segment (UUID) on is dropped,
 *   since that record belongs to the previous organization.
 * - Query strings are dropped (they may carry ids of the previous tenant).
 */
const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function safeReturnPath(returnTo: unknown, keepRecord = false): string {
  if (typeof returnTo !== "string") return "/dashboard";
  const path = returnTo.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/dashboard";
  }
  if (keepRecord) return path || "/dashboard";
  const kept: string[] = [];
  for (const segment of path.split("/").filter(Boolean)) {
    if (UUID_SEGMENT.test(segment)) break;
    if (!/^[a-z0-9_-]+$/i.test(segment)) return "/dashboard";
    kept.push(segment);
  }
  return kept.length ? `/${kept.join("/")}` : "/dashboard";
}
