/**
 * Training matrix compliance: each active employee's position requires a set
 * of trainings; a requirement is met by a record of that training master that
 * is not expired (valid, expiring or without expiry). Pure.
 */
import type { ValidityStatus } from "./validity.ts";

export interface MatrixEmployee {
  id: string;
  employeeNumber: string;
  name: string;
  position: string | null;
}
export interface MatrixRequirement {
  position: string;
  trainingMasterId: string;
  trainingName: string;
}
export interface MatrixTraining {
  employeeId: string;
  trainingMasterId: string | null;
  status: ValidityStatus;
}

export interface EmployeeCompliance {
  employee: MatrixEmployee;
  required: number;
  fulfilled: number;
  missing: string[];
}

const key = (position: string) => position.trim().toLowerCase();

export function computeMatrixCompliance(
  employees: readonly MatrixEmployee[],
  requirements: readonly MatrixRequirement[],
  trainings: readonly MatrixTraining[]
): { rows: EmployeeCompliance[]; required: number; fulfilled: number; percent: number } {
  const byPosition = new Map<string, MatrixRequirement[]>();
  for (const req of requirements) {
    const list = byPosition.get(key(req.position)) ?? [];
    list.push(req);
    byPosition.set(key(req.position), list);
  }
  const held = new Set(
    trainings
      .filter((t) => t.trainingMasterId && t.status !== "expired")
      .map((t) => `${t.employeeId}:${t.trainingMasterId}`)
  );

  const rows: EmployeeCompliance[] = [];
  let required = 0;
  let fulfilled = 0;
  for (const employee of employees) {
    const reqs = employee.position ? (byPosition.get(key(employee.position)) ?? []) : [];
    if (reqs.length === 0) continue;
    const missing = reqs
      .filter((r) => !held.has(`${employee.id}:${r.trainingMasterId}`))
      .map((r) => r.trainingName);
    required += reqs.length;
    fulfilled += reqs.length - missing.length;
    rows.push({ employee, required: reqs.length, fulfilled: reqs.length - missing.length, missing });
  }
  rows.sort(
    (a, b) =>
      b.missing.length - a.missing.length || a.employee.name.localeCompare(b.employee.name)
  );
  const percent = required > 0 ? Math.round((fulfilled / required) * 1000) / 10 : 100;
  return { rows, required, fulfilled, percent };
}
