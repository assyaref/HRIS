"use server";

import { and, eq } from "drizzle-orm";
import { forbidden } from "next/navigation";

import { db } from "@/db";
import {
  employees,
  payrollItems,
  payrollRuns,
  payslips,
  payslipDocuments,
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
  isPayslipPdfMimeType,
  isPayslipUuid,
  sanitizePayslipOriginalFilename,
} from "./payslip-document.guard";

const MAX_PDF_SIZE_BYTES = 20 * 1024 * 1024;

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
 * - Employee NIK + birthDate are required.
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

  if (file.size <= 0) {
    return {
      ok: false,
      message: "The selected PDF is empty.",
    };
  }

  if (file.size > MAX_PDF_SIZE_BYTES) {
    return {
      ok: false,
      message: "The payslip PDF must not exceed 20 MB.",
    };
  }

  if (!isPayslipPdfMimeType(file.type)) {
    return {
      ok: false,
      message: "Only PDF files are allowed.",
    };
  }

  const originalFilename = sanitizePayslipOriginalFilename(file.name);

  try {
    const payslipRows = await db
      .select({
        id: payslips.id,
        organizationId: payslips.organizationId,
        employeeId: payslips.employeeId,
        status: payslips.status,
        payrollItemId: payslips.payrollItemId,
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

    if (!employee.nik) {
      return {
        ok: false,
        message:
          "Employee NIK is required before the payslip PDF can be uploaded.",
      };
    }

    if (!employee.birthDate) {
      return {
        ok: false,
        message:
          "Employee birth date is required before the payslip PDF can be uploaded.",
      };
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

    const stored = await encryptAndStorePayslipPdf({
      pdf,
      identity: {
        nik: employee.nik,
        birthDate: employee.birthDate,
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

        await tx.insert(payslipDocuments).values({
          organizationId,
          payslipId: payslip.id,
          employeeId: employee.id,
          storageKey: stored.storageKey,
          originalFilename,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          sha256: stored.sha256,
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
