import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/auth/rbac";
import { PERMISSIONS } from "@/lib/auth/permissions";

import { listEmployeesFlatByOrganization } from "@/features/employees/queries";
import { getAnnouncementDetail } from "@/features/announcements/queries";
import { AnnouncementForm } from "@/features/announcements/announcement-form";
import { AnnouncementTargetEditor } from "@/features/announcements/target-editor";
import { RemoveAttachmentButton } from "@/features/announcements/attachment-actions";
import { AnnouncementStatusBadge } from "@/features/announcements/announcement-badges";

export const metadata: Metadata = {
  title: "Ubah Pengumuman",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Edit an announcement (R18). Published items may only be edited by a publish
 * holder (server-enforced); the audience editor is locked once published, and
 * attachments can only be added/removed on drafts and unpublished posts.
 */
export default async function EditAnnouncementPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;
  if (!UUID_PATTERN.test(announcementId)) {
    notFound();
  }

  const user = await requireUser();
  if (!user.organizationId) {
    forbidden();
  }

  const canUpdate = await hasPermission(
    user.id,
    PERMISSIONS.ANNOUNCEMENTS_UPDATE
  );
  if (!canUpdate) {
    forbidden();
  }

  const [employees, detail] = await Promise.all([
    listEmployeesFlatByOrganization(user.organizationId),
    getAnnouncementDetail({
      announcementId,
      organizationId: user.organizationId,
    }),
  ]);
  if (!detail) {
    notFound();
  }

  const published = detail.status === "published";
  const employeeOptions = employees.map((employee) => ({
    id: employee.id,
    label: `${employee.employeeNumber} — ${employee.firstName} ${employee.lastName}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ubah Pengumuman
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <AnnouncementStatusBadge status={detail.status} />
            {published ? (
              <span>Pengumuman yang sudah terbit hanya dapat diubah isinya.</span>
            ) : null}
          </p>
        </div>
        <Link
          href={`/announcements/${detail.id}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Kembali ke pengumuman
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detail pengumuman</CardTitle>
          <CardDescription>
            Judul, isi, prioritas, jadwal, dan masa berlaku.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnnouncementForm
            mode="edit"
            initial={detail}
            employees={employeeOptions}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Penerima</CardTitle>
          <CardDescription>
            {published
              ? "Penerima dikunci selama pengumuman diterbitkan."
              : "Pilih siapa saja yang dapat melihat pengumuman ini."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {published ? (
            <p className="text-sm text-muted-foreground">
              {detail.targetType === "all_employees"
                ? "Terlihat oleh semua karyawan."
                : `Targeted ${detail.recipientIds.length} recipient(s).`}
            </p>
          ) : (
            <AnnouncementTargetEditor
              announcementId={detail.id}
              targetType={detail.targetType}
              recipientIds={detail.recipientIds}
              employees={employeeOptions}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lampiran</CardTitle>
          <CardDescription>
            {published
              ? "Lampiran tidak dapat dihapus saat pengumuman diterbitkan."
              : "Hapus berkas yang tidak ingin Anda bagikan lagi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {detail.attachments.length === 0 ? (
            <EmptyState
              title="Tidak ada lampiran"
              description="Unggah berkas melalui formulir di atas."
              className="border-0 py-6"
            />
          ) : (
            detail.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {attachment.originalFilename}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {(attachment.fileSize / 1024).toFixed(0)} KB ·{" "}
                    {attachment.mimeType}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <a
                    href={`/api/announcements/${attachment.id}/download`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Unduh
                  </a>
                  {published ? null : (
                    <RemoveAttachmentButton
                      announcementId={detail.id}
                      attachmentId={attachment.id}
                      filename={attachment.originalFilename}
                    />
                  )}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
