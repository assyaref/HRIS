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

## Letter templates (migration 0028)

Tab **Templat surat** on `/documents`: templates with a title, a letter type
(for numbering) and a plain-text body — paragraphs separated by blank
lines — with merge fields: `{{nama}}`, `{{nomor_karyawan}}`, `{{nik}}`,
`{{jabatan}}`, `{{departemen}}`, `{{divisi}}`, `{{lokasi_kerja}}`,
`{{tanggal_masuk}}`, `{{jenis_kepegawaian}}`, `{{alamat}}`,
`{{perusahaan}}`, `{{nomor_surat}}`, `{{tanggal_surat}}`, `{{kota}}`,
`{{penandatangan}}`, `{{jabatan_penandatangan}}`, and three typed when the
letter is made: `{{keterangan}}`, `{{tanggal_mulai}}`, `{{tanggal_selesai}}`.

- Editor with clickable fields and a live preview on sample data; unknown
  fields or broken braces are rejected.
- "Tambah templat standar": Surat Keterangan Kerja, SP-1, SP-2, SP-3, Surat
  Tugas, SK Pengangkatan Karyawan Tetap (creates the default letter types
  when missing).
- **Buat surat dari templat**: pick template + employee; only the fields the
  template uses are asked; the number is issued from the template's type and
  the rendered text is snapshotted (`content.kind = "letter"`), printed as
  an A4 letter. Text only — a template can never inject markup.
- Same permissions as letters (employees.view + employees.document.upload).
  Audit: `letter_template.created|updated`, `document.letter_generated`.
- Additive table `letter_templates` (no employee reference). Before 0028 the
  tab shows "Modul belum aktif" and the button is hidden; numbering and PKWT
  keep working.

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
