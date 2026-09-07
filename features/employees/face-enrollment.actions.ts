"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  employeeFaceEnrollments,
  faceEnrollmentTemplates,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { createFaceTemplateFromEnrollmentCapture } from "@/lib/attendance/face-recognition";

import { getEmployeeInOrganization } from "./queries";
import {
  buildFaceEnrollmentAuditMetadata,
  evaluateFaceEnrollmentGuard,
  FACE_CAPTURE_MAX_BYTES,
  faceEnrollmentInputSchema,
  faceEnrollmentMessage,
  mapFaceTemplateResultToFailureReason,
  planFaceEnrollmentWrite,
} from "./face-enrollment";
import { getFaceEnrollmentSummaryInOrganization } from "./face-enrollment.queries";

/**
 * Face enrollment server action (Phase 10.1 + 10.2) — server-authoritative.
 *
 * Authorization + validation chain:
 *   requireUser → requirePermission(EMPLOYEES_UPDATE) → session organizationId
 *   → org-scoped employee lookup → employee status → duplicate policy
 *   → face-recognition provider → encrypted template persistence → audit.
 *
 * The browser never supplies `organizationId`, roles, permissions, a template,
 * an embedding, or any verification flag. It supplies ONLY the employeeId
 * (optional reenroll marker) and one transient JPEG capture. The JPEG is
 * decoded in-memory by the engine and is never persisted or logged.
 *
 * The engine is opt-in (`FACE_PROVIDER=human` + model folder + encryption
 * key). Without it the provider returns `not_configured` and nothing is
 * written or claimed — exactly the Phase 10.1 safe behavior.
 */

export interface FaceEnrollmentActionResult {
  ok: boolean;
  message?: string;
}

function invalidEnrollmentInput(): FaceEnrollmentActionResult {
  return { ok: false, message: faceEnrollmentMessage("invalid_input") };
}

export async function enrollFaceAction(
  _prevState: FaceEnrollmentActionResult | undefined,
  formData: FormData
): Promise<FaceEnrollmentActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE);

  if (!user.organizationId) {
    return {
      ok: false,
      message: "Akun Anda tidak terhubung ke organisasi mana pun.",
    };
  }
  const organizationId = user.organizationId;

  const employeeIdRaw = formData.get("employeeId");
  const reenrollRaw = formData.get("reenroll");
  if (typeof employeeIdRaw !== "string") {
    return invalidEnrollmentInput();
  }
  const parsed = faceEnrollmentInputSchema.safeParse({
    employeeId: employeeIdRaw,
    reenroll: reenrollRaw === "true",
  });
  if (!parsed.success) {
    return invalidEnrollmentInput();
  }

  // Transient capture validation. Only JPEG is accepted; size is bounded so
  // the camera payload cannot become an uncontrolled memory/CPU problem.
  const imageFile = formData.get("image");
  if (
    !imageFile ||
    typeof imageFile !== "object" ||
    !("arrayBuffer" in imageFile) ||
    !("size" in imageFile) ||
    !("type" in imageFile)
  ) {
    return invalidEnrollmentInput();
  }
  const file = imageFile as File;
  if (file.size <= 0 || file.size > FACE_CAPTURE_MAX_BYTES) {
    return invalidEnrollmentInput();
  }
  const mimeType = file.type || "application/octet-stream";
  if (mimeType !== "image/jpeg") {
    return invalidEnrollmentInput();
  }
  const imageBuffer = Buffer.from(await file.arrayBuffer());

  // Org-scoped employee lookup: cross-organization employees resolve to null
  // and receive the same generic error (existence is never revealed).
  const employee = await getEmployeeInOrganization(
    parsed.data.employeeId,
    organizationId
  );
  if (!employee) {
    return {
      ok: false,
      message: faceEnrollmentMessage("employee_unavailable"),
    };
  }

  const summary = await getFaceEnrollmentSummaryInOrganization(
    organizationId,
    employee.id
  );

  const decision = evaluateFaceEnrollmentGuard({
    employeeExists: true,
    employeeActive: employee.employmentStatus === "active",
    hasActiveEnrollment: summary.hasActive,
    allowReplacement: parsed.data.reenroll,
  });
  if (!decision.ok) {
    return { ok: false, message: decision.message };
  }


  const providerResult = await createFaceTemplateFromEnrollmentCapture({
    employeeId: employee.id,
    organizationId,
    imageBuffer,
    mimeType,
  });

  if (providerResult.status !== "success") {
    const reason = mapFaceTemplateResultToFailureReason(
      providerResult.status
    );
    return {
      ok: false,
      message:
        reason === null
          ? faceEnrollmentMessage("unexpected")
          : faceEnrollmentMessage(reason),
    };
  }

  const operation = summary.hasActive ? "replaced" : "created";
  const auditAction =
    operation === "replaced"
      ? "face_enrollment.replaced"
      : "face_enrollment.created";

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
              revokedByUserId: user.id,
              revokedAt: new Date(),
            })
            .where(eq(employeeFaceEnrollments.id, activeRow.id));
          // The old biometric secret must not survive a replacement.
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
          enrolledByUserId: user.id,
        })
        .returning({ id: employeeFaceEnrollments.id });
      const enrollmentId = inserted[0]?.id;
      if (!enrollmentId) {
        throw new Error("face enrollment insert returned no id");
      }

      await tx.insert(faceEnrollmentTemplates).values({
        organizationId,
        employeeId: employee.id,
        enrollmentId,
        templateVersion: providerResult.templateVersion,
        secret: providerResult.templateSecret,
      });
    });

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: auditAction,
        entityType: "employee",
        entityId: employee.id,
        metadata: buildFaceEnrollmentAuditMetadata({
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          previousStatus: summary.hasActive ? "ACTIVE" : summary.status,
          newStatus: "ACTIVE",
          operation,
        }),
      });
    } catch (auditError) {
      console.error("[face-enrollment] audit write failed", auditError);
    }

    revalidatePath("/employees");
    revalidatePath(`/employees/${employee.id}`);
    return {
      ok: true,
      message:
        operation === "replaced"
          ? "Data wajah karyawan berhasil diperbarui."
          : "Enrollment wajah berhasil disimpan.",
    };
  } catch (error) {
    // No image, embedding or template data is ever logged here.
    console.error("[face-enrollment] persistence failed", error);
    return {
      ok: false,
      message: faceEnrollmentMessage("unexpected"),
    };
  }
}
