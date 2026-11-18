# Time management: Kalender Libur, Shift & Grup Kerja, Lembur (migration 0024)

## What it adds

| Page | Purpose | View | Change |
| --- | --- | --- | --- |
| `/time/calendar` | Kalender bulanan + daftar hari libur (nasional, cuti bersama, perusahaan) | attendance.view | attendance.manage |
| `/time/shifts` | Master shift (jam masuk/pulang, istirahat, hari kerja, warna) dan grup kerja (shift + anggota) | attendance.manage | attendance.manage |
| `/overtime` | Karyawan mengajukan lembur (SPKL), melihat riwayat, membatalkan yang masih menunggu | attendance.view + akun tertaut ke karyawan | — |
| `/overtime/management` | Rekap & persetujuan lembur, lembur terbanyak, catat lembur atas nama karyawan | attendance.approve or attendance.manage | approve/reject: approve or manage; catat SPKL: manage |

- `/approvals` (Persetujuan) now also lists overtime requests for users with
  attendance.approve / attendance.manage (type "Lembur").
- Rules (`features/time/rules.ts`, unit-tested): times are `HH:MM`; an end
  time before the start crosses midnight (22:00 → 01:30 = 3 j 30 m); one
  request is at most 12 hours; equal start/end is rejected.
- An employee belongs to at most one work group; adding them to a group moves
  them out of the previous one. A shift used by a group cannot be deleted
  (deactivate it instead).
- Approvers cannot review their own overtime. HR-recorded overtime (SPKL) is
  approved immediately.
- All mutations are audit-logged (`holiday.*`, `shift.*`, `work_group.*`,
  `overtime.*`).
- No new permission codes: the module reuses the attendance permissions, so
  no RBAC re-seed is needed.

## Database (migration `0024_time_management`)

Additive only — five new tables, nothing else changes:

- `holidays` (unique organization + date + name)
- `shifts` (unique organization + name)
- `work_groups` (shift_id → shifts **RESTRICT**)
- `work_group_members` (work_group_id → work_groups CASCADE,
  employee_id → employees **RESTRICT**, unique organization + employee)
- `overtime_requests` (employee_id → employees **RESTRICT**, reviewer /
  submitter → users SET NULL)

Permanent employee deletion removes `work_group_members` and
`overtime_requests` rows explicitly ("Other related records"); Test Data
Purge does the same ("Shift & overtime"). Both skip the tables while they do
not exist.

## Deploy order (safe either way)

The code ships before the migration. Until 0024 is applied the four pages
show "Modul belum aktif" and the approvals inbox simply has no overtime
items. Nothing errors. After the migration the module turns on by itself.

## Applying the migration on the server

1. Backup first:
   ```bash
   sudo systemctl start hris-backup.service
   ```
2. From the deployed source tree of the current release, with the production
   `DATABASE_URL` (applies 0023 too if it is still pending):
   ```bash
   DATABASE_URL='<prod>' npm run db:migrate
   ```
3. Verify:
   ```bash
   psql "$DATABASE_URL" -c "\dt (holidays|shifts|work_groups|work_group_members|overtime_requests)"
   ```

Rollback (only if no data was entered yet):
`DROP TABLE overtime_requests, work_group_members, work_groups, shifts, holidays;`
and remove the `0024_time_management` row from `drizzle.__drizzle_migrations`.
