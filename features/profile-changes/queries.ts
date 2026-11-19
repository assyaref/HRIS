import "server-only";

import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  employeeAddresses,
  employeeBankAccounts,
  employees,
  profileChangeRequests,
  users,
  type ProfileChangeSet,
} from "@/db/schema";

import type { ProfileValues } from "./fields";

export interface ProfileChangeRow {
  id: string;
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  changes: ProfileChangeSet;
  note: string | null;
  status: string;
  reviewerName: string | null;
  reviewerNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

export const PROFILE_CHANGE_LIST_LIMIT = 300;

export async function listProfileChanges(
  organizationId: string,
  filters: { employeeId?: string; status?: string } = {}
): Promise<ProfileChangeRow[]> {
  const reviewers = alias(users, "reviewers");
  const where: SQL[] = [eq(profileChangeRequests.organizationId, organizationId)];
  if (filters.employeeId) where.push(eq(profileChangeRequests.employeeId, filters.employeeId));
  if (filters.status) where.push(eq(profileChangeRequests.status, filters.status));
  return db
    .select({
      id: profileChangeRequests.id,
      employeeId: profileChangeRequests.employeeId,
      employeeNumber: employees.employeeNumber,
      employeeName: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
      changes: profileChangeRequests.changes,
      note: profileChangeRequests.note,
      status: profileChangeRequests.status,
      reviewerName: reviewers.name,
      reviewerNote: profileChangeRequests.reviewerNote,
      reviewedAt: profileChangeRequests.reviewedAt,
      createdAt: profileChangeRequests.createdAt,
    })
    .from(profileChangeRequests)
    .innerJoin(employees, eq(employees.id, profileChangeRequests.employeeId))
    .leftJoin(reviewers, eq(reviewers.id, profileChangeRequests.reviewedBy))
    .where(and(...where))
    .orderBy(desc(profileChangeRequests.createdAt))
    .limit(PROFILE_CHANGE_LIST_LIMIT);
}

/** Current values of the changeable fields, as strings ("YYYY-MM-DD" for dates). */
export async function getChangeableProfile(
  employeeId: string,
  organizationId: string
): Promise<ProfileValues | null> {
  const rows = await db
    .select({
      phone: employees.phone,
      personalEmail: employees.personalEmail,
      nickname: employees.nickname,
      birthPlace: employees.birthPlace,
      birthDate: sql<string | null>`to_char(${employees.birthDate}, 'YYYY-MM-DD')`,
      religion: employees.religion,
      maritalStatus: employees.maritalStatus,
      nationality: employees.nationality,
      nik: employees.nik,
    })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId)))
    .limit(1);
  const base = rows[0];
  if (!base) return null;
  const [address, bank] = await Promise.all([
    db
      .select({
        address: employeeAddresses.address,
        city: employeeAddresses.city,
        province: employeeAddresses.province,
        postalCode: employeeAddresses.postalCode,
      })
      .from(employeeAddresses)
      .where(
        and(
          eq(employeeAddresses.organizationId, organizationId),
          eq(employeeAddresses.employeeId, employeeId),
          eq(employeeAddresses.type, "domicile")
        )
      )
      .limit(1),
    db
      .select({
        bankName: employeeBankAccounts.bankName,
        accountNumber: employeeBankAccounts.accountNumber,
        accountHolder: employeeBankAccounts.accountHolder,
        branch: employeeBankAccounts.branch,
      })
      .from(employeeBankAccounts)
      .where(
        and(
          eq(employeeBankAccounts.organizationId, organizationId),
          eq(employeeBankAccounts.employeeId, employeeId),
          eq(employeeBankAccounts.isPrimary, true)
        )
      )
      .limit(1),
  ]);
  return {
    ...base,
    domicileAddress: address[0]?.address ?? null,
    domicileCity: address[0]?.city ?? null,
    domicileProvince: address[0]?.province ?? null,
    domicilePostalCode: address[0]?.postalCode ?? null,
    bankName: bank[0]?.bankName ?? null,
    bankAccountNumber: bank[0]?.accountNumber ?? null,
    bankAccountHolder: bank[0]?.accountHolder ?? null,
    bankBranch: bank[0]?.branch ?? null,
  };
}
