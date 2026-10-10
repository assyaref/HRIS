import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { ChangePasswordForm } from "@/features/account/change-password-form";

export const metadata: Metadata = {
  title: "Ganti Password",
};

export default async function ChangePasswordPage() {
  // Allow access even when mustChangePassword is true
  await requireUser({ allowPendingPasswordChange: true });

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto">
      <div className="flex justify-center">
        <svg
          className="h-12 w-12 text-[#1677e8]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Ganti Password</CardTitle>
          <CardDescription>
            Anda wajib mengganti password sebelum melanjutkan. Password awal adalah Nomor Karyawan Anda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm forcedChange={true} />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Butuh bantuan? Hubungi administrator HRIS.
      </p>
    </div>
  );
}