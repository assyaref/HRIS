"use server";

import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { verifyFaceAgainstTemplate } from "@/lib/attendance/face-recognition";
import { faceVerificationRateLimiter } from "@/lib/security/face-verification-rate-limit";
import { isProduction } from "@/lib/config/env";

import { FACE_CAPTURE_MAX_BYTES } from "./face-enrollment";
import { getEmployeeInOrganization } from "./queries";
import {
  buildFaceVerificationAuditMetadata,
  buildFaceVerificationFailureResult,
  buildFaceVerificationSuccessResult,
  evaluateFaceVerificationGuard,
  faceVerificationInputSchema,
  mapFaceVerificationResultStatusToFailure,
  type FaceVerificationActionResult,
} from "./face-verification";
import { getActiveFaceVerificationTemplate } from "./face-verification.queries";

/**
 * Face verification server action (Phase 10.3) — server-authoritative.
 *
 * Authorization + validation chain:
 *   requireUser → requirePermission(EMPLOYEES_UPDATE) → session organizationId
 *   → org-scoped employee lookup (cross-org employees resolve to null) →
 *   active employee validation → ACTIVE enrollment + vault template lookup →
 *   server-side AES-256-GCM decryption → @vladmandic/human processing (exactly
 *   one face) → Human-native matching → SERVER threshold → minimal result.
 *
 * The browser supplies ONLY the `employeeId` and one transient JPEG capture.
 * It NEVER supplies organizationId, template, embedding, threshold, matched,
 * score, enrollment status, or employee ownership. Verification results are
 * decided entirely server-side; the browser only renders the returned
 * Indonesian message + the bare `matched` flag.
 *
 * The JPEG is decoded in-memory and discarded; no image, embedding, template
 * or score is ever logged, returned, or stored (only a safe audit category).
 *
 * NOTE (Phase 10.3 + 10.4 scope): this is a verification capability on the
 * employee record. It is NOT integrated into attendance check-in/check-out
 * decisions — that is a later phase. Phase 10.4 adds a production-only,
 * per-actor, per-organization rate-limit gate keyed to the AUTHENTICATED
 * user (employee id cannot bypass it); a shared Redis/PostgreSQL store is
 * required before the deployment scales horizontally.
 */

function invalidVerificationInput(): FaceVerificationActionResult {
  return buildFaceVerificationFailureResult("invalid_input");
}

export async function verifyFaceAction(
  _prevState: FaceVerificationActionResult | undefined,
  formData: FormData
): Promise<FaceVerificationActionResult> {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE);

  if (!user.organizationId) {
    return buildFaceVerificationFailureResult("processing_failed");
  }
  const organizationId = user.organizationId;

  // Abuse boundary (Phase 10.4): per-actor, per-organization budget enforced in
  // production. Keyed to the AUTHENTICATED user — changing employeeId cannot
  // bypass the limit, and no biometric data is ever stored.
  if (
    isProduction() &&
    faceVerificationRateLimiter.isLimited(organizationId, user.id)
  ) {
    return buildFaceVerificationFailureResult("rate_limited");
  }

  const employeeIdRaw = formData.get("employeeId");
  if (typeof employeeIdRaw !== "string") {
    return invalidVerificationInput();
  }
  const parsed = faceVerificationInputSchema.safeParse({
    employeeId: employeeIdRaw,
  });
  if (!parsed.success) {
    return invalidVerificationInput();
  }

  // Transient capture validation — same one-shot rules as enrollment. Only
  // JPEG is accepted and the size is bounded.
  const imageFile = formData.get("image");
  if (
    !imageFile ||
    typeof imageFile !== "object" ||
    !("arrayBuffer" in imageFile) ||
    !("size" in imageFile) ||
    !("type" in imageFile)
  ) {
    return invalidVerificationInput();
  }
  const file = imageFile as File;
  if (file.size <= 0 || file.size > FACE_CAPTURE_MAX_BYTES) {
    return invalidVerificationInput();
  }
  const mimeType = file.type || "application/octet-stream";
  if (mimeType !== "image/jpeg") {
    return invalidVerificationInput();
  }
  const imageBuffer = Buffer.from(await file.arrayBuffer());
  // Org-scoped employee lookup. A cross-organization employee resolves to null
  // and receives the same generic response as an unknown/inactive employee:
  // existence is never revealed.
  const employee = await getEmployeeInOrganization(
    parsed.data.employeeId,
    organizationId
  );
  if (!employee) {
    return buildFaceVerificationFailureResult("employee_unavailable");
  }

  // ACTIVE enrollment + vault template lookup (server-side only).
  const templateLookup = await getActiveFaceVerificationTemplate(
    organizationId,
    employee.id
  );

  const decision = evaluateFaceVerificationGuard({
    employeeExists: true,
    employeeActive: employee.employmentStatus === "active",
    templateLookup: templateLookup.kind,
  });
  if (!decision.ok) {
    // NO_ENROLLMENT and REVOKED_ONLY both arrive as `no_active_enrollment`
    // and produce the SAME safe response.
    if (decision.reason === "no_active_enrollment") {
      await writeVerificationAudit(organizationId, user.id, employee, {
        outcome: "unavailable",
      });
    }
    return buildFaceVerificationFailureResult(decision.reason);
  }
  if (templateLookup.kind !== "available") {
    return buildFaceVerificationFailureResult("template_unavailable");
  }

  const providerResult = await verifyFaceAgainstTemplate({
    imageBuffer,
    mimeType,
    templateVersion: templateLookup.templateVersion,
    encryptedTemplate: templateLookup.secret,
  });

  // Charge the attempt after the biometric comparison regardless of outcome.
  if (isProduction()) {
    faceVerificationRateLimiter.recordAttempt(organizationId, user.id);
  }

  if (providerResult.status !== "success") {
    const reason =
      mapFaceVerificationResultStatusToFailure(providerResult.status) ??
      "processing_failed";
    await writeVerificationAudit(organizationId, user.id, employee, {
      outcome: reason === "provider_not_configured" ? "unavailable" : "failed",
    });
    return buildFaceVerificationFailureResult(reason);
  }

  // The server (seam) already applied the server threshold. The browser only
  // ever sees `matched` — never the score, threshold, template or embedding.
  const outcome = providerResult.matched ? "matched" : "not_matched";
  await writeVerificationAudit(organizationId, user.id, employee, {
    outcome,
  });

  return buildFaceVerificationSuccessResult(providerResult.matched);
}

/** Best-effort safe audit for a verification attempt (category only). */
async function writeVerificationAudit(
  organizationId: string,
  actorUserId: string,
  employee: { id: string; employeeNumber: string | null },
  metadataInput: {
    outcome: "matched" | "not_matched" | "unavailable" | "failed";
  }
): Promise<void> {
  const actionByOutcome = {
    matched: "face_verification.matched",
    not_matched: "face_verification.not_matched",
    unavailable: "face_verification.unavailable",
    failed: "face_verification.failed",
  } as const;

  try {
    await writeAuditLog({
      organizationId,
      actorUserId,
      action: actionByOutcome[metadataInput.outcome],
      entityType: "employee",
      entityId: employee.id,
      metadata: buildFaceVerificationAuditMetadata({
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        outcome: metadataInput.outcome,
      }),
    });
  } catch (auditError) {
    // No image/embedding/template/score data is ever logged here.
    console.error("[face-verification] audit write failed", auditError);
  }
}
