"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
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

import {
  createPayrollComponentAction,
  setPayrollComponentActiveAction,
  updatePayrollComponentAction,
} from "./actions";
import {
  PAYROLL_COMPONENT_METHODS,
  PAYROLL_COMPONENT_METHOD_LABELS,
  PAYROLL_COMPONENT_TYPES,
  PAYROLL_COMPONENT_TYPE_LABELS,
} from "./constants";
import { formatIDR } from "./money";
import type { PayrollComponentRow } from "./queries";

function formFromComponent(component: PayrollComponentRow | null): {
  code: string;
  name: string;
  type: string;
  calculationMethod: string;
  defaultAmount: number;
  description: string;
} {
  return {
    code: component?.code ?? "",
    name: component?.name ?? "",
    type: component?.type ?? "earning",
    calculationMethod: component?.calculationMethod ?? "fixed",
    defaultAmount: component?.defaultAmount ?? 0,
    description: component?.description ?? "",
  };
}

const selectClass =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const textareaClass =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

function ComponentFormDialog({
  open,
  onOpenChange,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PayrollComponentRow | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const defaults = formFromComponent(initial);

  function submit(formData: FormData) {
    setError(null);
    const values = {
      code: String(formData.get("code") ?? ""),
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      calculationMethod: String(formData.get("calculationMethod") ?? ""),
      defaultAmount: Number(formData.get("defaultAmount") ?? 0),
      description: String(formData.get("description") ?? "").trim() || undefined,
    };
    startTransition(async () => {
      const result = initial
        ? await updatePayrollComponentAction(initial.id, values)
        : await createPayrollComponentAction(values);
      if (result.ok) {
        onOpenChange(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial ? "Edit payroll component" : "New payroll component"}
          </DialogTitle>
          <DialogDescription>
            Organization-wide component definitions. Amounts are integer IDR;
            percentages are whole numbers based on fixed earnings.
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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="component-code">Code</Label>
              <Input
                id="component-code"
                name="code"
                defaultValue={defaults.code}
                placeholder="basic_salary"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="component-name">Name</Label>
              <Input
                id="component-name"
                name="name"
                defaultValue={defaults.name}
                placeholder="Basic salary"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="component-type">Type</Label>
              <select id="component-type" name="type" defaultValue={defaults.type} className={selectClass}>
                {PAYROLL_COMPONENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PAYROLL_COMPONENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="component-method">Calculation method</Label>
              <select
                id="component-method"
                name="calculationMethod"
                defaultValue={defaults.calculationMethod}
                className={selectClass}
              >
                {PAYROLL_COMPONENT_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {PAYROLL_COMPONENT_METHOD_LABELS[method]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="component-amount">Default amount / percent</Label>
            <Input
              id="component-amount"
              name="defaultAmount"
              type="number"
              min={0}
              step={1}
              defaultValue={defaults.defaultAmount}
              required
            />
            <p className="text-xs text-muted-foreground">
              Fixed/manual = integer IDR. Percentage = whole percent of the
              employee&apos;s fixed earnings.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="component-description">Description (optional)</Label>
            <textarea
              id="component-description"
              name="description"
              rows={2}
              defaultValue={defaults.description}
              className={textareaClass}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : initial ? "Save changes" : "Create component"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}


export function PayrollComponentManager({
  components,
}: {
  components: PayrollComponentRow[];
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<PayrollComponentRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function toggle(component: PayrollComponentRow) {
    setMessage(null);
    startTransition(async () => {
      const result = await setPayrollComponentActiveAction(
        component.id,
        component.active !== "true"
      );
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      router.refresh();
    });
  }

  const activeCount = components.filter((c) => c.active === "true").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Payroll components
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {components.length} defined · {activeCount} active
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          New component
        </Button>
      </div>

      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            message.tone === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      {components.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center text-sm text-muted-foreground">
          No payroll components yet. Create one to start calculating runs —
          active earning components make up an employee&apos;s gross pay.
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="[&_tr]:border-b">
              <tr className="border-b">
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Component
                </th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Type
                </th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Method
                </th>
                <th className="h-10 px-4 text-right align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Default
                </th>
                <th className="h-10 px-4 text-left align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Status
                </th>
                <th className="h-10 px-4 text-right align-middle text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>


              {components.map((component) => (
                <tr
                  key={component.id}
                  className="border-b transition-colors hover:bg-muted/50"
                >
                  <td className="p-4">
                    <span className="font-medium">{component.name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">
                      {component.code}
                    </span>
                    {component.description ? (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {component.description}
                      </span>
                    ) : null}
                  </td>
                  <td className="p-4 capitalize">{component.type}</td>
                  <td className="p-4">
                    {PAYROLL_COMPONENT_METHOD_LABELS[
                      component.calculationMethod as keyof typeof PAYROLL_COMPONENT_METHOD_LABELS
                    ] ?? component.calculationMethod}
                  </td>
                  <td className="p-4 text-right font-medium">
                    {formatIDR(component.defaultAmount)}
                  </td>
                  <td className="p-4">
                    {component.active === "true" ? (
                      <Badge variant="primary">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(component)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => toggle(component)}
                        disabled={pending}
                      >
                        {component.active === "true" ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <ComponentFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          initial={null}
        />
      ) : null}
      {editing ? (
        <ComponentFormDialog
          open={Boolean(editing)}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          initial={editing}
        />
      ) : null}
    </div>
  );
}

