import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { SectionHeader } from "@/components/employee/section-header";
import { EmployeeEmptyState } from "@/components/employee/ui-states";
import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { EventCreateButton, RsvpButtons } from "@/features/agenda/agenda-forms";
import { AGENDA_GUIDE, AGENDA_MIGRATION, isAgendaReady } from "@/features/agenda/module";
import { listAgenda, listMyResponses } from "@/features/agenda/queries";
import { CATEGORY_COLORS, CATEGORY_LABELS, isForDepartment, RESPONSE_LABELS, wibDay, whenLabel } from "@/features/agenda/rules";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { isOrgMasterReady } from "@/features/org-master/module";
import { listDepartments, listEmployeeValues } from "@/features/org-master/queries";
import { groupValues } from "@/features/org-master/rules";
import { textParam, todayKey } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Agenda" };

/**
 * Company agenda: upcoming (or past) events the signed-in user is invited
 * to — by department — with RSVP. Publishers (announcements.create) see
 * every event and create / manage them.
 */
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  if (!(await isAgendaReady())) {
    return (
      <div className="space-y-6">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agenda</h1>
        </div>
        <ModuleNotReady module="Agenda" migration={AGENDA_MIGRATION} guide={AGENDA_GUIDE} />
      </div>
    );
  }

  const params = await searchParams;
  const past = textParam(params.view) === "past";
  const now = new Date();
  const [canManage, profile] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.ANNOUNCEMENTS_CREATE),
    getEmployeeSelfProfile(user.id, organizationId),
  ]);
  const DAY = 24 * 60 * 60 * 1000;
  const events = past
    ? await listAgenda(organizationId, new Date(now.getTime() - 180 * DAY), now, "desc")
    : await listAgenda(organizationId, now, new Date(now.getTime() + 120 * DAY));
  const visible = canManage
    ? events
    : events.filter((e) => !e.cancelled && isForDepartment(e.audienceDepartments, profile?.department ?? null));
  const myResponses = profile ? await listMyResponses(organizationId, profile.id, visible.map((e) => e.id)) : new Map<string, string>();

  let departments: string[] = [];
  if (canManage) {
    const [master, values] = await Promise.all([
      (await isOrgMasterReady()) ? listDepartments(organizationId) : Promise.resolve([]),
      listEmployeeValues(organizationId, "department"),
    ]);
    departments = [...new Set([...master.filter((d) => d.active).map((d) => d.name), ...groupValues(values).map((g) => g.preferred)])].sort();
  }

  // Group by WIB day.
  const byDay = new Map<string, typeof visible>();
  for (const e of visible) {
    const key = wibDay(e.startAt);
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }
  const today = todayKey();
  const needsAnswer = visible.filter((e) => !past && e.requireRsvp && !e.cancelled && profile && !myResponses.has(e.id) && isForDepartment(e.audienceDepartments, profile.department)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="emp-page-title">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Agenda</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">Rapat, training, dan acara perusahaan.</p>
        </div>
        {canManage ? <EventCreateButton departments={departments} defaultDate={today} /> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="hris-segmented inline-flex rounded-xl bg-muted p-1">
          <Link href="/agenda" className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", !past ? "hris-segmented-active bg-card shadow-sm" : "text-muted-foreground")}>
            Mendatang
          </Link>
          <Link href="/agenda?view=past" className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", past ? "hris-segmented-active bg-card shadow-sm" : "text-muted-foreground")}>
            Sudah lewat
          </Link>
        </div>
        {needsAnswer > 0 ? (
          <span className="rounded-full bg-[#FEF3C7] px-3 py-1 text-xs font-semibold text-[#B45309] dark:bg-[#3A2A10] dark:text-[#FCD34D]">
            {needsAnswer} agenda menunggu konfirmasi Anda
          </span>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmployeeEmptyState icon="calendar" title={past ? "Belum ada agenda yang lewat" : "Belum ada agenda"} description={canManage ? 'Tekan "Buat agenda" untuk menjadwalkan rapat atau acara.' : "Agenda untuk Anda akan tampil di sini."} />
      ) : (
        <div className="space-y-5">
          {[...byDay.entries()].map(([day, list]) => (
            <section key={day} className="space-y-2">
              <SectionHeader title={day === today ? "Hari ini" : new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))} />
              <div className="space-y-2">
                {list.map((e) => {
                  const mine = myResponses.get(e.id) ?? null;
                  const invited = profile ? isForDepartment(e.audienceDepartments, profile.department) : false;
                  return (
                    <article key={e.id} className={cn("hris-card rounded-2xl p-4", e.cancelled && "opacity-60")}>
                      <div className="flex items-start gap-3">
                        <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_COLORS[e.category] ?? "#64748B" }} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/agenda/${e.id}`} className={cn("font-semibold hover:text-primary", e.cancelled && "line-through")}>
                              {e.title}
                            </Link>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{CATEGORY_LABELS[e.category] ?? e.category}</span>
                            {e.cancelled ? <span className="text-xs font-semibold text-destructive">Dibatalkan</span> : null}
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            <HrisIcon name="clock" className="mr-1 inline size-3.5" />
                            {whenLabel(e.startAt, e.endAt, e.allDay)}
                          </p>
                          {e.location ? (
                            <p className="text-sm text-muted-foreground">
                              <HrisIcon name="map-pin" className="mr-1 inline size-3.5" />
                              {e.location}
                            </p>
                          ) : null}
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {e.audienceDepartments.length ? `Untuk: ${e.audienceDepartments.join(", ")}` : "Untuk semua karyawan"}
                            {e.requireRsvp ? ` · ${e.going} hadir` : ""}
                          </p>
                          {e.requireRsvp && invited && !e.cancelled && !past ? (
                            <div className="mt-2">
                              <RsvpButtons eventId={e.id} current={mine} />
                            </div>
                          ) : mine ? (
                            <p className="mt-1 text-xs font-medium">Jawaban Anda: {RESPONSE_LABELS[mine]}</p>
                          ) : null}
                        </div>
                        {canManage ? (
                          <Link href={`/agenda/${e.id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                            Rekap
                          </Link>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
