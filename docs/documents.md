# Surat & PKWT: letter numbering and PKWT generator (migration 0027)

`/documents` (menu Manajemen → **Surat & PKWT**):

| Tab / action | Who | What |
| --- | --- | --- |
| Register surat | employees.view + employees.document.view | every issued number with date, type, subject, employee/recipient, status; filters by date, type, search |
| Ambil nomor surat | + employees.document.upload | next number of a type for a date; optional recipient, employee, notes |
| Batalkan | + employees.document.upload | voids a number with a reason; the number is never reused |
| Buat PKWT | + employees.employment.view | contract letter from the employee's data (snapshot), numbered with the PKWT type (created automatically if missing); optional "update contract dates" sets the employee's contract start/end and employment type "Contract" (needs employees.employment.update) |
| Jenis surat | + employees.document.upload | code, name, number format, sequence digits, reset period; default set (PKWT, SK, SKK, SP, ST); code locked once a letter exists |

`/documents/[id]` shows a letter; a PKWT renders as an A4 letter with
**Cetak / PDF** (browser print; app chrome, toasts and mobile navigation are
hidden in print).

## Numbering

Format tokens: `{seq}` (zero-padded), `{code}`, `{month}`, `{roman}`,
`{year}`, `{yy}` — e.g. `{seq}/{code}/HRD/{roman}/{year}` →
`007/SK/HRD/XI/2026`. Sequences restart per year, per month or never.

Issuing runs in a transaction that locks the document type row
(`SELECT … FOR UPDATE`), so simultaneous requests get consecutive numbers
(verified with three tabs submitting at once → 001, 002, 003). Unique indexes
on (type, period, sequence) and (organization, number) are the backstop.

The PKWT text is a general template (parties, position, term, pay, working
hours, rights, termination, closing). Have it reviewed against company
regulations before use. Content is snapshotted, so later profile edits do
not change an issued letter.

Audit: `document_type.*`, `document.issued|voided|pkwt_generated`.

## Database

Additive: `document_types`, `issued_documents` (employee_id optional, →
employees **ON DELETE RESTRICT**; registered in permanent deletion and Test
Data Purge as "Issued letters"). No new permission codes.

## Deploy order

Code ships first; until 0027 runs the pages show "Modul belum aktif".
`DATABASE_URL='<prod>' npm run db:migrate`. Rollback (only if unused):
`DROP TABLE issued_documents, document_types;` and remove the
`0027_documents` row from `drizzle.__drizzle_migrations`.
