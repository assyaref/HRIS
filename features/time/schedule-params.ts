/**
 * Query-string parsing shared by the schedule report page and its Excel
 * export, so both always show the same period. Pure.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SCHEDULE_MAX_DAYS = 62;
export const DEFAULT_GRACE_MINUTES = 5;

export interface ScheduleParams {
  from: string;
  to: string;
  graceMinutes: number;
  groupId?: string;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const valid = (v: string | undefined): v is string => Boolean(v && DAY.test(v) && !Number.isNaN(Date.parse(v)));

function monthBounds(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function parseScheduleParams(
  params: Record<string, string | string[] | undefined>,
  today: string
): ScheduleParams {
  const graceRaw = Number.parseInt(one(params.grace) ?? "", 10);
  const graceMinutes = Number.isFinite(graceRaw) ? Math.min(Math.max(graceRaw, 0), 120) : DEFAULT_GRACE_MINUTES;
  const group = one(params.group);
  const groupId = group && UUID.test(group) ? group : undefined;

  const fromParam = one(params.from);
  const toParam = one(params.to);
  let from: string;
  let to: string;
  if (valid(fromParam) && valid(toParam) && fromParam <= toParam) {
    from = fromParam;
    to = toParam;
  } else {
    const m = MONTH.exec(one(params.month) ?? "") ?? MONTH.exec(today.slice(0, 7))!;
    ({ from, to } = monthBounds(Number(m[1]), Number(m[2])));
  }
  // Cap the period.
  const end = new Date(`${from}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + SCHEDULE_MAX_DAYS - 1);
  const cap = end.toISOString().slice(0, 10);
  if (to > cap) to = cap;
  return { from, to, graceMinutes, groupId };
}
