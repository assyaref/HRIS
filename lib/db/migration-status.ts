/**
 * Migration status — PURE (shared by `npm run db:status` and the System
 * Status page; unit-tested).
 *
 * drizzle-kit migrate applies every journal entry whose `when` is newer than
 * the LAST recorded migration; an older entry that is not recorded would be
 * skipped silently, so it is reported as "skipped".
 */

export interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export type MigrationState = "applied" | "pending" | "skipped";

export interface MigrationStatus {
  tag: string;
  when: number;
  state: MigrationState;
}

export function migrationStatus(entries: readonly JournalEntry[], appliedWhen: readonly number[]): {
  items: MigrationStatus[];
  applied: number;
  pending: number;
  skipped: number;
} {
  const applied = new Set(appliedWhen.map(Number));
  const last = applied.size ? Math.max(...applied) : 0;
  const items = entries.map((e) => ({
    tag: e.tag,
    when: e.when,
    state: (applied.has(e.when) ? "applied" : e.when < last ? "skipped" : "pending") as MigrationState,
  }));
  return {
    items,
    applied: items.filter((i) => i.state === "applied").length,
    pending: items.filter((i) => i.state === "pending").length,
    skipped: items.filter((i) => i.state === "skipped").length,
  };
}
