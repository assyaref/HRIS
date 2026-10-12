"use client";

import { useRef, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { notifier } from "@/lib/notifier";

import {
  confirmExcelImportAction,
  previewExcelImportAction,
  type ExcelImportPreviewResult,
} from "./import-action";

import type { ImportSettings } from "./import-settings";
import type { ImportResultDetail } from "./import-settings";

import {
  accountStatusLabel,
  assignmentStatusLabel,
  buildImportLogCsv,
} from "./import-log";

const initialResult: ExcelImportPreviewResult = {
  status: "idle",
  totalRows: 0,
  createCount: 0,
  updateCount: 0,
  errorCount: 0,
  previewErrors: [],
  sheetNames: [],
  plan: [],
};

const initialSettings: ImportSettings = {
  organizationId: "",
  projectId: "",
  workLocationId: null,
  roleId: "",
  provisionAccounts: true,
};

const STEPS = [
  "Upload",
  "Pengaturan",
  "Validasi",
  "Preview",
  "Import",
] as const;

type PillTone = "emerald" | "sky" | "gray" | "destructive";

const PILL_TONES: Record<PillTone, string> = {
  emerald: "bg-emerald-100 text-emerald-700",
  sky: "bg-sky-100 text-sky-700",
  gray: "bg-gray-100 text-gray-700",
  destructive: "bg-destructive/10 text-destructive",
};

function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}

function accountPillTone(status: ImportResultDetail["account"]): PillTone {
  if (status === "created") return "emerald";
  if (status === "existing") return "sky";
  if (status === "failed") return "destructive";
  return "gray";
}

function assignmentPillTone(status: ImportResultDetail["assignment"]): PillTone {
  if (status === "created") return "emerald";
  if (status === "existing") return "sky";
  return "destructive";
}

function SummaryCard({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; tone: PillTone }[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <dl className="mt-2 space-y-1 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className={`font-bold ${PILL_TONES[row.tone]}`}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {STEPS.map((label, index) => {
        const done = step > index;
        const active = step === index;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={
                done
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"
                  : active
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  : "flex h-5 w-5 items-center justify-center rounded-full border border-border"
              }
            >
              {index + 1}
            </span>
            <span
              className={
                active
                  ? "font-medium text-foreground"
                  : done
                  ? "text-foreground"
                  : ""
              }
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? <span aria-hidden>—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

interface ImportExcelDialogProps {
  /** Active organizations (server-provided). For SUPERADMIN, all active orgs; for others, only their own. */
  organizations: { id: string; code: string; name: string }[];
  /** Active projects in the selected organization (server-provided). */
  projects: { id: string; code: string; name: string; organizationId: string }[];
  /** Active work locations in the selected organization (server-provided). */
  workLocations: { id: string; name: string; organizationId: string }[];
  /** Roles in the selected organization (server-provided). */
  roles: { id: string; code: string; name: string; organizationId: string }[];
  /** Whether the current user is SUPERADMIN. */
  isSuperAdmin: boolean;
  /** The user's own organization ID (for non-SUPERADMIN). */
  userOrganizationId: string | null;
}

export function ImportExcelDialog({
  organizations,
  projects,
  workLocations,
  roles,
  isSuperAdmin,
  userOrganizationId,
}: ImportExcelDialogProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] =
    useState<ExcelImportPreviewResult>(initialResult);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<ImportSettings>(defaultSettings);

  /**
   * Default wizard settings. The organization select is only shown to a
   * SUPERADMIN with more than one tenant; everyone else is fixed to their own
   * organization, so seed it from the prop (the hidden field alone never fires
   * an onChange, which previously left `organizationId` empty and made the
   * project/work-location/role lists impossible to populate).
   */
  function defaultSettings(): ImportSettings {
    return {
      ...initialSettings,
      organizationId: isSuperAdmin ? "" : userOrganizationId ?? "",
    };
  }

  function openDialog() {
    notifier.warning(
      "Excel import can UPDATE existing employees (matched by Employee No.) as well as create new ones. Review the preview carefully."
    );
    setResult(initialResult);
    setFile(null);
    setStep(0);
    setSettings(defaultSettings());
    setOpen(true);
  }

  function pickFile(next: File | null) {
    setFile(next);
    setResult(initialResult);
    setStep(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function runPreview() {
    if (!file) {
      setResult({
        ...initialResult,
        status: "error",
        message: "Choose a .xlsx file first.",
      });
      return;
    }
    // Validate settings before preview
    if (!settings.organizationId || !settings.projectId || !settings.roleId) {
      setResult({
        ...initialResult,
        status: "error",
        message: "Organization, Project, dan Role wajib diisi.",
      });
      setStep(1); // Go back to Pengaturan step
      return;
    }
    setBusy(true);
    setStep(2);
    try {
      const payload = new FormData();
      payload.append("excelFile", file);
      // Include settings in the preview payload
      payload.append("settings", JSON.stringify(settings));
      const next = await previewExcelImportAction(initialResult, payload);
      setResult(next);
      if (next.status === "error") {
        setStep(0);
      } else {
        setStep(3);
      }
    } catch {
      setResult({
        ...initialResult,
        status: "error",
        message: "Could not validate the file. Please try again.",
      });
      setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!file) return;
    setBusy(true);
    setStep(4);
    try {
      const payload = new FormData();
      payload.append("excelFile", file);
      payload.append("settings", JSON.stringify(settings));
      const next = await confirmExcelImportAction(result, payload);
      setResult(next);
      if (next.status === "success") {
        notifier.success(next.message ?? "Excel import complete.");
        router.refresh();
      } else {
        notifier.error(next.message ?? "Import failed.");
        setStep(3);
      }
    } catch {
      setResult({
        ...initialResult,
        status: "error",
        message: "Could not process the import request. Please try again.",
      });
      setStep(0);
    } finally {
      setBusy(false);
    }
  }

  function downloadImportLog() {
    if (!result.details || result.details.length === 0) return;
    const { csv, filename } = buildImportLogCsv(result.details);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  const importCount = result.createCount + result.updateCount;

  // Filter projects by selected organization
  const filteredProjects = projects.filter(
    (p) => p.organizationId === settings.organizationId
  );
  // Filter work locations by selected organization
  const filteredWorkLocations = workLocations.filter(
    (wl) => wl.organizationId === settings.organizationId
  );
  // Filter roles by selected organization
  const filteredRoles = roles.filter(
    (r) => r.organizationId === settings.organizationId
  );

  // For non-SUPERADMIN, organization is fixed to their own
  const effectiveOrganizations = isSuperAdmin
    ? organizations
    : organizations.filter((o) => o.id === userOrganizationId);

  /**
   * Target organization label for the result screen. Prefers the name the
   * server validated and wrote to; falls back to the selected organization
   * from the option list. Never derived from the client payload.
   */
  const targetOrganization = result.targetOrganization ?? null;
  const targetOrganizationName =
    targetOrganization?.name ||
    effectiveOrganizations.find((o) => o.id === settings.organizationId)?.name ||
    null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={openDialog}
        aria-label="Import employees from Excel"
      >
        Import Excel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import employees from Excel</DialogTitle>
            <DialogDescription>
              Unknown Employee No. rows are created; existing rows are
              updated. Custom Fields and the section sheets are applied
              dynamically from your organization&apos;s active field
              definitions.
            </DialogDescription>
          </DialogHeader>

          <StepIndicator step={step} />

          {result.status === "error" && result.message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {result.message}
            </div>
          ) : null}

          {result.status === "success" ? (
            <div
              role="status"
              className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700"
            >
              {result.message}
            </div>
          ) : null}

          {/* Step 0: Upload */}
          {step === 0 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="excel-file" className="text-sm font-medium">
                  Excel workbook (.xlsx)
                </label>
                <input
                  ref={inputRef}
                  id="excel-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={busy}
                  onChange={(event) =>
                    pickFile(event.target.files?.[0] ?? null)
                  }
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Start from the downloadable template. Maximum 500 employees
                per import.
              </p>
            </div>
          ) : null}

          {/* Step 1: Pengaturan */}
          {step === 1 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="organization">Organization *</Label>
                {isSuperAdmin && effectiveOrganizations.length > 1 ? (
                  <select
                    value={settings.organizationId}
                    onChange={(e) => {
                      setSettings((prev) => ({
                        ...prev,
                        organizationId: e.target.value,
                        projectId: "",
                        workLocationId: null,
                        roleId: "",
                      }));
                    }}
                    disabled={busy}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="">Pilih Organization</option>
                    {effectiveOrganizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name} ({org.code})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {effectiveOrganizations[0]?.name ?? "—"}
                    <input
                      type="hidden"
                      name="organizationId"
                      value={effectiveOrganizations[0]?.id ?? ""}
                      onChange={(e) => setSettings((prev) => ({ ...prev, organizationId: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="project">Project *</Label>
                <select
                  value={settings.projectId}
                  onChange={(e) => {
                    setSettings((prev) => ({
                      ...prev,
                      projectId: e.target.value,
                      workLocationId: null,
                    }));
                  }}
                  disabled={busy || !settings.organizationId || filteredProjects.length === 0}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Pilih Project</option>
                  {filteredProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
                {!settings.organizationId && (
                  <p className="text-xs text-muted-foreground">
                    Pilih Organization terlebih dahulu.
                  </p>
                )}
                {settings.organizationId && filteredProjects.length === 0 && (
                  <p className="text-xs text-destructive">
                    Tidak ada project aktif di Organization ini.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="workLocation">Work Location</Label>
                <select
                  value={settings.workLocationId ?? ""}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, workLocationId: e.target.value || null }))
                  }
                  disabled={busy || !settings.organizationId || filteredWorkLocations.length === 0}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Pilih Work Location (opsional)</option>
                  {filteredWorkLocations.map((wl) => (
                    <option key={wl.id} value={wl.id}>
                      {wl.name}
                    </option>
                  ))}
                </select>
                {!settings.organizationId && (
                  <p className="text-xs text-muted-foreground">
                    Pilih Organization terlebih dahulu.
                  </p>
                )}
                {settings.organizationId && filteredWorkLocations.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Tidak ada work location aktif di Organization ini.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <select
                  value={settings.roleId}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, roleId: e.target.value }))
                  }
                  disabled={busy || !settings.organizationId || filteredRoles.length === 0}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">Pilih Role</option>
                  {filteredRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} ({role.code})
                    </option>
                  ))}
                </select>
                {!settings.organizationId && (
                  <p className="text-xs text-muted-foreground">
                    Pilih Organization terlebih dahulu.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="provisionAccounts">Account Provisioning</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="provisionAccounts"
                    checked={settings.provisionAccounts}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, provisionAccounts: e.target.checked }))
                    }
                    disabled={busy}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <Label htmlFor="provisionAccounts" className="text-sm font-medium">
                    Otomatis buat akun login untuk karyawan baru
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Password awal: Employee Number. Karyawan wajib ganti password
                  pada login pertama.
                </p>
              </div>
            </div>
          ) : null}

          {/* Step 2: Validasi */}
          {step === 2 ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Memvalidasi file Excel...
              </p>
            </div>
          ) : null}

          {/* Step 3: Preview */}
          {step === 3 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  <span className="font-medium">{result.totalRows}</span> total
                  rows
                </span>
                <span className="text-emerald-700">
                  <span className="font-medium">{result.createCount}</span> to
                  create
                </span>
                <span className="text-sky-700">
                  <span className="font-medium">{result.updateCount}</span> to
                  update
                </span>
                <span className="text-destructive">
                  <span className="font-medium">{result.errorCount}</span> with
                  errors
                </span>
              </div>
              {result.message ? (
                <p className="text-sm text-muted-foreground">
                  {result.message}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {result.sheetNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-border px-2 py-0.5"
                  >
                    {name}
                  </span>
                ))}
              </div>
              {result.previewErrors.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded-md border border-destructive/40">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Validation errors</caption>
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="p-2 font-mono">Row</th>
                        <th className="p-2">Employee No.</th>
                        <th className="p-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.previewErrors.map((error, index) => (
                        <tr
                          key={`${error.rowNumber}-${index}`}
                          className="border-b border-border/60"
                        >
                          <td className="p-2 font-mono text-xs">
                            {error.rowNumber || "—"}
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {error.employeeNumber || "—"}
                          </td>
                          <td className="p-2 text-sm text-destructive">
                            {error.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700">
                  No validation errors — the workbook can be imported.
                </div>
              )}
            </div>
          ) : null}

          {/* Step 4: Import */}
          {step === 4 && result.status !== "success" ? (
            <p className="text-sm text-muted-foreground">
              Importing {importCount} row(s). Please keep this dialog open.
            </p>
          ) : null}

          {/* Success Result */}
          {result.status === "success" ? (
            <div className="space-y-4">
              <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700">
                {result.message}
              </div>
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  Import Completed
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {result.summary?.employeesCreated ?? result.createCount} karyawan dibuat,{" "}
                  {result.summary?.employeesUpdated ?? result.updateCount} karyawan diperbarui
                  {targetOrganizationName
                    ? ` di Organisasi: ${targetOrganizationName}`
                    : ""}
                  . {result.errorCount > 0 ? `${result.errorCount} error.` : "0 error."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <SummaryCard
                  title="Employees"
                  rows={[
                    {
                      label: "Created",
                      value: result.summary?.employeesCreated ?? result.createCount,
                      tone: "emerald",
                    },
                    {
                      label: "Updated",
                      value: result.summary?.employeesUpdated ?? result.updateCount,
                      tone: "sky",
                    },
                    {
                      label: "Failed",
                      value: result.summary?.employeesFailed ?? 0,
                      tone: "destructive",
                    },
                  ]}
                />
                <SummaryCard
                  title="Accounts"
                  rows={[
                    {
                      label: "Created",
                      value: result.summary?.accountsCreated ?? 0,
                      tone: "emerald",
                    },
                    {
                      label: "Existing",
                      value: result.summary?.accountsExisting ?? 0,
                      tone: "sky",
                    },
                    {
                      label: "Failed",
                      value: result.summary?.accountsFailed ?? 0,
                      tone: "destructive",
                    },
                  ]}
                />
                <SummaryCard
                  title="Assignments"
                  rows={[
                    {
                      label: "Created",
                      value: result.summary?.assignmentsCreated ?? 0,
                      tone: "emerald",
                    },
                    {
                      label: "Existing",
                      value: result.summary?.assignmentsExisting ?? 0,
                      tone: "sky",
                    },
                    {
                      label: "Failed",
                      value: result.summary?.assignmentsFailed ?? 0,
                      tone: "destructive",
                    },
                  ]}
                />
              </div>
              {(result.summary?.accountsCreated ?? 0) > 0 ? (
                <div className="rounded-md border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-sm text-sky-700">
                  Initial password is the Employee Number. The employee must
                  change it after first login.
                </div>
              ) : null}
              {result.errors && result.errors.length > 0 ? (
                <div
                  role="alert"
                  className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-destructive">Import Errors</p>
                  {result.errors.map((error, index) => (
                    <p key={index} className="text-destructive">
                      {error}
                    </p>
                  ))}
                </div>
              ) : null}
              {result.warnings && result.warnings.length > 0 ? (
                <div className="space-y-1 rounded-md border border-amber-600/40 bg-amber-600/10 px-3 py-2 text-sm">
                  <p className="font-semibold text-amber-700">Warnings</p>
                  {result.warnings.map((warning, index) => (
                    <p key={index} className="text-amber-700">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
              {result.details && result.details.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Import details</caption>
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="p-2">Employee No.</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">Action</th>
                        <th className="p-2">Account</th>
                        <th className="p-2">Assignment</th>
                        <th className="p-2">Organization</th>
                        <th className="p-2">Project</th>
                        <th className="p-2">Work Location</th>
                        <th className="p-2">Role</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.details.map((detail, index) => (
                        <tr
                          key={`${detail.row}-${index}`}
                          className="border-b border-border/60"
                        >
                          <td className="p-2 font-mono text-xs">
                            {detail.employeeNumber}
                          </td>
                          <td className="p-2 text-sm">{detail.employeeName}</td>
                          <td className="p-2 text-sm">{detail.email || "—"}</td>
                          <td className="p-2">
                            <StatusPill
                              tone={
                                detail.operation === "create"
                                  ? "emerald"
                                  : detail.operation === "update"
                                  ? "sky"
                                  : "gray"
                              }
                            >
                              {detail.operation === "create"
                                ? "CREATE"
                                : detail.operation === "update"
                                ? "UPDATE"
                                : detail.operation.toUpperCase()}
                            </StatusPill>
                          </td>
                          <td className="p-2">
                            <StatusPill tone={accountPillTone(detail.account)}>
                              {accountStatusLabel(detail.account)}
                            </StatusPill>
                          </td>
                          <td className="p-2">
                            <StatusPill tone={assignmentPillTone(detail.assignment)}>
                              {assignmentStatusLabel(detail.assignment)}
                            </StatusPill>
                          </td>
                          <td className="p-2 text-sm">{detail.organization || "—"}</td>
                          <td className="p-2 text-sm">{detail.project || "—"}</td>
                          <td className="p-2 text-sm">{detail.workLocation || "—"}</td>
                          <td className="p-2 text-sm">{detail.role || "—"}</td>
                          <td className="p-2">
                            <StatusPill tone={detail.error ? "destructive" : "emerald"}>
                              {detail.error ? "FAILED" : "SUCCESS"}
                            </StatusPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {result.status === "success" ? (
              <>
                <Button
                  type="button"
                  disabled={!result.details || result.details.length === 0}
                  onClick={downloadImportLog}
                >
                  Download Import Log
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={!targetOrganization?.id}
                  onClick={() => {
                    const organizationId = targetOrganization?.id;
                    setOpen(false);
                    router.push(
                      organizationId
                        ? `/employees?org=${organizationId}`
                        : "/employees"
                    );
                  }}
                >
                  Lihat Karyawan
                  {targetOrganizationName ? ` ${targetOrganizationName}` : ""}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setOpen(false);
                    router.refresh();
                  }}
                >
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                {step >= 3 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setResult(initialResult);
                      setStep(0);
                    }}
                  >
                    Re-upload
                  </Button>
                ) : null}
                {step === 0 ? (
                  <Button
                    type="button"
                    disabled={!file || busy}
                    onClick={runPreview}
                  >
                    {busy ? "Validating..." : "Validate"}
                  </Button>
                ) : step === 1 ? (
                  <Button
                    type="button"
                    disabled={
                      busy ||
                      !settings.organizationId ||
                      !settings.projectId ||
                      !settings.roleId
                    }
                    onClick={runPreview}
                  >
                    {busy ? "Validating..." : "Validate"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={
                      busy || result.errorCount > 0 || importCount === 0
                    }
                    onClick={runConfirm}
                  >
                    {busy
                      ? "Importing..."
                      : `Import ${importCount} record${
                          importCount === 1 ? "" : "s"
                        }`}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}