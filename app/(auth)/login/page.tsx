import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Brand } from "@/components/layout/brand";
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
  title: "Sign in",
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
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <Brand />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your work email and password to access Enterprise HRIS.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Authorized personnel only. Sessions are protected and monitored.
      </p>
    </div>
  );
}

