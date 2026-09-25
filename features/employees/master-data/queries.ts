import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeAddresses,
  employeeBankAccounts,
  employeeCustomFieldValues,
  employeeDependents,
  employeeDocuments,
  employeeEducations,
  employeeEmploymentHistory,
  employeeInsurances,
  employees,
  workLocations,
} from "@/db/schema";

import { getEmployeeInOrganization, type EmployeeDetail } from "../queries";

/**
 * Employee Master Data queries (Employee Master Data 2.0) — server-only.
 *
 * Every accessor is scoped to a single (organizationId, employeeId) pair.
 * Cross-organization data is unreachable: unknown/foreign employees return
 * empty collections and callers respond with forbidden. Sections with a
 * single-row contract (insurance) return `null` when absent.
 */

export interface EmployeeMasterData extends EmployeeDetail {
  nik: string | null;
  birthDate: Date | null;
  nickname: string | null;
  birthPlace: string | null;
  gender: string | null;
  religion: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  personalEmail: string | null;
  profilePhotoUrl: string | null;
  division: string | null;
  department: string | null;
  position: string | null;
  workLocationId: string | null;
  workLocationName: string | null;
  managerId: string | null;
  managerEmployeeNumber: string | null;
  employmentType: string | null;
  contractStart: Date | null;
  contractEnd: Date | null;
  resignationDate: Date | null;
  terminationDate: Date | null;
  reasonForLeaving: string | null;
}

/** Full employee record + work location name + manager employee number. */
export async function getEmployeeMasterData(
  employeeId: string,
  organizationId: string
): Promise<EmployeeMasterData | null> {
  const base = await getEmployeeInOrganization(employeeId, organizationId);
  if (!base) return null;

  const detailRows = await db
    .select()
    .from(employees)
    .where(
      and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId))
    )
    .limit(1);
  const detail = detailRows[0];
  if (!detail) return null;

  const [locationRows, managerRows] = await Promise.all([
    detail.workLocationId
      ? db
          .select({ name: workLocations.name })
          .from(workLocations)
          .where(eq(workLocations.id, detail.workLocationId))
          .limit(1)
      : Promise.resolve([]),
    detail.managerId
      ? db
          .select({ employeeNumber: employees.employeeNumber })
          .from(employees)
          .where(eq(employees.id, detail.managerId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    ...base,
    nik: detail.nik,
    birthDate: detail.birthDate,
    nickname: detail.nickname,
    birthPlace: detail.birthPlace,
    gender: detail.gender,
    religion: detail.religion,
    maritalStatus: detail.maritalStatus,
    nationality: detail.nationality,
    personalEmail: detail.personalEmail,
    profilePhotoUrl: detail.profilePhotoUrl,
    division: detail.division,
    department: detail.department,
    position: detail.position,
    workLocationId: detail.workLocationId,
    workLocationName: locationRows[0]?.name ?? null,
    managerId: detail.managerId,
    managerEmployeeNumber: managerRows[0]?.employeeNumber ?? null,
    employmentType: detail.employmentType,
    contractStart: detail.contractStart,
    contractEnd: detail.contractEnd,
    resignationDate: detail.resignationDate,
    terminationDate: detail.terminationDate,
    reasonForLeaving: detail.reasonForLeaving,
  };
}

export async function listEmployeeAddresses(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeAddresses)
    .where(
      and(
        eq(employeeAddresses.organizationId, organizationId),
        eq(employeeAddresses.employeeId, employeeId)
      )
    )
    .orderBy(employeeAddresses.type);
}

export async function getEmployeeInsurance(
  employeeId: string,
  organizationId: string
) {
  const rows = await db
    .select()
    .from(employeeInsurances)
    .where(
      and(
        eq(employeeInsurances.organizationId, organizationId),
        eq(employeeInsurances.employeeId, employeeId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listEmployeeBankAccounts(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeBankAccounts)
    .where(
      and(
        eq(employeeBankAccounts.organizationId, organizationId),
        eq(employeeBankAccounts.employeeId, employeeId)
      )
    )
    .orderBy(employeeBankAccounts.isPrimary);
}

export async function listEmployeeDependents(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeDependents)
    .where(
      and(
        eq(employeeDependents.organizationId, organizationId),
        eq(employeeDependents.employeeId, employeeId)
      )
    )
    .orderBy(employeeDependents.createdAt);
}

export async function listEmployeeEducations(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeEducations)
    .where(
      and(
        eq(employeeEducations.organizationId, organizationId),
        eq(employeeEducations.employeeId, employeeId)
      )
    )
    .orderBy(employeeEducations.startYear);
}

export async function listEmployeeDocuments(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeDocuments)
    .where(
      and(
        eq(employeeDocuments.organizationId, organizationId),
        eq(employeeDocuments.employeeId, employeeId)
      )
    )
    .orderBy(employeeDocuments.createdAt);
}

export async function listEmployeeEmploymentHistory(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeEmploymentHistory)
    .where(
      and(
        eq(employeeEmploymentHistory.organizationId, organizationId),
        eq(employeeEmploymentHistory.employeeId, employeeId)
      )
    )
    .orderBy(employeeEmploymentHistory.effectiveFrom);
}

/** Current custom values (one row per active field for an employee). */
export async function listEmployeeCustomValues(
  employeeId: string,
  organizationId: string
) {
  return db
    .select()
    .from(employeeCustomFieldValues)
    .where(
      and(
        eq(employeeCustomFieldValues.organizationId, organizationId),
        eq(employeeCustomFieldValues.employeeId, employeeId)
      )
    )
    .orderBy(employeeCustomFieldValues.updatedAt);
}

/** Map a custom value row to its formatted display string. */
export function customValueDisplay(
  fieldType: string,
  value: {
    valueText: string | null;
    valueNumber: string | null;
    valueDate: Date | null;
    valueBoolean: boolean | null;
    valueJson: unknown[] | null;
  }
): string {
  if (fieldType === "select" || fieldType === "radio" || fieldType === "multiselect") {
    return (value.valueJson ?? []).map((item) => String(item)).join(", ");
  }
  if (fieldType === "checkbox") {
    return value.valueBoolean ? "Yes" : "No";
  }
  if (fieldType === "date" || fieldType === "datetime") {
    if (!value.valueDate) return "";
    const normalized = new Date(value.valueDate);
    if (Number.isNaN(normalized.getTime())) return "";
    if (fieldType === "date") return normalized.toISOString().slice(0, 10);
    return normalized.toISOString().replace("T", " ").slice(0, 16);
  }
  if (fieldType === "number" || fieldType === "currency") {
    return value.valueNumber ?? "";
  }
  return value.valueText ?? "";
}