"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { createPayrollPeriodAction } from "./actions";

export function PayrollPeriodCreateDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createPayrollPeriodAction({
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        periodStart: String(formData.get("periodStart") ?? ""),
        periodEnd: String(formData.get("periodEnd") ?? ""),
        paymentDate: String(formData.get("paymentDate") ?? ""),
      });
      if (result.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New payroll period
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New payroll period</DialogTitle>
            <DialogDescription>
              Create a payroll cycle. Dates use YYYY-MM-DD and are stored as
              UTC; no run is created until you calculate it.
            </DialogDescription>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="period-code">Code</Label>
              <Input
                id="period-code"
                name="code"
                placeholder="e.g. 2026-08"
                autoCapitalize="characters"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-name">Name</Label>
              <Input
                id="period-name"
                name="name"
                placeholder="e.g. August 2026 salary"
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="period-start">Start date</Label>
                <Input id="period-start" name="periodStart" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period-end">End date</Label>
                <Input id="period-end" name="periodEnd" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="period-payment">Payment date</Label>
                <Input id="period-payment" name="paymentDate" type="date" required />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating…" : "Create period"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
