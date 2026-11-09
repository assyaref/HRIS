import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * Global 403 page (rendered when `forbidden()` is raised by RBAC guards).
 * Deliberately minimal and free of technical details — no database, no stack,
 * no role/permission specifics are exposed here.
 */
export default function ForbiddenPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12 font-sans text-foreground">
      <div className="flex max-w-md flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex size-16 items-center justify-center rounded-2xl bg-surface-danger text-lg font-extrabold text-danger shadow-[0_10px_24px_-14px_rgb(220_38_38/0.7)]"
        >
          403
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Akses ditolak
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Anda tidak memiliki izin untuk membuka halaman ini. Jika menurut Anda
          ini keliru, hubungi administrator.
        </p>
        <Link href="/dashboard" className={buttonVariants({ className: "mt-6" })}>
          Kembali ke Beranda
        </Link>
      </div>
    </main>
  );
}
