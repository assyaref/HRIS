import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { qualified } from "@/lib/db/qualified";
import { agendaEvents, agendaResponses, employees } from "@/db/schema";

import { isForDepartment } from "./rules";

export interface AgendaEventRow {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  audienceDepartments: string[];
  requireRsvp: boolean;
  cancelled: boolean;
  going: number;
  maybe: number;
  notGoing: number;
}

const eventColumns = {
  id: agendaEvents.id,
  title: agendaEvents.title,
  description: agendaEvents.description,
  category: agendaEvents.category,
  startAt: agendaEvents.startAt,
  endAt: agendaEvents.endAt,
  allDay: agendaEvents.allDay,
  location: agendaEvents.location,
  audienceDepartments: agendaEvents.audienceDepartments,
  requireRsvp: agendaEvents.requireRsvp,
  cancelled: agendaEvents.cancelled,
  going: sql<number>`(SELECT COUNT(*)::int FROM ${agendaResponses} WHERE ${agendaResponses.eventId} = ${qualified(agendaEvents.id)} AND ${agendaResponses.response} = 'going')`,
  maybe: sql<number>`(SELECT COUNT(*)::int FROM ${agendaResponses} WHERE ${agendaResponses.eventId} = ${qualified(agendaEvents.id)} AND ${agendaResponses.response} = 'maybe')`,
  notGoing: sql<number>`(SELECT COUNT(*)::int FROM ${agendaResponses} WHERE ${agendaResponses.eventId} = ${qualified(agendaEvents.id)} AND ${agendaResponses.response} = 'not_going')`,
};

/** Events overlapping [from, to). */
export async function listAgenda(organizationId: string, from: Date, to: Date, order: "asc" | "desc" = "asc"): Promise<AgendaEventRow[]> {
  return db
    .select(eventColumns)
    .from(agendaEvents)
    .where(and(eq(agendaEvents.organizationId, organizationId), lte(agendaEvents.startAt, to), gte(agendaEvents.endAt, from)))
    .orderBy(order === "asc" ? asc(agendaEvents.startAt) : desc(agendaEvents.startAt))
    .limit(500);
}

export async function getAgendaEvent(organizationId: string, id: string): Promise<AgendaEventRow | null> {
  const rows = await db
    .select(eventColumns)
    .from(agendaEvents)
    .where(and(eq(agendaEvents.organizationId, organizationId), eq(agendaEvents.id, id)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listMyResponses(organizationId: string, employeeId: string, eventIds: string[]): Promise<Map<string, string>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ eventId: agendaResponses.eventId, response: agendaResponses.response })
    .from(agendaResponses)
    .where(
      and(
        eq(agendaResponses.organizationId, organizationId),
        eq(agendaResponses.employeeId, employeeId),
        inArray(agendaResponses.eventId, eventIds)
      )
    );
  return new Map(rows.map((r) => [r.eventId, r.response]));
}

export interface InvitedEmployee {
  id: string;
  employeeNumber: string;
  name: string;
  department: string | null;
  response: string | null;
  note: string | null;
}

/** Active employees the event is for, with their answer (if any). */
export async function listInvited(organizationId: string, event: Pick<AgendaEventRow, "id" | "audienceDepartments">): Promise<InvitedEmployee[]> {
  const [people, responses] = await Promise.all([
    db
      .select({
        id: employees.id,
        employeeNumber: employees.employeeNumber,
        name: sql<string>`TRIM(${employees.firstName} || ' ' || ${employees.lastName})`,
        department: employees.department,
      })
      .from(employees)
      .where(and(eq(employees.organizationId, organizationId), eq(employees.employmentStatus, "active")))
      .orderBy(asc(employees.firstName), asc(employees.lastName)),
    db
      .select({ employeeId: agendaResponses.employeeId, response: agendaResponses.response, note: agendaResponses.note })
      .from(agendaResponses)
      .where(and(eq(agendaResponses.organizationId, organizationId), eq(agendaResponses.eventId, event.id))),
  ]);
  const byEmployee = new Map(responses.map((r) => [r.employeeId, r]));
  return people
    .filter((p) => isForDepartment(event.audienceDepartments, p.department))
    .map((p) => ({ ...p, response: byEmployee.get(p.id)?.response ?? null, note: byEmployee.get(p.id)?.note ?? null }));
}
