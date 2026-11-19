import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { StatusTabs } from "@/components/ui/status-tabs";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { EventManageActions, RsvpButtons } from "@/features/agenda/agenda-forms";
import { AGENDA_GUIDE, AGENDA_MIGRATION, isAgendaReady } from "@/features/agenda/module";
import { getAgendaEvent, listInvited, listMyResponses } from "@/features/agenda/queries";
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  isForDepartment,
  RESPONSE_LABELS,
  rsvpSummary,
  wibDay,
  wibTime,
  whenLabel,
} from "@/features/agenda/rules";
import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { isOrgMasterReady } from "@/features/org-master/module";
import { listDepartments, listEmployeeValues } from "@/features/org-master/queries";
import { groupValues } from "@/features/org-master/rules";
import { textParam } from "@/features/reference-shared";

export const metadata: Metadata = { title: "Detail Agenda" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One agenda event. Invited employees answer the RSVP; publishers
 * (announcements.create) also see who answered what and who has not yet,
 * and edit or cancel the event. Others get 404.
 */
export default async function AgendaEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const user = await requireUser();
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;
  if (!(await isAgendaReady())) return <ModuleNotReady module="Agenda" migration={AGENDA_MIGRATION} guide={AGENDA_GUIDE} />;
  if (!UUID.test(eventId)) notFound();

  const [event, canManage, profile] = await Promise.all([
    getAgendaEvent(organizationId, eventId),
    hasPermission(user.id, PERMISSIONS.ANNOUNCEMENTS_CREATE),
    getEmployeeSelfProfile(user.id, organizationId),
  ]);
  if (!event) notFound();
  const invited = profile ? isForDepartment(event.audienceDepartments, profile.department) : false;
  if (!canManage && !invited) notFound();

  const mine = profile ? (await listMyResponses(organizationId, profile.id, [event.id])).get(event.id) ?? null : null;
  const isPast = event.endAt < new Date();
  const filter = textParam((await searchParams).rsvp) ?? "";

  let people: Awaited<ReturnType<typeof listInvited>> = [];
  let departments: string[] = [];
  if (canManage) {
    const [list, master, values] = await Promise.all([
      listInvited(organizationId, event),
      (await isOrgMasterReady()) ? listDepartments(organizationId) : Promise.resolve([]),
      listEmployeeValues(organizationId, "department"),
    ]);
    people = list;
    departments = [...new Set([...master.filter((d) => d.active).map((d) => d.name), ...groupValues(values).map((g) => g.preferred)])].sort();
  }
  const summary = rsvpSummary(
    people.map((p) => p.id),
    people.filter((p) => p.response).map((p) => ({ employeeId: p.id, response: p.response! }))
  );
  const shown = filter === "pending" ? people.filter((p) => !p.response) : filter ? people.filter((p) => p.response === filter) : people;

  return (
    <div className="space-y-5">
      <Link href="/agenda" className={buttonVariants({ variant: "ghost", size: "sm" })}>
        <HrisIcon name="chevron-left" className="size-4" />
        Agenda
      </Link>

      <article className="hris-card rounded-[20px] border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${CATEGORY_COLORS[event.category]}1A`, color: CATEGORY_COLORS[event.category] }}>
                {CATEGORY_LABELS[event.category] ?? event.category}
              </span>
              {event.cancelled ? <Badge variant="danger">Dibatalkan</Badge> : isPast ? <Badge variant="outline">Selesai</Badge> : null}
            </div>
            <h1 className={cn("mt-2 text-xl font-semibold tracking-tight break-words", event.cancelled && "line-through")}>{event.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{whenLabel(event.startAt, event.endAt, event.allDay)}</p>
            {event.location ? <p className="text-sm text-muted-foreground">{event.location}</p> : null}
            <p className="mt-1 text-xs text-muted-foreground">
              {event.audienceDepartments.length ? `Untuk: ${event.audienceDepartments.join(", ")}` : "Untuk semua karyawan"}
            </p>
          </div>
          {canManage ? (
            <EventManageActions
              cancelled={event.cancelled}
              departments={departments}
              event={{
                id: event.id,
                title: event.title,
                description: event.description,
                category: event.category,
                date: wibDay(event.startAt),
                endDate: wibDay(event.endAt),
                startTime: wibTime(event.startAt),
                endTime: wibTime(event.endAt),
                allDay: event.allDay,
                location: event.location,
                audienceDepartments: event.audienceDepartments,
                requireRsvp: event.requireRsvp,
              }}
            />
          ) : null}
        </div>
        {event.description ? <p className="mt-4 text-sm whitespace-pre-line">{event.description}</p> : null}
        {event.requireRsvp && invited && !event.cancelled && !isPast ? (
          <div className="mt-4 border-t border-[var(--card-border)] pt-4">
            <p className="mb-2 text-sm font-medium">Apakah Anda akan hadir?</p>
            <RsvpButtons eventId={event.id} current={mine} />
          </div>
        ) : mine ? (
          <p className="mt-4 text-sm">Jawaban Anda: <span className="font-semibold">{RESPONSE_LABELS[mine]}</span></p>
        ) : null}
      </article>

      {canManage ? (
        <section className="hris-card space-y-4 rounded-[20px] border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold">Peserta</h2>
              <p className="text-sm text-muted-foreground">
                {people.length} karyawan diundang
                {event.requireRsvp ? "" : " · konfirmasi kehadiran tidak diminta"}
              </p>
            </div>
            <a href={`/api/reports/export?report=agenda&event=${event.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <HrisIcon name="download" className="size-4" />
              Export Excel
            </a>
          </div>
          <StatusTabs
            active={filter}
            buildHref={(value) => `/agenda/${event.id}${value ? `?rsvp=${value}` : ""}`}
            tabs={[
              { value: "", label: "Semua", count: people.length },
              { value: "going", label: "Hadir", count: summary.going, tone: "#22C55E" },
              { value: "maybe", label: "Mungkin", count: summary.maybe, tone: "#F59E0B" },
              { value: "not_going", label: "Tidak hadir", count: summary.notGoing, tone: "#EF4444" },
              { value: "pending", label: "Belum menjawab", count: summary.pending, tone: "#94A3B8" },
            ]}
          />
          <ul className="divide-y divide-border rounded-xl border border-[var(--card-border)]">
            {shown.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">Tidak ada peserta pada filter ini.</li>
            ) : (
              shown.slice(0, 300).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{p.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {p.employeeNumber} · {p.department ?? "—"}
                    </span>
                  </span>
                  <span className={cn("shrink-0 text-xs font-semibold", !p.response && "text-muted-foreground")}>
                    {p.response ? RESPONSE_LABELS[p.response] : "Belum menjawab"}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
