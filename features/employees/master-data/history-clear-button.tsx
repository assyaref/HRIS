"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { clearEmploymentHistoryAction } from "./actions";

/** Super Administrator: wipe an employee's employment history (server re-checks). */
export function HistoryClearButton({
  employeeId,
  count,
}: {
  employeeId: string;
  count: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending || count === 0}
        onClick={() => {
          if (
            !window.confirm(
              `Bersihkan seluruh riwayat kepegawaian (${count} catatan)? Tindakan ini tidak dapat dibatalkan.`
            )
          ) {
            return;
          }
          setMessage(null);
          startTransition(async () => {
            const result = await clearEmploymentHistoryAction(employeeId);
            setMessage(result.message ?? null);
            router.refresh();
          });
        }}
      >
        {pending ? "Membersihkan…" : "Bersihkan riwayat"}
      </Button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}
