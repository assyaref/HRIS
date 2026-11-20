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
import {
  CUSTOM_FIELD_LOCATIONS,
  HEADER_SECTION,
  type CustomFieldLocation,
} from "@/features/employee-tabs/validation";
import type { EmployeeCustomTab } from "@/features/employee-tabs/queries";

/** The custom tabs a field may be assigned to on the Display Location form. */
type PlaceableTab = Pick<EmployeeCustomTab, "tabKey" | "name" | "icon" | "status">;

/**
 * Derive the Display Location select state from a stored `section`: the header
 * sentinel, a custom tab key, or a built-in system section. Unknown/legacy
 * values fall back to `system-tab` so the raw `section` is still posted and
 * nothing existing is rewritten.
 */
function placementFromSection(
  section: string,
  customTabs: readonly PlaceableTab[]
): { location: CustomFieldLocation; tabKey: string } {
  if (section === HEADER_SECTION) return { location: "header", tabKey: "" };
  const tab = customTabs.find((candidate) => candidate.tabKey === section);
  if (tab) return { location: "custom-tab", tabKey: tab.tabKey };
  return { location: "system-tab", tabKey: "" };
}

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
    return <Badge className="border-emerald-600/40 bg-emerald-600/10 text-emerald-700">Aktif</Badge>;
  }
  if (status === "inactive") {
    return <Badge variant="outline">Nonaktif</Badge>;
  }
  return <Badge variant="outline">Diarsipkan</Badge>;
}

function FieldForm({
  definition,
  roleOptions,
  customTabs,
  onSubmit,
  submitLabel,
  onDone,
}: {
  definition: EmployeeFieldDefinition | null;
  roleOptions: { value: string; label: string }[];
  customTabs: readonly PlaceableTab[];
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
  // Only ACTIVE tabs are assignable: a retired tab's fields fall back to the
  // built-in Custom Fields tab, so a field must not be newly parked on one.
  const assignableTabs = customTabs.filter((tab) => tab.status === "active");
  const [placement, setPlacement] = useState<CustomFieldLocation>(
    placementFromSection(definition?.section ?? "Lainnya", customTabs).location
  );
  const [tabKey, setTabKey] = useState(
    placementFromSection(definition?.section ?? "Lainnya", customTabs).tabKey
  );

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
        notifier.error(state.message ?? "Silakan perbaiki field yang ditandai.");
        return;
      }
      notifier.success(state.message ?? "Field disimpan.");
      setErrors({});
      event.currentTarget.reset();
      onDone?.();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-key`}>Kunci field</Label>
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
            Huruf kecil, angka, dan garis bawah. Tidak dapat diubah setelah dibuat.
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
          <Label htmlFor={`${formId}-type`}>Jenis</Label>
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
          <Label htmlFor={`${formId}-displayLocation`}>Lokasi tampilan</Label>
          <select
            id={`${formId}-displayLocation`}
            name="displayLocation"
            value={placement}
            onChange={(event) =>
              setPlacement(event.target.value as CustomFieldLocation)
            }
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {CUSTOM_FIELD_LOCATIONS.map((value) => (
              <option key={value} value={value}>
                {value === "header"
                  ? "Judul bagian"
                  : value === "custom-tab"
                    ? "Custom Tab"
                    : "Tab Sistem"}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Tempat field ini tampil di profil karyawan.
          </p>
        </div>
        {placement === "system-tab" ? (
          <div className="space-y-2">
            <Label htmlFor={`${formId}-section`}>Bagian</Label>
            <select
              id={`${formId}-section`}
              name="section"
              defaultValue={definition?.section ?? "Lainnya"}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {BUILTIN_FIELD_SECTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {placement === "custom-tab" ? (
          <div className="space-y-2">
            <Label htmlFor={`${formId}-customTabKey`}>Tab kustom</Label>
            <select
              id={`${formId}-customTabKey`}
              name="customTabKey"
              value={tabKey}
              onChange={(event) => setTabKey(event.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Pilih tab...</option>
              {assignableTabs.map((tab) => (
                <option key={tab.tabKey} value={tab.tabKey}>
                  {tab.icon ? `${tab.icon} ${tab.name}` : tab.name}
                </option>
              ))}
            </select>
            {errors.form ? (
              <p className="text-sm text-destructive">{errors.form}</p>
            ) : null}
          </div>
        ) : null}
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
          <Label htmlFor={`${formId}-description`}>Deskripsi</Label>
          <Input
            id={`${formId}-description`}
            name="description"
            defaultValue={definition?.description ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-displayOrder`}>Urutan tampilan</Label>
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
              <option value="active">Aktif</option>
              <option value="inactive">Nonaktif</option>
              <option value="archived">Diarsipkan</option>
            </select>
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Visibilitas (kode peran)</Label>
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
          <Label>Dapat diubah oleh (kode peran)</Label>
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
          Wajib
        </label>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan..." : submitLabel}
      </Button>
    </form>
  );
}

function RowActions({
  definition,
  canUpdate,
  canDelete,
  roleOptions,
  customTabs,
  onDone,
}: {
  definition: EmployeeFieldDefinition;
  canUpdate: boolean;
  canDelete: boolean;
  roleOptions: { value: string; label: string }[];
  customTabs: readonly PlaceableTab[];
  onDone: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<EmployeeFieldActionState>) {
    startTransition(async () => {
      const state = await action();
      if (state.status === "error") {
        notifier.error(state.message ?? "Tindakan gagal.");
      } else {
        notifier.success(state.message ?? "Selesai.");
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
            Duplikasi
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
              Nonaktifkan
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
              Aktifkan
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
          >
            Ubah
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
          Arsipkan
        </Button>
      ) : null}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Ubah field</DialogTitle>
            <DialogDescription>
              Kunci field tidak dapat diubah agar nilai historis tetap tertaut.
            </DialogDescription>
          </DialogHeader>
          <FieldForm
            definition={definition}
            roleOptions={roleOptions}
            customTabs={customTabs}
            submitLabel="Simpan perubahan"
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
  customTabs,
}: {
  definitions: EmployeeFieldDefinition[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  roleOptions: { value: string; label: string }[];
  customTabs: readonly PlaceableTab[];
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
        notifier.error(state.message ?? "Pengurutan ulang gagal.");
      } else {
        notifier.success(state.message ?? "Urutan disimpan.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Definisi field kustom</CardTitle>
          <CardDescription>
            Field di sini menentukan tab Field Kustom, template Excel, validasi impor, dan kolom ekspor — secara dinamis.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {canCreate ? (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => setShowCreate((current) => !current)}
              >
                {showCreate ? "Batal" : "New field"}
              </Button>
            </div>
          ) : null}
          {canCreate && showCreate ? (
            <Card>
              <CardHeader>
                <CardTitle>Buat field</CardTitle>
              </CardHeader>
              <CardContent>
                <FieldForm
                  definition={null}
                  roleOptions={roleOptions}
                  customTabs={customTabs}
                  submitLabel="Buat field"
                  onSubmit={createEmployeeFieldAction}
                  onDone={() => setShowCreate(false)}
                />
              </CardContent>
            </Card>
          ) : null}

          {ordered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada field. Buat satu — misalnya Ukuran Baju (pilihan S, M, L) — dan field itu otomatis tampil di semua tempat.
            </p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Kunci</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Bagian</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Urutan</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
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
                              aria-label="Pindah ke atas"
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => move(definition.id, 1)}
                              aria-label="Pindah ke bawah"
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
                          customTabs={customTabs}
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
