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

import { getEmployeeByUserId, getEmployeeInOrganization } from "./queries";
import {
  buildFaceEnrollmentAuditMetadata,
  evaluateFaceEnrollmentConsent,
  evaluateFaceEnrollmentGuard,
  evaluateFaceEnrollmentRevokeGuard,
  FACE_CAPTURE_MAX_BYTES,
  FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE,
  faceEnrollmentInputSchema,
  faceEnrollmentMessage,
  faceEnrollmentRevokeInputSchema,
  mapFaceTemplateResultToFailureReason,
  planFaceEnrollmentWrite,
  selfFaceEnrollmentInputSchema,
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
 * an embedding, or any verification flag. It supplies ONLY the employeeId, an
 * optional reenroll marker, an explicit operator consent acknowledgement, and
 * one transient JPEG capture. The JPEG is decoded in-memory by the engine and
 * is never persisted or logged.
 *
 * Consent is never an authorization boundary: `requireUser` +
 * `requirePermission(EMPLOYEES_UPDATE)` run first, and the org-scoped employee
 * guard still decides eligibility. A missing `consent: true` acknowledgement
 * fails closed before any employee lookup or capture processing.
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
  const consentRaw = formData.get("consent");
  if (typeof employeeIdRaw !== "string") {
    return invalidEnrollmentInput();
  }
  const parsed = faceEnrollmentInputSchema.safeParse({
    employeeId: employeeIdRaw,
    reenroll: reenrollRaw === "true",
    consent: consentRaw === "true",
  });
  if (!parsed.success) {
    return invalidEnrollmentInput();
  }

  // Explicit biometric consent gate (Phase 10.7C-42). Fails closed when the
  // operator did not acknowledge consent. Runs before any employee lookup or
  // capture processing and is independent of the authorization chain.
  const consentDecision = evaluateFaceEnrollmentConsent(parsed.data.consent);
  if (!consentDecision.ok) {
    return { ok: false, message: consentDecision.message };
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

/**
 * Employee SELF-SERVICE face enrollment (Phase 10.7C-50D) —
 * server-authoritative and SELF-ONLY.
 *
 * Chain:
 *   requireUser → session organizationId → consent gate → resolve the caller's
 *   OWN linked employee (getEmployeeByUserId) → org-scoped ACTIVE/duplicate
 *   guard → face-recognition provider → encrypted template persistence →
 *   audit.
 *
 * The browser supplies ONLY `consent`, an optional `reenroll` marker and one
 * transient JPEG. It never supplies an employeeId or organizationId: the
 * employee is derived from the authenticated user + session organization, so
 * an employee can never enroll a different employee — even through modified
 * FormData. A user without an organization, without a linked employee record,
 * or whose linked employee is inactive is rejected with safe generic
 * messages.
 *
 * Consent is never an authorization boundary — it defaults to false, is
 * checked before the JPEG bytes are read, and is enforced server-side. The
 * existing consent, guard, duplicate/replacement, encryption and audit rules
 * from the management flow are reused unchanged. The engine stays opt-in
 * (`not_configured` until an operator configures it) and no biometric
 * plaintext is ever logged or returned.
 */
export async function selfEnrollFaceAction(
  _prevState: FaceEnrollmentActionResult | undefined,
  formData: FormData
): Promise<FaceEnrollmentActionResult> {
  const user = await requireUser();

  // Fail closed when the session has no organization.
  if (!user.organizationId) {
    return {
      ok: false,
      message: "Akun Anda tidak terhubung ke organisasi mana pun.",
    };
  }
  const organizationId = user.organizationId;

  // Strict SELF-ONLY input: consent + optional reenroll only. A client that
  // smuggles an employeeId, organizationId, threshold or any other key is
  // rejected here (fail closed) — self-enrollment must never be steered by the
  // browser towards another employee.
  const reenrollRaw = formData.get("reenroll");
  const consentRaw = formData.get("consent");
  const parsed = selfFaceEnrollmentInputSchema.safeParse({
    reenroll: reenrollRaw === "true",
    consent: consentRaw === "true",
  });
  if (!parsed.success) {
    return invalidEnrollmentInput();
  }

  // Explicit consent gate (Phase 10.7C-42), enforced BEFORE the JPEG bytes are
  // read or any employee lookup happens.
  const consentDecision = evaluateFaceEnrollmentConsent(parsed.data.consent);
  if (!consentDecision.ok) {
    return { ok: false, message: consentDecision.message };
  }

  // SELF-ONLY identity source: resolve the caller's OWN linked employee inside
  // the caller's own organization. No client-supplied employeeId ever reaches
  // this lookup.
  const employee = await getEmployeeByUserId(user.id, organizationId);
  if (!employee) {
    return { ok: false, message: FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE };
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
      // No plaintext template, embedding, score or ciphertext is ever logged.
      console.error("[face-enrollment] audit write failed", auditError);
    }

    revalidatePath("/face-id");
    revalidatePath(`/employees/${employee.id}`);
    return {
      ok: true,
      message:
        operation === "replaced"
          ? "Data wajah Anda berhasil diperbarui."
          : "Data wajah Anda berhasil didaftarkan.",
    };
  } catch (error) {
    // No image, embedding or template data is ever logged here.
    console.error("[face-enrollment] self persistence failed", error);
    return {
      ok: false,
      message: faceEnrollmentMessage("unexpected"),
    };
  }
}

/**
 * Standalone face enrollment revocation (Phase 10.7C-44) — server-authoritative.
 *
 * Authorization + validation chain:
 *   requireUser → requirePermission(EMPLOYEES_UPDATE) → session organizationId
 *   → org-scoped employee lookup → ACTIVE-enrollment guard → transactional
 *   revoke (status + revoked_by/revoked_at + ciphertext deletion) → audit.
 *
 * The browser supplies ONLY the `employeeId`. It NEVER supplies
 * organizationId, roles, permissions, a template, an embedding, a threshold,
 * or any revocation flag.
 *
 * Only an ACTIVE enrollment can be revoked; a concurrent replacement or a
 * second revoke degrades to a safe no-op with a generic message. The status
 * update and the vault-row deletion happen in ONE transaction, so a REVOKED
 * row with surviving ciphertext is impossible. Employee employment status is
 * deliberately NOT required: revocation is a data-minimization action and must
 * remain available for departed/inactive employees. It only removes face
 * verification capability — it can never grant or bypass one.
 */
export async function revokeFaceEnrollmentAction(
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
  if (typeof employeeIdRaw !== "string") {
    return invalidEnrollmentInput();
  }
  const parsed = faceEnrollmentRevokeInputSchema.safeParse({
    employeeId: employeeIdRaw,
  });
  if (!parsed.success) {
    return invalidEnrollmentInput();
  }

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
  const decision = evaluateFaceEnrollmentRevokeGuard({
    employeeExists: true,
    hasActiveEnrollment: summary.hasActive,
  });
  if (!decision.ok) {
    return { ok: false, message: decision.message };
  }

  // Flag used to distinguish "nothing was ACTIVE" (safe no-op) from a real
  // failure. All mutations happen inside ONE transaction: the status flip and
  // the ciphertext deletion commit together or not at all.
  let revokedActiveEnrollment = false;

  try {
    await db.transaction(async (tx) => {
      // Re-resolve the ACTIVE row(s) INSIDE the transaction so a concurrent
      // replacement/re-enrollment can never be caught up in this revoke and so
      // the status update + template deletion are atomic.
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

      if (activeRows.length === 0) {
        // A second revoke or a replacement landed first: nothing was written
        // and nothing needs to be rolled back (fail closed, no partial state).
        return;
      }
      revokedActiveEnrollment = true;

      for (const activeRow of activeRows) {
        await tx
          .update(employeeFaceEnrollments)
          .set({
            status: "revoked",
            revokedByUserId: user.id,
            revokedAt: new Date(),
          })
          .where(eq(employeeFaceEnrollments.id, activeRow.id));
        // The old biometric secret must not survive a standalone revoke.
        await tx
          .delete(faceEnrollmentTemplates)
          .where(eq(faceEnrollmentTemplates.enrollmentId, activeRow.id));
      }
    });
  } catch (error) {
    // No image, embedding, template or ciphertext data is ever logged here.
    console.error("[face-enrollment] revoke persistence failed", error);
    return {
      ok: false,
      message: faceEnrollmentMessage("unexpected"),
    };
  }

  if (!revokedActiveEnrollment) {
    return {
      ok: false,
      message: faceEnrollmentMessage("no_active_enrollment"),
    };
  }

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "face_enrollment.revoked",
      entityType: "employee",
      entityId: employee.id,
      metadata: buildFaceEnrollmentAuditMetadata({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        previousStatus: "ACTIVE",
        newStatus: "REVOKED",
        operation: "revoked",
      }),
    });
  } catch (auditError) {
    // No plaintext template, embedding, score or ciphertext is ever logged.
    console.error("[face-enrollment] audit write failed", auditError);
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${employee.id}`);
  return {
    ok: true,
    message: "Data wajah karyawan berhasil direvoke.",
  };
}
