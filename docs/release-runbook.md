# Release runbook — reinstall / deploy with migrations 0023–0032

This release adds ten additive migrations. **The code is safe before and
after them**: every new module checks its tables and shows "Modul belum
aktif" until its migration runs; nothing in the existing modules changes
behaviour until the related feature is configured.

| Migration | Module | Guide |
| --- | --- | --- |
| `0023_compliance_mcu_training` | MCU & Training | `docs/compliance-mcu-training.md` |
| `0024_time_management` | Kalender Libur, Shift & Grup Kerja, Lembur (SPKL), Kepatuhan Jadwal, Lembur → Payroll | `docs/time-management.md` |
| `0025_profile_change_requests` | Pengajuan perubahan data (pribadi, alamat, rekening) | `docs/profile-change-requests.md` |
| `0026_helpdesk` | Tanya Admin | `docs/helpdesk.md` |
| `0027_documents` | Nomor surat & PKWT | `docs/documents.md` |
| `0028_letter_templates` | Templat surat | `docs/documents.md` |
| `0029_timesheets` | Timesheet | `docs/timesheets.md` |
| `0030_org_master` | Master Organisasi | `docs/org-master.md` |
| `0031_agenda` | Agenda | `docs/agenda.md` |
| `0032_approval_chain` | Persetujuan bertingkat (opt-in) | `docs/approval-chain.md` |

All ten only `CREATE TABLE` / indexes / foreign keys on the new tables (each
has a test asserting it is additive). Employee foreign keys are
`ON DELETE RESTRICT` and registered in permanent deletion and Test Data
Purge. No new permission codes: no RBAC re-seed is needed.

## 1. Before

- The server is reachable and PostgreSQL is running (`systemctl status postgresql`).
- Enough disk for a backup (`df -h`).
- A **backup** of the production database:
  ```bash
  sudo systemctl start hris-backup.service
  ```
  (or `pg_dump -Fc "$DATABASE_URL" > hris-$(date +%F).dump`), and confirm the
  file exists and is not empty.

## 2. Deploy the code

Push to `main` (GitHub Actions → `hris-deploy` → health check on
`/api/health`), or run the deploy script on the server as before. The app
works immediately; new modules show "Modul belum aktif".

## 3. Run the migrations

From the deployed source tree of the **same commit**, with the production
`DATABASE_URL` (or `.env.production` present):

```bash
npm run db:status      # lists applied / PENDING / SKIPPED; exit 1 = work to do
npm run db:migrate     # applies all pending migrations in one go
npm run db:status      # must end with "0 pending"
```

`SKIPPED` means a journal entry older than the last applied one was never
recorded; drizzle-kit will not apply it. Stop and apply that file manually
(`psql -f db/migrations/<tag>.sql`) after review. (Historical note: entries
`0011_nasty_khan`, `0015_user_account_name` and `0016_employee_master_data`
share one timestamp; they were always applied together.)

## 4. Verify

1. Sign in as Super Administrator → **Pengaturan → Status Sistem**: database
   connected, migrations `N/N`, all modules "Aktif".
2. Optional route smoke test (Playwright on a machine that can reach the app):
   ```bash
   SMOKE_BASE_URL=https://<host> SMOKE_USER=<admin> SMOKE_PASSWORD=<…> npm run smoke:routes
   ```
   Repeat with an HR account and an employee account; 403 pages count as a
   pass.

## 5. First-time setup (HR, in the app)

| Where | What |
| --- | --- |
| Master Organisasi | "Tambahkan ke master" for departments and positions, then "Seragamkan"; add grades and job descriptions |
| Kalender Libur | national holidays and collective leave for the year |
| Shift & Grup Kerja | shifts, then groups and members (enables Kepatuhan Jadwal) |
| Kelola Lembur → Integrasi payroll | "Siapkan komponen Lembur" (payroll manager) to pay approved overtime |
| Kelola Tiket Helpdesk → Kategori | "Tambah kategori standar" |
| Surat & PKWT | "Tambah jenis surat standar", then Templat surat → "Tambah templat standar"; review the template wording |
| MCU & Training | training masters, position matrix |
| Pengaturan → Alur Persetujuan | optional: direct manager → HR (needs the "Atasan" field filled in profiles) |

## 6. Rollback

The code does not need the new tables, so rolling the **code** back is a
normal redeploy of the previous commit. Rolling back a **migration** is only
safe while its tables are unused; each module guide lists the `DROP TABLE`
statement and the `drizzle.__drizzle_migrations` row to remove. Otherwise
restore the backup taken in step 1.
