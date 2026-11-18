import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { StatCard } from "@/components/dashboard/stat-card";
import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils/cn";

import { ModuleNotReady } from "@/features/compliance/module-not-ready";
import { textParam, todayKey } from "@/features/reference-shared";
import { isTimeModuleReady, TIME_GUIDE, TIME_MIGRATION } from "@/features/time/module";
import { listHolidays } from "@/features/time/queries";
import {
  HOLIDAY_TYPE_COLORS,
  HOLIDAY_TYPE_LABELS,
  isoWeekday,
  monthGrid,
  WEEKDAYS,
} from "@/features/time/rules";
import { HolidayCreateButton, HolidayDeleteButton } from "@/features/time/time-forms";

export const metadata: Metadata = { title: "Kalender Libur" };

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
const monthName = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const dayName = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function shiftMonth(year: number, month: number, delta: number): string {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Holiday calendar: a month grid plus the year's list. Everyone with
 * attendance access sees it (employees plan leave around it); attendance
 * managers add and remove holidays.
 */
export default async function HolidayCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_VIEW);
  if (!user.organizationId) forbidden();

  if (!(await isTimeModuleReady())) {
    return (
      <div className="space-y-6">
        <PageHeader title="Kalender Libur" description="Hari libur nasional, cuti bersama, dan libur perusahaan." />
        <ModuleNotReady module="Kalender Libur" migration={TIME_MIGRATION} guide={TIME_GUIDE} />
      </div>
    );
  }

  const canManage = await hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  const today = todayKey();
  const params = await searchParams;
  const requested = textParam(params.month);
  const match = MONTH.exec(requested ?? "") ?? MONTH.exec(today.slice(0, 7))!;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;

  const yearHolidays = await listHolidays(user.organizationId, `${year}-01-01`, `${year}-12-31`);
  const byDate = new Map<string, typeof yearHolidays>();
  for (const h of yearHolidays) {
    const list = byDate.get(h.holidayDate) ?? [];
    list.push(h);
    byDate.set(h.holidayDate, list);
  }
  const inMonth = yearHolidays.filter((h) => h.holidayDate.startsWith(monthKey));
  const upcoming = yearHolidays.filter((h) => h.holidayDate >= today).slice(0, 1)[0];
  const weekdayHolidays = yearHolidays.filter((h) => isoWeekday(h.holidayDate) <= 5);
  const counts = {
    national: yearHolidays.filter((h) => h.holidayType === "national").length,
    collective: yearHolidays.filter((h) => h.holidayType === "collective_leave").length,
    company: yearHolidays.filter((h) => h.holidayType === "company").length,
  };
  const weeks = monthGrid(year, month);
  const defaultDate = today.startsWith(monthKey) ? today : `${monthKey}-01`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kalender Libur"
        description="Hari libur nasional, cuti bersama, dan libur perusahaan yang berlaku untuk organisasi Anda."
        actions={canManage ? <HolidayCreateButton defaultDate={defaultDate} /> : null}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard icon="calendar" label={`Libur ${year}`} value={yearHolidays.length} hint={`${weekdayHolidays.length} jatuh di hari kerja`} tone="blue" />
        <StatCard icon="calendar-check" label="Libur nasional" value={counts.national} hint="Tanggal merah" tone="rose" />
        <StatCard icon="plane" label="Cuti bersama" value={counts.collective} hint="Ditetapkan pemerintah" tone="amber" />
        <StatCard
          icon="clock"
          label="Libur berikutnya"
          value={upcoming ? upcoming.holidayDate.slice(8, 10) + "/" + upcoming.holidayDate.slice(5, 7) : "—"}
          hint={upcoming?.name ?? "Belum ada jadwal"}
          tone="green"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="hris-card rounded-[20px] border bg-card p-5" aria-label={`Kalender ${monthName.format(new Date(Date.UTC(year, month - 1, 1)))}`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold capitalize">{monthName.format(new Date(Date.UTC(year, month - 1, 1)))}</h2>
            <div className="flex gap-1.5">
              <Link href={`/time/calendar?month=${shiftMonth(year, month, -1)}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Bulan sebelumnya">
                <HrisIcon name="chevron-left" className="size-4" />
              </Link>
              <Link href="/time/calendar" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Hari ini
              </Link>
              <Link href={`/time/calendar?month=${shiftMonth(year, month, 1)}`} className={buttonVariants({ variant: "outline", size: "sm" })} aria-label="Bulan berikutnya">
                <HrisIcon name="chevron-right" className="size-4" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-semibold text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d.value} className={cn("py-1", d.value === 7 && "text-[#EF4444]")}>
                {d.short}
              </div>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1.5">
            {weeks.flat().map((day, index) => {
              if (!day) return <div key={`blank-${index}`} aria-hidden className="min-h-16" />;
              const items = byDate.get(day) ?? [];
              const color = items[0] ? HOLIDAY_TYPE_COLORS[items[0].holidayType] : undefined;
              const sunday = isoWeekday(day) === 7;
              return (
                <div
                  key={day}
                  title={items.map((h) => h.name).join(", ") || undefined}
                  className={cn(
                    "flex min-h-16 flex-col rounded-xl border border-[var(--card-border)] p-1.5 text-left",
                    day === today && "ring-2 ring-primary",
                    items.length > 0 ? "bg-muted" : "bg-card"
                  )}
                  style={color ? { backgroundColor: `${color}14`, borderColor: `${color}55` } : undefined}
                >
                  <span className={cn("text-sm font-semibold", (sunday || items.length > 0) && "text-[#EF4444]")} style={color ? { color } : undefined}>
                    {Number(day.slice(8, 10))}
                  </span>
                  {items[0] ? (
                    <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-tight text-foreground/80">{items[0].name}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {Object.entries(HOLIDAY_TYPE_LABELS).map(([value, label]) => (
              <span key={value} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: HOLIDAY_TYPE_COLORS[value] }} />
                {label}
              </span>
            ))}
          </div>
        </section>

        <section className="hris-card rounded-[20px] border bg-card p-5">
          <h2 className="text-[17px] font-semibold">Daftar libur bulan ini</h2>
          <p className="mt-1 mb-3 text-sm text-muted-foreground">{inMonth.length} hari libur</p>
          {inMonth.length === 0 ? (
            <EmptyState
              title="Tidak ada hari libur"
              description={canManage ? "Tambahkan hari libur dengan tombol di atas." : "Belum ada hari libur di bulan ini."}
            />
          ) : (
            <ul className="space-y-2">
              {inMonth.map((h) => (
                <li key={h.id} className="flex items-center gap-3 rounded-xl border border-[var(--card-border)] px-3 py-2.5">
                  <span
                    className="flex size-10 shrink-0 flex-col items-center justify-center rounded-xl text-sm font-bold"
                    style={{ backgroundColor: `${HOLIDAY_TYPE_COLORS[h.holidayType] ?? "#64748B"}1A`, color: HOLIDAY_TYPE_COLORS[h.holidayType] ?? "#64748B" }}
                  >
                    {Number(h.holidayDate.slice(8, 10))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{h.name}</span>
                    <span className="text-xs text-muted-foreground capitalize">
                      {dayName.format(new Date(`${h.holidayDate}T00:00:00Z`))} · {HOLIDAY_TYPE_LABELS[h.holidayType] ?? h.holidayType}
                    </span>
                  </span>
                  {canManage ? <HolidayDeleteButton id={h.id} name={h.name} /> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
