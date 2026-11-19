import { StatusBadge, type StatusTone } from "@/components/employee/status-badge";

import { InfoRows, ProfileSection } from "@/features/account/profile-view";

import { displayFieldValue, fieldLabel, MARITAL_OPTIONS, maskValue } from "./fields";
import { isProfileChangeModuleReady } from "./module";
import { ProfileChangeButton, ProfileChangeCancelButton } from "./profile-change-forms";
import { getChangeableProfile, listProfileChanges } from "./queries";

const TONES: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  cancelled: "neutral",
};
const LABELS: Record<string, string> = {
  pending: "Menunggu HR",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });

const FALLBACK = (
  <p className="px-2 text-center text-[12px] leading-snug text-muted-foreground">
    Data kepegawaian dikelola oleh HR. Hubungi HR jika ada data yang perlu diperbarui.
  </p>
);

/**
 * "Data Pribadi" on Profil Saya: current personal data, a button to propose
 * changes, and the latest requests. Falls back to the old "contact HR" note
 * until migration 0025 is applied.
 */
export async function ProfileChangeSelfSection({
  organizationId,
  employeeId,
}: {
  organizationId: string;
  employeeId: string;
}) {
  if (!(await isProfileChangeModuleReady())) return FALLBACK;
  const [current, requests] = await Promise.all([
    getChangeableProfile(employeeId, organizationId),
    listProfileChanges(organizationId, { employeeId }),
  ]);
  if (!current) return FALLBACK;
  const pending = requests.find((r) => r.status === "pending");
  const recent = requests.slice(0, 3);
  const marital = MARITAL_OPTIONS.find((o) => o.value === current.maritalStatus)?.label ?? current.maritalStatus ?? null;

  return (
    <>
      <ProfileSection title="Data Pribadi">
        <InfoRows
          rows={[
            { label: "Nama panggilan", value: current.nickname ?? null, icon: "user" },
            { label: "Email pribadi", value: current.personalEmail ?? null, icon: "mail" },
            { label: "Tempat, tgl lahir", value: [current.birthPlace, current.birthDate].filter(Boolean).join(", ") || null, icon: "calendar" },
            { label: "Status pernikahan", value: marital, icon: "users" },
            { label: "Agama", value: current.religion ?? null, icon: "sparkles" },
            {
              label: "Alamat domisili",
              value: [current.domicileAddress, current.domicileCity].filter(Boolean).join(", ") || null,
              icon: "map-pin",
            },
            {
              label: "Rekening gaji",
              value: current.bankName ? `${current.bankName} ${maskValue(current.bankAccountNumber ?? null) ?? ""}`.trim() : null,
              icon: "wallet",
            },
          ]}
        />
        <div className="mt-3 space-y-2">
          <ProfileChangeButton current={current} disabled={Boolean(pending)} />
          {pending ? (
            <p className="text-center text-[12px] text-muted-foreground">
              Ada pengajuan yang sedang ditinjau HR. Data berubah setelah disetujui.
            </p>
          ) : null}
        </div>
      </ProfileSection>

      {recent.length > 0 ? (
        <ProfileSection title="Riwayat Pengajuan Perubahan">
          <ul className="divide-y divide-border border-t border-border">
            {recent.map((r) => (
              <li key={r.id} className="space-y-1.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-muted-foreground">{dateFormat.format(r.createdAt)}</span>
                  <div className="flex items-center gap-1.5">
                    {r.status === "pending" ? <ProfileChangeCancelButton id={r.id} /> : null}
                    <StatusBadge tone={TONES[r.status] ?? "neutral"}>{LABELS[r.status] ?? r.status}</StatusBadge>
                  </div>
                </div>
                <ul className="space-y-0.5 text-[13.5px]">
                  {Object.entries(r.changes).map(([field, change]) => (
                    <li key={field}>
                      <span className="text-muted-foreground">{fieldLabel(field)}:</span>{" "}
                      <span className="line-through decoration-muted-foreground/60">
                        {field === "bankAccountNumber" ? maskValue(change.from) ?? "—" : displayFieldValue(field, change.from)}
                      </span>{" "}
                      →{" "}
                      <span className="font-semibold">
                        {field === "bankAccountNumber" ? maskValue(change.to) ?? "—" : displayFieldValue(field, change.to)}
                      </span>
                    </li>
                  ))}
                </ul>
                {r.reviewerNote && r.status !== "pending" ? (
                  <p className="text-[12.5px] text-muted-foreground">Catatan HR: {r.reviewerNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </ProfileSection>
      ) : null}
    </>
  );
}
