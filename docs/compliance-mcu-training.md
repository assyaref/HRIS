# Compliance: Medical Check Up & Training (migration 0023)

## What it adds

| Page | Purpose | View | Change |
| --- | --- | --- | --- |
| `/compliance/mcu` | MCU per karyawan (terbaru / semua), status Kedaluwarsa / Akan habis (≤ 30 hari) / Berlaku / Tanpa masa berlaku, karyawan tanpa MCU, Export Excel | employees.view + employees.personal.view | employees.personal.update |
| `/compliance/trainings` | Data training & sertifikat, matriks training per jabatan (kepatuhan per karyawan), master training | employees.view + employees.employment.view | employees.employment.update |

- Export: `/api/reports/export?report=mcu|trainings` (+ employees.export).
- Beranda → "Perlu Perhatian": MCU / sertifikat yang kedaluwarsa atau
  berakhir ≤ 30 hari.
- A training record linked to a master without a "Berlaku sampai" date gets
  `training_date + master.validity_months` automatically.
- All mutations are audit-logged (`mcu.*`, `training.*`,
  `training_master.*`, `training_requirement.*`).
- No new permission codes: the module reuses the profile's Personal /
  Employment permissions, so no RBAC re-seed is needed.

## Database (migration `0023_compliance_mcu_training`)

Additive only — four new tables, nothing else changes:

- `medical_checkups` (employee_id → employees **ON DELETE RESTRICT**)
- `training_masters`
- `employee_trainings` (employee_id → employees **RESTRICT**,
  training_master_id → training_masters RESTRICT)
- `training_requirements` (training_master_id → training_masters CASCADE;
  no employee reference)

Permanent employee deletion removes MCU / training rows explicitly
("Other related records"), and Test Data Purge does the same ("Medical &
training"). Both skip the tables while they do not exist, so deletion keeps
working before the migration.

## Deploy order (safe either way)

The code ships before the migration. Until 0023 is applied the two pages show
"Modul belum aktif", the export answers 409, and the dashboard simply has no
MCU/training alerts. Nothing errors. After the migration the module turns on
by itself (no restart).

## Applying the migration on the VPS

1. Backup first (the daily timer also does this):
   ```bash
   sudo systemctl start hris-backup.service
   ```
2. From the deployed source tree of the current release (same commit as the
   running build), with the production `DATABASE_URL`:
   ```bash
   DATABASE_URL='<prod>' npm run db:migrate
   ```
3. Verify:
   ```bash
   psql "$DATABASE_URL" -c "\dt (medical_checkups|training_masters|employee_trainings|training_requirements)"
   ```
   and open `/compliance/mcu` — the notice is gone.

Rollback (only if no data was entered yet):
`DROP TABLE training_requirements, employee_trainings, medical_checkups, training_masters;`
and remove the `0023_compliance_mcu_training` row from
`drizzle.__drizzle_migrations`.
