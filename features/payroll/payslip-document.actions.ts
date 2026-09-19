"use server";

import { and, eq } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  employees,
  payrollEvents,
  payrollItems,
  payrollPeriods,
  payrollRuns,
  payslips,
  payslipDocuments,
  payslipDocumentVersions,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requireAnyPermission } from "@/lib/auth/rbac";
import {
  encryptAndStorePayslipPdf,
  removeStoredPayslipPdf,
} from "@/lib/payroll/payslip-pdf";
import {
  buildPayslipPdfReplaceDecision,
  buildPayslipPdfUploadDecision,
  isPayslipUuid,
  nextPayslipDocumentVersion,
  resolveHistoricalPayslipPasswordIdentity,
  sanitizePayslipOriginalFilename,
} from "./payslip-document.guard";
import {
  buildDistributionPayslipNumber,
  buildDistributionPayslipUploadDecision,
  buildPayslipPublishDecision,
} from "./payslip-distribution.guard";
import {
  buildBulkUploadPlan,
  PAYSLIP_BULK_MAX_FILES,
  type PayslipBulkEntryStatus,
} from "./payslip-bulk.guard";

export interface PayslipDocumentActionResult {
  ok: boolean;
  message: string;
  payslipId?: string;
}

/**
 * Upload and securely store one payslip PDF.
 *
 * Security contract:
 * - Management-only server action.
 * - Payslip and employee are always organization-scoped.
 * - Only generated payslips may receive a document.
 * - Employee number + birthDate are required for the PDF password.
 * - PDF is encrypted before final storage.
 * - The employee PDF password is never returned or persisted.
 * - Database insertion happens only after encrypted storage succeeds.
 * - If the database insert fails, the encrypted file is removed.
 */
export async function uploadPayslipPdfAction(
  formData: FormData
): Promise<PayslipDocumentActionResult> {
  const user = await requireUser();

  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);

  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }

  const organizationId = user.organizationId;

  const allowedFields = new Set(["payslipId", "file"]);

  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      return {
        ok: false,
        message: "Invalid payslip upload request.",
      };
    }
  }

  const payslipIdValue = formData.get("payslipId");
  const fileValue = formData.get("file");

  if (
    typeof payslipIdValue !== "string" ||
    !isPayslipUuid(payslipIdValue)
  ) {
    return {
      ok: false,
      message: "Invalid payslip identifier.",
    };
  }

  if (
    !fileValue ||
    typeof fileValue !== "object" ||
    !("arrayBuffer" in fileValue) ||
    !("size" in fileValue) ||
    !("type" in fileValue) ||
    !("name" in fileValue)
  ) {
    return {
      ok: false,
      message: "Please select a PDF payslip.",
    };
  }

  const file = fileValue as File;

  const originalFilename = sanitizePayslipOriginalFilename(file.name);

  const uploadDecision = buildPayslipPdfUploadDecision({
    mimeType: file.type,
    filename: originalFilename,
    size: file.size,
  });

  if (!uploadDecision.allowed) {
    return {
      ok: false,
      message: uploadDecision.message,
    };
  }

  try {
    const payslipRows = await db
      .select({
        id: payslips.id,
        organizationId: payslips.organizationId,
        employeeId: payslips.employeeId,
        status: payslips.status,
        payrollItemId: payslips.payrollItemId,
        payrollPeriodId: payslips.payrollPeriodId,
        payslipEmployeeNumberSnapshot: payslips.employeeNumberSnapshot,
        payslipBirthDateSnapshot: payslips.birthDateSnapshot,
        itemEmployeeNumberSnapshot: payrollItems.employeeNumberSnapshot,
        payrollRunId: payrollItems.payrollRunId,
        runStatus: payrollRuns.status,
      })
      .from(payslips)
      .innerJoin(
        payrollItems,
        eq(payrollItems.id, payslips.payrollItemId)
      )
      .innerJoin(
        payrollRuns,
        eq(payrollRuns.id, payrollItems.payrollRunId)
      )
      .where(
        and(
          eq(payslips.id, payslipIdValue),
          eq(payslips.organizationId, organizationId),
          eq(payrollItems.organizationId, organizationId),
          eq(payrollRuns.organizationId, organizationId)
        )
      )
      .limit(1);

    const payslip = payslipRows[0];

    if (!payslip) {
      forbidden();
    }

    if (payslip.status !== "generated") {
      return {
        ok: false,
        message:
          "Only generated payslips can receive a PDF document.",
      };
    }

    if (
      payslip.runStatus !== "approved" &&
      payslip.runStatus !== "locked"
    ) {
      return {
        ok: false,
        message:
          "The payroll run must be approved or locked before uploading payslips.",
      };
    }

    const employeeRows = await db
      .select({
        id: employees.id,
        organizationId: employees.organizationId,
        employeeNumber: employees.employeeNumber,
        nik: employees.nik,
        birthDate: employees.birthDate,
      })
      .from(employees)
      .where(
        and(
          eq(employees.id, payslip.employeeId),
          eq(employees.organizationId, organizationId)
        )
      )
      .limit(1);

    const employee = employeeRows[0];

    if (!employee) {
      forbidden();
    }

    const existingDocument = await db
      .select({
        id: payslipDocuments.id,
        storageKey: payslipDocuments.storageKey,
      })
      .from(payslipDocuments)
      .where(
        and(
          eq(payslipDocuments.organizationId, organizationId),
          eq(payslipDocuments.payslipId, payslip.id)
        )
      )
      .limit(1);

    if (existingDocument[0]) {
      return {
        ok: false,
        message:
          "A PDF document already exists for this payslip.",
      };
    }

    const pdf = Buffer.from(await file.arrayBuffer());

    /*
     * PDF password uses the historical identity snapshot when present (so a
     * later employee-number or birth-date change cannot alter this payslip's
     * opening password), falling back to the immutable payroll item snapshot
     * and only then the live employee for legacy rows.
     */
    const passwordIdentity = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: payslip.payslipEmployeeNumberSnapshot,
      payslipBirthDateSnapshot: payslip.payslipBirthDateSnapshot,
      itemEmployeeNumberSnapshot: payslip.itemEmployeeNumberSnapshot,
      liveEmployeeNumber: employee.employeeNumber,
      liveBirthDate: employee.birthDate,
    });

    if (!passwordIdentity.employeeNumber || !passwordIdentity.birthDate) {
      return {
        ok: false,
        message:
          "The payslip is missing the historical employee number or birth date required for its PDF password.",
      };
    }

    const stored = await encryptAndStorePayslipPdf({
      pdf,
      identity: {
        employeeNumber: passwordIdentity.employeeNumber,
        nik: employee.nik,
        birthDate: passwordIdentity.birthDate,
      },
    });

    try {
      await db.transaction(async (tx) => {
        const lockedPayslipRows = await tx
          .select({
            id: payslips.id,
            employeeId: payslips.employeeId,
            status: payslips.status,
          })
          .from(payslips)
          .where(
            and(
              eq(payslips.id, payslip.id),
              eq(payslips.organizationId, organizationId)
            )
          )
          .for("update")
          .limit(1);

        const lockedPayslip = lockedPayslipRows[0];

        if (!lockedPayslip) {
          forbidden();
        }

        if (lockedPayslip.status !== "generated") {
          throw new Error(
            "PAYSLIP_STATUS_CHANGED_BEFORE_DOCUMENT_INSERT"
          );
        }

        const duplicate = await tx
          .select({ id: payslipDocuments.id })
          .from(payslipDocuments)
          .where(
            and(
              eq(payslipDocuments.organizationId, organizationId),
              eq(payslipDocuments.payslipId, payslip.id)
            )
          )
          .limit(1);

        if (duplicate[0]) {
          throw new Error(
            "PAYSLIP_DOCUMENT_ALREADY_EXISTS"
          );
        }

        const insertedDocument = await tx
          .insert(payslipDocuments)
          .values({
            organizationId,
            payslipId: payslip.id,
            employeeId: employee.id,
            storageKey: stored.storageKey,
            originalFilename,
            mimeType: stored.mimeType,
            fileSize: stored.fileSize,
            sha256: stored.sha256,
          })
          .returning({ id: payslipDocuments.id });

        const documentId = insertedDocument[0]?.id;

        if (!documentId) {
          throw new Error("Payslip document insert returned no id.");
        }

        /*
         * Version history starts at 1 for the first uploaded document.
         * Replacements append 2, 3, ... and never delete this row.
         */
        await tx.insert(payslipDocumentVersions).values({
          organizationId,
          payslipDocumentId: documentId,
          payslipId: payslip.id,
          employeeId: employee.id,
          version: 1,
          storageKey: stored.storageKey,
          originalFilename,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          sha256: stored.sha256,
          source: "uploaded",
        });
      });
    } catch (error) {
      await removeStoredPayslipPdf(stored.storageKey).catch(
        (cleanupError) => {
          console.error(
            "[payroll] payslip document cleanup failed",
            cleanupError
          );
        }
      );

      if (
        error instanceof Error &&
        error.message === "PAYSLIP_DOCUMENT_ALREADY_EXISTS"
      ) {
        return {
          ok: false,
          message:
            "A PDF document already exists for this payslip.",
        };
      }

      if (
        error instanceof Error &&
        error.message ===
          "PAYSLIP_STATUS_CHANGED_BEFORE_DOCUMENT_INSERT"
      ) {
        return {
          ok: false,
          message:
            "The payslip status changed before the document could be saved.",
        };
      }

      throw error;
    }

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: "payslip.document.uploaded",
        entityType: "payslip_document",
        entityId: payslip.id,
        metadata: {
          payslipId: payslip.id,
          employeeId: employee.id,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
        },
      });
    } catch (auditError) {
      console.error(
        "[payroll] payslip document audit failed",
        auditError
      );
    }

    return {
      ok: true,
      message: "Payslip PDF uploaded and securely stored.",
      payslipId: payslip.id,
    };
  } catch (error) {
    console.error("[payroll] payslip PDF upload failed", error);

    return {
      ok: false,
      message:
        "The payslip PDF could not be uploaded. Please try again.",
    };
  }
}

/**
 * Replace the current payslip PDF with a new upload while retaining immutable
 * version history.
 *
 * Security contract:
 * - Management-only server action, same permissions as upload.
 * - Payslip, employee, and current document are always organization-scoped.
 * - Only `generated` payslips on approved/locked runs may be replaced;
 *   published and revoked payslips are immutable.
 * - A non-empty reason (max 1000 characters) is required and audited.
 * - The new PDF is encrypted and stored under a NEW server-generated storage
 *   key before the transaction that rotates the current document pointer.
 * - The prior version row and its encrypted file are retained; replacement
 *   never deletes history. Only the just-stored file is removed if the
 *   transaction fails.
 * - The employee PDF password is never returned or persisted.
 */
export async function replacePayslipPdfAction(
  formData: FormData
): Promise<PayslipDocumentActionResult> {
  const user = await requireUser();

  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);

  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }

  const organizationId = user.organizationId;

  const allowedFields = new Set(["payslipId", "file", "reason"]);

  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      return {
        ok: false,
        message: "Invalid payslip replacement request.",
      };
    }
  }

  const payslipIdValue = formData.get("payslipId");
  const reasonValue = formData.get("reason");
  const fileValue = formData.get("file");

  if (
    typeof payslipIdValue !== "string" ||
    !isPayslipUuid(payslipIdValue)
  ) {
    return {
      ok: false,
      message: "Invalid payslip identifier.",
    };
  }

  if (typeof reasonValue !== "string") {
    return {
      ok: false,
      message: "A reason for replacing the payslip PDF is required.",
    };
  }

  if (
    !fileValue ||
    typeof fileValue !== "object" ||
    !("arrayBuffer" in fileValue) ||
    !("size" in fileValue) ||
    !("type" in fileValue) ||
    !("name" in fileValue)
  ) {
    return {
      ok: false,
      message: "Please select a PDF payslip.",
    };
  }

  const file = fileValue as File;

  const originalFilename = sanitizePayslipOriginalFilename(file.name);
  const trimmedReason = reasonValue.trim();

  try {
    const payslipRows = await db
      .select({
        id: payslips.id,
        organizationId: payslips.organizationId,
        employeeId: payslips.employeeId,
        status: payslips.status,
        payrollItemId: payslips.payrollItemId,
        payrollPeriodId: payslips.payrollPeriodId,
        payslipEmployeeNumberSnapshot: payslips.employeeNumberSnapshot,
        payslipBirthDateSnapshot: payslips.birthDateSnapshot,
      })
      .from(payslips)
      .where(
        and(
          eq(payslips.id, payslipIdValue),
          eq(payslips.organizationId, organizationId)
        )
      )
      .limit(1);

    const payslip = payslipRows[0];

    if (!payslip) {
      forbidden();
    }

    /*
     * Resolve the borrowing workflow state in a mode-aware way so a
     * distribution payslip (no payroll item/run) is never hidden by an inner
     * join on `payroll_items`:
     * - Mode A (calculated): step through payroll item -> run.
     * - Mode B (distribution): the period is linked directly.
     */
    let payslipKind: "calculated" | "distribution" = "distribution";
    let runStatus: string | null = null;
    let periodStatus: string | null = null;
    let itemEmployeeNumberSnapshot: string | null = null;

    if (payslip.payrollItemId) {
      payslipKind = "calculated";
      const itemRows = await db
        .select({
          runStatus: payrollRuns.status,
          itemEmployeeNumberSnapshot: payrollItems.employeeNumberSnapshot,
        })
        .from(payrollItems)
        .innerJoin(
          payrollRuns,
          eq(payrollRuns.id, payrollItems.payrollRunId)
        )
        .where(
          and(
            eq(payrollItems.id, payslip.payrollItemId),
            eq(payrollItems.organizationId, organizationId),
            eq(payrollRuns.organizationId, organizationId)
          )
        )
        .limit(1);
      const item = itemRows[0];
      if (!item) forbidden();
      runStatus = item.runStatus;
      itemEmployeeNumberSnapshot = item.itemEmployeeNumberSnapshot;
    } else if (payslip.payrollPeriodId) {
      payslipKind = "distribution";
      const periodRows = await db
        .select({ status: payrollPeriods.status })
        .from(payrollPeriods)
        .where(
          and(
            eq(payrollPeriods.id, payslip.payrollPeriodId),
            eq(payrollPeriods.organizationId, organizationId)
          )
        )
        .limit(1);
      const period = periodRows[0];
      if (!period) forbidden();
      periodStatus = period.status;
    } else {
      forbidden();
    }

    const currentDocumentRows = await db
      .select({
        id: payslipDocuments.id,
        storageKey: payslipDocuments.storageKey,
        sha256: payslipDocuments.sha256,
      })
      .from(payslipDocuments)
      .where(
        and(
          eq(payslipDocuments.organizationId, organizationId),
          eq(payslipDocuments.payslipId, payslip.id)
        )
      )
      .limit(1);

    const currentDocument = currentDocumentRows[0];

    const replaceDecision = buildPayslipPdfReplaceDecision({
      mimeType: file.type,
      filename: originalFilename,
      size: file.size,
      reason: reasonValue,
      payslipStatus: payslip.status,
      runStatus,
      payslipKind,
      periodStatus,
      hasExistingDocument: Boolean(currentDocument),
    });

    if (!replaceDecision.allowed) {
      return {
        ok: false,
        message: replaceDecision.message,
      };
    }

    const employeeRows = await db
      .select({
        id: employees.id,
        organizationId: employees.organizationId,
        employeeNumber: employees.employeeNumber,
        nik: employees.nik,
        birthDate: employees.birthDate,
      })
      .from(employees)
      .where(
        and(
          eq(employees.id, payslip.employeeId),
          eq(employees.organizationId, organizationId)
        )
      )
      .limit(1);

    const employee = employeeRows[0];

    if (!employee) {
      forbidden();
    }

    const pdf = Buffer.from(await file.arrayBuffer());

    /*
     * Replacement reuses the SAME historical identity as the original
     * document: the payslip employee-number/birth-date snapshots first, then
     * the payroll item number snapshot, and the live employee ONLY as a legacy
     * fallback. Changing the employee master must never change an existing
     * payslip's opening password.
     */
    const passwordIdentity = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: payslip.payslipEmployeeNumberSnapshot,
      payslipBirthDateSnapshot: payslip.payslipBirthDateSnapshot,
      itemEmployeeNumberSnapshot,
      liveEmployeeNumber: employee.employeeNumber,
      liveBirthDate: employee.birthDate,
    });

    if (!passwordIdentity.employeeNumber || !passwordIdentity.birthDate) {
      return {
        ok: false,
        message:
          "The payslip is missing the historical employee number or birth date required for its PDF password.",
      };
    }

    const stored = await encryptAndStorePayslipPdf({
      pdf,
      identity: {
        employeeNumber: passwordIdentity.employeeNumber,
        nik: employee.nik,
        birthDate: passwordIdentity.birthDate,
      },
    });

    let newVersion = 0;

    try {
      newVersion = await db.transaction(async (tx) => {
        /*
         * Lock the current document row for the whole rotation. Two
         * concurrent replacements serialize here, so the version computed
         * below can never be read-then-written twice. The unique
         * (organizationId, payslipDocumentId, version) index is the final
         * database guard.
         */
        const lockedDocumentRows = await tx
          .select({ id: payslipDocuments.id })
          .from(payslipDocuments)
          .where(
            and(
              eq(payslipDocuments.organizationId, organizationId),
              eq(payslipDocuments.payslipId, payslip.id)
            )
          )
          .for("update")
          .limit(1);

        const lockedDocument = lockedDocumentRows[0];

        if (!lockedDocument) {
          throw new Error("PAYSLIP_DOCUMENT_MISSING");
        }

        const lockedPayslipRows = await tx
          .select({
            id: payslips.id,
            status: payslips.status,
          })
          .from(payslips)
          .where(
            and(
              eq(payslips.id, payslip.id),
              eq(payslips.organizationId, organizationId)
            )
          )
          .for("update")
          .limit(1);

        const lockedPayslip = lockedPayslipRows[0];

        if (!lockedPayslip) {
          throw new Error("PAYSLIP_MISSING");
        }

        if (lockedPayslip.status !== "generated") {
          throw new Error("PAYSLIP_STATUS_CHANGED_BEFORE_REPLACE");
        }

        const versionRows = await tx
          .select({ version: payslipDocumentVersions.version })
          .from(payslipDocumentVersions)
          .where(
            and(
              eq(
                payslipDocumentVersions.organizationId,
                organizationId
              ),
              eq(
                payslipDocumentVersions.payslipDocumentId,
                lockedDocument.id
              )
            )
          );

        const version = nextPayslipDocumentVersion(
          versionRows.map((row) => row.version)
        );

        await tx.insert(payslipDocumentVersions).values({
          organizationId,
          payslipDocumentId: lockedDocument.id,
          payslipId: payslip.id,
          employeeId: employee.id,
          version,
          storageKey: stored.storageKey,
          originalFilename,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          sha256: stored.sha256,
          source: "uploaded",
        });

        await tx
          .update(payslipDocuments)
          .set({
            storageKey: stored.storageKey,
            originalFilename,
            mimeType: stored.mimeType,
            fileSize: stored.fileSize,
            sha256: stored.sha256,
          })
          .where(
            and(
              eq(payslipDocuments.id, lockedDocument.id),
              eq(payslipDocuments.organizationId, organizationId)
            )
          );

        return version;
      });
    } catch (error) {
      /*
       * The prior version is retained, so only the newly stored file is
       * removed. Failure behavior is deterministic: no current-document
       * pointer is moved unless the whole transaction committed.
       */
      await removeStoredPayslipPdf(stored.storageKey).catch(
        (cleanupError) => {
          console.error(
            "[payroll] payslip replacement cleanup failed",
            cleanupError
          );
        }
      );

      if (
        error instanceof Error &&
        error.message === "PAYSLIP_DOCUMENT_MISSING"
      ) {
        return {
          ok: false,
          message: "There is no payslip document to replace.",
        };
      }

      if (
        error instanceof Error &&
        error.message === "PAYSLIP_STATUS_CHANGED_BEFORE_REPLACE"
      ) {
        return {
          ok: false,
          message:
            "The payslip status changed before the replacement could be saved.",
        };
      }

      throw error;
    }

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: "payslip.document.replaced",
        entityType: "payslip_document",
        entityId: payslip.id,
        metadata: {
          payslipId: payslip.id,
          employeeId: employee.id,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
          previousSha256: currentDocument?.sha256 ?? "",
          sha256: stored.sha256,
          version: newVersion,
          reason: trimmedReason,
        },
      });
    } catch (auditError) {
      console.error(
        "[payroll] payslip document replacement audit failed",
        auditError
      );
    }

    return {
      ok: true,
      message: `Payslip PDF replaced and securely stored (version ${newVersion}).`,
      payslipId: payslip.id,
    };
  } catch (error) {
    console.error("[payroll] payslip PDF replacement failed", error);

    return {
      ok: false,
      message:
        "The payslip PDF could not be replaced. Please try again.",
    };
  }
}

/**
 * Mode B — upload and securely store one payslip PDF for direct distribution,
 * without using the payroll calculation engine.
 *
 * Security contract (mirrors uploadPayslipPdfAction plus Mode B rules):
 * - Management-only server action.
 * - Period and employee are always organization-scoped.
 * - A distribution payslip is linked to the period via `payroll_period_id`
 *   (no payroll item / run).
 * - Only non-cancelled, non-locked periods accept distribution payslips.
 * - The employee must not already hold a payslip (calculated or distribution)
 *   for the period.
 * - The payslip number is server-derived: `PS-{PERIOD_CODE}-D-{employee_number}`.
 * - Employee number + birth date are required for the PDF password.
 * - PDF is encrypted before final storage; the employee PDF password is never
 *   returned or persisted.
 * - Database insertion (payslip + document + version history + event) happens
 *   only after encrypted storage succeeds; rollback removes the stored file.
 */
export async function uploadDistributionPayslipPdfAction(
  formData: FormData
): Promise<PayslipDocumentActionResult> {
  const user = await requireUser();

  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);

  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }

  const organizationId = user.organizationId;

  const allowedFields = new Set(["periodId", "employeeId", "file"]);

  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      return {
        ok: false,
        message: "Invalid payslip upload request.",
      };
    }
  }

  const periodIdValue = formData.get("periodId");
  const employeeIdValue = formData.get("employeeId");
  const fileValue = formData.get("file");

  if (
    typeof periodIdValue !== "string" ||
    !isPayslipUuid(periodIdValue)
  ) {
    return {
      ok: false,
      message: "Invalid payroll period identifier.",
    };
  }

  if (
    typeof employeeIdValue !== "string" ||
    !isPayslipUuid(employeeIdValue)
  ) {
    return {
      ok: false,
      message: "Invalid employee identifier.",
    };
  }

  if (
    !fileValue ||
    typeof fileValue !== "object" ||
    !("arrayBuffer" in fileValue) ||
    !("size" in fileValue) ||
    !("type" in fileValue) ||
    !("name" in fileValue)
  ) {
    return {
      ok: false,
      message: "Please select a PDF payslip.",
    };
  }

  const file = fileValue as File;

  const originalFilename = sanitizePayslipOriginalFilename(file.name);

  const uploadDecision = buildPayslipPdfUploadDecision({
    mimeType: file.type,
    filename: originalFilename,
    size: file.size,
  });

  if (!uploadDecision.allowed) {
    return {
      ok: false,
      message: uploadDecision.message,
    };
  }

  try {
    const periodRows = await db
      .select({
        id: payrollPeriods.id,
        code: payrollPeriods.code,
        status: payrollPeriods.status,
      })
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.id, periodIdValue),
          eq(payrollPeriods.organizationId, organizationId)
        )
      )
      .limit(1);

    const period = periodRows[0];

    if (!period) {
      forbidden();
    }

    const employeeRows = await db
      .select({
        id: employees.id,
        organizationId: employees.organizationId,
        employeeNumber: employees.employeeNumber,
        nik: employees.nik,
        birthDate: employees.birthDate,
      })
      .from(employees)
      .where(
        and(
          eq(employees.id, employeeIdValue),
          eq(employees.organizationId, organizationId)
        )
      )
      .limit(1);

    const employee = employeeRows[0];

    if (!employee) {
      forbidden();
    }

    const distributionDuplicate = await db
      .select({ id: payslips.id })
      .from(payslips)
      .where(
        and(
          eq(payslips.organizationId, organizationId),
          eq(payslips.payrollPeriodId, period.id),
          eq(payslips.employeeId, employee.id)
        )
      )
      .limit(1);

    const calculatedDuplicate = await db
      .select({ id: payslips.id })
      .from(payslips)
      .innerJoin(payrollItems, eq(payrollItems.id, payslips.payrollItemId))
      .innerJoin(
        payrollRuns,
        eq(payrollRuns.id, payrollItems.payrollRunId)
      )
      .where(
        and(
          eq(payslips.organizationId, organizationId),
          eq(payrollRuns.payrollPeriodId, period.id),
          eq(payslips.employeeId, employee.id)
        )
      )
      .limit(1);

    const duplicateEmployeePayslip = Boolean(
      distributionDuplicate[0] || calculatedDuplicate[0]
    );

    const decision = buildDistributionPayslipUploadDecision({
      periodStatus: period.status,
      duplicateEmployeePayslip,
      employeeNumber: employee.employeeNumber,
      birthDate: employee.birthDate,
    });

    if (!decision.allowed) {
      return {
        ok: false,
        message: decision.message,
      };
    }

    if (!employee.employeeNumber || !employee.birthDate) {
      return {
        ok: false,
        message:
          "Employee number and birth date are required before the payslip PDF can be uploaded.",
      };
    }

    const payslipNumber = buildDistributionPayslipNumber(
      period.code,
      employee.employeeNumber
    );

    /*
     * Mode B has no payroll item, so the historical identity snapshot is
     * captured from the employee record at upload time and stored on the
     * payslip. Later changes to the employee number or birth date can never
     * alter this payslip's opening password.
     */
    const snapshotEmployeeNumber = employee.employeeNumber;
    const snapshotBirthDate = employee.birthDate;

    const pdf = Buffer.from(await file.arrayBuffer());

    const stored = await encryptAndStorePayslipPdf({
      pdf,
      identity: {
        employeeNumber: snapshotEmployeeNumber,
        nik: employee.nik,
        birthDate: snapshotBirthDate,
      },
    });

    let payslipId = "";

    try {
      await db.transaction(async (tx) => {
        const lockedPeriodRows = await tx
          .select({ id: payrollPeriods.id, status: payrollPeriods.status })
          .from(payrollPeriods)
          .where(
            and(
              eq(payrollPeriods.id, period.id),
              eq(payrollPeriods.organizationId, organizationId)
            )
          )
          .for("update")
          .limit(1);

        const lockedPeriod = lockedPeriodRows[0];

        if (!lockedPeriod) {
          forbidden();
        }

        if (
          lockedPeriod.status === "cancelled" ||
          lockedPeriod.status === "locked"
        ) {
          throw new Error(
            "PERIOD_STATE_CHANGED_BEFORE_DOCUMENT_INSERT"
          );
        }

        const duplicateLocked = await tx
          .select({ id: payslips.id })
          .from(payslips)
          .where(
            and(
              eq(payslips.organizationId, organizationId),
              eq(payslips.payrollPeriodId, period.id),
              eq(payslips.employeeId, employee.id)
            )
          )
          .limit(1);

        if (duplicateLocked[0]) {
          throw new Error("EMPLOYEE_ALREADY_HAS_DISTRIBUTION_PAYSLIP");
        }

        const insertedPayslip = await tx
          .insert(payslips)
          .values({
            organizationId,
            payrollPeriodId: period.id,
            employeeId: employee.id,
            employeeNumberSnapshot: employee.employeeNumber,
            birthDateSnapshot: employee.birthDate,
            payslipNumber,
            issuedAt: new Date(),
            status: "generated",
          })
          .returning({ id: payslips.id });

        const insertedPayslipId = insertedPayslip[0]?.id;

        if (!insertedPayslipId) {
          throw new Error("Payslip insert returned no id.");
        }

        const insertedDocument = await tx
          .insert(payslipDocuments)
          .values({
            organizationId,
            payslipId: insertedPayslipId,
            employeeId: employee.id,
            storageKey: stored.storageKey,
            originalFilename,
            mimeType: stored.mimeType,
            fileSize: stored.fileSize,
            sha256: stored.sha256,
          })
          .returning({ id: payslipDocuments.id });

        const documentId = insertedDocument[0]?.id;

        if (!documentId) {
          throw new Error("Payslip document insert returned no id.");
        }

        await tx.insert(payslipDocumentVersions).values({
          organizationId,
          payslipDocumentId: documentId,
          payslipId: insertedPayslipId,
          employeeId: employee.id,
          version: 1,
          storageKey: stored.storageKey,
          originalFilename,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          sha256: stored.sha256,
          source: "uploaded",
        });

        await tx.insert(payrollEvents).values({
          organizationId,
          payrollPeriodId: period.id,
          actorUserId: user.id,
          eventType: "payslip.generated",
          fromStatus: null,
          toStatus: "generated",
          reason: null,
          metadata: JSON.stringify({
            payslipId: insertedPayslipId,
            kind: "distribution",
            payslipNumber,
          }),
        });

        payslipId = insertedPayslipId;
      });
    } catch (error) {
      await removeStoredPayslipPdf(stored.storageKey).catch(
        (cleanupError) => {
          console.error(
            "[payroll] payslip document cleanup failed",
            cleanupError
          );
        }
      );

      if (
        error instanceof Error &&
        error.message === "EMPLOYEE_ALREADY_HAS_DISTRIBUTION_PAYSLIP"
      ) {
        return {
          ok: false,
          message:
            "This employee already has a payslip for this payroll period.",
        };
      }

      if (
        error instanceof Error &&
        error.message === "PERIOD_STATE_CHANGED_BEFORE_DOCUMENT_INSERT"
      ) {
        return {
          ok: false,
          message:
            "The payroll period changed before the payslip could be saved.",
        };
      }

      throw error;
    }

    try {
      await writeAuditLog({
        organizationId,
        actorUserId: user.id,
        action: "payslip.document.uploaded",
        entityType: "payslip_document",
        entityId: payslipId,
        metadata: {
          payslipId,
          employeeId: employee.id,
          periodId: period.id,
          kind: "distribution",
          payslipNumber,
          fileSize: stored.fileSize,
          mimeType: stored.mimeType,
        },
      });
    } catch (auditError) {
      console.error(
        "[payroll] payslip document audit failed",
        auditError
      );
    }

    return {
      ok: true,
      message: "Payslip PDF uploaded and securely stored.",
      payslipId,
    };
  } catch (error) {
    console.error("[payroll] payslip PDF upload failed", error);

    return {
      ok: false,
      message:
        "The payslip PDF could not be uploaded. Please try again.",
    };
  }
}

/**
 * Publish ONE generated payslip to employee self-service.
 *
 * Works for calculated (Mode A) and distribution (Mode B) payslips. The
 * payslip must currently be `generated` and must have an encrypted PDF
 * document. The period row is locked first (serializing concurrent workflow
 * transitions), then the payslip row is locked and its status re-read; a
 * `payslip.published` event + best-effort audit entry are appended.
 */
export async function publishPayslipAction(
  payslipId: string
): Promise<PayslipDocumentActionResult> {
  const user = await requireUser();

  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);

  if (!user.organizationId) {
    return {
      ok: false,
      message: "Your account is not assigned to an organization.",
    };
  }

  const organizationId = user.organizationId;

  if (!isPayslipUuid(payslipId)) {
    return { ok: false, message: "Invalid payslip identifier." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const locatedRows = await tx
        .select({
          id: payslips.id,
          employeeId: payslips.employeeId,
          payrollPeriodId: payslips.payrollPeriodId,
          payrollItemId: payslips.payrollItemId,
        })
        .from(payslips)
        .where(
          and(
            eq(payslips.id, payslipId),
            eq(payslips.organizationId, organizationId)
          )
        )
        .limit(1);

      const located = locatedRows[0];

      if (!located) {
        return { kind: "error" as const, message: "Payslip not found." };
      }

      // A distribution payslip links the period directly; a calculated
      // payslip reaches it through its payroll item -> run.
      let periodId = located.payrollPeriodId;

      if (!periodId && located.payrollItemId) {
        const runRows = await tx
          .select({
            periodId: payrollRuns.payrollPeriodId,
          })
          .from(payrollItems)
          .innerJoin(
            payrollRuns,
            eq(payrollRuns.id, payrollItems.payrollRunId)
          )
          .where(eq(payrollItems.id, located.payrollItemId))
          .limit(1);

        periodId = runRows[0]?.periodId ?? null;
      }

      if (!periodId) {
        return { kind: "error" as const, message: "Payslip not found." };
      }

      const period = await lockPeriodTxForPublish(
        tx,
        organizationId,
        periodId
      );
      if (!period) {
        return { kind: "error" as const, message: "Payslip not found." };
      }

      const lockedRows = await tx
        .select({ id: payslips.id, status: payslips.status })
        .from(payslips)
        .where(
          and(
            eq(payslips.id, payslipId),
            eq(payslips.organizationId, organizationId)
          )
        )
        .for("update")
        .limit(1);

      const lockedPayslip = lockedRows[0];

      if (!lockedPayslip) {
        return { kind: "error" as const, message: "Payslip not found." };
      }

      const documentRows = await tx
        .select({ id: payslipDocuments.id })
        .from(payslipDocuments)
        .where(
          and(
            eq(payslipDocuments.organizationId, organizationId),
            eq(payslipDocuments.payslipId, payslipId)
          )
        )
        .limit(1);

      const decision = buildPayslipPublishDecision({
        status: lockedPayslip.status,
        hasDocument: Boolean(documentRows[0]),
      });

      if (!decision.allowed) {
        return { kind: "error" as const, message: decision.message };
      }

      const now = new Date();

      await tx
        .update(payslips)
        .set({ status: "published", publishedAt: now })
        .where(
          and(
            eq(payslips.id, payslipId),
            eq(payslips.organizationId, organizationId)
          )
        );

      await tx.insert(payrollEvents).values({
        organizationId,
        payrollPeriodId: periodId,
        actorUserId: user.id,
        eventType: "payslip.published",
        fromStatus: "generated",
        toStatus: "published",
        reason: null,
        metadata: JSON.stringify({
          payslipId,
          kind: located.payrollItemId ? "calculated" : "distribution",
        }),
      });

      return { kind: "success" as const };
    });

    if (outcome.kind === "error") {
      return { ok: false, message: outcome.message };
    }

    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "payslip.published",
      entityType: "payslip",
      entityId: payslipId,
      metadata: null,
    }).catch((auditError) => {
      console.error(
        "[payroll] payslip publication audit failed",
        auditError
      );
    });

    return { ok: true, message: "Payslip published." };
  } catch (error) {
    console.error("[payroll] publish payslip failed", error);

    return {
      ok: false,
      message: "The payslip could not be published. Please try again.",
    };
  }
}

/**
 * Locks the org-scoped payroll period row for the duration of a payslip
 * transition, returning its id. The period id always comes from the located
 * payslip row, so a cross-organization period can never be reached.
 */
async function lockPeriodTxForPublish(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  organizationId: string,
  periodId: string
): Promise<{ periodId: string } | null> {
  const rows = await tx
    .select({ periodId: payrollPeriods.id })
    .from(payrollPeriods)
    .where(
      and(
        eq(payrollPeriods.id, periodId),
        eq(payrollPeriods.organizationId, organizationId)
      )
    )
    .for("update")
    .limit(1);

  return rows[0] ?? null;
}

export type BulkDistributionPayslipEntryStatus =
  | "created"
  | PayslipBulkEntryStatus
  | "invalid_file"
  | "write_failed";

export interface BulkDistributionPayslipEntryResult {
  filename: string;
  employeeNumber: string | null;
  employeeId: string | null;
  employeeName: string | null;
  ok: boolean;
  status: BulkDistributionPayslipEntryStatus;
  message: string;
  payslipId: string | null;
  payslipNumber: string | null;
}

export interface BulkDistributionPayslipActionResult {
  ok: boolean;
  message: string;
  periodId: string | null;
  total: number;
  createdCount: number;
  problemCount: number;
  entries: BulkDistributionPayslipEntryResult[];
}

/**
 * Mode B — bulk upload many distribution payslip PDFs for one payroll period.
 *
 * Contract:
 * - Management-only; every lookup is organization-scoped.
 * - Files are matched by the leading employee-number prefix in the filename
 *   using the shared `payslip-bulk.guard` plan (<= `PAYSLIP_BULK_MAX_FILES`).
 * - Every file is reported: `matched` rows become a distribution payslip,
 *   while unmatched rows keep their problem status. No file is silently
 *   dropped.
 * - Each file is encrypted with the same employee number + birth date
 *   password contract as the single upload, stored, then persisted in its own
 *   transaction that locks the period row and re-checks duplicates.
 * - An orphaned encrypted file is removed if the corresponding insert fails.
 * - The password is never logged, returned, or persisted.
 */
export async function bulkUploadDistributionPayslipsAction(
  formData: FormData
): Promise<BulkDistributionPayslipActionResult> {
  const emptyResult = (
    message: string,
    periodId: string | null = null
  ): BulkDistributionPayslipActionResult => ({
    ok: false,
    message,
    periodId,
    total: 0,
    createdCount: 0,
    problemCount: 0,
    entries: [],
  });

  const user = await requireUser();

  await requireAnyPermission(user.id, [
    PERMISSIONS.PAYSLIP_PUBLISH,
    PERMISSIONS.PAYSLIP_MANAGE,
    PERMISSIONS.PAYROLL_MANAGE,
  ]);

  if (!user.organizationId) {
    return emptyResult("Your account is not assigned to an organization.");
  }

  const organizationId = user.organizationId;

  const allowedFields = new Set(["periodId", "files"]);

  for (const key of formData.keys()) {
    if (!allowedFields.has(key)) {
      return emptyResult("Invalid bulk payslip upload request.");
    }
  }

  const periodIdValue = formData.get("periodId");

  if (
    typeof periodIdValue !== "string" ||
    !isPayslipUuid(periodIdValue)
  ) {
    return emptyResult("Invalid payroll period identifier.");
  }

  const rawFiles = formData.getAll("files");

  if (rawFiles.length === 0) {
    return emptyResult("Please select at least one PDF payslip.");
  }

  if (rawFiles.length > PAYSLIP_BULK_MAX_FILES) {
    return emptyResult(
      `A bulk upload cannot contain more than ${PAYSLIP_BULK_MAX_FILES} files.`
    );
  }

  const files: File[] = [];

  for (const value of rawFiles) {
    if (
      !value ||
      typeof value !== "object" ||
      !("arrayBuffer" in value) ||
      !("size" in value) ||
      !("type" in value) ||
      !("name" in value)
    ) {
      return emptyResult("One of the selected files is not a valid PDF.");
    }

    files.push(value as File);
  }

  try {
    const periodRows = await db
      .select({
        id: payrollPeriods.id,
        code: payrollPeriods.code,
        status: payrollPeriods.status,
      })
      .from(payrollPeriods)
      .where(
        and(
          eq(payrollPeriods.id, periodIdValue),
          eq(payrollPeriods.organizationId, organizationId)
        )
      )
      .limit(1);

    const period = periodRows[0];

    if (!period) {
      forbidden();
    }

    const employeeRows = await db
      .select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        nik: employees.nik,
        firstName: employees.firstName,
        lastName: employees.lastName,
        birthDate: employees.birthDate,
      })
      .from(employees)
      .where(
        and(
          eq(employees.organizationId, organizationId),
          eq(employees.employmentStatus, "active")
        )
      );

    const employeesWithNumber = employeeRows.filter(
      (employee) => Boolean(employee.employeeNumber)
    );

    const employeeById = new Map(
      employeesWithNumber.map((employee) => [employee.id, employee])
    );

    const plan = buildBulkUploadPlan(
      files.map((file) => ({ name: file.name })),
      employeesWithNumber.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber ?? "",
        hasBirthDate: Boolean(employee.birthDate),
      }))
    );

    const results: BulkDistributionPayslipEntryResult[] = plan.entries.map(
      (entry) => ({
        filename: entry.filename,
        employeeNumber: entry.employeeNumber,
        employeeId: entry.employeeId,
        employeeName:
          entry.employeeId && employeeById.get(entry.employeeId)
            ? [
                employeeById.get(entry.employeeId)?.firstName,
                employeeById.get(entry.employeeId)?.lastName,
              ]
                .filter(Boolean)
                .join(" ")
                .trim()
            : null,
        ok: false,
        status: entry.status,
        message: entry.message,
        payslipId: null,
        payslipNumber: null,
      })
    );

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const planEntry = plan.entries[index];
      const result = results[index];

      if (planEntry.status !== "matched" || !planEntry.employeeId) {
        continue;
      }

      const employee = employeeById.get(planEntry.employeeId);

      if (
        !employee ||
        !employee.employeeNumber ||
        !employee.birthDate
      ) {
        result.status = "missing_birth_date";
        result.message = `Employee ${
          planEntry.employeeNumber ?? ""
        } is missing an employee number or birth date.`;
        continue;
      }

      const originalFilename = sanitizePayslipOriginalFilename(file.name);

      const fileDecision = buildPayslipPdfUploadDecision({
        mimeType: file.type,
        filename: originalFilename,
        size: file.size,
      });

      if (!fileDecision.allowed) {
        result.status = "invalid_file";
        result.message = fileDecision.message;
        continue;
      }

      let stored:
        | {
            storageKey: string;
            mimeType: string;
            fileSize: number;
            sha256: string;
          }
        | null = null;

      try {
        const snapshotEmployeeNumber = employee.employeeNumber;

        const pdf = Buffer.from(await file.arrayBuffer());

        stored = await encryptAndStorePayslipPdf({
          pdf,
          identity: {
            employeeNumber: snapshotEmployeeNumber,
            nik: employee.nik,
            birthDate: employee.birthDate,
          },
        });

        const storedFile = stored;

        const payslipNumber = buildDistributionPayslipNumber(
          period.code,
          snapshotEmployeeNumber
        );

        let createdPayslipId = "";

        await db.transaction(async (tx) => {
          const lockedPeriodRows = await tx
            .select({ id: payrollPeriods.id, status: payrollPeriods.status })
            .from(payrollPeriods)
            .where(
              and(
                eq(payrollPeriods.id, period.id),
                eq(payrollPeriods.organizationId, organizationId)
              )
            )
            .for("update")
            .limit(1);

          const lockedPeriod = lockedPeriodRows[0];

          if (!lockedPeriod) {
            throw new Error("PERIOD_NOT_FOUND");
          }

          if (
            lockedPeriod.status === "cancelled" ||
            lockedPeriod.status === "locked"
          ) {
            throw new Error("PERIOD_STATE_CHANGED_BEFORE_DOCUMENT_INSERT");
          }

          const duplicateDistribution = await tx
            .select({ id: payslips.id })
            .from(payslips)
            .where(
              and(
                eq(payslips.organizationId, organizationId),
                eq(payslips.payrollPeriodId, period.id),
                eq(payslips.employeeId, employee.id)
              )
            )
            .limit(1);

          const duplicateCalculated = await tx
            .select({ id: payslips.id })
            .from(payslips)
            .innerJoin(
              payrollItems,
              eq(payrollItems.id, payslips.payrollItemId)
            )
            .innerJoin(
              payrollRuns,
              eq(payrollRuns.id, payrollItems.payrollRunId)
            )
            .where(
              and(
                eq(payslips.organizationId, organizationId),
                eq(payrollRuns.payrollPeriodId, period.id),
                eq(payslips.employeeId, employee.id)
              )
            )
            .limit(1);

          if (duplicateDistribution[0] || duplicateCalculated[0]) {
            throw new Error("EMPLOYEE_ALREADY_HAS_DISTRIBUTION_PAYSLIP");
          }

          const insertedPayslip = await tx
            .insert(payslips)
            .values({
              organizationId,
              payrollPeriodId: period.id,
              employeeId: employee.id,
              employeeNumberSnapshot: snapshotEmployeeNumber,
              birthDateSnapshot: employee.birthDate,
              payslipNumber,
              issuedAt: new Date(),
              status: "generated",
            })
            .returning({ id: payslips.id });

          const insertedPayslipId = insertedPayslip[0]?.id;

          if (!insertedPayslipId) {
            throw new Error("PAYSLIP_INSERT_RETURNED_NO_ID");
          }

          const insertedDocument = await tx
            .insert(payslipDocuments)
            .values({
              organizationId,
              payslipId: insertedPayslipId,
              employeeId: employee.id,
              storageKey: storedFile.storageKey,
              originalFilename,
              mimeType: storedFile.mimeType,
              fileSize: storedFile.fileSize,
              sha256: storedFile.sha256,
            })
            .returning({ id: payslipDocuments.id });

          const documentId = insertedDocument[0]?.id;

          if (!documentId) {
            throw new Error("PAYSLIP_DOCUMENT_INSERT_RETURNED_NO_ID");
          }

          await tx.insert(payslipDocumentVersions).values({
            organizationId,
            payslipDocumentId: documentId,
            payslipId: insertedPayslipId,
            employeeId: employee.id,
            version: 1,
            storageKey: storedFile.storageKey,
            originalFilename,
            mimeType: storedFile.mimeType,
            fileSize: storedFile.fileSize,
            sha256: storedFile.sha256,
            source: "uploaded",
          });

          await tx.insert(payrollEvents).values({
            organizationId,
            payrollPeriodId: period.id,
            actorUserId: user.id,
            eventType: "payslip.generated",
            fromStatus: null,
            toStatus: "generated",
            reason: null,
            metadata: JSON.stringify({
              payslipId: insertedPayslipId,
              kind: "distribution",
              payslipNumber,
              bulk: true,
            }),
          });

          createdPayslipId = insertedPayslipId;
        });

        result.ok = true;
        result.status = "created";
        result.message = "Payslip PDF uploaded and securely stored.";
        result.payslipId = createdPayslipId;
        result.payslipNumber = payslipNumber;

        await writeAuditLog({
          organizationId,
          actorUserId: user.id,
          action: "payslip.document.uploaded",
          entityType: "payslip_document",
          entityId: createdPayslipId,
          metadata: {
            payslipId: createdPayslipId,
            employeeId: employee.id,
            periodId: period.id,
            kind: "distribution",
            bulk: true,
            payslipNumber,
            fileSize: storedFile.fileSize,
            mimeType: storedFile.mimeType,
          },
        }).catch((auditError) => {
          console.error(
            "[payroll] bulk payslip document audit failed",
            auditError
          );
        });
      } catch (error) {
        if (stored) {
          await removeStoredPayslipPdf(stored.storageKey).catch(
            (cleanupError) => {
              console.error(
                "[payroll] bulk payslip document cleanup failed",
                cleanupError
              );
            }
          );
        }

        if (
          error instanceof Error &&
          error.message === "EMPLOYEE_ALREADY_HAS_DISTRIBUTION_PAYSLIP"
        ) {
          result.status = "duplicate_employee";
          result.message = `Employee ${employee.employeeNumber} already has a payslip for this payroll period.`;
          continue;
        }

        if (
          error instanceof Error &&
          error.message === "PERIOD_STATE_CHANGED_BEFORE_DOCUMENT_INSERT"
        ) {
          result.status = "write_failed";
          result.message =
            "The payroll period was locked or cancelled before this payslip could be saved.";
          continue;
        }

        console.error("[payroll] bulk payslip PDF upload failed", error);

        result.status = "write_failed";
        result.message =
          "The payslip PDF could not be uploaded. Please try again.";
      }
    }

    const createdCount = results.filter((result) => result.ok).length;
    const problemCount = results.length - createdCount;

    return {
      ok: createdCount > 0,
      message:
        createdCount > 0
          ? `Uploaded ${createdCount} payslip${
              createdCount === 1 ? "" : "s"
            }${problemCount > 0 ? `, ${problemCount} problem${
              problemCount === 1 ? "" : "s"
            }` : ""}.`
          : "No payslips were uploaded. Review the problems below.",
      periodId: period.id,
      total: results.length,
      createdCount,
      problemCount,
      entries: results,
    };
  } catch (error) {
    console.error("[payroll] bulk payslip PDF upload failed", error);

    return emptyResult(
      "The bulk payslip upload could not be completed. Please try again.",
      periodIdValue
    );
  }
}
