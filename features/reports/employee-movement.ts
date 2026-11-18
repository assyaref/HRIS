/**
 * Employee movement report (masuk / keluar / turnover) over a date range.
 * Pure: works on plain rows so it is unit-testable and shared by the page
 * and the Excel export.
 */

export interface MovementEmployee {
  id: string;
  employeeNumber: string;
  name: string;
  position: string | null;
  department: string | null;
  workLocation: string | null;
  employmentStatus: string;
  /** "YYYY-MM-DD" or null. */
  hireDate: string | null;
  /** Earliest of termination / resignation date, "YYYY-MM-DD" or null. */
  exitDate: string | null;
}

export interface MovementGroup {
  key: string;
  joined: number;
  left: number;
  headcountEnd: number;
}

export interface EmployeeMovementReport {
  from: string;
  to: string;
  headcountStart: number;
  headcountEnd: number;
  joined: MovementEmployee[];
  left: MovementEmployee[];
  /** Exits ÷ average headcount × 100, rounded to 1 decimal; null when 0. */
  turnoverRate: number | null;
  byDepartment: MovementGroup[];
  byWorkLocation: MovementGroup[];
}

/** Employed on `day`: hired on/before it (or unknown) and not exited before it. */
function employedOn(employee: MovementEmployee, day: string): boolean {
  if (employee.hireDate && employee.hireDate > day) return false;
  if (employee.exitDate && employee.exitDate < day) return false;
  // Without any exit date an inactive employee is treated as gone.
  if (!employee.exitDate && employee.employmentStatus !== "active") return false;
  return true;
}

const inRange = (value: string | null, from: string, to: string) =>
  value !== null && value >= from && value <= to;

function group(
  rows: readonly MovementEmployee[],
  keyOf: (row: MovementEmployee) => string | null,
  from: string,
  to: string
): MovementGroup[] {
  const map = new Map<string, MovementGroup>();
  for (const row of rows) {
    const key = keyOf(row)?.trim() || "Tidak diisi";
    const entry = map.get(key) ?? { key, joined: 0, left: 0, headcountEnd: 0 };
    if (inRange(row.hireDate, from, to)) entry.joined++;
    if (inRange(row.exitDate, from, to)) entry.left++;
    if (employedOn(row, to)) entry.headcountEnd++;
    map.set(key, entry);
  }
  return [...map.values()]
    .filter((g) => g.joined || g.left || g.headcountEnd)
    .sort((a, b) => b.headcountEnd - a.headcountEnd || a.key.localeCompare(b.key));
}

export function buildEmployeeMovementReport(
  employees: readonly MovementEmployee[],
  from: string,
  to: string
): EmployeeMovementReport {
  const [start, end] = from <= to ? [from, to] : [to, from];
  const headcountStart = employees.filter((e) => employedOn(e, start)).length;
  const headcountEnd = employees.filter((e) => employedOn(e, end)).length;
  const joined = employees
    .filter((e) => inRange(e.hireDate, start, end))
    .sort((a, b) => (a.hireDate ?? "").localeCompare(b.hireDate ?? ""));
  const left = employees
    .filter((e) => inRange(e.exitDate, start, end))
    .sort((a, b) => (a.exitDate ?? "").localeCompare(b.exitDate ?? ""));
  const average = (headcountStart + headcountEnd) / 2;
  const turnoverRate =
    average > 0 ? Math.round((left.length / average) * 1000) / 10 : null;
  return {
    from: start,
    to: end,
    headcountStart,
    headcountEnd,
    joined,
    left,
    turnoverRate,
    byDepartment: group(employees, (e) => e.department, start, end),
    byWorkLocation: group(employees, (e) => e.workLocation, start, end),
  };
}
