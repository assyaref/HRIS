"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Attendance recap error boundary. Never exposes stack traces or database
 * details; the technical error is logged server-side.
 */
export default function AttendanceRecapError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[attendance/recap] page error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-12 text-center">
      <h2 className="text-sm font-semibold text-foreground">
        Rekap absensi gagal dimuat
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Terjadi kesalahan saat memuat halaman ini. Silakan coba lagi.
      </p>
      <Button type="button" variant="outline" onClick={retry}>
        Coba lagi
      </Button>
    </div>
  );
}
