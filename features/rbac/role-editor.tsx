"use client";

import { useActionState, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Badge } from "@/components/ui/badge";
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
  PERMISSION_MODULE_LABELS,
  type Permission,
  type PermissionDefinition,
  type PermissionModule,
} from "@/lib/auth/permissions";
import { SUPERADMIN_ROLE_CODE } from "@/lib/auth/roles";

import type { RoleActionState } from "./actions";

const initialState: RoleActionState = { status: "idle" };

export interface RolePermissionEditorProps {
  roleCode: string;
  roleName: string;
  roleDescription: string;
  isSystemRole: boolean;
  canEdit: boolean;
  canDelete: boolean;
  catalog: readonly PermissionDefinition[];
  grantedCodes: readonly Permission[];
  updateAction: (
    prevState: RoleActionState,
    formData: FormData
  ) => Promise<RoleActionState>;
  deleteAction: (
    prevState: RoleActionState,
    formData: FormData
  ) => Promise<RoleActionState>;
}

function FormAlert({ state }: { state: RoleActionState }) {
  if (state.status === "idle" || !state.message) return null;
  const tone =
    state.status === "success"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
      : "border-destructive/40 bg-destructive/10 text-destructive";
  return (
    <div role="status" className={`rounded-md border px-3 py-2 text-sm ${tone}`}>
      {state.message}
    </div>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

/**
 * Role profile + permission assignment editor (client leaf).
 *
 * Everything rendered here is display + input collection only. The bound
 * server actions re-authenticate and re-authorize every submission, so a
 * tampered form can never grant capabilities the actor is not allowed to
 * assign.
 */
export function RolePermissionEditor({
  roleCode,
  roleName,
  roleDescription,
  isSystemRole,
  canEdit,
  canDelete,
  catalog,
  grantedCodes,
  updateAction,
  deleteAction,
}: RolePermissionEditorProps) {
  const isSuperAdminRole = roleCode === SUPERADMIN_ROLE_CODE;

  const [updateState, updateFormAction] = useActionState(
    updateAction,
    initialState
  );
  const [deleteState, deleteFormAction] = useActionState(
    deleteAction,
    initialState
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Controlled selection initialized from the server-provided grant set.
  // After a successful update the router re-renders this page from fresh
  // server data, so the local selection and the DB stay aligned.
  const [selected, setSelected] = useState<Set<Permission>>(
    () => new Set(grantedCodes)
  );

  const permissionGroups = useMemo(() => {
    const groups = new Map<PermissionModule, PermissionDefinition[]>();
    for (const definition of catalog) {
      const entries = groups.get(definition.module) ?? [];
      entries.push(definition);
      groups.set(definition.module, entries);
    }
    return Array.from(groups.entries());
  }, [catalog]);

  const togglePermission = (code: Permission, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  };

  const nameError = updateState.fieldErrors?.name;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>{roleName}</CardTitle>
            <Badge variant="outline">{roleCode}</Badge>
            {isSystemRole ? (
              <Badge variant="secondary">System role</Badge>
            ) : null}
            {isSuperAdminRole ? (
              <Badge variant="destructive">System-level</Badge>
            ) : null}
          </div>
          <CardDescription>
            {roleDescription || "No description provided."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>
            Role code is fixed and cannot be changed.
            {isSuperAdminRole
              ? " SUPERADMIN is a protected system role — only SUPERADMIN holders can modify it, and it cannot be deleted."
              : isSystemRole
                ? " This is a seeded system role and cannot be deleted."
                : null}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Role profile &amp; permissions</CardTitle>
          <CardDescription>
            {canEdit
              ? "Update the role name, description and the permissions granted to it."
              : "You have read-only access to this role."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormAlert state={updateState} />

          <form action={updateFormAction} noValidate className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-role-name">Name</Label>
                <Input
                  id="edit-role-name"
                  name="name"
                  defaultValue={roleName}
                  disabled={!canEdit}
                  required
                  invalid={Boolean(nameError)}
                  aria-invalid={Boolean(nameError)}
                  aria-describedby={nameError ? "edit-role-name-error" : undefined}
                />
                {nameError ? (
                  <p
                    id="edit-role-name-error"
                    className="text-sm text-destructive"
                  >
                    {nameError}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-role-description">Description</Label>
                <Input
                  id="edit-role-description"
                  name="description"
                  defaultValue={roleDescription ?? ""}
                  disabled={!canEdit}
                />
              </div>
            </div>

            <div className="space-y-6">
              {permissionGroups.map(([module, definitions]) => (
                <fieldset key={module} disabled={!canEdit}>
                  <legend className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                    {PERMISSION_MODULE_LABELS[module]}
                  </legend>
                  <ul className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
                    {definitions.map((definition) => {
                      const checked = selected.has(definition.code);
                      return (
                        <li key={definition.code} className="flex items-start gap-2.5">
                          <input
                            id={`perm-${definition.code}`}
                            name="permissionCodes"
                            type="checkbox"
                            value={definition.code}
                            checked={checked}
                            onChange={(event) =>
                              togglePermission(
                                definition.code,
                                event.target.checked
                              )
                            }
                            className="mt-0.5 size-4 shrink-0 rounded border-input accent-foreground"
                          />
                          <div className="min-w-0">
                            <label
                              htmlFor={`perm-${definition.code}`}
                              className="block font-mono text-xs font-medium text-foreground break-all"
                            >
                              {definition.code}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {definition.description}
                            </p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))}
            </div>

            {canEdit ? (
              <div className="flex justify-end border-t border-border pt-4">
                <SaveButton disabled={false} />
              </div>
            ) : null}
          </form>
        </CardContent>
      </Card>
      {canDelete ? (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>
              Deleting a role is permanent. Roles assigned to users cannot be
              deleted until those assignments are removed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAlert state={deleteState} />
            <form action={deleteFormAction} className="space-y-3">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Are you sure? This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                    <DeleteButton />
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete role
                </Button>
              )}
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="destructive" disabled={pending}>
      {pending ? "Deleting..." : "Yes, delete"}
    </Button>
  );
}

