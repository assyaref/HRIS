import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { ChangePasswordForm } from "@/features/account/change-password-form";

export const metadata: Metadata = {
  title: "Account Settings",
};

/**
 * Account settings — change password for authenticated users.
 */
export default async function AccountSettingsPage() {
  await requireUser();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Manage your account security settings.
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Ganti Password</CardTitle>
          <CardDescription>
            Update your password to keep your account secure.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
