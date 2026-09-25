import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

import type { EmployeeMasterData } from "./queries";
import type { EmployeeSectionActionState } from "./actions";
import {
  deleteAddressAction,
  deleteBankAccountAction,
  deleteDependentAction,
  deleteEducationAction,
  deleteEmployeeDocumentAction,
  saveAddressAction,
  saveBankAccountAction,
  saveDependentAction,
  saveEducationAction,
  saveInsuranceAction,
  setPrimaryBankAccountAction,
  updateEmployeeStatusAction,
  updateEmploymentDataAction,
  updatePersonalDataAction,
  uploadEmployeeDocumentAction,
} from "./actions";
import {
  ActionButton,
  Disclosure,
  FormRow,
  ListSection,
  SectionForm,
  SelectRow,
} from "./forms";
import { CustomFieldsSection, type CustomFieldSpec } from "./custom-fields-section";
import {
  formatBankAccount,
  formatNik,
  formatNpwp,
  formatBpjs,
  formatPhone,
  formatPersonalEmail,
} from "./display";

import type {
  EmployeeAddress,
  EmployeeBankAccount,
  EmployeeDependent,
  EmployeeDocument,
  EmployeeEducation,
  EmployeeInsuranceRecord,
  EmploymentHistoryRow,
} from "./types";
import type { WorkLocationOption, ManagerOption } from "./queries-options";

/**
 * Employee Master Data 2.0 tab content (server components).
 *
 * Rendering decisions (which sections/values a viewer may see) are made
 * server-side in the page using RBAC; these components receive only
 * pre-filtered props. Raw NIK/NPWP/BPJS/bank values are masked here unless
 * `revealSensitive` is true (the caller holds the section update capability).
 */

function iso(value: Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function isoDateTime(value: Date): string {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

/* ------------------------------------------------------------------ */
/* Overview                                                            */
/* ------------------------------------------------------------------ */

export function OverviewSection({
  employee,
  canUpdate,
  canDeactivate,
  organizationName,
  revealPhone,
}: {
  employee: EmployeeMasterData;
  canUpdate: boolean;
  canDeactivate: boolean;
  organizationName: string | null;
  revealPhone: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Key employee facts at a glance.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Name" value={`${employee.firstName} ${employee.lastName}`} />
          <Fact label="Employee No." value={employee.employeeNumber} mono />
          <Fact label="Status" value={employee.employmentStatus} />
          <Fact label="Organization" value={organizationName ?? "—"} />
          <Fact label="Position" value={employee.position ?? "—"} />
          <Fact label="Department" value={employee.department ?? "—"} />
          <Fact label="Division" value={employee.division ?? "—"} />
          <Fact label="Employment type" value={employee.employmentType ?? "—"} />
          <Fact label="Work location" value={employee.workLocationName ?? "—"} />
          <Fact label="Manager" value={employee.managerEmployeeNumber ?? "—"} />
          <Fact label="Hire date" value={iso(employee.hireDate) || "—"} />
          <Fact label="Email" value={employee.email ?? "—"} />
          <Fact label="Phone" value={formatPhone(employee.phone, revealPhone)} />
          <Fact
            label="Linked account"
            value={employee.linkedUserEmail ?? "none"}
          />
          <Fact label="Created" value={isoDateTime(employee.createdAt)} />
          <Fact label="Last updated" value={isoDateTime(employee.updatedAt)} />
        </CardContent>
      </Card>
      {canUpdate ? (
        <StatusToggle
          employeeId={employee.id}
          status={employee.employmentStatus}
          canDeactivate={canDeactivate}
        />
      ) : null}
    </div>
  );
}

function StatusToggle({
  employeeId,
  status,
  canDeactivate,
}: {
  employeeId: string;
  status: string;
  canDeactivate: boolean;
}) {
  const target = status === "active" ? "inactive" : "active";
  async function toggleStatusAction(formData: FormData): Promise<void> {
    "use server";
    const requested =
      formData.get("status") === "inactive" ? "inactive" : "active";
    await updateEmployeeStatusAction(employeeId, requested);
  }
  if (target === "inactive" && !canDeactivate) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Employment status</CardTitle>
        <CardDescription>
          Changing status is audited and snapshotted into the employment
          history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={toggleStatusAction}>
          <input type="hidden" name="status" value={target} />
          <ButtonLike>
            {target === "inactive" ? "Deactivate employee" : "Activate employee"}
          </ButtonLike>
        </form>
      </CardContent>
    </Card>
  );
}

function ButtonLike({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
    >
      {children}
    </button>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono text-xs" : "font-medium"}>
        {value ?? "—"}
      </span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Personal                                                            */
/* ------------------------------------------------------------------ */

export function PersonalSection({
  employee,
  canEdit,
  reveal,
}: {
  employee: EmployeeMasterData;
  canEdit: boolean;
  reveal: boolean;
}) {
  const action = updatePersonalDataAction.bind(null, employee.id);
  return (
    <SectionForm
      title="Personal data"
      description="Identity, birth and contact details. NIK is masked for viewers without update rights."
      action={action}
    >
      {canEdit ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="NIK" name="nik" value={employee.nik} maxLength={32} />
          <FormRow label="Nickname" name="nickname" value={employee.nickname} maxLength={100} />
          <FormRow label="Birth date" name="birthDate" type="date" value={iso(employee.birthDate)} />
          <FormRow label="Birth place" name="birthPlace" value={employee.birthPlace} maxLength={200} />
          <SelectRow
            label="Gender"
            name="gender"
            value={employee.gender}
            options={[
              { value: "Male", label: "Male" },
              { value: "Female", label: "Female" },
            ]}
          />
          <FormRow label="Religion" name="religion" value={employee.religion} maxLength={50} />
          <SelectRow
            label="Marital status"
            name="maritalStatus"
            value={employee.maritalStatus}
            options={[
              { value: "Single", label: "Single" },
              { value: "Married", label: "Married" },
              { value: "Divorced", label: "Divorced" },
              { value: "Widowed", label: "Widowed" },
            ]}
          />
          <FormRow label="Nationality" name="nationality" value={employee.nationality} maxLength={50} />
          <FormRow label="Personal email" name="personalEmail" type="email" value={employee.personalEmail} maxLength={254} />
          <FormRow label="Phone" name="phone" value={employee.phone} maxLength={30} />
        </div>
      ) : (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="NIK" value={formatNik(employee.nik, reveal)} />
          <Fact label="Nickname" value={employee.nickname ?? "—"} />
          <Fact label="Birth date" value={iso(employee.birthDate) || "—"} />
          <Fact label="Birth place" value={employee.birthPlace ?? "—"} />
          <Fact label="Gender" value={employee.gender ?? "—"} />
          <Fact label="Religion" value={employee.religion ?? "—"} />
          <Fact label="Marital status" value={employee.maritalStatus ?? "—"} />
          <Fact label="Nationality" value={employee.nationality ?? "—"} />
          <Fact label="Personal email" value={formatPersonalEmail(employee.personalEmail, reveal)} />
          <Fact label="Phone" value={formatPhone(employee.phone, reveal)} />
        </div>
      )}
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Employment                                                          */
/* ------------------------------------------------------------------ */

export function EmploymentSection({
  employee,
  canEdit,
  workLocations,
  managers,
}: {
  employee: EmployeeMasterData;
  canEdit: boolean;
  workLocations: WorkLocationOption[];
  managers: ManagerOption[];
}) {
  const action = updateEmploymentDataAction.bind(null, employee.id);
  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Employment</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Division" value={employee.division ?? "—"} />
          <Fact label="Department" value={employee.department ?? "—"} />
          <Fact label="Position" value={employee.position ?? "—"} />
          <Fact label="Employment type" value={employee.employmentType ?? "—"} />
          <Fact label="Work location" value={employee.workLocationName ?? "—"} />
          <Fact label="Manager" value={employee.managerEmployeeNumber ?? "—"} />
          <Fact label="Hire date" value={iso(employee.hireDate) || "—"} />
          <Fact label="Contract start" value={iso(employee.contractStart) || "—"} />
          <Fact label="Contract end" value={iso(employee.contractEnd) || "—"} />
          <Fact label="Resignation date" value={iso(employee.resignationDate) || "—"} />
          <Fact label="Termination date" value={iso(employee.terminationDate) || "—"} />
          <Fact label="Reason for leaving" value={employee.reasonForLeaving ?? "—"} />
        </CardContent>
      </Card>
    );
  }
  return (
    <SectionForm
      title="Employment"
      description="Organization assignment, position and contract. Changes are snapshotted to the History tab."
      action={action}
      submitLabel="Save employment"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Division" name="division" value={employee.division} maxLength={100} />
        <FormRow label="Department" name="department" value={employee.department} maxLength={100} />
        <FormRow label="Position" name="position" value={employee.position} maxLength={100} />
        <SelectRow
          label="Employment type"
          name="employmentType"
          value={employee.employmentType}
          options={[
            "Probation",
            "Contract",
            "Permanent",
            "Daily",
            "Internship",
            "Freelance",
          ].map((value) => ({ value, label: value }))}
        />
        <SelectRow
          label="Work location"
          name="workLocationId"
          value={employee.workLocationId}
          options={workLocations.map((location) => ({
            value: location.id,
            label: location.name,
          }))}
        />
        <SelectRow
          label="Manager"
          name="managerId"
          value={employee.managerId}
          options={managers.map((manager) => ({
            value: manager.id,
            label: `${manager.employeeNumber} — ${manager.name}`,
          }))}
        />
        <FormRow label="Contract start" name="contractStart" type="date" value={iso(employee.contractStart)} />
        <FormRow label="Contract end" name="contractEnd" type="date" value={iso(employee.contractEnd)} />
        <FormRow label="Resignation date" name="resignationDate" type="date" value={iso(employee.resignationDate)} />
        <FormRow label="Termination date" name="terminationDate" type="date" value={iso(employee.terminationDate)} />
        <FormRow label="Reason for leaving" name="reasonForLeaving" value={employee.reasonForLeaving} maxLength={500} />
        <FormRow label="History note (optional)" name="historyNotes" maxLength={500} />
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Addresses                                                           */
/* ------------------------------------------------------------------ */

export function AddressesSection({
  employeeId,
  addresses,
  canEdit,
}: {
  employeeId: string;
  addresses: EmployeeAddress[];
  canEdit: boolean;
}) {
  const ktp = addresses.find((address) => address.type === "ktp") ?? null;
  const domicile = addresses.find((address) => address.type === "domicile") ?? null;
  return (
    <ListSection
      title="Addresses"
      description="One KTP address and one Domicile address per employee."
      footer={
        canEdit ? (
          <AddressEditors employeeId={employeeId} ktp={ktp} domicile={domicile} />
        ) : null
      }
    >
      {addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No addresses recorded.</p>
      ) : addresses.map((address) => (
          <div key={address.id} className="rounded-md border border-border p-4 text-sm">
            <p className="mb-2 font-medium capitalize">
              {address.type === "ktp" ? "KTP" : "Domicile"}
              {address.sameAsKtp ? (
                <span className="ml-2 text-xs text-muted-foreground">(same as KTP)</span>
              ) : null}
            </p>
            <p>{address.address ?? "—"}</p>
            <p className="text-muted-foreground">
              {[address.rtRw, address.village, address.district]
                .filter(Boolean)
                .join(" / ") || ""}
            </p>
            <p className="text-muted-foreground">
              {[address.city, address.province, address.postalCode]
                .filter(Boolean)
                .join(", ") || "—"}
            </p>
            {canEdit ? (
              <div className="mt-3 flex items-center gap-2">
                <ActionButton
                  label="Remove"
                  action={deleteAddressAction}
                  employeeId={employeeId}
                  rowId={address.id}
                  variant="outline"
                />
                <Disclosure label="Edit">
                  <AddressEditor
                    employeeId={employeeId}
                    type={address.type === "ktp" ? "ktp" : "domicile"}
                    existing={address}
                  />
                </Disclosure>
              </div>
            ) : null}
          </div>
        ))
      }
    </ListSection>
  );
}

function AddressEditors({
  employeeId,
  ktp,
  domicile,
}: {
  employeeId: string;
  ktp: EmployeeAddress | null;
  domicile: EmployeeAddress | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AddressEditor employeeId={employeeId} type="ktp" existing={ktp} />
      <AddressEditor employeeId={employeeId} type="domicile" existing={domicile} />
    </div>
  );
}

function AddressEditor({
  employeeId,
  type,
  existing,
}: {
  employeeId: string;
  type: "ktp" | "domicile";
  existing: EmployeeAddress | null;
}) {
  const action = (
    prevState: EmployeeSectionActionState,
    formData: FormData
  ) => saveAddressAction(employeeId, existing?.id ?? null, prevState, formData);
  return (
    <SectionForm
      title={type === "ktp" ? "KTP address" : "Domicile address"}
      action={action}
      submitLabel={existing ? "Update" : "Save"}
    >
      <input type="hidden" name="type" value={type} />
      {type === "domicile" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sameAsKtp" value="on" className="h-4 w-4 rounded border-input" />
          Same as KTP
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Address" name="address" value={existing?.address} maxLength={500} />
        <FormRow label="RT/RW" name="rtRw" value={existing?.rtRw} maxLength={20} />
        <FormRow label="Village / Kelurahan" name="village" value={existing?.village} maxLength={120} />
        <FormRow label="District / Kecamatan" name="district" value={existing?.district} maxLength={120} />
        <FormRow label="City" name="city" value={existing?.city} maxLength={120} />
        <FormRow label="Province" name="province" value={existing?.province} maxLength={120} />
        <FormRow label="Postal code" name="postalCode" value={existing?.postalCode} maxLength={20} />
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Insurance / government                                             */
/* ------------------------------------------------------------------ */

export function InsuranceSection({
  employeeId,
  insurance,
  canEdit,
  reveal,
}: {
  employeeId: string;
  insurance: EmployeeInsuranceRecord | null;
  canEdit: boolean;
  reveal: boolean;
}) {
  const action = saveInsuranceAction.bind(null, employeeId);
  const value = <T,>(fn: (item: NonNullable<typeof insurance>) => T): T | undefined =>
    insurance ? fn(insurance) : undefined;
  if (!canEdit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Insurance & government</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="NPWP" value={formatNpwp(insurance?.npwp ?? null, reveal) ?? "—"} />
          <Fact label="BPJS Kesehatan No." value={formatBpjs(insurance?.bpjsKesehatanNumber ?? null, reveal) ?? "—"} />
          <Fact label="BPJS Kesehatan status" value={insurance?.bpjsKesehatanStatus ?? "—"} />
          <Fact label="BPJS Kesehatan class" value={insurance?.bpjsKesehatanClass ?? "—"} />
          <Fact label="BPJS Ketenagakerjaan No." value={formatBpjs(insurance?.bpjsKetenagakerjaanNumber ?? null, reveal) ?? "—"} />
          <Fact label="BPJS Ketenagakerjaan status" value={insurance?.bpjsKetenagakerjaanStatus ?? "—"} />
        </CardContent>
      </Card>
    );
  }
  return (
    <SectionForm
      title="Insurance & government"
      description="NPWP and BPJS registrations. Values are masked for viewers without update rights."
      action={action}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="NPWP" name="npwp" value={value((i) => (reveal ? i.npwp : formatNpwp(i.npwp, reveal)))} maxLength={30} />
        <FormRow label="BPJS Kesehatan No." name="bpjsKesehatanNumber" value={value((i) => (reveal ? i.bpjsKesehatanNumber : formatBpjs(i.bpjsKesehatanNumber, reveal)))} maxLength={30} />
        <FormRow label="BPJS Kesehatan status" name="bpjsKesehatanStatus" value={value((i) => i.bpjsKesehatanStatus)} maxLength={30} />
        <FormRow label="BPJS Kesehatan class" name="bpjsKesehatanClass" value={value((i) => i.bpjsKesehatanClass)} maxLength={10} />
        <FormRow label="BPJS Ketenagakerjaan No." name="bpjsKetenagakerjaanNumber" value={value((i) => (reveal ? i.bpjsKetenagakerjaanNumber : formatBpjs(i.bpjsKetenagakerjaanNumber, reveal)))} maxLength={30} />
        <FormRow label="BPJS Ketenagakerjaan status" name="bpjsKetenagakerjaanStatus" value={value((i) => i.bpjsKetenagakerjaanStatus)} maxLength={30} />
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Bank accounts                                                       */
/* ------------------------------------------------------------------ */

export function BankAccountsSection({
  employeeId,
  accounts,
  canEdit,
  reveal,
}: {
  employeeId: string;
  accounts: EmployeeBankAccount[];
  canEdit: boolean;
  reveal: boolean;
}) {
  return (
    <ListSection
      title="Bank accounts"
      description="One primary account per employee; account numbers are masked for viewers without update rights."
      footer={
        canEdit ? (
          <BankEditor employeeId={employeeId} reveal={reveal} />
        ) : null
      }
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bank accounts recorded.</p>
      ) : accounts.map((account) => (
          <div key={account.id} className="rounded-md border border-border p-4 text-sm">
            <p className="font-medium">
              {account.bankName}
              {account.isPrimary ? (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Primary
                </span>
              ) : null}
            </p>
            <p className="text-muted-foreground">
              {formatBankAccount(account.accountNumber, reveal)} · {account.accountHolder}
            </p>
            <p className="text-muted-foreground">
              {account.branch ?? "—"} · {account.status}
            </p>
            {canEdit ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {!account.isPrimary ? (
                  <ActionButton
                    label="Set primary"
                    action={setPrimaryBankAccountAction}
                    employeeId={employeeId}
                    rowId={account.id}
                  />
                ) : null}
                <ActionButton
                  label="Remove"
                  action={deleteBankAccountAction}
                  employeeId={employeeId}
                  rowId={account.id}
                  variant="outline"
                />
                <Disclosure label="Edit">
                  <BankEditor
                    employeeId={employeeId}
                    reveal={reveal}
                    existing={account}
                  />
                </Disclosure>
              </div>
            ) : null}
          </div>
        ))
      }
    </ListSection>
  );
}

function BankEditor({
  employeeId,
  reveal,
  existing = null,
}: {
  employeeId: string;
  reveal: boolean;
  existing?: EmployeeBankAccount | null;
}) {
  const action = (
    prevState: EmployeeSectionActionState,
    formData: FormData
  ) => saveBankAccountAction(employeeId, existing?.id ?? null, prevState, formData);
  return (
    <SectionForm
      title={existing ? `Edit ${existing.bankName}` : "Add bank account"}
      action={action}
      submitLabel={existing ? "Save account" : "Add account"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Bank name" name="bankName" value={existing?.bankName} required maxLength={100} />
        <FormRow
          label="Account number"
          name="accountNumber"
          value={existing ? (reveal ? existing.accountNumber : "") : ""}
          required={!existing}
          maxLength={40}
        />
        <FormRow label="Account holder" name="accountHolder" value={existing?.accountHolder} required maxLength={150} />
        <FormRow label="Branch" name="branch" value={existing?.branch} maxLength={120} />
        <SelectRow
          label="Status"
          name="status"
          value={existing?.status}
          options={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            name="isPrimary"
            value="on"
            defaultChecked={existing?.isPrimary ?? false}
            className="h-4 w-4 rounded border-input"
          />
          Set as primary
        </label>
      </div>
      {existing && !reveal ? (
        <p className="text-xs text-muted-foreground">
          The masked account number is preserved unless you type a new one.
        </p>
      ) : null}
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Family / dependents                                                 */
/* ------------------------------------------------------------------ */

export function FamilySection({
  employeeId,
  dependents,
  canEdit,
  reveal,
}: {
  employeeId: string;
  dependents: EmployeeDependent[];
  canEdit: boolean;
  reveal: boolean;
}) {
  return (
    <ListSection
      title="Family / dependents"
      description="Dependent NIK values are masked for viewers without personal update rights."
      footer={canEdit ? <DependentEditor employeeId={employeeId} reveal={reveal} /> : null}
    >
      {dependents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No family members recorded.</p>
      ) : dependents.map((dependent) => (
          <div key={dependent.id} className="rounded-md border border-border p-4 text-sm">
            <p className="font-medium">
              {dependent.name} · <span className="capitalize">{dependent.relationship}</span>
            </p>
            <p className="text-muted-foreground">
              {formatNik(dependent.nik, reveal) ?? "—"} · {iso(dependent.birthDate) || "—"} ·{" "}
              {dependent.gender ?? "—"}
            </p>
            <p className="text-muted-foreground">
              {[dependent.occupation, dependent.dependentStatus, dependent.bpjsStatus]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {dependent.notes ? (
              <p className="mt-1 text-muted-foreground">{dependent.notes}</p>
            ) : null}
            {canEdit ? (
              <div className="mt-3 flex items-center gap-2">
                <ActionButton
                  label="Remove"
                  action={deleteDependentAction}
                  employeeId={employeeId}
                  rowId={dependent.id}
                  variant="outline"
                />
                <Disclosure label="Edit">
                  <DependentEditor
                    employeeId={employeeId}
                    reveal={reveal}
                    existing={dependent}
                  />
                </Disclosure>
              </div>
            ) : null}
          </div>
        ))
      }
    </ListSection>
  );
}

function DependentEditor({
  employeeId,
  reveal,
  existing = null,
}: {
  employeeId: string;
  reveal: boolean;
  existing?: EmployeeDependent | null;
}) {
  const action = (
    prevState: EmployeeSectionActionState,
    formData: FormData
  ) => saveDependentAction(employeeId, existing?.id ?? null, prevState, formData);
  return (
    <SectionForm
      title={existing ? `Edit ${existing.name}` : "Add family member"}
      action={action}
      submitLabel={existing ? "Save member" : "Add member"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Name" name="name" value={existing?.name} required maxLength={150} />
        <SelectRow
          label="Relationship"
          name="relationship"
          value={existing?.relationship}
          options={["spouse", "child", "parent", "other"].map((value) => ({
            value,
            label: value,
          }))}
        />
        <FormRow
          label="NIK"
          name="nik"
          value={existing ? (reveal ? existing.nik : "") : ""}
          maxLength={32}
        />
        <FormRow label="Birth date" name="birthDate" type="date" value={existing ? iso(existing.birthDate) : ""} />
        <SelectRow
          label="Gender"
          name="gender"
          value={existing?.gender}
          options={[
            { value: "Male", label: "Male" },
            { value: "Female", label: "Female" },
          ]}
        />
        <FormRow label="Occupation" name="occupation" value={existing?.occupation} maxLength={120} />
        <FormRow label="Dependent status" name="dependentStatus" value={existing?.dependentStatus} maxLength={30} />
        <FormRow label="BPJS status" name="bpjsStatus" value={existing?.bpjsStatus} maxLength={30} />
        <FormRow label="Notes" name="notes" value={existing?.notes} maxLength={500} />
      </div>
      {reveal ? null : (
        <p className="text-xs text-muted-foreground">
          NIK is only accepted here if you may update personal data.
        </p>
      )}
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Education                                                           */
/* ------------------------------------------------------------------ */

export function EducationSection({
  employeeId,
  educations,
  canEdit,
}: {
  employeeId: string;
  educations: EmployeeEducation[];
  canEdit: boolean;
}) {
  return (
    <ListSection
      title="Education"
      footer={canEdit ? <EducationEditor employeeId={employeeId} /> : null}
    >
      {educations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No education records.</p>
      ) : educations.map((education) => (
          <div key={education.id} className="rounded-md border border-border p-4 text-sm">
            <p className="font-medium">{education.educationLevel} · {education.institution}</p>
            <p className="text-muted-foreground">
              {[education.major, education.startYear, education.graduationYear, education.gpaScore]
                .filter(Boolean)
                .join(" · ") || "—"}
            </p>
            {education.certificateNumber ? (
              <p className="text-muted-foreground">No. {education.certificateNumber}</p>
            ) : null}
            {education.notes ? (
              <p className="mt-1 text-muted-foreground">{education.notes}</p>
            ) : null}
            {canEdit ? (
              <div className="mt-3">
                <ActionButton
                  label="Remove"
                  action={deleteEducationAction}
                  employeeId={employeeId}
                  rowId={education.id}
                  variant="outline"
                />
              </div>
            ) : null}
          </div>
        ))
      }
    </ListSection>
  );
}

function EducationEditor({ employeeId }: { employeeId: string }) {
  const action = (
    prevState: EmployeeSectionActionState,
    formData: FormData
  ) => saveEducationAction(employeeId, null, prevState, formData);
  return (
    <SectionForm title="Add education" action={action} submitLabel="Add education">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Education level" name="educationLevel" required maxLength={40} />
        <FormRow label="Institution" name="institution" required maxLength={150} />
        <FormRow label="Major" name="major" maxLength={150} />
        <FormRow label="Start year" name="startYear" type="number" maxLength={4} />
        <FormRow label="Graduation year" name="graduationYear" type="number" maxLength={4} />
        <FormRow label="GPA / Score" name="gpaScore" maxLength={20} />
        <FormRow label="Certificate No." name="certificateNumber" maxLength={100} />
        <FormRow label="Notes" name="notes" maxLength={500} />
      </div>
    </SectionForm>
  );
}

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export function DocumentsSection({
  employeeId,
  documents,
  canUpload,
  canDelete,
}: {
  employeeId: string;
  documents: EmployeeDocument[];
  canUpload: boolean;
  canDelete: boolean;
}) {
  const uploadAction = uploadEmployeeDocumentAction.bind(null, employeeId);
  return (
    <ListSection
      title="Documents"
      description="Files are stored privately and served only by the authenticated download route."
      footer={
        canUpload ? (
          <SectionForm
            title="Upload document"
            action={uploadAction}
            submitLabel="Upload"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectRow
                label="Document type"
                name="documentType"
                options={[
                  "ktp",
                  "kk",
                  "npwp",
                  "bpjs",
                  "ijazah",
                  "certificate",
                  "employment_contract",
                  "appointment_letter",
                  "resignation_letter",
                  "paklaring",
                  "other",
                ].map((value) => ({ value, label: value }))}
              />
              <FormRow label="Document number" name="documentNumber" maxLength={100} />
              <FormRow label="Expiry date" name="expiryDate" type="date" />
              <FormRow label="Notes" name="notes" maxLength={500} />
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="f-file">File (PDF, image, Word, Excel — 10 MB max)</Label>
                <input
                  id="f-file"
                  name="file"
                  type="file"
                  required
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
                />
              </div>
            </div>
          </SectionForm>
        ) : null
      }
    >
      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents uploaded.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Type</th>
                <th className="p-2">Number</th>
                <th className="p-2">File</th>
                <th className="p-2">Expiry</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id} className="border-b border-border/60">
                  <td className="p-2 font-mono text-xs">{document.documentType}</td>
                  <td className="p-2">{document.documentNumber ?? "—"}</td>
                  <td className="p-2">
                    <Link
                      href={`/api/employees/${employeeId}/documents/${document.id}/download`}
                      className={buttonVariants({ variant: "ghost", size: "sm" })}
                    >
                      {document.originalFilename}
                    </Link>
                  </td>
                  <td className="p-2">{iso(document.expiryDate) || "—"}</td>
                  <td className="p-2 text-right">
                    {canDelete ? (
                      <ActionButton
                        label="Delete"
                        action={deleteEmployeeDocumentAction}
                        employeeId={employeeId}
                        rowId={document.id}
                        variant="outline"
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ListSection>
  );
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

export function HistorySection({
  history,
}: {
  history: EmploymentHistoryRow[];
}) {
  return (
    <ListSection title="Employment history" description="Append-only snapshots of employment changes.">
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No history recorded yet.</p>
      ) : (
        <ol className="space-y-3">
          {history.map((entry) => (
            <li key={entry.id} className="rounded-md border border-border p-4 text-sm">
              <p className="font-medium">
                {isoDateTime(entry.effectiveFrom)}
                <span className="ml-2 text-muted-foreground">
                  {entry.employmentStatus ?? "—"}
                </span>
              </p>
              <p className="text-muted-foreground">
                {[entry.position, entry.department, entry.division]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
              <p className="text-muted-foreground">
                {[entry.employmentType, entry.workLocationId, entry.managerId]
                  .filter(Boolean)
                  .join(" · ") || ""}
              </p>
              {entry.notes ? (
                <p className="mt-1 text-muted-foreground">{entry.notes}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </ListSection>
  );
}

export { CustomFieldsSection };
export type { CustomFieldSpec };
