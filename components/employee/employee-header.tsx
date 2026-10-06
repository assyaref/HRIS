import { HrisIcon } from "@/components/layout/icons";

export interface EmployeeHeaderProfile {
  firstName: string;
  lastName: string;
  employeeNumber: string;
  position: string | null;
  department: string | null;
  division: string | null;
  workLocationName: string | null;
  profilePhotoUrl: string | null;
}

function initials(first: string, last: string): string {
  const a = first.trim().charAt(0);
  const b = last.trim().charAt(0);
  const value = `${a}${b}`.toUpperCase();
  return value || "?";
}

/**
 * Employee-app hero header: organization, greeting, identity and the
 * employee photo (circular, soft cyan/blue ring). All values are dynamic and
 * resolved server-side for the signed-in employee — nothing is hard-coded.
 */
export function EmployeeHeader({
  profile,
  greeting,
  organizationName,
  roleLabel,
  todayLabel,
  statusLabel,
}: {
  profile: EmployeeHeaderProfile;
  greeting: string;
  organizationName: string | null;
  roleLabel: string | null;
  todayLabel: string;
  statusLabel: string;
}) {
  return (
    <section className="emp-gradient relative overflow-hidden rounded-[1.75rem] px-5 pt-5 pb-6 text-white shadow-[0_18px_40px_-24px_rgba(22,119,232,0.7)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-white/80 uppercase">
            {organizationName ?? "Enterprise HRIS"}
          </p>
          <p className="mt-2 text-sm text-white/85">{greeting},</p>
          <h1 className="truncate text-xl font-semibold tracking-tight">
            {profile.firstName} {profile.lastName}
          </h1>
          <p className="mt-0.5 truncate text-sm text-white/85">
            {profile.position ?? roleLabel ?? "Employee"}
          </p>
        </div>

        <span className="relative shrink-0">
          {profile.profilePhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.profilePhotoUrl}
              alt={`${profile.firstName} ${profile.lastName}`}
              className="size-16 rounded-full border-2 border-white/80 object-cover shadow-lg ring-2 ring-cyan-300/60 sm:size-20"
            />
          ) : (
            <span className="flex size-16 items-center justify-center rounded-full border-2 border-white/80 bg-white/15 text-lg font-semibold shadow-lg ring-2 ring-cyan-300/60 sm:size-20 sm:text-xl">
              {initials(profile.firstName, profile.lastName)}
            </span>
          )}
        </span>
      </div>

      <dl className="relative mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/90">
        {profile.employeeNumber ? (
          <div className="flex items-center gap-1.5">
            <HrisIcon name="briefcase" className="size-3.5" />
            <dt className="sr-only">Employee number</dt>
            <dd className="font-medium">{profile.employeeNumber}</dd>
          </div>
        ) : null}
        {profile.department ? (
          <div className="flex items-center gap-1.5">
            <HrisIcon name="building" className="size-3.5" />
            <dt className="sr-only">Department</dt>
            <dd>{profile.department}</dd>
          </div>
        ) : null}
        {profile.division ? (
          <div className="flex items-center gap-1.5">
            <HrisIcon name="projects" className="size-3.5" />
            <dt className="sr-only">Division</dt>
            <dd>{profile.division}</dd>
          </div>
        ) : null}
        {profile.workLocationName ? (
          <div className="flex items-center gap-1.5">
            <HrisIcon name="map-pin" className="size-3.5" />
            <dt className="sr-only">Work location</dt>
            <dd>{profile.workLocationName}</dd>
          </div>
        ) : null}
      </dl>

      <div className="relative mt-3 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 font-medium">
          {todayLabel}
        </span>
        <span className="rounded-full border border-white/30 bg-white/10 px-2.5 py-0.5 font-medium">
          {statusLabel}
        </span>
      </div>
    </section>
  );
}
