"use client";

import { startTransition, useActionState, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
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
  DynamicCustomFieldInputs,
  type DynamicCustomFieldSpec,
} from "@/features/employee-fields/dynamic-inputs";

import { EMPLOYMENT_TYPES, GENDERS } from "./constants";
import type { LinkableUser } from "./queries";
import { createEmployeeAction, type EmployeeActionState } from "./actions";

const initialState: EmployeeActionState = { status: "idle" };

const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"];

/** A custom field spec plus the profile tab it is displayed on. */
export interface CreateCustomFieldSpec extends DynamicCustomFieldSpec {
  /** Custom tab key (the definition's `section`), or null when unassigned. */
  tabKey: string | null;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Menyimpan..." : "Simpan karyawan"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

/** One profile-tab block inside the create form. */
function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: HrisIconName;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--card-border)] bg-card p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className="hris-chip-blue flex size-9 shrink-0 items-center justify-center rounded-xl"
        >
          <HrisIcon name={icon} className="size-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {description ? (
            <p className="text-[13px] text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function TextField({
  label,
  name,
  type = "text",
  maxLength,
  placeholder,
  required,
  error,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  maxLength?: number;
  placeholder?: string;
  required?: boolean;
  error?: string;
  autoComplete?: string;
}) {
  const id = `new-${name}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        maxLength={maxLength}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        invalid={Boolean(error)}
      />
      <FieldError message={error} />
    </div>
  );
}

function SelectField({
  label,
  name,
  options,
  error,
  emptyLabel = "—",
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  error?: string;
  emptyLabel?: string;
}) {
  const id = `new-${name}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name={name}
        defaultValue=""
        aria-invalid={Boolean(error) || undefined}
        className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <option value="">{emptyLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

const asOptions = (values: readonly string[]) =>
  values.map((value) => ({ value, label: value }));

/**
 * "Add employee" dialog (client leaf), laid out like the employee profile:
 * Account & identity, Personal, Employment, then each custom tab's fields.
 * Address, insurance, bank, family, education and documents are completed on
 * the profile, which opens right after saving.
 *
 * Submission runs in `createEmployeeAction`, which re-checks authentication,
 * `employees.create` and — per section — the same permissions as the profile
 * tabs, and always uses the caller's organization. The form is submitted via
 * a transition (not `<form action>`) so a validation error keeps every value.
 */
export function CreateEmployeeDialog({
  linkableUsers,
  customFieldSpecs = [],
  customTabs = [],
  workLocations = [],
  managers = [],
  canPersonal = false,
  canEmployment = false,
}: {
  linkableUsers: LinkableUser[];
  customFieldSpecs?: CreateCustomFieldSpec[];
  customTabs?: { tabKey: string; name: string }[];
  workLocations?: { id: string; name: string }[];
  managers?: { id: string; employeeNumber: string; name: string }[];
  canPersonal?: boolean;
  canEmployment?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createEmployeeAction, initialState);

  const errors = state.fieldErrors;
  const tabKeys = new Set(customTabs.map((tab) => tab.tabKey));
  const tabGroups = customTabs
    .map((tab) => ({
      tab,
      specs: customFieldSpecs.filter((spec) => spec.tabKey === tab.tabKey),
    }))
    .filter((group) => group.specs.length > 0);
  const otherSpecs = customFieldSpecs.filter(
    (spec) => !spec.tabKey || !tabKeys.has(spec.tabKey)
  );

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HrisIcon name="user-plus" className="size-4" />
        Tambah karyawan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl bg-[#F7F8FC] dark:bg-card">
          <DialogHeader>
            <DialogTitle>Tambah karyawan</DialogTitle>
            <DialogDescription>
              Isian mengikuti tab profil karyawan. Status awal Aktif; alamat,
              asuransi, rekening, keluarga, pendidikan dan dokumen dilengkapi
              di profil setelah disimpan.
            </DialogDescription>
          </DialogHeader>

          {state.message && state.status === "error" ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </div>
          ) : null}
          {errors && Object.keys(errors).length > 0 && !state.message ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Periksa kembali isian yang ditandai.
              {Object.entries(errors)
                .filter(([key]) => key.startsWith("cf:"))
                .map(([key, message]) => (
                  <p key={key}>{message}</p>
                ))}
            </div>
          ) : null}

          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startTransition(() => formAction(formData));
            }}
          >
            <Section
              icon="user"
              title="Akun & Identitas"
              description="Data utama yang tampil di Overview profil."
            >
              <TextField
                label="Employee number"
                name="employeeNumber"
                placeholder="mis. EMP-0001"
                required
                error={errors?.employeeNumber}
              />
              <TextField
                label="Hire date"
                name="hireDate"
                type="date"
                error={errors?.hireDate}
              />
              <TextField
                label="First name"
                name="firstName"
                autoComplete="given-name"
                required
                error={errors?.firstName}
              />
              <TextField
                label="Last name"
                name="lastName"
                autoComplete="family-name"
                error={errors?.lastName}
              />
              <TextField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                error={errors?.email}
              />
              <div className="space-y-2">
                <Label htmlFor="new-userId">Linked account</Label>
                <select
                  id="new-userId"
                  name="userId"
                  defaultValue=""
                  disabled={linkableUsers.length === 0}
                  className="flex h-10 w-full rounded-xl border border-input bg-card px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <option value="">
                    {linkableUsers.length === 0
                      ? "Tidak ada akun yang bisa ditautkan"
                      : "Tanpa akun"}
                  </option>
                  {linkableUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.email}
                    </option>
                  ))}
                </select>
                <FieldError message={errors?.userId} />
              </div>
            </Section>

            {canPersonal ? (
              <Section icon="profile" title="Personal" description="Sama dengan tab Personal di profil.">
                <TextField label="NIK" name="nik" maxLength={32} error={errors?.nik} />
                <TextField label="Nickname" name="nickname" maxLength={100} error={errors?.nickname} />
                <TextField label="Birth date" name="birthDate" type="date" error={errors?.birthDate} />
                <TextField label="Birth place" name="birthPlace" maxLength={200} error={errors?.birthPlace} />
                <SelectField label="Gender" name="gender" options={asOptions(GENDERS)} error={errors?.gender} />
                <TextField label="Religion" name="religion" maxLength={50} error={errors?.religion} />
                <SelectField
                  label="Marital status"
                  name="maritalStatus"
                  options={asOptions(MARITAL_STATUSES)}
                  error={errors?.maritalStatus}
                />
                <TextField label="Nationality" name="nationality" maxLength={50} error={errors?.nationality} />
                <TextField
                  label="Personal email"
                  name="personalEmail"
                  type="email"
                  maxLength={254}
                  error={errors?.personalEmail}
                />
                <TextField label="Phone" name="phone" type="tel" maxLength={30} error={errors?.phone} />
              </Section>
            ) : (
              <Section icon="profile" title="Kontak">
                <TextField label="Phone" name="phone" type="tel" maxLength={30} error={errors?.phone} />
              </Section>
            )}

            {canEmployment ? (
              <Section icon="briefcase" title="Employment" description="Sama dengan tab Employment di profil; tercatat sebagai riwayat pertama.">
                <TextField label="Division" name="division" maxLength={100} error={errors?.division} />
                <TextField label="Department" name="department" maxLength={100} error={errors?.department} />
                <TextField label="Position" name="position" maxLength={100} error={errors?.position} />
                <SelectField
                  label="Employment type"
                  name="employmentType"
                  options={asOptions(EMPLOYMENT_TYPES)}
                  error={errors?.employmentType}
                />
                <SelectField
                  label="Work location"
                  name="workLocationId"
                  options={workLocations.map((location) => ({
                    value: location.id,
                    label: location.name,
                  }))}
                  error={errors?.workLocationId}
                />
                <SelectField
                  label="Manager"
                  name="managerId"
                  options={managers.map((manager) => ({
                    value: manager.id,
                    label: `${manager.employeeNumber} — ${manager.name}`,
                  }))}
                  error={errors?.managerId}
                />
                <TextField label="Contract start" name="contractStart" type="date" error={errors?.contractStart} />
                <TextField label="Contract end" name="contractEnd" type="date" error={errors?.contractEnd} />
              </Section>
            ) : null}

            {tabGroups.map(({ tab, specs }) => (
              <section
                key={tab.tabKey}
                className="rounded-2xl border border-[var(--card-border)] bg-card p-4 sm:p-5"
              >
                <h3 className="mb-4 flex items-center gap-3 text-[15px] font-semibold text-foreground">
                  <span
                    aria-hidden="true"
                    className="hris-chip-violet flex size-9 items-center justify-center rounded-xl"
                  >
                    <HrisIcon name="layers" className="size-[18px]" />
                  </span>
                  {tab.name}
                </h3>
                <DynamicCustomFieldInputs
                  specs={specs}
                  idPrefix={`cf-${tab.tabKey}`}
                  legend={null}
                />
              </section>
            ))}
            {otherSpecs.length > 0 ? (
              <section className="rounded-2xl border border-[var(--card-border)] bg-card p-4 sm:p-5">
                <h3 className="mb-4 flex items-center gap-3 text-[15px] font-semibold text-foreground">
                  <span
                    aria-hidden="true"
                    className="hris-chip-violet flex size-9 items-center justify-center rounded-xl"
                  >
                    <HrisIcon name="employee-fields" className="size-[18px]" />
                  </span>
                  Custom fields
                </h3>
                <DynamicCustomFieldInputs specs={otherSpecs} legend={null} />
              </section>
            ) : null}

            <DialogFooter className="pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <SubmitButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
