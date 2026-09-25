import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { employeeCustomFieldDefinitions } from "@/db/schema";

import type { CustomFieldType } from "./validation";

export interface EmployeeFieldDefinition {
  id: string;
  organizationId: string;
  fieldKey: string;
  label: string;
  description: string | null;
  fieldType: CustomFieldType;
  section: string;
  isRequired: boolean;
  status: string;
  displayOrder: number;
  options: string[];
  visibilityConfig: string[];
  editableByConfig: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

function toDefinition(
  row: typeof employeeCustomFieldDefinitions.$inferSelect
): EmployeeFieldDefinition {
  return {
    id: row.id,
    organizationId: row.organizationId,
    fieldKey: row.fieldKey,
    label: row.label,
    description: row.description,
    fieldType: row.fieldType as CustomFieldType,
    section: row.section,
    isRequired: row.isRequired,
    status: row.status,
    displayOrder: row.displayOrder,
    options: row.options,
    visibilityConfig: row.visibilityConfig,
    editableByConfig: row.editableByConfig,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  };
}

/** Every field definition in one organization (including archived). */
export async function listFieldDefinitions(
  organizationId: string
): Promise<EmployeeFieldDefinition[]> {
  const rows = await db
    .select()
    .from(employeeCustomFieldDefinitions)
    .where(
      and(
        eq(employeeCustomFieldDefinitions.organizationId, organizationId),
        isNull(employeeCustomFieldDefinitions.deletedAt)
      )
    )
    .orderBy(
      asc(employeeCustomFieldDefinitions.section),
      asc(employeeCustomFieldDefinitions.displayOrder),
      asc(employeeCustomFieldDefinitions.label)
    );
  return rows.map(toDefinition);
}

/**
 * Active, non-archived field definitions. These drive the profile Custom
 * Fields tab, the Excel export/template/import and the required-field checks
 * on save. `section` is included for grouped rendering.
 */
export async function listActiveFieldDefinitions(
  organizationId: string
): Promise<EmployeeFieldDefinition[]> {
  const rows = await db
    .select()
    .from(employeeCustomFieldDefinitions)
    .where(
      and(
        eq(employeeCustomFieldDefinitions.organizationId, organizationId),
        eq(employeeCustomFieldDefinitions.status, "active"),
        isNull(employeeCustomFieldDefinitions.deletedAt)
      )
    )
    .orderBy(
      asc(employeeCustomFieldDefinitions.displayOrder),
      asc(employeeCustomFieldDefinitions.label)
    );
  return rows.map(toDefinition);
}

/**
 * Load one field definition but only when it belongs to `organizationId`.
 * Returns `null` for unknown fields and for fields owned by another
 * organization (callers respond with forbidden; no existence leak).
 */
export async function getFieldDefinition(
  fieldId: string,
  organizationId: string
): Promise<EmployeeFieldDefinition | null> {
  const rows = await db
    .select()
    .from(employeeCustomFieldDefinitions)
    .where(
      and(
        eq(employeeCustomFieldDefinitions.id, fieldId),
        eq(employeeCustomFieldDefinitions.organizationId, organizationId)
      )
    )
    .limit(1);
  const row = rows[0];
  return row ? toDefinition(row) : null;
}