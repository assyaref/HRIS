import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { readEmployeeDocument } from "@/lib/employee-documents/storage";

import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { employeeDocuments } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Authorized employee-document download.
 *
 * Security: the caller must hold `employees.document.view`, the document id
 * must resolve inside the caller's organization AND under the requested
 * employee (both from the session, never the URL beyond the ids themselves),
 * so a tampered path can never reach another tenant or employee's file.
 * Files live outside the web root; this route is the ONLY thing that serves
 * them.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ employeeId: string; documentId: string }> }
): Promise<Response> {
  const { employeeId, documentId } = await context.params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW);
  if (!user.organizationId) {
    return new Response("Not Found", { status: 404 });
  }

  const rows = await db
    .select({
      documentType: employeeDocuments.documentType,
      originalFilename: employeeDocuments.originalFilename,
      storageKey: employeeDocuments.storageKey,
      mimeType: employeeDocuments.mimeType,
      fileSize: employeeDocuments.fileSize,
    })
    .from(employeeDocuments)
    .where(
      and(
        eq(employeeDocuments.id, documentId),
        eq(employeeDocuments.employeeId, employeeId),
        eq(employeeDocuments.organizationId, user.organizationId)
      )
    )
    .limit(1);
  const document = rows[0];
  if (!document) {
    return new Response("Not Found", { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readEmployeeDocument(document.storageKey);
  } catch {
    // A missing file is a server-side integrity issue, not a client error.
    return new Response("Not Found", { status: 404 });
  }

  try {
    await writeAuditLog({
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "employee.document.downloaded",
      entityType: "employee_document",
      entityId: documentId,
      metadata: {
        employeeId,
        documentType: document.documentType,
        originalFilename: document.originalFilename,
      },
    });
  } catch (error) {
    console.error("[employee-documents] audit failed", error);
  }

  const safeName = document.originalFilename.replace(/[^\w.\-]/g, "_");
  return new Response(new Uint8Array(bytes) as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": document.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
