import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeTrainings,
  employees,
  medicalCheckups,
  trainingMasters,
  trainingRequirements,
  workLocations,
} from "@/db/schema";

import { evaluateValidity, type ValidityStatus } from "./validity";

const employeeName = sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`;

/* ------------------------------------------------------------------ */
/* Medical check-ups                                                   */
/* ------------------------------------------------------------------ */

export interface McuRow {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  position: string | null;
  workLocation: string | null;
  checkupDate: string;
  validUntil: string | null;
  provider: string | null;
  location: string | null;
  doctor: string | null;
  result: string;
  notes: string | null;
  status: ValidityStatus;
  daysRemaining: number | null;
}

/** Every MCU record of the organization, newest check-up first. */
export async function listMcuRecords(organizationId: string, today: string): Promise<McuRow[]> {
  const rows = await db
    .select({
      id: medicalCheckups.id,
      employeeId: medicalCheckups.employeeId,
      employeeNumber: employees.employeeNumber,
      employeeName,
      position: employees.position,
      workLocation: workLocations.name,
      checkupDate: medicalCheckups.checkupDate,
      validUntil: medicalCheckups.validUntil,
      provider: medicalCheckups.provider,
      location: medicalCheckups.location,
      doctor: medicalCheckups.doctor,
      result: medicalCheckups.result,
      notes: medicalCheckups.notes,
    })
    .from(medicalCheckups)
    .innerJoin(
      employees,
      and(eq(employees.id, medicalCheckups.employeeId), eq(employees.organizationId, organizationId))
    )
    .leftJoin(workLocations, eq(workLocations.id, employees.workLocationId))
    .where(eq(medicalCheckups.organizationId, organizationId))
    .orderBy(desc(medicalCheckups.checkupDate), asc(employees.employeeNumber));
  return rows.map((row) => ({ ...row, ...evaluateValidity(row.validUntil, today) }));
}

/**
 * The latest record per employee (most recent check-up date): the status an
 * employee is in right now. Older records stay visible in the full list.
 */
export function latestPerEmployee<T extends { employeeId: string; checkupDate?: string; trainingDate?: string }>(
  rows: readonly T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.employeeId)) continue;
    seen.add(row.employeeId);
    out.push(row);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Trainings                                                           */
/* ------------------------------------------------------------------ */

export interface TrainingMasterRow {
  id: string;
  name: string;
  category: string | null;
  trainingType: string;
  durationHours: number | null;
  organizer: string | null;
  validityMonths: number | null;
  isMandatory: boolean;
  active: boolean;
  recordCount: number;
}

export async function listTrainingMasters(organizationId: string): Promise<TrainingMasterRow[]> {
  const rows = await db
    .select({
      id: trainingMasters.id,
      name: trainingMasters.name,
      category: trainingMasters.category,
      trainingType: trainingMasters.trainingType,
      durationHours: trainingMasters.durationHours,
      organizer: trainingMasters.organizer,
      validityMonths: trainingMasters.validityMonths,
      isMandatory: trainingMasters.isMandatory,
      active: trainingMasters.active,
      recordCount: sql<number>`(SELECT count(*)::int FROM employee_trainings t WHERE t.training_master_id = ${trainingMasters.id})`,
    })
    .from(trainingMasters)
    .where(eq(trainingMasters.organizationId, organizationId))
    .orderBy(asc(trainingMasters.name));
  return rows.map((row) => ({ ...row, recordCount: Number(row.recordCount) }));
}

export interface TrainingRow {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  position: string | null;
  trainingMasterId: string | null;
  title: string;
  certificateNumber: string | null;
  issuer: string | null;
  location: string | null;
  trainingDate: string;
  validUntil: string | null;
  notes: string | null;
  status: ValidityStatus;
  daysRemaining: number | null;
}

export async function listTrainingRecords(
  organizationId: string,
  today: string
): Promise<TrainingRow[]> {
  const rows = await db
    .select({
      id: employeeTrainings.id,
      employeeId: employeeTrainings.employeeId,
      employeeNumber: employees.employeeNumber,
      employeeName,
      position: employees.position,
      trainingMasterId: employeeTrainings.trainingMasterId,
      title: employeeTrainings.title,
      certificateNumber: employeeTrainings.certificateNumber,
      issuer: employeeTrainings.issuer,
      location: employeeTrainings.location,
      trainingDate: employeeTrainings.trainingDate,
      validUntil: employeeTrainings.validUntil,
      notes: employeeTrainings.notes,
    })
    .from(employeeTrainings)
    .innerJoin(
      employees,
      and(eq(employees.id, employeeTrainings.employeeId), eq(employees.organizationId, organizationId))
    )
    .where(eq(employeeTrainings.organizationId, organizationId))
    .orderBy(desc(employeeTrainings.trainingDate), asc(employees.employeeNumber));
  return rows.map((row) => ({ ...row, ...evaluateValidity(row.validUntil, today) }));
}

export interface RequirementRow {
  id: string;
  position: string;
  trainingMasterId: string;
  trainingName: string;
}

export async function listTrainingRequirements(organizationId: string): Promise<RequirementRow[]> {
  return db
    .select({
      id: trainingRequirements.id,
      position: trainingRequirements.position,
      trainingMasterId: trainingRequirements.trainingMasterId,
      trainingName: trainingMasters.name,
    })
    .from(trainingRequirements)
    .innerJoin(trainingMasters, eq(trainingMasters.id, trainingRequirements.trainingMasterId))
    .where(eq(trainingRequirements.organizationId, organizationId))
    .orderBy(asc(trainingRequirements.position), asc(trainingMasters.name));
}

/* ------------------------------------------------------------------ */
/* Shared lookups                                                      */
/* ------------------------------------------------------------------ */

export interface ActiveEmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
  position: string | null;
  department: string | null;
}

export async function listActiveEmployeeOptions(
  organizationId: string
): Promise<ActiveEmployeeOption[]> {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      name: employeeName,
      position: employees.position,
      department: employees.department,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, "active")))
    .orderBy(asc(employees.firstName), asc(employees.lastName));
  return rows;
}
