import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeFaceEnrollments,
  employees,
  faceEnrollmentTemplates,
} from "@/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { createFaceTemplateFromEnrollmentCapture } from "@/lib/attendance/face-recognition";
import {
  profilePhotoUrlFor,
  readEmployeeProfilePhoto,
  storeEmployeeProfilePhoto,
} from "@/lib/employees/profile-photo-storage";

import {
  buildFaceEnrollmentAuditMetadata,
  evaluateFaceEnrollmentGuard,
  faceEnrollmentMessage,
  mapFaceTemplateResultToFailureReason,
  planFaceEnrollmentWrite,
} from "./face-enrollment";
import { getFaceEnrollmentSummaryInOrganization } from "./face-enrollment.queries";

/**
 * Shared Face ID persistence used by the profile-photo flows.
 *
 * The camera flows (`enrollFaceAction`, `selfEnrollFaceAction`) keep their own
 * copy of this transaction; this module lets a stored profile photo feed the
 * SAME engine + guard + encrypted-template write, so an employee with a
 * profile photo does not need a second camera session (and vice versa: a
 * camera enrollment can seed the profile photo, see `saveProfilePhotoIfMissing`).
 * Callers have already authenticated, authorized and org-scoped the employee.
 */

export interface EnrollFaceFromImageInput {
  organizationId: string;
  employee: { id: string; employeeNumber: string; employmentStatus: string };
  actorUserId: string;
  imageBuffer: Buffer;
  /** Replace an existing ACTIVE enrollment instead of refusing. */
  allowReplacement: boolean;
}

export type EnrollFaceFromImageResult =
  | { ok: true; operation: "created" | "replaced"; message: string }
  | { ok: false; message: string };

export async function enrollFaceFromImage(
  input: EnrollFaceFromImageInput
): Promise<EnrollFaceFromImageResult> {
  const { organizationId, employee, actorUserId, imageBuffer } = input;

  const summary = await getFaceEnrollmentSummaryInOrganization(
    organizationId,
    employee.id
  );
  const decision = evaluateFaceEnrollmentGuard({
    employeeExists: true,
    employeeActive: employee.employmentStatus === "active",
    hasActiveEnrollment: summary.hasActive,
    allowReplacement: input.allowReplacement,
  });
  if (!decision.ok) return { ok: false, message: decision.message };

  const providerResult = await createFaceTemplateFromEnrollmentCapture({
    employeeId: employee.id,
    organizationId,
    imageBuffer,
    mimeType: "image/jpeg",
  });
  if (providerResult.status !== "success") {
    const reason = mapFaceTemplateResultToFailureReason(providerResult.status);
    return {
      ok: false,
      message:
        reason === null
          ? faceEnrollmentMessage("unexpected")
          : faceEnrollmentMessage(reason),
    };
  }

  const operation = summary.hasActive ? "replaced" : "created";
  try {
    const plan = planFaceEnrollmentWrite(summary.hasActive);
    await db.transaction(async (tx) => {
      if (plan.operation === "replace") {
        const activeRows = await tx
          .select({ id: employeeFaceEnrollments.id })
          .from(employeeFaceEnrollments)
          .where(
            and(
              eq(employeeFaceEnrollments.organizationId, organizationId),
              eq(employeeFaceEnrollments.employeeId, employee.id),
              eq(employeeFaceEnrollments.status, "active")
            )
          );
        for (const activeRow of activeRows) {
          await tx
            .update(employeeFaceEnrollments)
            .set({
              status: "revoked",
              revokedByUserId: actorUserId,
              revokedAt: new Date(),
            })
            .where(eq(employeeFaceEnrollments.id, activeRow.id));
          await tx
            .delete(faceEnrollmentTemplates)
            .where(eq(faceEnrollmentTemplates.enrollmentId, activeRow.id));
        }
      }
      const inserted = await tx
        .insert(employeeFaceEnrollments)
        .values({
          organizationId,
          employeeId: employee.id,
          status: "active",
          providerTemplateRef: providerResult.providerTemplateRef,
          enrolledByUserId: actorUserId,
        })
        .returning({ id: employeeFaceEnrollments.id });
      const enrollmentId = inserted[0]?.id;
      if (!enrollmentId) throw new Error("face enrollment insert returned no id");
      await tx.insert(faceEnrollmentTemplates).values({
        organizationId,
        employeeId: employee.id,
        enrollmentId,
        templateVersion: providerResult.templateVersion,
        keyVersion: providerResult.templateKeyVersion,
        secret: providerResult.templateSecret,
      });
    });
  } catch (error) {
    console.error("[face-enrollment] persistence failed", error);
    return { ok: false, message: faceEnrollmentMessage("unexpected") };
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId,
      action:
        operation === "replaced"
          ? "face_enrollment.replaced"
          : "face_enrollment.created",
      entityType: "employee",
      entityId: employee.id,
      metadata: {
        ...buildFaceEnrollmentAuditMetadata({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          previousStatus: summary.hasActive ? "ACTIVE" : summary.status,
          newStatus: "ACTIVE",
          operation,
        }),
        source: "profile_photo",
      },
    });
  } catch (auditError) {
    console.error("[face-enrollment] audit write failed", auditError);
  }

  return {
    ok: true,
    operation,
    message:
      operation === "replaced"
        ? "Data wajah diperbarui dari foto profil."
        : "Face ID didaftarkan dari foto profil.",
  };
}

/**
 * Seed the profile photo from a successful camera enrollment when the employee
 * has none yet, so a Face ID capture doubles as the profile picture. Best
 * effort: a storage failure never fails the enrollment that already committed.
 */
export async function saveProfilePhotoIfMissing(
  organizationId: string,
  employeeId: string,
  imageBuffer: Buffer
): Promise<void> {
  try {
    const existing = await readEmployeeProfilePhoto(organizationId, employeeId);
    if (existing) return;
    await storeEmployeeProfilePhoto({
      organizationId,
      employeeId,
      bytes: new Uint8Array(imageBuffer),
    });
    await db
      .update(employees)
      .set({ profilePhotoUrl: profilePhotoUrlFor(employeeId, Date.now()) })
      .where(
        and(eq(employees.id, employeeId), eq(employees.organizationId, organizationId))
      );
  } catch (error) {
    console.error("[face-enrollment] profile photo seed failed", error);
  }
}
