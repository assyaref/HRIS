import type { ReactNode } from "react";

import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth/auth";

/**
 * Authenticated application shell (route group `(dashboard)`).
 *
 * The auth guard runs here, server-side, for every route in this group:
 * unauthenticated requests are redirected to /login before any page renders.
 * Responsive: sticky sidebar on `lg+`, header + mobile drawer below `lg`.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await requireUser();

  return (
    <div className="flex min-h-svh flex-col bg-background font-sans text-foreground lg:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={currentUser} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

