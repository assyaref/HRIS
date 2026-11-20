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
import {
  deleteAddressAction,
  deleteBankAccountAction,
  deleteDependentAction,
  deleteEducationAction,
  deleteEmployeeDocumentAction,
  deleteEmploymentHistoryEntryAction,
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
import { HistoryClearButton } from "./history-clear-button";
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
          <CardTitle>Ringkasan</CardTitle>
          <CardDescription>Ringkasan data utama karyawan.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Nama" value={`${employee.firstName} ${employee.lastName}`} />
          <Fact label="No. Karyawan" value={employee.employeeNumber} mono />
          <Fact label="Status" value={employee.employmentStatus} />
          <Fact label="Organisasi" value={organizationName ?? "—"} />
          <Fact label="Jabatan" value={employee.position ?? "—"} />
          <Fact label="Departemen" value={employee.department ?? "—"} />
          <Fact label="Divisi" value={employee.division ?? "—"} />
          <Fact label="Jenis kepegawaian" value={employee.employmentType ?? "—"} />
          <Fact label="Lokasi kerja" value={employee.workLocationName ?? "—"} />
          <Fact label="Atasan" value={employee.managerEmployeeNumber ?? "—"} />
          <Fact label="Tanggal masuk" value={iso(employee.hireDate) || "—"} />
          <Fact label="Email" value={employee.email ?? "—"} />
          <Fact label="Telepon" value={formatPhone(employee.phone, revealPhone)} />
          <Fact
            label="Akun tertaut"
            value={employee.linkedUserEmail ?? "none"}
          />
          <Fact label="Dibuat" value={isoDateTime(employee.createdAt)} />
          <Fact label="Terakhir diperbarui" value={isoDateTime(employee.updatedAt)} />
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
        <CardTitle>Status kepegawaian</CardTitle>
        <CardDescription>
          Perubahan status diaudit dan disimpan ke riwayat kepegawaian.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={toggleStatusAction}>
          <input type="hidden" name="status" value={target} />
          <ButtonLike>
            {target === "inactive" ? "Nonaktifkan karyawan" : "Aktifkan karyawan"}
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
      title="Data pribadi"
      description="Data identitas, kelahiran, dan kontak. NIK disamarkan bagi yang tidak memiliki hak ubah."
      action={action}
    >
      {canEdit ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormRow label="NIK" name="nik" value={employee.nik} maxLength={32} />
          <FormRow label="Nama panggilan" name="nickname" value={employee.nickname} maxLength={100} />
          <FormRow label="Tanggal lahir" name="birthDate" type="date" value={iso(employee.birthDate)} />
          <FormRow label="Tempat lahir" name="birthPlace" value={employee.birthPlace} maxLength={200} />
          <SelectRow
            label="Jenis Kelamin"
            name="gender"
            value={employee.gender}
            options={[
              { value: "Male", label: "Laki-laki" },
              { value: "Female", label: "Perempuan" },
            ]}
          />
          <FormRow label="Agama" name="religion" value={employee.religion} maxLength={50} />
          <SelectRow
            label="Status pernikahan"
            name="maritalStatus"
            value={employee.maritalStatus}
            options={[
              { value: "Single", label: "Lajang" },
              { value: "Married", label: "Menikah" },
              { value: "Divorced", label: "Cerai hidup" },
              { value: "Widowed", label: "Cerai mati" },
            ]}
          />
          <FormRow label="Kewarganegaraan" name="nationality" value={employee.nationality} maxLength={50} />
          <FormRow label="Email pribadi" name="personalEmail" type="email" value={employee.personalEmail} maxLength={254} />
          <FormRow label="Telepon" name="phone" value={employee.phone} maxLength={30} />
        </div>
      ) : (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="NIK" value={formatNik(employee.nik, reveal)} />
          <Fact label="Nama panggilan" value={employee.nickname ?? "—"} />
          <Fact label="Tanggal lahir" value={iso(employee.birthDate) || "—"} />
          <Fact label="Tempat lahir" value={employee.birthPlace ?? "—"} />
          <Fact label="Jenis Kelamin" value={employee.gender ?? "—"} />
          <Fact label="Agama" value={employee.religion ?? "—"} />
          <Fact label="Status pernikahan" value={employee.maritalStatus ?? "—"} />
          <Fact label="Kewarganegaraan" value={employee.nationality ?? "—"} />
          <Fact label="Email pribadi" value={formatPersonalEmail(employee.personalEmail, reveal)} />
          <Fact label="Telepon" value={formatPhone(employee.phone, reveal)} />
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
          <CardTitle>Kepegawaian</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Fact label="Divisi" value={employee.division ?? "—"} />
          <Fact label="Departemen" value={employee.department ?? "—"} />
          <Fact label="Jabatan" value={employee.position ?? "—"} />
          <Fact label="Jenis kepegawaian" value={employee.employmentType ?? "—"} />
          <Fact label="Lokasi kerja" value={employee.workLocationName ?? "—"} />
          <Fact label="Atasan" value={employee.managerEmployeeNumber ?? "—"} />
          <Fact label="Tanggal masuk" value={iso(employee.hireDate) || "—"} />
          <Fact label="Mulai kontrak" value={iso(employee.contractStart) || "—"} />
          <Fact label="Akhir kontrak" value={iso(employee.contractEnd) || "—"} />
          <Fact label="Tanggal resign" value={iso(employee.resignationDate) || "—"} />
          <Fact label="Tanggal berhenti" value={iso(employee.terminationDate) || "—"} />
          <Fact label="Alasan keluar" value={employee.reasonForLeaving ?? "—"} />
        </CardContent>
      </Card>
    );
  }
  return (
    <SectionForm
      title="Kepegawaian"
      description="Penempatan organisasi, jabatan, dan kontrak. Perubahan disimpan ke tab Riwayat."
      action={action}
      submitLabel="Simpan kepegawaian"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Divisi" name="division" value={employee.division} maxLength={100} list="org-master-divisions" />
        <FormRow label="Departemen" name="department" value={employee.department} maxLength={100} list="org-master-departments" />
        <FormRow label="Jabatan" name="position" value={employee.position} maxLength={100} list="org-master-positions" />
        <SelectRow
          label="Jenis kepegawaian"
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
          label="Lokasi kerja"
          name="workLocationId"
          value={employee.workLocationId}
          options={workLocations.map((location) => ({
            value: location.id,
            label: location.name,
          }))}
        />
        <SelectRow
          label="Atasan"
          name="managerId"
          value={employee.managerId}
          options={managers.map((manager) => ({
            value: manager.id,
            label: `${manager.employeeNumber} — ${manager.name}`,
          }))}
        />
        <FormRow label="Mulai kontrak" name="contractStart" type="date" value={iso(employee.contractStart)} />
        <FormRow label="Akhir kontrak" name="contractEnd" type="date" value={iso(employee.contractEnd)} />
        <FormRow label="Tanggal resign" name="resignationDate" type="date" value={iso(employee.resignationDate)} />
        <FormRow label="Tanggal berhenti" name="terminationDate" type="date" value={iso(employee.terminationDate)} />
        <FormRow label="Alasan keluar" name="reasonForLeaving" value={employee.reasonForLeaving} maxLength={500} />
        <FormRow label="Catatan riwayat (opsional)" name="historyNotes" maxLength={500} />
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
      title="Alamat"
      description="Satu alamat KTP dan satu alamat Domisili per karyawan."
      footer={
        canEdit ? (
          <AddressEditors employeeId={employeeId} ktp={ktp} domicile={domicile} />
        ) : null
      }
    >
      {addresses.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada alamat.</p>
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
                  label="Hapus"
                  action={deleteAddressAction}
                  employeeId={employeeId}
                  rowId={address.id}
                  variant="outline"
                />
                <Disclosure label="Ubah">
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
  // Bound server action: the bound arguments are serialized with the server
  // reference, so a Client Component can receive it (an inline closure is NOT
  // a server reference and makes React throw while rendering the tab).
  const action = saveAddressAction.bind(null, employeeId, existing?.id ?? null);
  return (
    <SectionForm
      title={type === "ktp" ? "KTP address" : "Domicile address"}
      action={action}
      submitLabel={existing ? "Perbarui" : "Simpan"}
    >
      <input type="hidden" name="type" value={type} />
      {type === "domicile" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sameAsKtp" value="on" className="h-4 w-4 rounded border-input" />
          Sama dengan KTP
        </label>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Alamat" name="address" value={existing?.address} maxLength={500} />
        <FormRow label="RT/RW" name="rtRw" value={existing?.rtRw} maxLength={20} />
        <FormRow label="Village / Kelurahan" name="village" value={existing?.village} maxLength={120} />
        <FormRow label="District / Kecamatan" name="district" value={existing?.district} maxLength={120} />
        <FormRow label="Kota" name="city" value={existing?.city} maxLength={120} />
        <FormRow label="Provinsi" name="province" value={existing?.province} maxLength={120} />
        <FormRow label="Kode pos" name="postalCode" value={existing?.postalCode} maxLength={20} />
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
          <Fact label="No. BPJS Kesehatan" value={formatBpjs(insurance?.bpjsKesehatanNumber ?? null, reveal) ?? "—"} />
          <Fact label="Status BPJS Kesehatan" value={insurance?.bpjsKesehatanStatus ?? "—"} />
          <Fact label="BPJS Kesehatan class" value={insurance?.bpjsKesehatanClass ?? "—"} />
          <Fact label="No. BPJS Ketenagakerjaan" value={formatBpjs(insurance?.bpjsKetenagakerjaanNumber ?? null, reveal) ?? "—"} />
          <Fact label="Status BPJS Ketenagakerjaan" value={insurance?.bpjsKetenagakerjaanStatus ?? "—"} />
        </CardContent>
      </Card>
    );
  }
  return (
    <SectionForm
      title="Insurance & government"
      description="Pendaftaran NPWP dan BPJS. Nilai disamarkan bagi yang tidak memiliki hak ubah."
      action={action}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="NPWP" name="npwp" value={value((i) => (reveal ? i.npwp : formatNpwp(i.npwp, reveal)))} maxLength={30} />
        <FormRow label="No. BPJS Kesehatan" name="bpjsKesehatanNumber" value={value((i) => (reveal ? i.bpjsKesehatanNumber : formatBpjs(i.bpjsKesehatanNumber, reveal)))} maxLength={30} />
        <FormRow label="Status BPJS Kesehatan" name="bpjsKesehatanStatus" value={value((i) => i.bpjsKesehatanStatus)} maxLength={30} />
        <FormRow label="BPJS Kesehatan class" name="bpjsKesehatanClass" value={value((i) => i.bpjsKesehatanClass)} maxLength={10} />
        <FormRow label="No. BPJS Ketenagakerjaan" name="bpjsKetenagakerjaanNumber" value={value((i) => (reveal ? i.bpjsKetenagakerjaanNumber : formatBpjs(i.bpjsKetenagakerjaanNumber, reveal)))} maxLength={30} />
        <FormRow label="Status BPJS Ketenagakerjaan" name="bpjsKetenagakerjaanStatus" value={value((i) => i.bpjsKetenagakerjaanStatus)} maxLength={30} />
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
      title="Rekening bank"
      description="Satu rekening utama per karyawan; nomor rekening disamarkan bagi yang tidak memiliki hak ubah."
      footer={
        canEdit ? (
          <BankEditor employeeId={employeeId} reveal={reveal} />
        ) : null
      }
    >
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada rekening bank.</p>
      ) : accounts.map((account) => (
          <div key={account.id} className="rounded-md border border-border p-4 text-sm">
            <p className="font-medium">
              {account.bankName}
              {account.isPrimary ? (
                <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  Utama
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
                    label="Jadikan utama"
                    action={setPrimaryBankAccountAction}
                    employeeId={employeeId}
                    rowId={account.id}
                  />
                ) : null}
                <ActionButton
                  label="Hapus"
                  action={deleteBankAccountAction}
                  employeeId={employeeId}
                  rowId={account.id}
                  variant="outline"
                />
                <Disclosure label="Ubah">
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
  const action = saveBankAccountAction.bind(null, employeeId, existing?.id ?? null);
  return (
    <SectionForm
      title={existing ? `Edit ${existing.bankName}` : "Add bank account"}
      action={action}
      submitLabel={existing ? "Simpan rekening" : "Tambah rekening"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Nama bank" name="bankName" value={existing?.bankName} required maxLength={100} />
        <FormRow
          label="Nomor rekening"
          name="accountNumber"
          value={existing ? (reveal ? existing.accountNumber : "") : ""}
          required={!existing}
          maxLength={40}
        />
        <FormRow label="Nama pemilik rekening" name="accountHolder" value={existing?.accountHolder} required maxLength={150} />
        <FormRow label="Cabang" name="branch" value={existing?.branch} maxLength={120} />
        <SelectRow
          label="Status"
          name="status"
          value={existing?.status}
          options={[
            { value: "active", label: "Aktif" },
            { value: "inactive", label: "Nonaktif" },
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
          Jadikan utama
        </label>
      </div>
      {existing && !reveal ? (
        <p className="text-xs text-muted-foreground">
          Nomor rekening yang disamarkan tetap dipakai kecuali Anda mengetik nomor baru.
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
      title="Keluarga / tanggungan"
      description="NIK tanggungan disamarkan bagi yang tidak memiliki hak ubah data pribadi."
      footer={canEdit ? <DependentEditor employeeId={employeeId} reveal={reveal} /> : null}
    >
      {dependents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada anggota keluarga.</p>
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
                  label="Hapus"
                  action={deleteDependentAction}
                  employeeId={employeeId}
                  rowId={dependent.id}
                  variant="outline"
                />
                <Disclosure label="Ubah">
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
  const action = saveDependentAction.bind(null, employeeId, existing?.id ?? null);
  return (
    <SectionForm
      title={existing ? `Edit ${existing.name}` : "Add family member"}
      action={action}
      submitLabel={existing ? "Simpan anggota" : "Tambah anggota"}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Nama" name="name" value={existing?.name} required maxLength={150} />
        <SelectRow
          label="Hubungan"
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
        <FormRow label="Tanggal lahir" name="birthDate" type="date" value={existing ? iso(existing.birthDate) : ""} />
        <SelectRow
          label="Jenis Kelamin"
          name="gender"
          value={existing?.gender}
          options={[
            { value: "Male", label: "Laki-laki" },
            { value: "Female", label: "Perempuan" },
          ]}
        />
        <FormRow label="Pekerjaan" name="occupation" value={existing?.occupation} maxLength={120} />
        <FormRow label="Status tanggungan" name="dependentStatus" value={existing?.dependentStatus} maxLength={30} />
        <FormRow label="Status BPJS" name="bpjsStatus" value={existing?.bpjsStatus} maxLength={30} />
        <FormRow label="Catatan" name="notes" value={existing?.notes} maxLength={500} />
      </div>
      {reveal ? null : (
        <p className="text-xs text-muted-foreground">
          NIK hanya diterima di sini jika Anda berhak mengubah data pribadi.
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
      title="Pendidikan"
      footer={canEdit ? <EducationEditor employeeId={employeeId} /> : null}
    >
      {educations.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada data pendidikan.</p>
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
                  label="Hapus"
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
  const action = saveEducationAction.bind(null, employeeId, null);
  return (
    <SectionForm title="Tambah pendidikan" action={action} submitLabel="Tambah pendidikan">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormRow label="Jenjang pendidikan" name="educationLevel" required maxLength={40} />
        <FormRow label="Institusi" name="institution" required maxLength={150} />
        <FormRow label="Jurusan" name="major" maxLength={150} />
        <FormRow label="Tahun mulai" name="startYear" type="number" maxLength={4} />
        <FormRow label="Tahun lulus" name="graduationYear" type="number" maxLength={4} />
        <FormRow label="GPA / Score" name="gpaScore" maxLength={20} />
        <FormRow label="No. Sertifikat" name="certificateNumber" maxLength={100} />
        <FormRow label="Catatan" name="notes" maxLength={500} />
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
      title="Dokumen"
      description="Berkas disimpan secara privat dan hanya dapat diunduh oleh pengguna yang berhak."
      footer={
        canUpload ? (
          <SectionForm
            title="Unggah dokumen"
            action={uploadAction}
            submitLabel="Unggah"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectRow
                label="Jenis dokumen"
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
              <FormRow label="Nomor dokumen" name="documentNumber" maxLength={100} />
              <FormRow label="Tanggal kedaluwarsa" name="expiryDate" type="date" />
              <FormRow label="Catatan" name="notes" maxLength={500} />
              <div className="sm:col-span-2 space-y-2">
                <Label htmlFor="f-file">Berkas (PDF, gambar, Word, Excel — maks. 10 MB)</Label>
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
        <p className="text-sm text-muted-foreground">Belum ada dokumen yang diunggah.</p>
      ) : (
        <div className="rounded-md border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="p-2 font-medium">Jenis</th>
                <th className="p-2">Nomor</th>
                <th className="p-2">Berkas</th>
                <th className="p-2">Masa berlaku</th>
                <th className="p-2 text-right">Aksi</th>
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
                        label="Hapus"
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
  employeeId,
  history,
  canClear = false,
}: {
  employeeId: string;
  history: EmploymentHistoryRow[];
  /** Super Administrator only: delete entries / clear the whole history. */
  canClear?: boolean;
}) {
  return (
    <ListSection
      title="Riwayat kepegawaian"
      description="Riwayat perubahan kepegawaian (hanya bertambah)."
      footer={
        canClear ? (
          <HistoryClearButton employeeId={employeeId} count={history.length} />
        ) : null
      }
    >
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada riwayat.</p>
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
              {canClear ? (
                <div className="mt-2">
                  <ActionButton
                    label="Hapus"
                    action={deleteEmploymentHistoryEntryAction}
                    employeeId={employeeId}
                    rowId={entry.id}
                    variant="outline"
                  />
                </div>
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
