import type { Metadata } from "next";

import { HrisIcon } from "@/components/layout/icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";
import { isFaceRecognitionConfigured } from "@/lib/attendance/face-recognition";

import { ChangePasswordForm } from "@/features/account/change-password-form";
import {
  ExpandableRow,
  InfoRows,
  LinkRow,
  ProfileSection,
  ProfileView,
  SectionChips,
  ThemePreferenceRow,
  type ProfileTabKey,
} from "@/features/account/profile-view";
import { logoutAction } from "@/features/auth/actions";
import { hasManagementDashboard } from "@/features/dashboard/access";
import { getFaceEnrollmentSummaryInOrganization } from "@/features/employees/face-enrollment.queries";
import { ProfilePhotoCard } from "@/features/employees/profile-photo-card";
import { getEmployeeSelfProfile, getOrganizationName } from "@/features/employees/queries";

export const metadata: Metadata = {
  title: "Profil Saya",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  inactive: "Nonaktif",
  probation: "Masa Percobaan",
  resigned: "Mengundurkan Diri",
  terminated: "Diberhentikan",
};

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

function parseTab(value: string | string[] | undefined): ProfileTabKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "akun" || raw === "lainnya" ? raw : "data";
}

/**
 * "Profil Saya" — the signed-in user's profile and account settings.
 *
 * Reference mobile layout: identity card, then three tabs — Data Pegawai
 * (read-only employment and contact data), Akun & Keamanan (profile photo /
 * Face ID reference, password, theme) and Lainnya (Face ID, notifications,
 * sign out). Profile data is resolved server-side from the user's linked
 * employee record; every write goes through the existing server actions.
 */
export default async function AccountSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const roleLabel = displayRoleLabel(authorization.roleCodes);
  const employeeFrame = !hasManagementDashboard(authorization.permissionCodes);

  const [profile, organizationName] = user.organizationId
    ? await Promise.all([
        getEmployeeSelfProfile(user.id, user.organizationId),
        getOrganizationName(user.organizationId),
      ])
    : [null, null];
  const faceSummary = profile
    ? await getFaceEnrollmentSummaryInOrganization(profile.organizationId, profile.id)
    : null;

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`.trim()
    : user.email.split("@")[0];
  const faceActive = faceSummary?.status === "ACTIVE";

  const dataPanel = profile ? (
    <>
      <ProfileSection title="Informasi Kepegawaian">
        <InfoRows
          rows={[
            { label: "Jabatan", value: profile.position, icon: "briefcase" },
            { label: "Departemen", value: profile.department, icon: "building" },
            { label: "Divisi", value: profile.division, icon: "layers" },
            { label: "Atasan", value: profile.managerName, icon: "employees" },
            { label: "Tanggal Bergabung", value: formatDate(profile.hireDate), icon: "calendar" },
            { label: "Lokasi Kerja", value: profile.workLocationName, icon: "map-pin" },
          ]}
        />
      </ProfileSection>
      <ProfileSection title="Informasi Kontak">
        <InfoRows
          rows={[
            { label: "Email", value: profile.email ?? user.email, icon: "mail" },
            { label: "Nomor HP", value: profile.phone, icon: "phone" },
          ]}
        />
      </ProfileSection>
      <p className="px-2 text-center text-[12px] leading-snug text-muted-foreground">
        Data kepegawaian dikelola oleh HR. Hubungi HR jika ada data yang perlu diperbarui.
      </p>
    </>
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>Profil belum tersedia</CardTitle>
        <CardDescription>
          Akun Anda belum ditautkan ke data karyawan. Hubungi administrator.
        </CardDescription>
      </CardHeader>
    </Card>
  );

  const accountPanel = (
    <>
      <SectionChips
        items={[
          ...(profile && faceSummary
            ? [{ target: "foto-profil", label: "Foto Profil", icon: "camera" as const }]
            : []),
          { target: "keamanan", label: "Keamanan", icon: "lock" },
          { target: "preferensi", label: "Preferensi", icon: "sliders" },
        ]}
      />

      {profile && faceSummary ? (
        <ProfilePhotoCard
          employeeId={null}
          displayName={displayName}
          photoUrl={profile.profilePhotoUrl}
          canEdit
          faceStatus={faceSummary.status}
          engineConfigured={isFaceRecognitionConfigured()}
          employeeActive={profile.employmentStatus === "active"}
          selfService
          layout="profile"
        />
      ) : null}

      <ProfileSection id="keamanan" title="Keamanan Akun">
        <div className="divide-y divide-border border-t border-border">
          <ExpandableRow
            icon="key"
            title="Ganti Password"
            description="Perbarui password Anda secara berkala."
          >
            <div className="rounded-2xl bg-muted/40 p-3.5">
              <ChangePasswordForm />
            </div>
          </ExpandableRow>
          {profile ? (
            <LinkRow
              href="/face-id"
              icon="shield"
              title="Face ID Absensi"
              description={
                faceActive
                  ? "Wajah Anda sudah terdaftar untuk absensi."
                  : "Daftarkan wajah Anda untuk absensi."
              }
              trailing={
                <span
                  className={
                    faceActive
                      ? "shrink-0 rounded-full bg-[#E3F6E8] px-2 py-0.5 text-[11.5px] font-semibold text-[#15803D] dark:bg-[#16301C] dark:text-[#86EFAC]"
                      : "shrink-0 rounded-full bg-[#FFF4E0] px-2 py-0.5 text-[11.5px] font-semibold text-[#B45309] dark:bg-[#3A2A10] dark:text-[#FCD34D]"
                  }
                >
                  {faceActive ? "Aktif" : "Belum"}
                </span>
              }
            />
          ) : null}
        </div>
      </ProfileSection>

      <ProfileSection id="preferensi" title="Preferensi" className="pb-3">
        <div className="border-t border-border">
          <ThemePreferenceRow />
        </div>
      </ProfileSection>
    </>
  );

  const otherPanel = (
    <>
      <ProfileSection title="Lainnya">
        <div className="divide-y divide-border border-t border-border">
          <LinkRow
            href="/notifications"
            icon="bell"
            title="Notifikasi"
            description="Pemberitahuan pengajuan dan informasi terbaru."
          />
          <LinkRow
            href="/announcements"
            icon="megaphone"
            title="Pengumuman"
            description="Informasi resmi dari perusahaan."
          />
          {organizationName ? (
            <div className="flex min-h-[64px] items-center gap-3 py-2.5">
              <span className="hris-chip-blue flex size-11 shrink-0 items-center justify-center rounded-full">
                <HrisIcon name="building" className="size-[22px]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] leading-tight font-bold text-foreground">
                  Perusahaan
                </span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted-foreground">
                  {organizationName}
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </ProfileSection>

      <form action={logoutAction}>
        <button
          type="submit"
          className="flex min-h-[60px] w-full items-center gap-3 rounded-[22px] border border-[var(--card-border)] bg-card px-4 text-left hris-card transition-colors hover:bg-surface-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-danger text-[#EF4444]">
            <HrisIcon name="logout" className="size-[22px]" />
          </span>
          <span className="flex-1 text-[15px] font-bold text-[#EF4444]">Keluar</span>
        </button>
      </form>
    </>
  );

  return (
    <div className={employeeFrame ? undefined : "mx-auto max-w-2xl space-y-5"}>
      {employeeFrame ? (
        <h1 className="sr-only">Profil Saya</h1>
      ) : (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profil Saya</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola informasi akun dan data kepegawaian Anda.
          </p>
        </div>
      )}

      <ProfileView
        initialTab={parseTab(params.tab)}
        identity={{
          displayName,
          subtitle: profile?.position ?? roleLabel ?? null,
          employeeNumber: profile?.employeeNumber ?? null,
          photoUrl: profile?.profilePhotoUrl ?? null,
          statusLabel: profile
            ? (STATUS_LABELS[profile.employmentStatus] ?? profile.employmentStatus)
            : null,
          statusActive: profile?.employmentStatus === "active",
          canEditPhoto: Boolean(profile && faceSummary),
        }}
        panels={{ data: dataPanel, akun: accountPanel, lainnya: otherPanel }}
      />
    </div>
  );
}
