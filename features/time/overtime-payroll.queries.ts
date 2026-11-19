import "server-only";

import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { holidays, overtimeRequests, shifts, workGroupMembers, workGroups } from "@/db/schema";
import { tableExists } from "@/lib/db/table-exists";

import type { OvertimeEntry } from "./overtime-pay";
import { isoWeekday, parseWorkingDays } from "./rules";

type Executor = Pick<typeof db, "select" | "execute">;

/**
 * Approved overtime of every employee with an overtime date in [from, to]
 * ("YYYY-MM-DD"), each day classified as working day or rest day (holiday,
 * or not a working day of the employee's work-group shift; Mon–Fri when the
 * employee has no shift). Empty while migration 0024 is not applied, so the
 * payroll keeps working before it. Runs on `db` or inside a transaction.
 */
export async function loadApprovedOvertime(
  executor: Executor,
  organizationId: string,
  from: string,
  to: string
): Promise<Map<string, OvertimeEntry[]>> {
  const result = new Map<string, OvertimeEntry[]>();
  if (!(await tableExists(executor, "overtime_requests"))) return result;

  const [requests, holidayRows, schedules] = await Promise.all([
    executor
      .select({
        id: overtimeRequests.id,
        employeeId: overtimeRequests.employeeId,
        day: overtimeRequests.overtimeDate,
        minutes: overtimeRequests.totalMinutes,
      })
      .from(overtimeRequests)
      .where(
        and(
          eq(overtimeRequests.organizationId, organizationId),
          eq(overtimeRequests.status, "approved"),
          gte(overtimeRequests.overtimeDate, from),
          lte(overtimeRequests.overtimeDate, to)
        )
      ),
    executor
      .select({ day: holidays.holidayDate })
      .from(holidays)
      .where(and(eq(holidays.organizationId, organizationId), gte(holidays.holidayDate, from), lte(holidays.holidayDate, to))),
    executor
      .select({ employeeId: workGroupMembers.employeeId, workingDays: shifts.workingDays })
      .from(workGroupMembers)
      .innerJoin(workGroups, eq(workGroups.id, workGroupMembers.workGroupId))
      .innerJoin(shifts, eq(shifts.id, workGroups.shiftId))
      .where(eq(workGroupMembers.organizationId, organizationId)),
  ]);

  const holidaySet = new Set(holidayRows.map((h) => h.day));
  const daysOf = new Map(schedules.map((s) => [s.employeeId, parseWorkingDays(s.workingDays)]));
  for (const r of requests) {
    const workingDays = daysOf.get(r.employeeId) ?? [1, 2, 3, 4, 5];
    const entry: OvertimeEntry = {
      requestId: r.id,
      day: r.day,
      minutes: r.minutes,
      restDay: holidaySet.has(r.day) || !workingDays.includes(isoWeekday(r.day)),
      sixDayWeek: workingDays.length >= 6,
    };
    const list = result.get(r.employeeId) ?? [];
    list.push(entry);
    result.set(r.employeeId, list);
  }
  return result;
}
