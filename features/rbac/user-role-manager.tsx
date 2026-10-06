"use client";

import { useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  assignRoleForSuperAdminAction,
  removeRoleForSuperAdminAction,
} from "./user-role.actions";
import type {
  UserRoleItem,
  SuperAdminUserItem,
} from "./user-role.queries";
import type { RoleListItem } from "./queries";

interface UserRoleManagerProps {
  organizationId: string;
  users: SuperAdminUserItem[];
  roles: RoleListItem[];
  initialUserId?: string;
  initialAssignments: UserRoleItem[];
}

export function UserRoleManager({
  organizationId,
  users,
  roles,
  initialUserId,
  initialAssignments,
}: UserRoleManagerProps) {
  const [selectedUserId, setSelectedUserId] = useState(
    initialUserId ?? users[0]?.id ?? ""
  );
  const [assignments, setAssignments] = useState(initialAssignments);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const assignedRoleIds = useMemo(
    () => new Set(assignments.map((assignment) => assignment.roleId)),
    [assignments]
  );

  const availableRoles = roles.filter(
    (role) =>
      role.code !== "SUPERADMIN" && !assignedRoleIds.has(role.id)
  );

  function refreshSelectedUser(nextUserId: string) {
    setSelectedUserId(nextUserId);
    setMessage(null);
    setError(null);

    const params = new URLSearchParams(window.location.search);
    params.set("organizationId", organizationId);
    params.set("userId", nextUserId);
    window.location.href = `/settings/users?${params.toString()}`;
  }

  function assignRole() {
    if (!selectedUserId || !selectedRoleId) return;

    setMessage(null);
    setError(null);

    const role = roles.find((item) => item.id === selectedRoleId);

    if (!role) {
      setError("Selected role was not found.");
      return;
    }

    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("userId", selectedUserId);
    formData.set("roleId", selectedRoleId);

    startTransition(async () => {
      const result = await assignRoleForSuperAdminAction(
        { status: "idle" },
        formData
      );

      if (result.status === "success") {
        setMessage(result.message ?? "Role assigned.");
        setSelectedRoleId("");
        window.location.reload();
      } else {
        setError(result.message ?? "Could not assign role.");
      }
    });
  }

  function removeRole(roleId: string) {
    setMessage(null);
    setError(null);

    const formData = new FormData();
    formData.set("organizationId", organizationId);
    formData.set("userId", selectedUserId);
    formData.set("roleId", roleId);

    startTransition(async () => {
      const result = await removeRoleForSuperAdminAction(formData);

      if (result.status === "success") {
        setAssignments((current) =>
          current.filter((assignment) => assignment.roleId !== roleId)
        );
        setMessage(result.message ?? "Role removed.");
      } else {
        setError(result.message ?? "Could not remove role.");
      }
    });
  }

  const selectedUser = users.find((user) => user.id === selectedUserId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>User Role Management</CardTitle>
        <CardDescription>
          Assign organization roles to users. Permissions are inherited from
          the selected role.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {message ? (
          <div
            role="status"
            className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm"
          >
            {message}
          </div>
        ) : null}

        {error ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        ) : null}

        <div className="space-y-2">
          <label
            htmlFor="user-role-user"
            className="text-sm font-medium"
          >
            User
          </label>

          <select
            id="user-role-user"
            value={selectedUserId}
            onChange={(event) =>
              refreshSelectedUser(event.target.value)
            }
            disabled={pending || users.length === 0}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {users.length === 0 ? (
              <option value="">No users found</option>
            ) : (
              users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.email} — {user.status}
                </option>
              ))
            )}
          </select>
        </div>

        {selectedUser ? (
          <div className="rounded-md border p-4 text-sm">
            <p className="font-medium">{selectedUser.email}</p>
            <p className="text-muted-foreground">
              Status: {selectedUser.status}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Current roles</h3>
            <p className="text-xs text-muted-foreground">
              EMPLOYEE is protected as the base tenant role.
            </p>
          </div>

          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No roles assigned.
            </p>
          ) : (
            <div className="space-y-2">
              {assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">{assignment.roleCode}</p>
                    <p className="text-xs text-muted-foreground">
                      {assignment.roleName}
                    </p>
                  </div>

                  {assignment.roleCode === "EMPLOYEE" ? (
                    <span className="text-xs text-muted-foreground">
                      Protected
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => removeRole(assignment.roleId)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 border-t pt-5">
          <div>
            <h3 className="text-sm font-semibold">Assign role</h3>
            <p className="text-xs text-muted-foreground">
              SUPERADMIN cannot be delegated to tenant users.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedRoleId}
              onChange={(event) => setSelectedRoleId(event.target.value)}
              disabled={pending || availableRoles.length === 0}
              className="flex h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">
                {availableRoles.length === 0
                  ? "No additional roles available"
                  : "Select role"}
              </option>

              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.code} — {role.name}
                </option>
              ))}
            </select>

            <Button
              type="button"
              disabled={pending || !selectedRoleId || !selectedUserId}
              onClick={assignRole}
            >
              {pending ? "Processing..." : "Assign Role"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
