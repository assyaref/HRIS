"use client";

import { useId, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { notifier } from "@/lib/notifier";

import {
  createEmployeeFieldAction,
  deleteEmployeeFieldAction,
  duplicateEmployeeFieldAction,
  reorderEmployeeFieldsAction,
  setEmployeeFieldStatusAction,
  updateEmployeeFieldAction,
  type EmployeeFieldActionState,
} from "./actions";
import type { EmployeeFieldDefinition } from "./queries";
import {
  BUILTIN_FIELD_SECTIONS,
  CUSTOM_FIELD_TYPES,
  type CustomFieldType,
} from "./validation";

/**
 * Custom field definition manager (Settings → Employee Fields).
 *
 * Full lifecycle: create, edit, duplicate, activate/deactivate, archive and
 * reorder. Every mutation goes through a server action that re-checks auth,
 * the organization scope and the matching `employee_fields.*` permission;
 * this component is UI only. Definitions created here flow automatically
 * into the employee tabs, the Excel template, import and export.
 */

function statusBadge(status: string) {
  if (status === "active") {
    return <Badge className="border-emerald-600/40 bg-emerald-600/10 text-emerald-700">Active</Badge>;
  }
  if (status === "inactive") {
    return <Badge variant="outline">Inactive</Badge>;
  }
  return <Badge variant="outline">Archived</Badge>;
}

function FieldForm({
  definition,
  roleOptions,
  onSubmit,
  submitLabel,
  onDone,
}: {
  definition: EmployeeFieldDefinition | null;
  roleOptions: { value: string; label: string }[];
  onSubmit: (
    prevState: EmployeeFieldActionState,
    formData: FormData
  ) => Promise<EmployeeFieldActionState>;
  submitLabel: string;
  onDone?: () => void;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const needsOptions = (value: string) =>
    ["select", "multiselect", "radio"].includes(value);
  const [type, setType] = useState<CustomFieldType>(
    definition?.fieldType ?? "text"
  );
  const [status, setStatus] = useState(definition?.status ?? "active");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrors({});
    startTransition(async () => {
      const state = await onSubmit(
        { status: "idle" },
        formData
      );
      if (state.status === "error") {
        setErrors(state.fieldErrors ?? {});
        notifier.error(state.message ?? "Please fix the highlighted fields.");
        return;
      }
      notifier.success(state.message ?? "Field saved.");
      setErrors({});
      event.currentTarget.reset();
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-key`}>Field key</Label>
          <Input
            id={`${formId}-key`}
            name="fieldKey"
            defaultValue={definition?.fieldKey ?? ""}
            readOnly={Boolean(definition)}
            required
            placeholder="e.g. shirt_size"
          />
          {errors.fieldKey ? (
            <p className="text-sm text-destructive">{errors.fieldKey}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Lowercase letters, digits and underscores. Immutable once created.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-label`}>Label</Label>
          <Input
            id={`${formId}-label`}
            name="label"
            defaultValue={definition?.label ?? ""}
            required
            placeholder="e.g. Shirt Size"
          />
          {errors.label ? (
            <p className="text-sm text-destructive">{errors.label}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-type`}>Type</Label>
          <select
            id={`${formId}-type`}
            name="fieldType"
            value={type}
            onChange={(event) =>
              setType(event.target.value as CustomFieldType)
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {CUSTOM_FIELD_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-section`}>Section</Label>
          <select
            id={`${formId}-section`}
            name="section"
            defaultValue={definition?.section ?? "Other"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {BUILTIN_FIELD_SECTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        {needsOptions(type) ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={`${formId}-options`}>
              Options (one per line)
            </Label>
            <textarea
              id={`${formId}-options`}
              name="options"
              rows={4}
              defaultValue={definition?.options.join("\n") ?? ""}
              className="flex min-h-20 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
            />
            {errors.options ? (
              <p className="text-sm text-destructive">{errors.options}</p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor={`${formId}-description`}>Description</Label>
          <Input
            id={`${formId}-description`}
            name="description"
            defaultValue={definition?.description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-displayOrder`}>Display order</Label>
          <Input
            id={`${formId}-displayOrder`}
            name="displayOrder"
            type="number"
            min={0}
            defaultValue={definition?.displayOrder ?? 0}
          />
        </div>
        {definition ? (
          <div className="space-y-2">
            <Label htmlFor={`${formId}-status`}>Status</Label>
            <select
              id={`${formId}-status`}
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Visibility (role codes)</Label>
          <div className="flex flex-wrap gap-3">
            {roleOptions.map((role) => (
              <label key={role.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="visibilityRoles"
                  value={role.value}
                  defaultChecked={definition?.visibilityConfig.includes(
                    role.value
                  )}
                  className="h-4 w-4 rounded border-input"
                />
                {role.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Empty = visible to every role that can view employee data.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Editable by (role codes)</Label>
          <div className="flex flex-wrap gap-3">
            {roleOptions.map((role) => (
              <label key={role.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  name="editableRoles"
                  value={role.value}
                  defaultChecked={definition?.editableByConfig.includes(
                    role.value
                  )}
                  className="h-4 w-4 rounded border-input"
                />
                {role.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Empty = every role with custom-data update rights.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isRequired"
            value="on"
            defaultChecked={definition?.isRequired}
            className="h-4 w-4 rounded border-input"
          />
          Required
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}

function RowActions({
  definition,
  canUpdate,
  canDelete,
  roleOptions,
  onDone,
}: {
  definition: EmployeeFieldDefinition;
  canUpdate: boolean;
  canDelete: boolean;
  roleOptions: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<EmployeeFieldActionState>) {
    startTransition(async () => {
      const state = await action();
      if (state.status === "error") {
        notifier.error(state.message ?? "Action failed.");
      } else {
        notifier.success(state.message ?? "Done.");
        onDone();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {canUpdate ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              run(() =>
                duplicateEmployeeFieldAction(definition.id)
              )
            }
            disabled={pending}
          >
            Duplicate
          </Button>
          {definition.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                run(() => setEmployeeFieldStatusAction(definition.id, "inactive"))
              }
              disabled={pending}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                run(() => setEmployeeFieldStatusAction(definition.id, "active"))
              }
              disabled={pending}
            >
              Activate
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
        </>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => run(() => deleteEmployeeFieldAction(definition.id))}
          disabled={pending}
        >
          Archive
        </Button>
      ) : null}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit field</DialogTitle>
            <DialogDescription>
              The field key is immutable so historical values stay linked.
            </DialogDescription>
          </DialogHeader>
          <FieldForm
            definition={definition}
            roleOptions={roleOptions}
            submitLabel="Save changes"
            onSubmit={(prev, formData) =>
              updateEmployeeFieldAction(definition.id, prev, formData)
            }
            onDone={() => {
              setEditOpen(false);
              onDone();
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EmployeeFieldsManager({
  definitions,
  canCreate,
  canUpdate,
  canDelete,
  roleOptions,
}: {
  definitions: EmployeeFieldDefinition[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  roleOptions: { value: string; label: string }[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  // Active fields are rendered in displayOrder; archived trail at the end.
  const ordered = [...definitions].sort((a, b) => {
    if (a.status === "archived" && b.status !== "archived") return 1;
    if (b.status === "archived" && a.status !== "archived") return -1;
    return a.displayOrder - b.displayOrder || a.label.localeCompare(b.label);
  });

  function move(id: string, direction: -1 | 1) {
    const active = ordered.filter(
      (definition) => definition.status !== "archived"
    );
    const index = active.findIndex((definition) => definition.id === id);
    if (index < 0) return;
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= active.length) return;
    const next = [...active];
    const [row] = next.splice(index, 1);
    next.splice(swapWith, 0, row);
    const order = next.map((definition) => definition.id);
    const formData = new FormData();
    formData.append("order", JSON.stringify(order));
    startTransition(async () => {
      const state = await reorderEmployeeFieldsAction({ status: "idle" }, formData);
      if (state.status === "error") {
        notifier.error(state.message ?? "Reorder failed.");
      } else {
        notifier.success(state.message ?? "Order saved.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Custom field definitions</CardTitle>
          <CardDescription>
            Fields here drive the Custom Fields tab, the Excel template,
            import validation and export columns — dynamically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canCreate ? (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? "Cancel" : "New field"}
              </Button>
            </div>
          ) : null}
          {canCreate && showCreate ? (
            <Card>
              <CardHeader>
                <CardTitle>Create field</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldForm
                  definition={null}
                  roleOptions={roleOptions}
                  submitLabel="Create field"
                  onSubmit={createEmployeeFieldAction}
                  onDone={() => setShowCreate(false)}
                />
              </CardContent>
            </Card>
          ) : null}

          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fields defined yet. Create one — for example Shirt Size
              (select with options S, M, L) — and it appears everywhere
              automatically.
            </p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordered.map((definition) => (
                    <TableRow key={definition.id}>
                      <TableCell className="font-medium">
                        {definition.label}
                        {definition.isRequired ? (
                          <span className="text-destructive"> *</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {definition.fieldKey}
                      </TableCell>
                      <TableCell>{definition.fieldType}</TableCell>
                      <TableCell>{definition.section}</TableCell>
                      <TableCell>{statusBadge(definition.status)}</TableCell>
                      <TableCell>
                        {canUpdate && definition.status !== "archived" ? (
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => move(definition.id, -1)}
                              aria-label="Move up"
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => move(definition.id, 1)}
                              aria-label="Move down"
                            >
                              ↓
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">
                            {definition.displayOrder}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          definition={definition}
                          canUpdate={canUpdate}
                          canDelete={canDelete}
                          roleOptions={roleOptions}
                          onDone={() => undefined}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
