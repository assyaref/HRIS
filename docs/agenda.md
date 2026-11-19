# Agenda Perusahaan (migration 0031)

Company planner: meetings, trainings and events for all employees or chosen
departments, with optional RSVP.

| Page | Who | What |
| --- | --- | --- |
| `/agenda` | everyone | upcoming (120 days) / past (180 days) events the user is invited to, grouped per day (WIB), RSVP buttons (Hadir / Mungkin / Tidak hadir), count of events waiting for an answer |
| `/agenda/[id]` | invited employees; publishers | details and RSVP; publishers also see every invited employee's answer (filter: hadir / mungkin / tidak hadir / belum menjawab), Export Excel, edit and cancel / re-activate |

- **Publishers** = `announcements.create` (the people who publish company
  information); they see every event, invited or not. Nobody else can open
  an event they are not invited to (404).
- **Audience**: all employees, or departments picked from the organization
  master / employee data; matched case- and space-insensitively against the
  employee's department.
- Times are entered and shown in WIB; all-day and multi-day events supported.
- RSVP only for invited employees, on events that are not cancelled and not
  over. Cancelled events disappear for employees.
- **Notifikasi**: events in the next 7 days, unread while an RSVP is asked
  and not answered.
- Export: `/api/reports/export?report=agenda&event=<id>` (announcements.create).
- Audit: `agenda.created|updated|cancelled|responded`.

## Database

Additive: `agenda_events`, `agenda_responses` (employee_id → employees
**ON DELETE RESTRICT**, event_id CASCADE; unique per event + employee).
Permanent deletion and Test Data Purge ("Agenda responses") remove an
employee's answers explicitly. Before 0031 the pages show "Modul belum
aktif" and notifications have no agenda items.

Rules: `features/agenda/rules.ts` (unit-tested).
