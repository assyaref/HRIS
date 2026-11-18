# Reference parity — People Moyee analysis (Nov 2026)

Mapping of the modules in the reference analysis to this HRIS. "Built" =
available now; "Existing" = already covered before this pass; "Next" =
needs new tables, so it ships with a reviewed migration (production
migrations are applied manually in an approved window — the deploy
workflow never runs `db:migrate`, so code that needs a new table must not
be deployed before its migration).

## Built in this pass (no schema change)

| Reference module | Route | Guard |
| --- | --- | --- |
| Executive Approval | `/approvals` — one inbox for leave + permission requests, status counts, date window | any of leave/permission approve/manage |
| Document Control / Monitoring Contract / Reporting Contract | `/monitoring/contracts` — Kedaluwarsa / Akan habis (≤ 30 hari) / Berlaku / Tanpa batas / Nonaktif, Excel export | employees.view + employees.employment.view (export: + employees.export) |
| Reporting Employee (in/out, turnover) | `/reports/employees` — headcount, masuk, keluar, turnover, per departemen / lokasi, Excel | reports.view |
| Reporting Leave | `/reports/leave` — per jenis / status, Excel | reports.view |
| Audit Trail | `/settings/audit-trail` — filter aksi/pelaku, modul, tanggal | audit.view |
| Organization Chart | `/organization/chart` — from each employee's Manager, print / PDF | employees.view |
| Dashboard: Employee Data Progress, demographic gender / age, contracts expiring | Beranda (management) | employees.view (+ personal.view for demographics, employment.view for contracts) |

Exports: `GET /api/reports/export?report=contracts|employees|leave` —
authenticated, every required permission checked server-side, audit-logged
(`report.exported`).

Pure logic with tests: `features/compliance/contract-status.ts`,
`features/reports/employee-movement.ts`, `features/org-chart/build-tree.ts`,
`features/insights/workforce.ts` (tests in `tests/reference/`).

## Existing before this pass

Organisasi (tenant), Proyek, Lokasi Kerja (geofence), Karyawan (profil
multi-tab, tab & field kustom, import/export Excel), Absensi (wajah + GPS,
rekap), Cuti (jenis, saldo, persetujuan), Izin, Payroll & slip gaji,
Pengumuman, Notifikasi, Pengguna / Role / Hak Akses (RBAC), jejak audit
(tabel `audit_logs`).

## Built with migration 0023 (see docs/compliance-mcu-training.md)

| Reference module | Route |
| --- | --- |
| Monitoring / Reporting Medical Check Up | `/compliance/mcu` |
| Monitoring / Reporting Training, Matrix Training, Matrix Training Setup, Employee Training (master) | `/compliance/trainings` |

## Next phase (needs migrations)

| Module | New data |
| --- | --- |
| MCU doctor notes / consultation requests (from mobile) | doctor-note & consultation tables |
| Overtime / SPKL, Overtime Setup | `overtime_requests`, project overtime settings |
| Holiday calendar, Shift / Work Schedule, Work Group | `holidays`, `shifts`, `work_groups` |
| Organization master (department, area, grade, jabatan, job desc) | organization master tables |
| Generic approval engine for profile-change requests from mobile | `approval_requests` (type, payload old/new, approver chain) |
| Ask Admin (helpdesk), Activity, Planner | tickets, categories, activities |
| Management No Surat (document numbering), PKWT generator | counters, templates |
| Timesheet | timesheets + approvals |

Recommended order (from the reference roadmap): calendar + shifts → overtime
→ MCU + training (feeds Document Control) → approval engine → helpdesk →
documents. Each: migration + seed for new permission codes + pages +
tests + `npm run smoke:routes`.
