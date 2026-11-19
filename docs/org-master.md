# Master Organisasi: departments, positions, grades (migration 0030)

`/organization/master` (menu Manajemen → Master Organisasi; view:
employees.view, change: employees.employment.update).

| Tab | Content |
| --- | --- |
| Departemen | name, division, description, employees using it, positions in it |
| Jabatan | name, department, grade, **job description**, employees using it |
| Grade | code, name, level (seniority), positions with that grade |

## Employees keep free text — the master curates it

`employees.division / department / position` are **not** changed (no
column, no foreign key). The master is matched against them ignoring case
and extra spaces ("  akuntansi " ≡ "Akuntansi"):

- **Rapikan data karyawan** panel per tab:
  - *Tambahkan N ke master* — creates entries for every value used by
    employees but missing in the master (most used spelling wins);
  - *Seragamkan N data karyawan* — rewrites matching spellings to the
    master's exact name.
- Renaming a department / position offers *perbarui juga N data karyawan*
  so employees follow the new name.
- Employee forms (create dialog, Employment section of the profile) get
  autocomplete suggestions from the active master (`<datalist>`), still
  accepting any text.
- Bulk employee updates are limited to the caller's organization and
  audit-logged with counts (`org_master.*`).

## Database

Additive: `job_grades`, `departments`, `job_positions` (department / grade
SET NULL); no employee reference, nothing to clean up on employee deletion.
Before 0030 the page shows "Modul belum aktif" and the employee forms simply
have no suggestions. `DATABASE_URL='<prod>' npm run db:migrate`; rollback
(only if unused): `DROP TABLE job_positions, departments, job_grades;` and
remove the `0030_org_master` row from `drizzle.__drizzle_migrations`.

Rules: `features/org-master/rules.ts` (unit-tested).
