# Helpdesk "Tanya Admin" (migration 0026)

Employees ask HR questions as tickets; HR answers in a thread.

| Page | Who | What |
| --- | --- | --- |
| `/helpdesk` | every signed-in user with a linked employee | own tickets, unread HR replies, "Buat tiket" (category, priority, subject, question) |
| `/helpdesk/[ticketId]` | the ticket owner, or an agent | conversation; owner can reply and close ("Masalah selesai"); writing on a finished ticket reopens it |
| `/helpdesk/management` | agents: employees.view + employees.update | all tickets, "waiting for HR" first, filters, search; Kategori tab (add, default set, (de)activate) |

Agents on a ticket can reply publicly or write an **internal note** (never
shown to the employee), and set status (Baru / Diproses / Selesai / Ditutup),
priority, category and assignee (active users with employees.update). An
agent opening their *own* ticket acts as the employee.

- Ticket numbers: `TKT-YYMM-NNNN`, per organization and month, unique
  (retried on a concurrent collision).
- An HR reply on a new ticket moves it to "Diproses".
- Unread HR replies appear in **Notifikasi** (and the bell count) until the
  employee opens the ticket.
- Audit: `helpdesk.ticket_created|message_added|ticket_updated|category_*`.
- No new permission codes.

Also in this change, **Notifikasi** now includes overtime decisions
(migration 0024) and profile-change decisions (0025), each only once its
module's tables exist.

## Database

Additive: `helpdesk_categories`, `helpdesk_tickets` (employee_id →
employees **ON DELETE RESTRICT**), `helpdesk_messages` (ticket_id → tickets
CASCADE). Permanent deletion and Test Data Purge ("Helpdesk tickets")
delete the tickets explicitly; messages go with them.

## Deploy order

Code ships first; until 0026 runs the pages show "Modul belum aktif" and
notifications simply have no helpdesk items. Apply with
`DATABASE_URL='<prod>' npm run db:migrate`.

Rollback (only if unused): `DROP TABLE helpdesk_messages, helpdesk_tickets,
helpdesk_categories;` and remove the `0026_helpdesk` row from
`drizzle.__drizzle_migrations`.
