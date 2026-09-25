"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  updateEmployeeCustomDataAction,
  type EmployeeSectionActionState,
} from "./actions";

const initialState: EmployeeSectionActionState = { status: "idle" };

/**
 * Custom Fields tab (Employee Master Data 2.0).
 *
 * 100% definition-driven: every label, input type, option list and
 * required-ness comes from the organization's ACTIVE field definitions
 * fetched server-side (Settings → Employee Fields). Adding a field in the
 * admin UI makes it appear here, on the Excel template/import/export and on
 * employee creation WITHOUT any source-code change.
 */

export interface CustomFieldSpec {
  id: string;
  fieldKey: string;
  label: string;
  description: string | null;
  fieldType: string;
  isRequired: boolean;
  options: string[];
  /** Current raw value for the editor (text/number/date/… or joined options). */
  currentValue: string;
  canEdit: boolean;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "Saving..." : "Save custom data"}
    </Button>
  );
}

function fieldId(key: string): string {
  return `custom-${key}`;
}

function renderInput(spec: CustomFieldSpec): React.ReactNode {
  const id = fieldId(spec.fieldKey);
  const common = {
    id,
    name: spec.fieldKey,
    defaultValue: spec.currentValue,
    disabled: !spec.canEdit,
    required: spec.isRequired && spec.canEdit,
  } as const;

  switch (spec.fieldType) {
    case "textarea":
      return (
        <textarea
          {...common}
          rows={3}
          className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
      );
    case "select":
    case "radio":
      return (
        <select
          {...common}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        >
          <option value="">—</option>
          {spec.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "multiselect":
      return (
        <div className="flex flex-wrap gap-3">
          {spec.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`${spec.fieldKey}[]`}
                value={option}
                defaultChecked={spec.currentValue
                  .split(", ")
                  .includes(option)}
                disabled={!spec.canEdit}
                className="h-4 w-4 rounded border-input"
              />
              {option}
            </label>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name={spec.fieldKey}
            value="true"
            defaultChecked={
              spec.currentValue.toLowerCase() === "true" ||
              spec.currentValue === "Yes"
            }
            disabled={!spec.canEdit}
            className="h-4 w-4 rounded border-input"
          />
          Yes
        </label>
      );
    case "date":
      return <Input {...common} type="date" />;
    case "datetime":
      return <Input {...common} type="datetime-local" />;
    case "number":
    case "currency":
      return <Input {...common} type="number" step="any" />;
    case "email":
      return <Input {...common} type="email" />;
    case "phone":
      return <Input {...common} type="tel" />;
    case "url":
      return <Input {...common} type="url" placeholder="https://…" />;
    default:
      return <Input {...common} type="text" />;
  }
}

export function CustomFieldsSection({
  employeeId,
  specs,
}: {
  employeeId: string;
  specs: CustomFieldSpec[];
}) {
  const [state, formAction] = useActionState(
    updateEmployeeCustomDataAction.bind(null, employeeId),
    initialState
  );

  const errors = state.fieldErrors ?? {};
  const hasErrors = Object.keys(errors).length > 0;
  const anyEditable = specs.some((spec) => spec.canEdit);

  if (specs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Custom Fields</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No active custom fields are defined for your organization yet. An
          administrator can create fields in Settings → Employee Fields —
          they appear here and in the Excel template automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Custom Fields</CardTitle>
        <CardDescription>
          Fields below come from your organization&apos;s active custom field
          definitions.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate className="space-y-4">
          {state.message && state.status === "success" ? (
            <p className="text-sm text-emerald-700">{state.message}</p>
          ) : null}
          {hasErrors && !state.message ? (
            <p className="text-sm text-destructive">
              Some values were rejected. See the fields below.
            </p>
          ) : null}
          {state.message && state.status === "error" ? (
            <p className="text-sm text-destructive">{state.message}</p>
          ) : null}

          {specs.filter((spec) => spec.canEdit).map((spec) => (
            <input
              key={`${spec.id}-present`}
              type="hidden"
              name={`${spec.fieldKey}__present`}
              value="true"
            />
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            {specs.map((spec) => (
              <div key={spec.id} className="space-y-2">
                <Label htmlFor={fieldId(spec.fieldKey)}>
                  {spec.label}
                  {spec.isRequired ? (
                    <span className="text-destructive"> *</span>
                  ) : null}
                </Label>
                {spec.description ? (
                  <p className="text-xs text-muted-foreground">
                    {spec.description}
                  </p>
                ) : null}
                {renderInput(spec)}
                {errors[spec.fieldKey] ? (
                  <p className="text-sm text-destructive">
                    {errors[spec.fieldKey]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>

          {anyEditable ? <SubmitButton disabled={!anyEditable} /> : null}
        </form>
      </CardContent>
    </Card>
  );
}
