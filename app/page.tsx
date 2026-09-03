import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/auth";

export const metadata: Metadata = {
  title: "Enterprise HRIS",
};

/**
 * Auth-aware root entry point.
 * Redirect is decided server-side; no client-side JavaScript is involved.
 *   - authenticated  → /dashboard
 *   - unauthenticated → /login
 */
export default async function Home() {
  const currentUser = await getCurrentUser();

  if (currentUser) {
    redirect("/dashboard");
  }
  redirect("/login");
}

