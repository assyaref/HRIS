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

## Built with migration 0024 (see docs/time-management.md)

| Reference module | Route |
| --- | --- |
| Holiday calendar | `/time/calendar` |
| Shift / Work Schedule, Work Group | `/time/shifts` |
| Overtime / SPKL (self-service) | `/overtime` |
| Shift-aware attendance (late / early / absent by work-group shift) | `/time/schedule-report` |
| Overtime approval & recap | `/overtime/management`, `/approvals` (type Lembur) |

## Built with migration 0025 (see docs/profile-change-requests.md)

| Reference module | Route |
| --- | --- |
| Approval of profile-change requests from mobile | Profil Saya → Ajukan perubahan data; `/profile-changes`, `/approvals` |

## Built with migration 0026 (see docs/helpdesk.md)

| Reference module | Route |
| --- | --- |
| Ask Admin (helpdesk) with categories | `/helpdesk`, `/helpdesk/management` |

## Built with migration 0027 (see docs/documents.md)

| Reference module | Route |
| --- | --- |
| Management No Surat (document numbering), PKWT generator | `/documents` |

## Next phase (needs migrations)

| Module | New data |
| --- | --- |
| MCU doctor notes / consultation requests (from mobile) | doctor-note & consultation tables |
| Overtime Setup (rates, project rules), overtime → payroll | project overtime settings |
| Organization master (department, area, grade, jabatan, job desc) | organization master tables |
| Multi-level approver chain, bank-account / address / family change requests | extends `profile_change_requests` |
| Activity, Planner | activities |
| Custom letter templates (SK, SKK, SP) with merge fields | letter templates |
| Timesheet | timesheets + approvals |

Recommended order (from the reference roadmap): ~~calendar + shifts →
overtime → MCU + training → profile-change approval → helpdesk →
documents (No Surat, PKWT)~~ (done) → timesheet, letter templates. Each: migration + seed for new permission codes + pages +
tests + `npm run smoke:routes`.
