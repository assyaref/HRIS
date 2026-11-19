/**
 * Organization-master matching rules — PURE (unit-tested).
 *
 * Employee department / position values are free text. They match a master
 * entry when equal after trimming, collapsing inner whitespace and ignoring
 * case ("  akuntansi " ≡ "Akuntansi").
 */

/** Trimmed, single-spaced display form. */
export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Comparison key. */
export function nameKey(value: string): string {
  return cleanName(value).toLocaleLowerCase("id-ID");
}

export interface ValueCount {
  value: string;
  count: number;
}

export interface ValueGroup {
  key: string;
  /** Most used spelling (ties: alphabetical). */
  preferred: string;
  spellings: ValueCount[];
  total: number;
}

/** Groups raw employee values by key; empty values are ignored. */
export function groupValues(values: readonly ValueCount[]): ValueGroup[] {
  const groups = new Map<string, ValueCount[]>();
  for (const v of values) {
    if (!v.value || cleanName(v.value) === "") continue;
    const key = nameKey(v.value);
    const list = groups.get(key) ?? [];
    const existing = list.find((x) => x.value === v.value);
    if (existing) existing.count += v.count;
    else list.push({ value: v.value, count: v.count });
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([key, spellings]) => {
      const sorted = [...spellings].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
      return {
        key,
        preferred: cleanName(sorted[0].value),
        spellings: sorted,
        total: sorted.reduce((s, x) => s + x.count, 0),
      };
    })
    .sort((a, b) => b.total - a.total || a.preferred.localeCompare(b.preferred));
}

/** Employee value groups with no master entry of the same key. */
export function unregistered(groups: readonly ValueGroup[], masterNames: readonly string[]): ValueGroup[] {
  const known = new Set(masterNames.map(nameKey));
  return groups.filter((g) => !known.has(g.key));
}

/**
 * Employee spellings that differ from the master's exact name although they
 * match it ("akuntansi " for master "Akuntansi").
 */
export function inconsistent(groups: readonly ValueGroup[], masterNames: readonly string[]): { master: string; spellings: ValueCount[] }[] {
  const byKey = new Map(masterNames.map((n) => [nameKey(n), n]));
  const out: { master: string; spellings: ValueCount[] }[] = [];
  for (const g of groups) {
    const master = byKey.get(g.key);
    if (!master) continue;
    const off = g.spellings.filter((s) => s.value !== master);
    if (off.length > 0) out.push({ master, spellings: off });
  }
  return out;
}

/** Employees using a master name (any spelling). */
export function usageCount(groups: readonly ValueGroup[], name: string): number {
  return groups.find((g) => g.key === nameKey(name))?.total ?? 0;
}
