"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button, type ButtonVariant } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { EmployeeSectionActionState } from "./actions";

const initialState: EmployeeSectionActionState = { status: "idle" };

/**
 * Shared section-form primitives for the Employee Master Data 2.0 tabs.
 *
 * Each form binds to a `useActionState` server action already bound to the
 * employee id on the server (`.bind(null, employeeId)`), so the browser only
 * ever submits field values. The actions themselves enforce authentication,
 * organization scope and per-section RBAC.
 */

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : label}
    </Button>
  );
}

function StateMessage({ state }: { state: EmployeeSectionActionState }) {
  if (state.status === "success" && state.message) {
    return <p className="text-sm text-emerald-700">{state.message}</p>;
  }
  if (state.status === "error" && state.message) {
    return (
      <p
        role="alert"
        className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        {state.message}
      </p>
    );
  }
  if (state.status === "error" && state.fieldErrors) {
    return (
      <ul className="space-y-1 text-sm text-destructive">
        {Object.entries(state.fieldErrors).map(([key, message]) => (
          <li key={key}>
            {message ?? "Invalid value."}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export function FormRow({
  label,
  name,
  value,
  type = "text",
  maxLength,
  required,
}: {
  label: string;
  name: string;
  value?: string | null;
  type?: string;
  maxLength?: number;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <Input
        id={`f-${name}`}
        name={name}
        type={type}
        defaultValue={value ?? ""}
        maxLength={maxLength}
        required={required}
      />
    </div>
  );
}

export function SelectRow({
  label,
  name,
  value,
  options,
  includeEmpty = true,
}: {
  label: string;
  name: string;
  value?: string | null;
  options: { value: string; label: string }[];
  includeEmpty?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={`f-${name}`}>{label}</Label>
      <select
        id={`f-${name}`}
        name={name}
        defaultValue={value ?? ""}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {includeEmpty ? <option value="">—</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SectionForm({
  title,
  description,
  action,
  children,
  submitLabel = "Save",
}: {
  title: string;
  description?: string;
  action: (
    prevState: EmployeeSectionActionState,
    formData: FormData
  ) => Promise<EmployeeSectionActionState>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialState);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate className="space-y-4">
          {children}
          <StateMessage state={state} />
          <SubmitButton label={submitLabel} />
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Small imperative button for a server action of shape
 * `(employeeId, rowId) => state` (delete row / set primary). Renders the
 * returned message inline.
 */
export function ActionButton({
  label,
  action,
  employeeId,
  rowId,
  variant = "ghost",
  disabled = false,
}: {
  label: string;
  action: (
    employeeId: string,
    rowId: string
  ) => Promise<EmployeeSectionActionState>;
  employeeId: string;
  rowId: string;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={variant}
        size="sm"
        disabled={pending || disabled}
        onClick={() => {
          setPending(true);
          setMessage(null);
          void action(employeeId, rowId)
            .then((state) =>
              setMessage(
                state.message ?? (state.status === "error" ? "Failed." : null)
              )
            )
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Working..." : label}
      </Button>
      {message ? (
        <span className="text-xs text-muted-foreground">{message}</span>
      ) : null}
    </span>
  );
}

/**
 * Collapse/expand a server-rendered editor (the children can contain forms
 * with server actions; the client only controls visibility).
 */
export function Disclosure({
  label,
  children,
  variant = "ghost",
}: {
  label: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={variant}
        size="sm"
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "Cancel" : label}
      </Button>
      {open ? <div className="w-full">{children}</div> : null}
    </div>
  );
}

/** Collapsible inline editor used by the list-based sections. */
export function CollapsibleEditor({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Card wrapping a list of rows plus an optional editor/toolbar. */
export function ListSection({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

export const sectionFormInitialState = initialState;
