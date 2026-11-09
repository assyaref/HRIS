import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background bg-[radial-gradient(60rem_30rem_at_50%_-10%,var(--surface-primary),transparent_70%)] px-4 py-12 font-sans text-foreground">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
