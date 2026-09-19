import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employees,
  payslips,
  payslipDocuments,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasAnyPermission } from "@/lib/auth/rbac";
import { writeAuditLog } from "@/lib/auth/audit";
import { getEmployeeByUserId } from "@/features/employees/queries";
import { readStoredPayslipPdf } from "@/lib/payroll/payslip-pdf";
import {
  buildPayslipDocumentAccessDecision,
  isPayslipUuid,
  sanitizePayslipHeaderFilename,
} from "@/features/payroll/payslip-document.guard";

export const dynamic = "force-dynamic";

const FORBIDDEN_QUERY_KEYS = [
  "organizationId",
  "employeeId",
  "storageKey",
] as const;

export async function GET(
  request: Request,
  context: {
    params: Promise<{ payslipId: string }>;
  }
): Promise<Response> {
  /*
   * Reject client attempts to provide tenant/authority identifiers.
   * Organization and employee identity always come from the session/database.
   */
  const search = new URL(request.url).searchParams;

  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (search.has(key)) {
      return new Response("Bad Request", {
        status: 400,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }

  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  if (!user.organizationId) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const organizationId = user.organizationId;
  const { payslipId } = await context.params;

  if (
    typeof payslipId !== "string" ||
    !isPayslipUuid(payslipId)
  ) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /*
   * Determine whether the caller is management.
   *
   * PAYSLIP_VIEW alone is intentionally not enough to bypass
   * employee ownership. Management access requires an explicit
   * payroll/payslip management/view permission.
   */
  const canManage = await hasAnyPermission(user.id, [
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYSLIP_MANAGE,
  ]);

  /*
   * Resolve caller's linked employee for self-service ownership.
   * This is still organization-scoped.
   */
  const linkedEmployee = await getEmployeeByUserId(
    user.id,
    organizationId
  );

  /*
   * Fetch the published payslip and its private document in one
   * organization-scoped query.
   */
  const rows = await db
    .select({
      payslipId: payslips.id,
      organizationId: payslips.organizationId,
      employeeId: payslips.employeeId,
      payslipNumber: payslips.payslipNumber,
      status: payslips.status,
      originalFilename: payslipDocuments.originalFilename,
      storageKey: payslipDocuments.storageKey,
      mimeType: payslipDocuments.mimeType,
      fileSize: payslipDocuments.fileSize,
      sha256: payslipDocuments.sha256,
    })
    .from(payslips)
    .innerJoin(
      payslipDocuments,
      and(
        eq(
          payslipDocuments.payslipId,
          payslips.id
        ),
        eq(
          payslipDocuments.organizationId,
          organizationId
        ),
        eq(
          payslipDocuments.employeeId,
          payslips.employeeId
        )
      )
    )
    .innerJoin(
      employees,
      and(
        eq(employees.id, payslips.employeeId),
        eq(
          employees.organizationId,
          organizationId
        )
      )
    )
    .where(
      and(
        eq(payslips.id, payslipId),
        eq(
          payslips.organizationId,
          organizationId
        ),
        eq(payslips.status, "published")
      )
    )
    .limit(1);

  const document = rows[0];

  /*
   * Return the same generic not-found response when the payslip,
   * organization, publication state, or document does not match.
   *
   * This avoids revealing cross-tenant/cross-employee existence.
   */
  if (!document) {
    return new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /*
   * Employee self-service boundary.
   *
   * A non-management user MUST own the payslip through the
   * employee linked to their authenticated user account.
   */
  /*
   * Build the access + audit decision for this published payslip PDF.
   *
   * The decision carries both `allowed` and `recordAudit`: the audit event is
   * recorded exactly when (and only when) authorization for the document view
   * succeeded. Both fields are derived purely from organization-scoped server
   * data — never from the client.
   */
  const decision = buildPayslipDocumentAccessDecision({
    linkedEmployeeId: linkedEmployee?.id ?? null,
    payslipEmployeeId: document.employeeId,
    managementAllowed: canManage,
  });

  if (!decision.allowed) {
    return new Response("Forbidden", {
      status: 403,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /*
   * The storage key comes exclusively from the server-side database.
   * It is never accepted from request parameters.
   */
  let pdf: Buffer;

  try {
    pdf = await readStoredPayslipPdf(
      document.storageKey
    );
  } catch (error) {
    console.error(
      "[payroll] payslip PDF read failed",
      error
    );

    return new Response("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  /*
   * Last-viewed access audit (PM-06).
   *
   * Written AFTER successful authorization and BEFORE the PDF response is
   * returned. Best effort only: an audit failure must NEVER fail the
   * download nor surface to the employee. The audit payload carries the
   * actor, organization, payslip, and employee identifiers only — never the
   * PDF password, its components, the storage key, or PDF contents.
   */
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: user.id,
      action: "payslip.document.viewed",
      entityType: "payslip_document",
      entityId: payslipId,
      metadata: {
        payslipId,
        employeeId: document.employeeId,
      },
    });
  } catch (auditError) {
    console.error(
      "[payroll] payslip document view audit failed",
      auditError
    );
  }

  const filename = sanitizePayslipHeaderFilename(
    document.originalFilename
  );

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'self'",
    },
  });
}
