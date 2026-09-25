"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface DynamicCustomFieldSpec {
  fieldKey: string;
  label: string;
  description: string | null;
  fieldType: string;
  isRequired: boolean;
  options: string[];
}

/**
 * Definition-driven custom field inputs (Employee Master Data 2.0).
 *
 * Shared by the Create Employee dialog and anywhere else custom fields must
 * render dynamically: every prop comes from a field definition row, so an
 * administrator creating "Shirt Size" (select: S/M/L/XL/XXL) or "Vehicle
 * Number" makes those inputs appear immediately — no source-code change.
 *
 * Names are prefixed with `cf:` so the server action can distinguish them
 * from core fields (and rejects unknown `cf:` keys against the definitions).
 */
export function DynamicCustomFieldInputs({
  specs,
  idPrefix = "cf",
}: {
  specs: DynamicCustomFieldSpec[];
  idPrefix?: string;
}) {
  if (specs.length === 0) return null;
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm font-medium">Custom fields</legend>
      <div className="grid gap-4 sm:grid-cols-2">
        {specs.map((spec) => {
          const id = `${idPrefix}-${spec.fieldKey}`;
          return (
            <div key={spec.fieldKey} className="space-y-2">
              <Label htmlFor={id}>
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
              {renderControl(spec, id)}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

function renderControl(spec: DynamicCustomFieldSpec, id: string) {
  const name = `cf:${spec.fieldKey}`;
  switch (spec.fieldType) {
    case "textarea":
      return (
        <textarea
          id={id}
          name={name}
          rows={3}
          required={spec.isRequired}
          className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
        />
      );
    case "select":
    case "radio":
      return (
        <select
          id={id}
          name={name}
          required={spec.isRequired}
          defaultValue=""
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
        <div className="flex flex-wrap gap-3" id={id}>
          {spec.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`${name}[]`}
                value={option}
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
            id={id}
            type="checkbox"
            name={name}
            value="true"
            className="h-4 w-4 rounded border-input"
          />
          Yes
        </label>
      );
    case "date":
      return <Input id={id} name={name} type="date" required={spec.isRequired} />;
    case "datetime":
      return (
        <Input id={id} name={name} type="datetime-local" required={spec.isRequired} />
      );
    case "number":
    case "currency":
      return (
        <Input id={id} name={name} type="number" step="any" required={spec.isRequired} />
      );
    case "email":
      return <Input id={id} name={name} type="email" required={spec.isRequired} />;
    case "phone":
      return <Input id={id} name={name} type="tel" required={spec.isRequired} />;
    case "url":
      return <Input id={id} name={name} type="url" required={spec.isRequired} />;
    default:
      return <Input id={id} name={name} type="text" required={spec.isRequired} />;
  }
}
