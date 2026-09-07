import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeFaceEnrollments,
  faceEnrollmentTemplates,
} from "@/db/schema";

/**
 * Face verification data access (Phase 10.3) — server-only, org-scoped.
 *
 * Only an ACTIVE enrollment may be verified:
 * - a row with no active enrollment (never enrolled OR revoked-only) is
 *   returned as `no_active_enrollment` so both cases produce the same safe
 *   response — the browser can never distinguish them;
 * - an ACTIVE enrollment is always joined with its vault template row. An
 *   ACTIVE row without a vault row is an integrity failure and is returned as
 *   `missing_template` (never verified).
 *
 * The encrypted secret stays on the server: this module returns the ciphertext
 * buffer to the server seam/action only. No image, embedding or plaintext
 * template ever leaves the server.
 */

export type ActiveFaceVerificationTemplate =
  | {
      kind: "available";
      enrollmentId: string;
      templateVersion: string;
      /** Encrypted template: nonce(12) || ciphertext || authTag(16). */
      secret: Buffer;
    }
  | { kind: "no_active_enrollment" }
  | { kind: "missing_template" };

export async function getActiveFaceVerificationTemplate(
  organizationId: string,
  employeeId: string
): Promise<ActiveFaceVerificationTemplate> {
  // 1) The ACTIVE enrollment + its vault row must both exist.
  const activeRows = await db
    .select({
      enrollmentId: employeeFaceEnrollments.id,
      templateVersion: faceEnrollmentTemplates.templateVersion,
      secret: faceEnrollmentTemplates.secret,
    })
    .from(employeeFaceEnrollments)
    .innerJoin(
      faceEnrollmentTemplates,
      eq(faceEnrollmentTemplates.enrollmentId, employeeFaceEnrollments.id)
    )
    .where(
      and(
        eq(employeeFaceEnrollments.organizationId, organizationId),
        eq(employeeFaceEnrollments.employeeId, employeeId),
        eq(employeeFaceEnrollments.status, "active")
      )
    )
    .limit(1);

  const active = activeRows[0];
  if (active) {
    return {
      kind: "available",
      enrollmentId: active.enrollmentId,
      templateVersion: active.templateVersion,
      secret: active.secret,
    };
  }

  // 2) Distinguish "no ACTIVE enrollment at all" from "ACTIVE row with no
  //    vault row" so the action can respond safely to each.
  const statusRows = await db
    .select({ status: employeeFaceEnrollments.status })
    .from(employeeFaceEnrollments)
    .where(
      and(
        eq(employeeFaceEnrollments.organizationId, organizationId),
        eq(employeeFaceEnrollments.employeeId, employeeId)
      )
    )
    .limit(50);
  const hasActiveRow = statusRows.some((row) => row.status === "active");

  return hasActiveRow
    ? { kind: "missing_template" }
    : { kind: "no_active_enrollment" };
}
