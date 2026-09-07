import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { employeeFaceEnrollments } from "@/db/schema";
import {
  FACE_ENROLLMENT_DB_STATUS_ACTIVE,
  FACE_ENROLLMENT_DB_STATUS_REVOKED,
  deriveFaceEnrollmentStatus,
  type FaceEnrollmentPresentationStatus,
} from "./face-enrollment";

/**
 * Face enrollment data access (Phase 10.1) — server-only, org-scoped.
 *
 * Every query is keyed to one organization derived from the authenticated
 * session. Enrollment rows from another organization can never be read.
 * No raw image or biometric data is stored or returned here.
 */

export interface FaceEnrollmentSummary {
  status: FaceEnrollmentPresentationStatus;
  /** True when the employee has exactly one ACTIVE enrollment (DB-enforced). */
  hasActive: boolean;
  hasRevoked: boolean;
}

/** Org-scoped enrollment summary for one employee. */
export async function getFaceEnrollmentSummaryInOrganization(
  organizationId: string,
  employeeId: string
): Promise<FaceEnrollmentSummary> {
  const rows = await db
    .select({ status: employeeFaceEnrollments.status })
    .from(employeeFaceEnrollments)
    .where(
      and(
        eq(employeeFaceEnrollments.organizationId, organizationId),
        eq(employeeFaceEnrollments.employeeId, employeeId)
      )
    );

  const hasActive = rows.some(
    (row) => row.status === FACE_ENROLLMENT_DB_STATUS_ACTIVE
  );
  const hasRevoked = rows.some(
    (row) => row.status === FACE_ENROLLMENT_DB_STATUS_REVOKED
  );

  return {
    status: deriveFaceEnrollmentStatus({ hasActive, hasRevoked }),
    hasActive,
    hasRevoked,
  };
}
