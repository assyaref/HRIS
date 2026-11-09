import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/lib/auth/auth";

export const metadata: Metadata = {
  title: "Masuk",
};

/**
 * Professional HRIS sign-in page.
 * Authenticated visitors are already past this screen — send them to the
 * dashboard. Unauthenticated visitors get the credential form.
 */
export default async function LoginPage() {
  const currentUser = await getCurrentUser();
  if (currentUser) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="shadow-[var(--shadow-xl)]">
        <CardHeader className="p-6 pb-4 sm:p-8 sm:pb-5">
          <CardTitle className="text-2xl!">Masuk</CardTitle>
          <CardDescription>
            Gunakan Nomor Karyawan atau Email dan password Anda.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0 sm:p-8 sm:pt-0">
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Khusus personel berwenang. Sesi dilindungi dan dipantau.
      </p>
    </div>
  );
}

