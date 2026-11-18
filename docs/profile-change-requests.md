# Profile change requests (migration 0025)

Employees propose changes to their own personal data from **Profil Saya →
Data Pegawai → Data Pribadi → "Ajukan perubahan data"**. HR reviews the
old → new values at **`/profile-changes`** (or in **Persetujuan**, type
"Perubahan data") and approves — the values are applied to the employee
profile in the same transaction — or rejects with a reason.

| Who | Can |
| --- | --- |
| Employee with a linked employee record | submit (one pending request at a time), cancel while pending, see history and HR notes |
| employees.view + employees.personal.view | open `/profile-changes` |
| employees.view + employees.personal.update | approve / reject (never their own request) |

Changeable fields (`features/profile-changes/fields.ts`, unit-tested):
Nomor HP, email pribadi, nama panggilan, tempat & tanggal lahir, agama,
status pernikahan, kewarganegaraan, NIK (16 digit). Employment, payroll and
login data stay HR-only. Only fields that really change are stored, as
`{ field: { from, to } }`; approval re-validates every value, and a NIK
already used by another employee is refused.

Audit: `profile_change.submitted|cancelled|approved|rejected` (approval
stores the old/new values).

## Database

Additive: one table `profile_change_requests` (employee_id → employees
**ON DELETE RESTRICT**, registered in the permanent-deletion plan and in
Test Data Purge as "Profile change requests"). No new permission codes.

## Deploy order

Code ships first. Until 0025 is applied, Profil Saya shows the previous
"contact HR" note, `/profile-changes` shows "Modul belum aktif" and the
approvals inbox has no profile items. Apply with:

```bash
DATABASE_URL='<prod>' npm run db:migrate
```

Rollback (only if unused): `DROP TABLE profile_change_requests;` and remove
the `0025_profile_change_requests` row from `drizzle.__drizzle_migrations`.
