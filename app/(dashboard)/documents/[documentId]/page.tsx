import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { VoidDocumentButton } from "@/features/documents/document-forms";
import { DOCUMENTS_GUIDE, DOCUMENTS_MIGRATION, isDocumentsModuleReady } from "@/features/documents/module";
import { longDate, parsePkwtContent } from "@/features/documents/pkwt";
import { PkwtLetter } from "@/features/documents/pkwt-letter";
import { getIssuedDocument } from "@/features/documents/queries";
import { getOrganizationName } from "@/features/employees/queries";
import { PrintButton } from "@/features/org-chart/print-button";

export const metadata: Metadata = { title: "Detail Surat" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One issued letter; a generated PKWT renders as a printable A4 letter. */
export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isDocumentsModuleReady())) {
    return <ModuleNotReady module="Surat & Nomor Surat" migration={DOCUMENTS_MIGRATION} guide={DOCUMENTS_GUIDE} />;
  }
  if (!UUID.test(documentId)) notFound();
  const [doc, organizationName, canManage, canSeeContract] = await Promise.all([
    getIssuedDocument(organizationId, documentId),
    getOrganizationName(organizationId),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW),
  ]);
  if (!doc) notFound();
  const pkwt = parsePkwtContent(doc.content);

  return (
    <div className="space-y-5">
      <div className="hris-no-print flex flex-wrap items-center justify-between gap-3">
        <Link href="/documents" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <HrisIcon name="chevron-left" className="size-4" />
          Register surat
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {canManage && !doc.voided ? <VoidDocumentButton id={doc.id} documentNumber={doc.documentNumber} /> : null}
          {pkwt && canSeeContract ? <PrintButton /> : null}
        </div>
      </div>

      <section className="hris-no-print hris-card rounded-[20px] border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {doc.typeCode} — {doc.typeName}
            </p>
            <h1 className={doc.voided ? "mt-1 font-mono text-xl font-semibold line-through" : "mt-1 font-mono text-xl font-semibold"}>
              {doc.documentNumber}
            </h1>
            <p className="mt-1 text-sm">{doc.subject}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Tanggal surat {longDate(doc.issuedDate)}
              {doc.recipient ? ` · Kepada: ${doc.recipient}` : ""}
              {doc.employeeId ? (
                <>
                  {" · "}
                  <Link href={`/employees/${doc.employeeId}`} className="hover:text-primary">
                    Profil karyawan
                  </Link>
                </>
              ) : null}
            </p>
            {doc.notes ? <p className="mt-1 text-sm text-muted-foreground">Catatan: {doc.notes}</p> : null}
            {doc.voided ? <p className="mt-1 text-sm text-destructive">Dibatalkan: {doc.voidReason}</p> : null}
          </div>
          <Badge variant={doc.voided ? "danger" : "success"}>{doc.voided ? "Dibatalkan" : "Terbit"}</Badge>
        </div>
      </section>

      {pkwt ? (
        canSeeContract ? (
          <div className="overflow-x-auto rounded-[20px] bg-muted/50 p-4 print:overflow-visible print:bg-transparent print:p-0">
            <PkwtLetter
              content={pkwt}
              documentNumber={doc.documentNumber}
              issuedDate={doc.issuedDate}
              organizationName={organizationName ?? "Perusahaan"}
              voided={doc.voided}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Isi kontrak hanya dapat dilihat dengan akses data kepegawaian.</p>
        )
      ) : (
        <p className="hris-no-print text-sm text-muted-foreground">
          Nomor ini dicatat di register. Isi surat dibuat di luar aplikasi; cantumkan nomor di atas pada surat Anda.
        </p>
      )}
    </div>
  );
}
