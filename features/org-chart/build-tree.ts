/**
 * Organization chart from the employee → manager relation.
 *
 * Pure. Robust against bad data: a manager outside the list makes the
 * employee a root, and reporting cycles (A → B → A) are broken so every
 * employee appears exactly once.
 */

export interface OrgChartPerson {
  id: string;
  managerId: string | null;
  name: string;
  employeeNumber: string;
  position: string | null;
  department: string | null;
  photoUrl?: string | null;
}

export interface OrgChartNode extends OrgChartPerson {
  children: OrgChartNode[];
  /** Total people below this node (all levels). */
  descendantCount: number;
}

export function buildOrgChart(people: readonly OrgChartPerson[]): OrgChartNode[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const childrenOf = new Map<string, OrgChartPerson[]>();
  const roots: OrgChartPerson[] = [];

  for (const person of people) {
    const managerId =
      person.managerId && person.managerId !== person.id && byId.has(person.managerId)
        ? person.managerId
        : null;
    if (managerId) {
      const list = childrenOf.get(managerId) ?? [];
      list.push(person);
      childrenOf.set(managerId, list);
    } else {
      roots.push(person);
    }
  }

  const placed = new Set<string>();
  const sortPeople = (a: OrgChartPerson, b: OrgChartPerson) =>
    a.name.localeCompare(b.name);

  const build = (person: OrgChartPerson): OrgChartNode => {
    placed.add(person.id);
    const children = (childrenOf.get(person.id) ?? [])
      .filter((child) => !placed.has(child.id))
      .sort(sortPeople)
      .map(build);
    return {
      ...person,
      children,
      descendantCount: children.reduce((sum, c) => sum + 1 + c.descendantCount, 0),
    };
  };

  const tree = roots.sort(sortPeople).map(build);

  // People only reachable through a cycle were never placed: break the cycle
  // at the first unplaced person (by name) and hang the rest beneath them.
  for (const person of [...people].sort(sortPeople)) {
    if (!placed.has(person.id)) tree.push(build(person));
  }
  // Larger teams first, then by name.
  return tree.sort(
    (a, b) => b.descendantCount - a.descendantCount || a.name.localeCompare(b.name)
  );
}
