"use client";

import { useState } from "react";

import { useRunner } from "@/components/forms/record-kit";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { managerReviewLeaveAction } from "@/features/leave/actions";
import { managerReviewPermissionAction } from "@/features/permission/actions";
import { managerReviewOvertimeAction } from "@/features/time/actions";

import { saveApprovalSettingsAction } from "./actions";
import { REQUEST_TYPE_LABELS, type ApprovalRequestType } from "./rules";

const TEXTAREA =
  "min-h-[80px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/80 focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-ring/15 focus-visible:outline-none";

export function ApprovalSettingsForm({ enabled }: { enabled: ApprovalRequestType[] }) {
  const { pending, error, run } = useRunner();
  const on = new Set(enabled);
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        const fd = new FormData(event.currentTarget);
        run(() => saveApprovalSettingsAction(fd));
      }}
    >
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <ul className="divide-y divide-border rounded-xl border border-[var(--card-border)]">
        {(Object.keys(REQUEST_TYPE_LABELS) as ApprovalRequestType[]).map((type) => (
          <li key={type}>
            <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
              <span>
                <span className="block font-medium">{REQUEST_TYPE_LABELS[type]}</span>
                <span className="block text-xs text-muted-foreground">Atasan langsung menyetujui lebih dulu, lalu HR.</span>
              </span>
              <input type="checkbox" name={type} defaultChecked={on.has(type)} className="size-5 accent-[var(--primary)]" />
            </label>
          </li>
        ))}
      </ul>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan..." : "Simpan pengaturan"}
      </Button>
    </form>
  );
}

export function ManagerDecisionButtons({ type, id, employeeName }: { type: ApprovalRequestType; id: string; employeeName: string }) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const { pending, error, run } = useRunner();
  const decide = (decision: "approved" | "rejected", text: string) => {
    if (type === "leave") return managerReviewLeaveAction(id, { decision, reviewerNote: text || undefined });
    if (type === "permission") return managerReviewPermissionAction(id, { decision, reviewerNote: text || undefined });
    return managerReviewOvertimeAction(id, decision, text);
  };
  return (
    <div className="flex justify-end gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={() => run(() => decide("approved", ""))}>
        Setujui
      </Button>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setRejecting(true)}>
        Tolak
      </Button>
      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tolak pengajuan {REQUEST_TYPE_LABELS[type].toLowerCase()}</DialogTitle>
            <DialogDescription>Pengajuan {employeeName} langsung ditolak dan tidak diteruskan ke HR.</DialogDescription>
          </DialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <textarea aria-label="Alasan penolakan" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={TEXTAREA} placeholder="Alasan penolakan" />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRejecting(false)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(() => decide("rejected", note), () => setRejecting(false))}>
              Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
