import type { Metadata } from "next";

import { ProfileCard, type ProfileRow } from "@/components/employee/profile-card";
import { SectionHeader } from "@/components/employee/section-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";

import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { ChangePasswordForm } from "@/features/account/change-password-form";

export const metadata: Metadata = {
  title: "Profil Saya",
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

/**
 * Employee profile & account page. Profile data is read-only and resolved
 * server-side from the signed-in user's linked employee record; account
 * security (change password) uses the existing self-service action.
 */
export default async function AccountSettingsPage() {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const roleLabel = displayRoleLabel(authorization.roleCodes);

  const profile = user.organizationId
    ? await getEmployeeSelfProfile(user.id, user.organizationId)
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#172554]">
          Profil Saya
        </h1>
        <p className="mt-1 text-sm text-[#64748b]">
          Informasi kepegawaian dan pengaturan akun Anda.
        </p>
      </div>

      {profile ? (
        <ProfileCard
          firstName={profile.firstName}
          lastName={profile.lastName}
          employeeNumber={profile.employeeNumber}
          subtitle={profile.position ?? roleLabel}
          profilePhotoUrl={profile.profilePhotoUrl}
          rows={
            [
              { label: "Jabatan", value: profile.position, icon: "briefcase" },
              { label: "Department", value: profile.department, icon: "building" },
              { label: "Division", value: profile.division, icon: "projects" },
              { label: "Email", value: profile.email ?? user.email, icon: "document" },
              { label: "Nomor HP", value: profile.phone, icon: "profile" },
              {
                label: "Status",
                value:
                  profile.employmentStatus === "active"
                    ? "Aktif"
                    : profile.employmentStatus,
                icon: "check",
              },
              { label: "Tanggal Bergabung", value: formatDate(profile.hireDate), icon: "calendar" },
              { label: "Work Location", value: profile.workLocationName, icon: "map-pin" },
              { label: "Atasan", value: profile.managerName, icon: "employees" },
            ] as ProfileRow[]
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Profil belum tersedia</CardTitle>
            <CardDescription>
              Akun Anda belum ditautkan ke data karyawan. Hubungi administrator.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <section className="space-y-3">
        <SectionHeader
          title="Keamanan Akun"
          description="Perbarui kata sandi secara berkala."
        />
        <Card>
          <CardHeader>
            <CardTitle>Ganti Password</CardTitle>
            <CardDescription>
              Masukkan password lama dan password baru Anda.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
