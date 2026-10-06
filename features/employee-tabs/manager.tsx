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
  createCustomTabAction,
  reorderCustomTabsAction,
  setCustomTabStatusAction,
  updateCustomTabAction,
  type EmployeeTabActionState,
} from "./actions";
import type { EmployeeCustomTab } from "./queries";
import { CUSTOM_TAB_STATUSES, normalizeTabKey, TAB_KEY_PATTERN } from "./validation";
import { suggestedCustomTabDisplayOrder, SYSTEM_TABS } from "./tabs";

/**
 * Employee Tabs manager (Settings → Employee Fields, "Employee Tabs" card).
 *
 * Full lifecycle: create, edit, activate/deactivate and reorder. Every
 * mutation goes through a server action that re-checks auth, the
 * organization scope and the `employee_fields.*` permissions; this
 * component is UI only. Active tabs flow automatically into the employee
 * profile tab strip, the Excel template, import and export.
 */

function statusBadge(status: string) {
  if (status === "active") {
    return (
      <Badge className="border-emerald-600/40 bg-emerald-600/10 text-emerald-700">
        Active
      </Badge>
    );
  }
  return <Badge variant="outline">Inactive</Badge>;
}

function TabForm({
  tab,
  roleOptions,
  defaultDisplayOrder,
  submitLabel,
  onSubmit,
  onDone,
}: {
  tab: EmployeeCustomTab | null;
  roleOptions: { value: string; label: string }[];
  defaultDisplayOrder: number;
  submitLabel: string;
  onSubmit: (
    prevState: EmployeeTabActionState,
    formData: FormData
  ) => Promise<EmployeeTabActionState>;
  onDone?: () => void;
}) {
  const formId = useId();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState(tab?.tabKey ?? "");
  const [name, setName] = useState(tab?.name ?? "");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErrors({});
    startTransition(async () => {
      const state = await onSubmit({ status: "idle" }, formData);
      if (state.status === "error") {
        setErrors(state.fieldErrors ?? {});
        notifier.error(state.message ?? "Please fix the highlighted fields.");
        return;
      }
      notifier.success(state.message ?? "Tab saved.");
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-name`}>Tab name</Label>
          <Input
            id={`${formId}-name`}
            name="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!tab) {
                const normalized = normalizeTabKey(event.target.value);
                setKey(normalized);
              }
            }}
            required
            placeholder="e.g. Sertifikasi"
          />
          {errors.name ? (
            <p className="text-sm text-destructive">{errors.name}</p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-key`}>Tab key</Label>
          <Input
            id={`${formId}-key`}
            name="tabKey"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            readOnly={Boolean(tab)}
            required
            placeholder="e.g. certification"
          />
          {errors.tabKey ? (
            <p className="text-sm text-destructive">{errors.tabKey}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Lowercase letters, digits and underscores. Immutable once
            created{!tab && key && !TAB_KEY_PATTERN.test(key) ? " — the auto key is not valid yet." : "."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-icon`}>Icon (optional)</Label>
          <Input
            id={`${formId}-icon`}
            name="icon"
            defaultValue={tab?.icon ?? ""}
            maxLength={24}
            placeholder="e.g. 🎓"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-displayOrder`}>Display order</Label>
          <Input
            id={`${formId}-displayOrder`}
            name="displayOrder"
            type="number"
            min={0}
            max={9999}
            defaultValue={
              tab?.displayOrder ?? defaultDisplayOrder
            }
            required
          />
          <p className="text-xs text-muted-foreground">
            Position between system tabs (e.g. 70 sits between Bank Account
            at 60 and Family at 90).
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${formId}-description`}>Description (optional)</Label>
          <Input
            id={`${formId}-description`}
            name="description"
            defaultValue={tab?.description ?? ""}
            placeholder="What belongs on this tab?"
          />
          {errors.description ? (
            <p className="text-sm text-destructive">{errors.description}</p>
          ) : null}
        </div>
        {tab ? (
          <div className="space-y-2">
            <Label htmlFor={`${formId}-status`}>Status</Label>
            <select
              id={`${formId}-status`}
              name="status"
              defaultValue={tab.status}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CUSTOM_TAB_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value === "active" ? "Active" : "Inactive"}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Visibility (role codes)</Label>
          <div className="flex flex-wrap gap-3">
            {roleOptions.map((role) => (
              <label
                key={role.value}
                className="flex items-center gap-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  name="visibilityRoles"
                  value={role.value}
                  defaultChecked={tab?.visibilityConfig.includes(role.value)}
                  className="h-4 w-4 rounded border-input"
                />
                {role.label}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Empty = visible to every role that can view employee custom data.
          </p>
        </div>
      </div>
      {errors.form ? (
        <p className="text-sm text-destructive">{errors.form}</p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}

function RowActions({
  tab,
  canUpdate,
  roleOptions,
  onDone,
}: {
  tab: EmployeeCustomTab;
  canUpdate: boolean;
  roleOptions: { value: string; label: string }[];
  onDone: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<EmployeeTabActionState>) {
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
          {tab.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => run(() => setCustomTabStatusAction(tab.id, "inactive"))}
              disabled={pending}
            >
              Deactivate
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => run(() => setCustomTabStatusAction(tab.id, "active"))}
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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit tab</DialogTitle>
            <DialogDescription>
              The tab key is immutable so fields assigned to it stay linked.
              Assign fields to this tab from the Display Location control on
              the field form.
            </DialogDescription>
          </DialogHeader>
          <TabForm
            tab={tab}
            roleOptions={roleOptions}
            defaultDisplayOrder={tab.displayOrder}
            submitLabel="Save changes"
            onSubmit={(prev, formData) =>
              updateCustomTabAction(tab.id, prev, formData)
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

export function EmployeeTabsManager({
  tabs,
  fieldCounts,
  canCreate,
  canUpdate,
  roleOptions,
}: {
  tabs: EmployeeCustomTab[];
  fieldCounts: Record<string, number>;
  canCreate: boolean;
  canUpdate: boolean;
  roleOptions: { value: string; label: string }[];
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();

  function move(id: string, direction: -1 | 1) {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const swapWith = index + direction;
    if (swapWith < 0 || swapWith >= tabs.length) return;
    const next = [...tabs];
    const [row] = next.splice(index, 1);
    next.splice(swapWith, 0, row);
    const order = next.map((tab) => tab.id);
    const formData = new FormData();
    formData.append("order", JSON.stringify(order));
    startTransition(async () => {
      const state = await reorderCustomTabsAction({ status: "idle" }, formData);
      if (state.status === "error") {
        notifier.error(state.message ?? "Reorder failed.");
      } else {
        notifier.success(state.message ?? "Order saved.");
      }
    });
  }

  const systemOrderHint = SYSTEM_TABS.filter(
    (tab) => tab.key === "bank" || tab.key === "family"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Employee Tabs</CardTitle>
        <CardDescription>
          Custom tabs appear on every employee profile between the system
          tabs, ordered by their display order (Bank Account is{" "}
          {systemOrderHint[0]?.displayOrder ?? 60}, Family is{" "}
          {systemOrderHint[1]?.displayOrder ?? 90}
          ). Fields are assigned to a tab from the Display Location control on
          the field form.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canCreate ? (
          <Button type="button" onClick={() => setShowCreate((current) => !current)}>
            {showCreate ? "Cancel" : "Add Custom Tab"}
          </Button>
        ) : null}
        {canCreate && showCreate ? (
          <Card>
            <CardHeader>
              <CardTitle>New custom tab</CardTitle>
              <CardDescription>
                The key is derived from the name and can be adjusted before
                saving.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TabForm
                tab={null}
                roleOptions={roleOptions}
                defaultDisplayOrder={suggestedCustomTabDisplayOrder(tabs.length)}
                submitLabel="Create tab"
                onSubmit={createCustomTabAction}
                onDone={() => setShowCreate(false)}
              />
            </CardContent>
          </Card>
        ) : null}

        {tabs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No custom tabs yet. Create one — for example Sertifikasi — then
            assign custom fields to it; it appears on employee profiles and
            in the Excel template, import and export automatically.
          </p>
        ) : (
          <div className="rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Tab Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Fields</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabs.map((tab, index) => (
                  <TableRow key={tab.id}>
                    <TableCell>
                      {canUpdate ? (
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending || index === 0}
                            onClick={() => move(tab.id, -1)}
                            aria-label="Move up"
                          >
                            ↑
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending || index === tabs.length - 1}
                            onClick={() => move(tab.id, 1)}
                            aria-label="Move down"
                          >
                            ↓
                          </Button>
                          <span className="w-8 text-right tabular-nums">
                            {tab.displayOrder}
                          </span>
                        </div>
                      ) : (
                        <span className="tabular-nums">{tab.displayOrder}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {tab.icon ? `${tab.icon} ` : ""}
                      {tab.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{tab.tabKey}</TableCell>
                    <TableCell>
                      <span className="tabular-nums">
                        {fieldCounts[tab.tabKey] ?? 0}
                      </span>
                      {(fieldCounts[tab.tabKey] ?? 0) === 0 ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (assign fields to show data)
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{statusBadge(tab.status)}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        tab={tab}
                        canUpdate={canUpdate}
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
  );
}
