import { HrisIcon, type HrisIconName } from "@/components/layout/icons";

function initials(first: string, last: string): string {
  const value = `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase();
  return value || "?";
}

export interface ProfileRow {
  label: string;
  value: string | null;
  icon?: HrisIconName;
}

/**
 * Employee profile card: photo/initials identity block plus labelled info
 * rows. Values are resolved server-side for the signed-in employee.
 */
export function ProfileCard({
  firstName,
  lastName,
  employeeNumber,
  subtitle,
  profilePhotoUrl,
  rows,
}: {
  firstName: string;
  lastName: string;
  employeeNumber: string;
  subtitle: string | null;
  profilePhotoUrl: string | null;
  rows: ProfileRow[];
}) {
  return (
    <section className="emp-card overflow-hidden">
      <div className="emp-gradient-soft flex flex-col items-center gap-3 px-6 py-6 text-center">
        {profilePhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profilePhotoUrl}
            alt={`${firstName} ${lastName}`}
            className="size-20 rounded-full border-4 border-white object-cover shadow-lg ring-2 ring-cyan-300/60"
          />
        ) : (
          <span className="flex size-20 items-center justify-center rounded-full border-4 border-white bg-white text-xl font-semibold text-[#1677e8] shadow-lg ring-2 ring-cyan-300/60">
            {initials(firstName, lastName)}
          </span>
        )}
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-[#172554]">
            {firstName} {lastName}
          </h2>
          <p className="text-sm text-[#64748b]">{subtitle ?? "Employee"}</p>
          <p className="mt-1 text-xs font-medium tracking-wide text-[#94a3b8] uppercase">
            {employeeNumber}
          </p>
        </div>
      </div>

      <dl className="divide-y divide-slate-100">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-4 px-5 py-3.5"
          >
            <dt className="flex items-center gap-2 text-sm text-[#64748b]">
              {row.icon ? (
                <HrisIcon name={row.icon} className="size-4 text-slate-400" />
              ) : null}
              {row.label}
            </dt>
            <dd className="text-right text-sm font-medium text-[#172554]">
              {row.value && row.value.trim() !== "" ? row.value : "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
