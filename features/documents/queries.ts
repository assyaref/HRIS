import "server-only";

import { and, asc, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { qualified } from "@/lib/db/qualified";
import {
  documentTypes,
  employeeAddresses,
  employees,
  issuedDocuments,
  letterTemplates,
  users,
  workLocations,
} from "@/db/schema";

export interface DocumentTypeRow {
  id: string;
  code: string;
  name: string;
  numberFormat: string;
  sequencePadding: number;
  resetPeriod: string;
  active: boolean;
  issuedCount: number;
}

export async function listDocumentTypes(organizationId: string): Promise<DocumentTypeRow[]> {
  return db
    .select({
      id: documentTypes.id,
      code: documentTypes.code,
      name: documentTypes.name,
      numberFormat: documentTypes.numberFormat,
      sequencePadding: documentTypes.sequencePadding,
      resetPeriod: documentTypes.resetPeriod,
      active: documentTypes.active,
      issuedCount: sql<number>`(SELECT COUNT(*)::int FROM ${issuedDocuments} WHERE ${issuedDocuments.documentTypeId} = ${qualified(documentTypes.id)})`,
    })
    .from(documentTypes)
    .where(eq(documentTypes.organizationId, organizationId))
    .orderBy(desc(documentTypes.active), asc(documentTypes.code));
}

export interface IssuedDocumentRow {
  id: string;
  documentNumber: string;
  typeCode: string;
  typeName: string;
  issuedDate: string;
  subject: string;
  recipient: string | null;
  employeeId: string | null;
  employeeName: string | null;
  employeeNumber: string | null;
  hasContent: boolean;
  notes: string | null;
  voided: boolean;
  voidReason: string | null;
  issuedByName: string | null;
  createdAt: Date;
}

export const DOCUMENT_LIST_LIMIT = 500;

function documentSelect() {
  return db
    .select({
      id: issuedDocuments.id,
      documentNumber: issuedDocuments.documentNumber,
      typeCode: documentTypes.code,
      typeName: documentTypes.name,
      issuedDate: issuedDocuments.issuedDate,
      subject: issuedDocuments.subject,
      recipient: issuedDocuments.recipient,
      employeeId: issuedDocuments.employeeId,
      employeeName: sql<string | null>`NULLIF(TRIM(COALESCE(${employees.firstName}, '') || ' ' || COALESCE(${employees.lastName}, '')), '')`,
      employeeNumber: employees.employeeNumber,
      hasContent: sql<boolean>`${issuedDocuments.content} IS NOT NULL`,
      notes: issuedDocuments.notes,
      voided: issuedDocuments.voided,
      voidReason: issuedDocuments.voidReason,
      issuedByName: sql<string | null>`COALESCE(${users.name}, ${users.email})`,
      createdAt: issuedDocuments.createdAt,
    })
    .from(issuedDocuments)
    .innerJoin(documentTypes, eq(documentTypes.id, issuedDocuments.documentTypeId))
    .leftJoin(employees, eq(employees.id, issuedDocuments.employeeId))
    .leftJoin(users, eq(users.id, issuedDocuments.issuedBy));
}

export async function listIssuedDocuments(
  organizationId: string,
  filters: { from: string; to: string; typeId?: string }
): Promise<IssuedDocumentRow[]> {
  const where: SQL[] = [
    eq(issuedDocuments.organizationId, organizationId),
    gte(issuedDocuments.issuedDate, filters.from),
    lte(issuedDocuments.issuedDate, filters.to),
  ];
  if (filters.typeId) where.push(eq(issuedDocuments.documentTypeId, filters.typeId));
  return documentSelect()
    .where(and(...where))
    .orderBy(desc(issuedDocuments.issuedDate), desc(issuedDocuments.createdAt))
    .limit(DOCUMENT_LIST_LIMIT);
}

export async function getIssuedDocument(organizationId: string, id: string) {
  const rows = await db
    .select({
      id: issuedDocuments.id,
      documentNumber: issuedDocuments.documentNumber,
      typeCode: documentTypes.code,
      typeName: documentTypes.name,
      issuedDate: issuedDocuments.issuedDate,
      subject: issuedDocuments.subject,
      recipient: issuedDocuments.recipient,
      employeeId: issuedDocuments.employeeId,
      content: issuedDocuments.content,
      notes: issuedDocuments.notes,
      voided: issuedDocuments.voided,
      voidReason: issuedDocuments.voidReason,
    })
    .from(issuedDocuments)
    .innerJoin(documentTypes, eq(documentTypes.id, issuedDocuments.documentTypeId))
    .where(and(eq(issuedDocuments.organizationId, organizationId), eq(issuedDocuments.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

/** Employee data a PKWT needs (snapshotted into the letter at issue time). */
export async function getPkwtEmployeeData(organizationId: string, employeeId: string) {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      name: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
      nik: employees.nik,
      birthPlace: employees.birthPlace,
      birthDate: sql<string | null>`to_char(${employees.birthDate}, 'YYYY-MM-DD')`,
      gender: employees.gender,
      position: employees.position,
      department: employees.department,
      address: sql<string | null>`(
        SELECT NULLIF(CONCAT_WS(', ', ${employeeAddresses.address}, ${employeeAddresses.city}, ${employeeAddresses.province}), '')
        FROM ${employeeAddresses}
        WHERE ${employeeAddresses.employeeId} = ${qualified(employees.id)} AND ${employeeAddresses.type} = 'ktp'
        LIMIT 1
      )`,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)))
    .limit(1);
  return rows[0] ?? null;
}

export interface LetterTemplateRow {
  id: string;
  name: string;
  title: string;
  body: string;
  active: boolean;
  documentTypeId: string;
  typeCode: string;
  typeName: string;
}

export async function listLetterTemplates(organizationId: string): Promise<LetterTemplateRow[]> {
  return db
    .select({
      id: letterTemplates.id,
      name: letterTemplates.name,
      title: letterTemplates.title,
      body: letterTemplates.body,
      active: letterTemplates.active,
      documentTypeId: letterTemplates.documentTypeId,
      typeCode: documentTypes.code,
      typeName: documentTypes.name,
    })
    .from(letterTemplates)
    .innerJoin(documentTypes, eq(documentTypes.id, letterTemplates.documentTypeId))
    .where(eq(letterTemplates.organizationId, organizationId))
    .orderBy(desc(letterTemplates.active), asc(documentTypes.code), asc(letterTemplates.name));
}

/** Employee data used by letter merge fields. */
export async function getLetterEmployeeData(organizationId: string, employeeId: string) {
  const rows = await db
    .select({
      id: employees.id,
      employeeNumber: employees.employeeNumber,
      name: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
      nik: employees.nik,
      position: employees.position,
      department: employees.department,
      division: employees.division,
      employmentType: employees.employmentType,
      hireDate: sql<string | null>`to_char(${employees.hireDate}, 'YYYY-MM-DD')`,
      workLocation: workLocations.name,
      address: sql<string | null>`(
        SELECT NULLIF(CONCAT_WS(', ', ${employeeAddresses.address}, ${employeeAddresses.city}, ${employeeAddresses.province}), '')
        FROM ${employeeAddresses}
        WHERE ${employeeAddresses.employeeId} = ${qualified(employees.id)} AND ${employeeAddresses.type} = 'ktp'
        LIMIT 1
      )`,
    })
    .from(employees)
    .leftJoin(workLocations, eq(workLocations.id, employees.workLocationId))
    .where(and(eq(employees.organizationId, organizationId), eq(employees.id, employeeId)))
    .limit(1);
  return rows[0] ?? null;
}
