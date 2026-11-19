# Timesheet (migration 0029)

Employees record the hours they spent per day on a project or task, submit
each ISO week, and an approver approves or rejects the employee-week.

| Page | Who | What |
| --- | --- | --- |
| `/timesheet` | attendance.view + linked employee | week navigation, entries per day with day totals, "Catat jam kerja", "Ajukan minggu ini"; rejection note shown |
| `/timesheet/management` | attendance.approve or attendance.manage | one ISO week grouped per employee: total, hours per project, entries, approve / reject (reason required); hours per project for the week; Excel export (attendance.manage) |

- **Entries:** date (no future dates), duration (`1:30`, `1,5`, `2 jam`,
  `90m`; ≤ 16 h per entry, ≤ 24 h per day), project (the employee's active
  project assignments, or every active project when they have none; or
  "internal"), task, notes.
- **Week flow:** draft → *Ajukan* → submitted → approved / rejected. A
  submitted or approved week is locked; editing a rejected entry turns it
  back into a draft, and the week can be re-submitted. Approvers cannot
  review their own timesheet.
- Submitted weeks appear in **Persetujuan** (type "Timesheet"); decisions
  appear in the employee's **Notifikasi**.
- Export: `/api/reports/export?report=timesheet&week=YYYY-MM-DD` (summary +
  entries; 409 before the migration).
- Audit: `timesheet.entry_saved|entry_deleted|week_submitted|week_approved|week_rejected`.
- No new permission codes (attendance permissions, like overtime).

## Database

Additive table `timesheet_entries` (employee_id → employees **ON DELETE
RESTRICT**, project_id → projects SET NULL, reviewer → users SET NULL).
Permanent deletion and Test Data Purge ("Timesheets") remove an employee's
entries explicitly. Before 0029 the pages show "Modul belum aktif" and the
inbox / notifications simply have no timesheet items.

`DATABASE_URL='<prod>' npm run db:migrate` · rollback (only if unused):
`DROP TABLE timesheet_entries;` and remove the `0029_timesheets` row from
`drizzle.__drizzle_migrations`.

Rules: `features/timesheets/rules.ts` (unit-tested).
