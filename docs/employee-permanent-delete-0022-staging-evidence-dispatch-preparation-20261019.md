# Migration 0022 — Staging Evidence Dispatch Preparation & Operational Intake Checklist (2026-10-19)

**Document type:** DISPATCH PREPARATION RECORD + OPERATIONAL INTAKE CHECKLIST —
**staging scope only**. This is **not** an approval, a change record, a
verification result, a gate decision, or an execution instruction. It authorizes
nothing and must not be read as one. The messages in §4 are **prepared for
manual dispatch through the official channel by an authorized person**; this
document does not send them and does not contact anyone.

**Status:** OPEN — messages PREPARED, **NOT SENT**. All **47** artifacts
(`A1`–`H3`) remain `PENDING` (not received); all staging gates (`G1-S`–`G5-S`)
remain `BLOCKED`; all Part A rows (`A1`–`A14`) remain `PENDING` ☐; **14** of 15
blockers remain `OPEN` (`B-12` `CLOSED` by documentation corrective action,
2026-10-16). No artifact is `CONFIRMED`; no gate is `PASS`.

**Date prepared:** 2026-10-19
**Repository:** `/opt/hris` (git `main`, working tree; no commit made)

**Built from / validated against (unchanged; this document only references them
and adds the dispatch layer the coordination package calls for):**

| Source document | Role here |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` (pack) | Authoritative artifact rows; governs on conflict |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` (register) | Receiving side; per-row `Env`/`Captured (UTC)`/`Collector`/`Reviewer`/`Checksum`/`Result` |
| `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` (coordination) | Owner slices (§2.1), stop conditions (§2.6), Part A checklist (§4) |
| `docs/employee-permanent-delete-0022-staging-evidence-response-templates.md` (templates) | Waves (§2), label block (§3), `RT-DBA`/`RT-APP`/`RT-OP`/`RT-RV` (§4), receipt workflow (§6) |
| `docs/employee-permanent-delete-dba-handoff.md` (handoff) | Labeling §5.2, storage §5.3, redaction §5.4, return checklist §8, STOP §7.2 |
| `docs/employee-permanent-delete-dba-evidence-intake.md` (DBA intake) | Result vocabulary §0, gates §5, staging authorization §7.1 |

> **Hard boundary observed in producing this document.** No database was
> contacted and **no query was executed**. No migration, seed, deployment,
> journal, snapshot, ledger, schema, configuration, or employee record was run,
> read, or changed. No secret, `.env.production`, or connection string was read
> or guessed. No message was sent; no owner was contacted; no recipient name,
> email address, or identity was invented. No `PENDING` row was advanced, no gate
> was set to `PASS`, and no rehearsal was started or authorized. Control plane
> unchanged: `DELETION_EXECUTION_ENABLED = false`,
> `RETENTION_ELIGIBLE_CATEGORIES = []`.

---

## 0. Purpose and scope

The coordination package and the response templates define *what* is requested,
*who* owns it, and *how* it is returned. This document is the **dispatch-execution
layer for 2026-10-19**: it (i) records the result of the official-channel
connector check, (ii) fixes the recipient roster by **role only**, (iii)
provides the five copy-ready messages (DBA; DBA + Application Lead; Application
Lead; operator; independent reviewer), (iv) provides the operational per-artifact
intake checklist used when artifacts arrive, and (v) records the local read-only
verification performed today. It creates no new requirement and changes no state.

**In scope:** staging evidence dispatch preparation; artifacts `A1`–`H3` (47);
recipients by role; intake validation steps; local repository-side verification
(repo facts only).

**Out of scope (unchanged):** every production evidence row, gates `G1-P`–`G4-P`,
Part B `B1`–`B13`, policy §4 retention sign-off, any apply/rehearsal, any
`generate`/`push`, journal or ledger edit, seed, deployment, or employee deletion.

---

## 1. Official-channel connector check (2026-10-19, read-only)

Question: does this workspace provide an official integration/connector that is
allowed to communicate with the artifact owners (DBA, Application Lead,
operator, reviewer)?

| Candidate channel | Checked | Result |
| --- | --- | --- |
| OpenCode configuration (`~/.config/opencode/opencode.json`, `opencode.jsonc`) | yes | **Model providers only** (Token Harbor, Ollama). **No MCP server, no email, no ticketing, no chat/Slack connector** is configured. |
| OpenCode plugins / MCP (`~/.opencode`, project `.opencode`) | yes | Binary + package files only; **no messaging or ticketing capability**. |
| Project repositories (`/opt/hris`, deploy tooling) | yes | No outbound communication integration for evidence dispatch; `/usr/local/sbin/hris-deploy` is an external deployment binary (root-owned, not readable, not a communication channel). |
| Direct database access from this account | yes | **Not available and not attempted**; the application team supplies no connection string and must not run DBA templates (pack §1 rule 3). |

**Conclusion:** **no official outbound connector is available from this
workspace.** External dispatch therefore **cannot be performed here**. The five
messages in §4 are produced as **copy-ready text for an authorized person to
send through the organization's official channel**. Recipients are identified by
**role only** (§2); no name, email address, or personal identity is fabricated
anywhere in this document or in the messages. **No message has been sent and no
owner has been contacted** as part of this work.

---

## 2. Recipient roster (by role only — fill identity at dispatch time)

Identity columns are intentionally empty; the dispatcher fills them from the
organization's own directory at send time. Do not guess or invent them.

| Msg | Role (from coordination §1 / templates §8) | Response template | Artifacts (count) | Wave-1 first actions | Name / address (fill at dispatch) | Sent (UTC) |
| --- | --- | --- | --- | --- | --- | --- |
| M-1 | **DBA** (primary collector) | `RT-DBA` | sole 27 (`A1`,`A2`,`A3`,`A5`,`A7`,`B1`,`B2`,`B4`,`B5`,`C1`–`C6`,`C9`,`D1`,`D4`,`E2`,`E5`,`F1`–`F6`,`G6`) | `A1`,`A2`,`A3`,`A5`,`A7`; `D1`,`D4` | | ☐ not sent |
| M-2 | **DBA + Application Lead** (joint) | `RT-DBA` + `RT-APP` contributions | joint 11 (`A4`,`B3`,`C7`,`C8`,`D5`,`E1`,`E3`,`E4`,`E6`,`H1`,`H3`) | `A4`; `D5` (after `D1`–`D4` + `G1`); open change record (`H3`) | | ☐ not sent |
| M-3 | **Application Lead** (primary collector/classifier) | `RT-APP` | sole 7 (`D2`,`D3`,`G1`,`G2`,`G3`,`G4`,`G5`) + classification contribution (`C7`,`C8`) | `D2`,`D3`,`G1` | | ☐ not sent |
| M-4 | **Rehearsal operator** | `RT-OP` | `A6`, `H2` | `A6`, `H2` (can follow Wave 1; `A6` feeds `A12`/`B-08`) | | ☐ not sent |
| M-5 | **Independent reviewer (≠ collector)** | `RT-RV` | verifies all 47 on receipt | stand by; no result valid without a named reviewer | | ☐ not sent |

**Dispatch rules (templates §5, handoff §5.3, pack §1 rule 6):** raw artifacts go
**only** to the approved restricted-access evidence location over the approved
secure channel — **never** in Git, **never** in chat, **never** in a broadly
shared folder. The messages themselves contain no secret and no connection
string; they may travel on the normal official channel.

---

## 3. Intake sequence (waves + dependencies; nothing here authorizes anything)

Wave order per response-templates §2 (adjusted dependency notes from pack §2/§8
and register §3). Read-only collection may run in parallel where independent;
completing a wave advances no gate until a reviewer ≠ collector records the
`Result`.

| Wave | Artifacts | Owners | Closes (when CONFIRMED) | Dependency notes |
| --- | --- | --- | --- | --- |
| **1 — Identity/isolation + `0020` urgent** | `A1`,`A2`,`A3`,`A4`,`A5`,`A7`; `D1`,`D2`,`D3`,`D4`,`D5` (+`G1` pinning input) | DBA; joint `A4`/`D5`; App Lead `D2`/`D3`/`G1` | `B-01`,`B-04`,`B-07`(partial),`B-08`; feeds `G5-S`,`G1-S` | `D5` needs `D1`–`D4` **and** the pinned build `G1`; `A6` guard attestation (Wave 4) is separate from Wave-1 `A1`–`A5`/`A7` capture |
| **2 — Ledger / catalog / lineage** | `B1`–`B5`; `C1`–`C9`; `E1`–`E6` | DBA; joint `B3`,`C7`,`C8`,`E1`,`E3`,`E4`,`E6` | `B-02`,`B-03`,`B-05`; feeds `G2-S`,`G3-S` | `E1` needs `B2`; `E2` needs `B3`+`B4`; `E3` needs `B1`–`B5`+`C1`–`C7`; `E4` needs the approved reconciliation disposition; `E6` needs `E1`–`E5`; `C9` is the pre-apply BEFORE capture (before any rehearsal) |
| **3 — Backup / build** | `F1`–`F6`; `G2`–`G6` (`G1` already Wave 1) | DBA `F*`+`G6`; App Lead `G2`–`G5` | `B-06`,`B-09`,`B-14`; feeds `G4-S`,`A5`,`A8`,`A14` | `F3` restore target must be proven **disposable + isolated**; `G4` repo preflight still requires in-rehearsal DBA re-verification (`B-14`) |
| **4 — Attestations** | `A6`,`H1`,`H2`,`H3` | operator `A6`/`H2`; joint `H1`/`H3` | `B-08`(complete),`B-10`,`B-13`; feeds `A3`,`A11`,`A12`,`A13` | `H3` (change record) is best opened **first** operationally so every artifact can carry a ticket ID (pack §8 step 1); `A1`/`A2` authorizations (`B-11`) signed **last** |

**Gate resolution rule (register §7, coordination §3.8):** `G1-S`–`G5-S` are
resolved by DBA + Application Lead **only after** the cited artifacts are
`CONFIRMED` against attached raw artifacts — never from repository facts, test
output, or this document.

---

## 4. Ready-to-send messages (copy-ready; NOT SENT)

Each message is self-contained: scope, artifacts + IDs + gates/blockers, what to
collect, environment/database allowed, mandatory metadata, acceptance criteria
and response format, prerequisites/dependencies, and the negative-result rule.
Message text cites the governing documents so the recipient never has to guess.

### 4.1 M-1 — To: DBA (primary collector)

```
SUBJECT: [HRIS-0022][STAGING ONLY] Evidence request — DBA collection slice (27 artifacts, A1–G6). Read-only. No approval, no execution.

Kepada: DBA (penanggung jawab utama kolleksi bukti staging)
Dari: [pengirim resmi — isi saat dispatch]
Tiket / change record: [ID — buka/isi pada H3/A3; jika belum ada, laporkan sebagai prerequisite]

1. SCOPE & AUTHORITY
- Ini adalah PERMINTAAN BUKTI (evidence request) untuk migration 0022, LINGKUPAN STAGING SAJA.
- Bukan approval, bukan change record, bukan instruksi eksekusi. Tidak ada apply/rehearsal yang diizinkan.
- Reference pack: docs/employee-permanent-delete-0022-staging-evidence-request-pack.md (§2 rows govern);
  intake register: docs/employee-permanent-delete-0022-staging-evidence-intake-register.md §3;
  aturan: pack §1 (rules of engagement), handoff §5 (label/storage/redaction), handoff §8 (return checklist).
- Kumpulan 27 artefak DBA (sole): A1, A2, A3, A5, A7, B1, B2, B4, B5, C1, C2, C3, C4, C5, C6, C9, D1, D4, E2, E5, F1, F2, F3, F4, F5, F6, G6.
- Kontribusi joint (dengan Application Lead): A4, B3, C7, C8, D5, E1, E3, E4, E6, H1, H3 (lihat pesan M-2).

2. ENVIRONMENT & DATABASE YANG DIPERBOLEHKAN
- HANYA database STAGING. Setiap artefak wajib berlabel Env = staging + nama database staging.
- JANGAN menjalankan apapun terhadap production. JANGAN mensubstitusi artefak production sebagai staging (intake §0 rule 3).
- Tim aplikasi TIDAK menyediakan connection string. JANGAN membaca/menggunakan .env.production.
- Kanal: read-only saja (SELECT / SHOW / current_setting atau record eksternal read-only).
  DILARANG: INSERT/UPDATE/DELETE/DDL/VACUUM/ANALYZE, drizzle-kit migrate/generate/push, edit ledger/journal,
  session_replication_role, disable trigger.

3. ARTEFAK YANG HARUS DIKUMPULKAN (Wave 1 dulu, lalu 2–3)
Wave 1 (prioritas):
- A1  — identitas DB: nama DB, server version lengkap, timezone, encoding, extensions — EVD-E1-1-<ts>-01.txt (template pack §7 TS-S1; redaksi R1)
- A2  — identitas endpoint ter-redaksi + role class (staging/DR/preview/CI) — EVD-E1-2-<ts>-01.txt (T1+TS-S1; R2; hanya host class/cluster role)
- A3  — baris staging dari environment inventory lengkap (E1.3) — EVD-E1-3-<ts>-01.txt (intake dba-evidence-intake §4; R1)
- A5  — export role & grant staging (dedicated owner/migration/app-rw/readonly/backup) — EVD-ROLE-C3-<ts>-01.csv (TS-S2; R3)
- A7  — deployment-controller review: tidak ada controller/systemd/timer/CI/job eksternal yang bisa menjalankan db:migrate di luar change record —
  EVD-E6-4-<ts>-01.md (master §G.2; R1+R5; sertakan /usr/local/sbin/hris-deploy dalam review)
- D1  — konfirmasi kolom 0020 (capture yang sama dengan C2) — EVD-E4-1-<ts>-01.txt (T4/TS-S4)
- D4  — distribusi nilai must_change_password (HANYA agregat count) — EVD-E4-4-<ts>-01.txt (TS-S5; P1)
Wave 2:
- B1 — baris ledger id,hash,created_at — EVD-E2-1-<ts>-01.csv (TS-S3 #1). Jika tabel ledger absen: catat sebagai kegagalan schema/restore, JANGAN pernah membuatnya.
- B2 — ringkasan ledger: count, min(created_at), max(created_at) (epoch ms + rendering UTC) — EVD-E2-2-<ts>-01.txt (TS-S3 #2)
- B4 — baris ledger (jika ada) untuk 0019–0022: id, created_at — EVD-E2-4-<ts>-01.txt (absence = "no ledger row", BUKAN "not applied")
- B5 — observasi append-only + metode — EVD-E2-5-<ts>-01.md
- C1 — 0019: face_enrollment_templates.key_version (default/null/type) — EVD-E3-1-<ts>-01.txt (TS-S4)
- C2 — 0020: users.must_change_password/password_changed_at/last_login_at — EVD-E3-2-<ts>-01.txt (TS-S4)
- C3 — 0021: 3 tabel kontrol + 6 index + aksi FK — EVD-E3-3-<ts>-01.txt (T5)
- C4 — 0022: 11 tabel PROTECTED — nullability, confdeltype, retained_identity_check — EVD-E3-4-<ts>-01.txt (TS-S6). confdeltype='c' (CASCADE) = STOP.
- C5 — inventaris kolom snapshot pada tabel PROTECTED — EVD-E3-4-SNAP-<ts>-01.txt (T7)
- C6 — scan FK employee penuh (deteksi CASCADE tak terduga) — EVD-E3-4-FK-<ts>-01.txt (TS-S7)
- C9 — kontrak PRE-APPLY BEFORE (11 FK protected 'r' + NOT NULL; 0 retained-identity CHECK; inventaris snapshot; 11 deletable FK 'r') —
  EVD-E3-4-PRE-<ts>-01.txt (runbook §5.5 q1–4 / TS-S9)
- E2 — konfirmasi append-only + hash-anchor 0019–0022 — EVD-LIN-2-<ts>-01.md
- E5 — checksum 0015–0022 milik DBA (independen dari repo) — EVD-E6-1-<ts>-01.txt
Wave 3:
- F1 — backup staging terverifikasi terakhir: label pattern <ENVIRONMENT>-db-<YYYYMMDD>T<HHMMSS>Z-pre-0022, waktu UTC, lokasi (redaksi R6), retensi, manifest + SHA-256 — EVD-E5-1-<ts>-01.md
- F2 — output verifikasi backup (complete, bukan queued; WAL continuity; SHA-256 post-transfer) — EVD-E5-2-<ts>-01.log
- F3 — restore test ke database DISPOSABLE terisolasi: log, identitas target (bukan live staging, bukan production), rekonsiliasi row-count/checksum, durasi, pg_isready + identity query; drop atau read-only-kan kembali — EVD-E5-3-<ts>-01.log
- F4 — posture PITR: wal_level, archive_mode, tool, retensi, RPO/RTO — ATAU pernyataan eksplisit "staging is restore-only" — EVD-E5-4-<ts>-01.txt (TS-S10; R7)
- F5 — backup + verifikasi restore private-file storage: manifest (relative path, size, SHA-256), hitungan referenced/missing/orphan/path-escape; restore hanya ke <STAGING_PRIVATE_ROOT>; orphans DIKARANTINA, tidak pernah dihapus — EVD-E5-5-<ts>-01.md (P2)
- F6 — pernyataan eksplisit: apakah backup restore-tested ada untuk staging? (yes + ref F1–F3, atau NO eksplisit) — EVD-E5-6-<ts>-01.md. NO = STOP §4.9.
- G6 — cross-reference A7 untuk jalur deploy aplikasi (kutip artefak A7, jangan ditulis ulang) — EVD-E6-4-G-<ts>-01.md (R1+R5)

4. METADATA WAJIB pada setiap artefak (handoff §5.2, pack §1 rules 4–7, templates §3)
- Env = staging (persis; nilai lain = reject) + nama database.
- Captured (UTC) ISO-8601 + server/report timezone. DILARANG backfill/perkiraan.
- Collector (nama) dan Reviewer (nama, ≠ collector).
- Change/ticket ID dari change record (H3/A3).
- Filename pattern staging: EVD-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext> dengan <item> = ID pack dengan titik diganti dash
  (contoh: EVD-E3-4-20261016T090000Z-01.txt). Gunakan nilai ini persis sebagai Evidence ref di intake register §3.
- SHA-256 per file artifact, dicatat dan dibandingkan saat transfer (mismatch = STOP, jangan direkonsiliasi diam-diam).
  Console text langsung: n/a + catat console/session ID.
- Status redaksi: terapkan kode pack §5 (R1 A1/A3/A7/G6; R2 A2/A4; R3 A5; R6 F1/F2/F3; R7 F4; P1 D4; P2 F5).
  Bukti yang memuat secret/connection string/PII berlebih adalah STOP §4.11 — redaksi + re-capture, jangan disubmis apa adanya.
- Contract-check: setiap artefak diverifikasi terhadap sel Metode verifikasi di pack §2 / register §3.

5. KRITERIA PENERIMAAN & FORMAT RESPONS
- Selesaikan template RT-DBA (response-templates §4.1): packet header + per-artifact return lines + return checklist per group
  (handoff §8) dengan status DONE / PARTIAL / UNAVAILABLE / DISCREPANCY per butir.
- Simpan file mentah HANYA di lokasi bukti restricted-access yang disetujui (bukan Git, bukan chat, bukan folder bersama luas).
- Routing: kembalikan checklist + referensi EVD-… + file mentah (via kanal terkontrol) ke Application Lead untuk entri ke
  staging intake register §3/§4; hasil (Result) hanya dicatat reviewer ≠ collector.
- Yang dihitung diterima: artefak berlabel lengkap + checksum cocok + redaksi terverifikasi + kontrak terpenuhi = CONFIRMED (oleh reviewer).
  Artefak ada tapi kontrak tidak cocok = NOT CONFIRMED. Tidak bisa dikumpulkan = UNAVAILABLE (sebutkan alasannya).

6. PRASYARAT & DEPENDENSI
- Buka/punya change record (H3/A3) agar setiap artefak bisa berlabel ticket ID (pack §8 step 1).
- D1/D4 (0020) = URGENT (handoff §2): laporkan segera. Jika kolom absen DAN build yang membaca must_change_password terdeploy,
  atau build tidak bisa diidentifikasi → ACTIVE INCIDENT, STOP §4.4, eskalasi ke DBA + Application Lead.
- E1 membutuhkan B2 (max created_at). E2 membutuhkan B3+B4. F3 membutuhkan target disposable terbukti terisolasi.
- A6 (re-verification checksum in-rehearsal terhadap 724db82d…65c) dilakukan DBA saat rehearsal nanti (B-14) — bukan bagian dari Wave 1–3 capture ini.

7. HASIL NEGATIF — WAJIB
- Jangan menebak, jangan mengisi PASS dari inferensi repository. Jika bukti tidak tersedia atau tidak bisa dikumpulkan:
  laporkan UNAVAILABLE (dengan alasan) atau NOT CONFIRMED (jika artefak ada tetapi tidak cocok kontrak) — JANGAN diubah menjadi PASS.
- Setiap UNAVAILABLE/NOT CONFIRMED pada butir wajib = STOP sampai gate pemiliknya menyelesaikannya (intake §0 rule 6).
- STOP apa pun: jangan deploy, jangan retry migration, jangan edit journal/ledger, preservasi bukti, eskalasi.

8. YANG TIDAK DIMINTA DARI ANDA SEKARANG
- Bukti production apa pun (G1-P–G4-P, E4.2–E4.4 production, E5.1–E5.6 production, Part B B1–B13) — di luar lingkup permintaan ini.
- Approval A1/A2 (ditandatangani TERAKHIR setelah B-01…B-10 terevidensi — B-11).

Balas dengan: (a) tanda terima permintaan + change record ID, (b) rencana jadwal capture per wave, (c) RT-DBA packet sesuai artefak yang selesai.
```

### 4.2 M-2 — To: DBA + Application Lead (joint artifacts)

```
SUBJECT: [HRIS-0022][STAGING ONLY] Joint evidence request — 11 artefak bersama (A4, B3, C7, C8, D5, E1, E3, E4, E6, H1, H3). Read-only.

Kepada: DBA + Application Lead (pemilik bersama)
Dari: [pengirim resmi — isi saat dispatch]
Tiket / change record: [ID — wajib dibuka/diisi via H3]

1. SCOPE & AUTHORITY
- Permintaan bukti STAGING SAJA untuk migration 0022; bukan approval, bukan change record, bukan instruksi eksekusi.
- Governed oleh pack §2 (row text governs), intake register §3, coordination §2.1 (owner slices) dan §3 (pencatatan status).

2. ENVIRONMENT & DATABASE
- HANYA staging; label Env = staging + nama database pada setiap artefak; tidak ada substitusi antar-environment.
- Read-only saja; kanal bukti = lokasi restricted-access yang disetujui.

3. ARTEFAK JOINT (11) — ID, filename, gate/blocker, kontrak
- A4 — isolation-matrix attestation, semua 7 kontrol (cluster/DB terpisah, file root terpisah, secret staging unik, role dedicated tanpa keanggotaan production, route production ditolak, integrations disabled/test sinks, HRIS_ENV=staging guard) —
  EVD-ISO-C1-<ts>-01.md — feeds G5-S/A4/A12; menutup B-01/B-08 — tiap baris kontrol wajib tanda Attested? + evidence ref (A1/A2/A5/A7 atau platform config); tanpa sel kosong — redaksi R2+R6.
- B3 — pemetaan hash→file review + daftar hash unmapped — EVD-E2-3-<ts>-01.csv — feeds G2-S/G3-S; B-02 — setiap hash ledger dibandingkan sha256(raw .sql) file yang direview; daftar unmapped tetap diproduksi walaupun kosong.
- C7 — inventaris tabel aplikasi penuh (input klasifikasi) — EVD-E3-5-<ts>-01.csv — feeds G1-S/G2-S; B-03 — DBA capture + Application Lead klasifikasi; SEMUA objek diklasifikasi expected-approved / production-only / repository-only / unexplained; unexplained = STOP §4.2.
- C8 — daftar objek live-tanpa-ledger (pola 0015/0016) — EVD-E3-6-<ts>-01.txt — B-03 — dicatat sebagai OBSERVASI dengan referensi tiket; ledger TIDAK PERNAH diedit untuk "memperbaikinya" (STOP §4.7).
- D5 — disposition G1 staging: routine / not-yet-deployed / incident — EVD-G1-DISP-<ts>-01.md — feeds G1-S; B-04 — persis satu dari tiga; diputuskan BERSAMA dua peran; timestamp UTC + evidence ref D1–D4 dicatat; incident/ambigu = STOP §4.4.
- E1 — max(created_at) live staging + kandidat safe repair when (aritmetika ditampilkan; when harus > max, mis. max+1; epoch ms + rendering UTC) — EVD-LIN-1-<ts>-01.md — feeds G3-S/G2-S/A7; B-05 — kandidat when ≤ max = STOP (lineage undetermined).
- E3 — klasifikasi status aplikasi 0019–0022 (applied / not applied / unexplained) dari LEDGER + KATALOG — EVD-LIN-3-<ts>-01.md — B-05 — tiap baris mengutip BOTH ledger dan catalog; nol objek unexplained; klasifikasi dari file repository saja = STOP §4.2/§4.5.
- E4 — disposition snapshot-chain untuk staging (duplikasi prefix 0011; prevId 0012 menggantung; rantai 0012–0014 patah; snapshot idx 15–19 hilang) — EVD-LIN-4-<ts>-01.md — B-05 — disposition ditulis di artefak rekonsiliasi yang di-approve dan dikutip di sini; dilabel eksplisit REPOSITORY FACT, bukan live evidence.
- E6 — penerimaan lineage assessment untuk STAGING (rekaman A7) — EVD-A7-ACCEPT-<ts>-01.md — B-05 — menerima mengutip E1–E5; menyatakan eksplisit ledger production TIDAK dikonsultasikan; percobaan sebelum E1–E5 ada = tetap PENDING (tanpa waiver).
- H1 — evidence-capture plan + pengakuan STOP-condition (A11) — EVD-A11-ACK-<ts>-01.md — feeds A11; B-10 — KEDUA peran mengakui daftar bukti dan daftar STOP di change record.
- H3 — change record header (ID, window, rollback owner, incident commander) + definisi rehearsal (A3, A9, A10: Test A/B/C §5.7 + assertions §5.8) — EVD-CR-A3-<ts>-01.md — feeds A3/A9/A10; B-10 — change record wajib dibuka dengan keempat field; tanpa change record, A3 tetap open dan rehearsal tidak bisa dimulai. BUKA INI DULU (pack §8 step 1).

4. METADATA WAJIB (identik dengan M-1 §4): Env=staging + nama DB; Captured (UTC)+TZ; Collector; Reviewer ≠ collector; change/ticket ID;
   filename EVD-<item>-<ts>-<seq>.<ext>; SHA-256 per file; kode redaksi terpasang (A4: R2+R6); contract-check terhadap Metode verifikasi pack §2.

5. KRITERIA PENERIMAAN & FORMAT RESPONS
- Formulir: kontribusi RT-DBA + RT-APP (templates §4.1/§4.2); C7/C8 menggunakan worksheet klasifikasi objek (RT-APP).
- Status per butir: DONE / PARTIAL / UNAVAILABLE / DISCREPANCY + referensi file EVD-….
- Result (CONFIRMED/NOT CONFIRMED/UNAVAILABLE/PENDING) hanya dicatat reviewer ≠ collector di intake register §3/§4/§8.1.
- Gate G1-S–G5-S hanya diselesaikan SETELAH artefak CONFIRMED, oleh DBA + Application Lead bersama, terhadap artefak terlampir — tidak dari fakta repository.

6. PRASYARAT & DEPENDENSI
- H3 (change record) dibuka lebih dulu; A4 membutuhkan output A1/A2/A5/A7; D5 membutuhkan D1–D4 + G1 (pinned build, M-3);
  E1 membutuhkan B2; E3 membutuhkan B1–B5 + C1–C7; E6 membutuhkan E1–E5; H1 membutuhkan daftar bukti+STOP yang sama dengan pack §2/§4.
- Penerimaan staging exception harus dicatat di change record: policy §4 retention sign-off TIDAK diperlukan untuk rehearsal staging 0022 dan TIDAK berlaku untuk production.

7. HASIL NEGATIF — WAJIB
- Bukti tidak tersedia → UNAVAILABLE (dengan alasan); artefak ada tetapi tidak cocok → NOT CONFIRMED; JANGAN diubah menjadi PASS.
- Apapun UNAVAILABLE/NOT CONFIRMED pada butir wajib = STOP sampai gate pemilik menyelesaikannya.

8. YANG TIDAK DIMINTA
- Bukti production apa pun / Part B B1–B13 / approval A1–A2 (terakhir, setelah B-01…B-10 — B-11) / apply / rehearsal / edit journal-ledger.

Balas dengan: tanda terima + change record ID/window/rollback owner/incident commander, dan rencana penyelesaian 11 baris joint per wave.
```

### 4.3 M-3 — To: Application Lead (primary collector/classifier)

```
SUBJECT: [HRIS-0022][STAGING ONLY] Evidence request — Application Lead slice (7 artefak sole + klasifikasi C7/C8). Read-only.

Kepada: Application Lead
Dari: [pengirim resmi — isi saat dispatch]
Tiket / change record: [ID]

1. SCOPE & AUTHORITY
- Permintaan bukti STAGING SAJA untuk migration 0022; bukan approval/change record/instruksi eksekusi.
- Governed oleh pack §2.G/§2.D, intake register §3, coordination §2.1, templates §4.2 (RT-APP).

2. ENVIRONMENT & DATABASE
- HANYA staging. Build yang dipinning harus build yang benar-benar terdeploy di staging (bukan working tree sembarang).
- Read-only / record eksternal (release/CI/deployment record). Tidak ada deployment, migration, atau perubahan konfigurasi yang diminta.

3. ARTEFAK SOLE (7) + KONTRIBUSI JOINT
Wave 1 (urgent — mendukung disposition 0020):
- D2 — deployed staging build ID / release record; build dipin ke commit SHA; teridentifikasi tanpa ambiguitas —
  EVD-E4-2-<ts>-01.md — feeds G1-S; B-04 — redaksi R5 (tanpa internal URL/token/CI secret). Build tidak bisa diidentifikasi = STOP §4.4 (incident, bukan rutin).
- D3 — apakah build terPIN membaca users.must_change_password? (jalur baca repo: lib/auth/auth.ts requireUser + employee-import path,
  diverifikasi terhadap build dari D2, BUKAN working tree bebas) — EVD-E4-3-<ts>-01.md — B-04 — kolom absen saat build pembaca terdeploy = incident STOP §4.4.
- G1 — staging deployment record / release manifest / CI build ID terpin ke commit yang direview; tabel build ID ↔ commit SHA ↔ checksum artefak lengkap —
  EVD-E6-2-<ts>-01.md — feeds A8/A14; B-07/B-09/B-14 — redaksi R5. Build tidak terpin = A8 tetap open.
Wave 3:
- G2 — rekaman urutan deploy TETAP: migration dulu, lalu build kompatibel; tanpa deployment aplikasi sebelum check §5.5/§5.8 direkam —
  EVD-ORD-A8-<ts>-01.md — feeds A8 — urutan tertulis eksplisit di change record + rasional backward-compat. Deploy sebelum migration = STOP (deploy-order breach).
- G3 — bukti control plane disabled: DELETION_EXECUTION_ENABLED = false dan RETENTION_ELIGIBLE_CATEGORIES = [] dengan konfigurasi + output tes dari build terpin —
  EVD-A14-<ts>-01.md — feeds A14 — nilai repository SAJA tidak cukup untuk gate. Salah satu flag menjadi true/non-empty = STOP (control-plane breach).
- G4 — checksum preflight sisi repository + commit SHA untuk 0019–0022 dan _journal.json — EVD-A6-REPO-<ts>-01.txt — feeds A6 (bagian repository) —
  nilai wajib sama dengan anchor pack §0 (0019 21752cce…2d27; 0020 baf18875…4eaa; 0021 0e234c6e…7764; 0022 724db82d…65c; journal 20 entri, last 0018).
  Gate tetap mensyaratkan re-verifikasi DBA in-rehearsal (B-14).
- G5 — pernyataan kompatibilitas build terpin: kolom snapshot mana yang dibaca/ditulis build, dan mengapa migration harus mendahuluinya;
  sebutkan jalur kode yang mereferensikan employeeNameSnapshot; perilaku fail-closed pre-0022 (23503) dicatat — EVD-COMPAT-<ts>-01.md — feeds A8 —
  bertentangan dengan G2 atau build tidak teridentifikasi = STOP.
Kontribusi joint (lihat pesan M-2 untuk kontrak penuh):
- C7 — klasifikasi SETIAP objek tabel (expected-approved / production-only / repository-only / unexplained) dari capture DBA; unexplained = STOP §4.2.
- C8 — observasi objek live-tanpa-ledger dengan referensi tiket; ledger tidak pernah diedit.
- Selain itu: kontribusi pada A4, B3, D5, E1, E3, E4, E6, H1, H3 (joint).

4. METADATA WAJIB: Env=staging; Captured (UTC)+TZ; Collector; Reviewer ≠ collector (reviewer Anda untuk baris sole = DBA);
   change/ticket ID; filename EVD-<item>-<ts>-<seq>.<ext>; SHA-256 per file; redaksi (R5 untuk D2/G1; R1+R5 untuk G6 bila mengutip A7);
   contract-check terhadap Metode verifikasi pack §2.

5. KRITERIA PENERIMAAN & FORMAT RESPONS
- Formulir RT-APP (templates §4.2): packet header (pinned build ID + commit SHA), per-artifact return lines, pernyataan wajib §4.2 (7 pernyataan),
  dan worksheet klasifikasi objek untuk C7/C8.
- Status per butir: DONE / PARTIAL / UNAVAILABLE / DISCREPANCY + file EVD-… di lokasi restricted-access yang disetujui (bukan Git/chat).
- Result hanya dicatat reviewer ≠ collector di intake register.

6. PRASYARAT & DEPENDENSI
- D2/G1 (pinned build) adalah prasyarat D3 dan D5 (disposition 0020 bersama DBA) — utamakan Wave 1.
- G3 membutuhkan output tes dari build yang sama dengan yang dipin (tests/employees/employee-deletion-controls.test.ts); rekam nilai + lampirkan output.
- A2 (authorization Anda) ditandatangani TERAKHIR setelah B-01…B-10 terevidensi (B-11) — permintaan ini BUKAN permintaan tanda tangan A2.

7. HASIL NEGATIF — WAJIB
- Tidak bisa mengidentifikasi build → UNAVAILABLE/NOT CONFIRMED + eskalasi STOP §4.4; JANGAN diubah menjadi PASS.
- Klasifikasi objek tidak boleh "expected" tanpa bukti; keraguan = unexplained = STOP, bukan ditebak.

8. YANG TIDAK DIMINTA
- Production evidence / Part B / apply / deployment / generate / push / edit journal-ledger / penghapusan data karyawan.

Balas dengan: tanda terima + pinned build ID/commit SHA + rencana penyelesaian D2, D3, G1 (Wave 1) lalu G2–G5 dan klasifikasi C7/C8.
```

### 4.4 M-4 — To: Rehearsal operator

```
SUBJECT: [HRIS-0022][STAGING ONLY] Attestation request — operator slice (A6 guard staging, H2 synthetic-data). Non-destruktif.

Kepada: Rehearsal operator
Dari: [pengirim resmi — isi saat dispatch]
Tiket / change record: [ID]

1. SCOPE & AUTHORITY
- Dua attestation STAGING SAJA: A6 (guard rehearsal shell) dan H2 (synthetic-data / no-production-PII).
- Bukan approval, bukan instruksi eksekusi, bukan izin rehearsal. Reviewed oleh DBA + Application Lead.

2. ENVIRONMENT & DATABASE
- HANYA sesi shell staging yang akan dipakai untuk rehearsal (psql/pg_dump).
- JANGAN sentuh production; JANGAN menjalankan migration/apply; JANGAN mengeksekusi apapun selain membaca/menampilkan guard.

3. ARTEFAK
- A6 — Staging guard attestation untuk rehearsal shell: HRIS_ENV=staging; STAGING_DATABASE_URL eksplisit (NAMA variabel saja);
  ketiadaan DATABASE_URL fallback dinyatakan EKSPLISIT; guard snippet ada dan dievaluasi di sesi yang sama —
  EVD-GUARD-A12-<ts>-01.md — feeds A12; menutup B-08 — redaksi R4: VALUE STAGING_DATABASE_URL dan URL koneksi lain TIDAK boleh muncul;
  hanya nama variabel, hasil evaluasi guard, dan host class.
  Catatan scope: aplikasi tidak memiliki konsep STAGING_DATABASE_URL (register §11 R-1) — A6 mengattest guard SHELL rehearsal saja;
  isolasi aplikasi dibuktikan terpisah lewat A2/A4/A5.
- H2 — Synthetic-data attestation (A13): hanya data sintetis; TIDAK ada PII production yang masuk ke artefak staging mana pun —
  EVD-A13-ATTEST-<ts>-01.md — feeds A13; menutup B-13 — redaksi P1+P2. Jika PII ditemukan: redaksi + re-capture, JANGAN disubmis apa adanya.
  Sumber aturan: runbook §0 rule 7 (§0.7).

4. METADATA WAJIB: Env=staging; Captured (UTC)+TZ; attestor/operator; reviewer (≠ attestor); change/ticket ID;
   filename EVD-GUARD-A12-<ts>-01.md dan EVD-A13-ATTEST-<ts>-01.md; SHA-256; kode redaksi terpasang (R4 / P1+P2);
   storage = lokasi restricted-access yang disetujui (bukan Git/chat).

5. KRITERIA PENERIMAAN & FORMAT RESPONS
- Gunakan formulir RT-OP (templates §4.3): header packet + bagian A6 (session, HRIS_ENV=staging, nama variabel, fallback absent ☐,
  guard dievaluasi ☐, host class redacted, hasil evaluasi, captured UTC, file, SHA-256) + bagian H2 (pernyataan no-PII ☐, tindakan bila PII ditemukan ☐, file, SHA-256).
- Hasil (CONFIRMED/…) hanya dicatat reviewer ≠ collector (DBA + Application Lead) di intake register §3.

6. PRASYARAT & DEPENDENSI
- A6 paling cepat diattest setelah sesi shell staging tersedia; idealnya bersamaan dengan Wave 1 isolation capture (A1/A2/A4/A5) karena hasilnya menjadi evidence ref kontrol HRIS_ENV pada A4.
- H2 dapat menyusul setelah artefak Wave 1–3 terkumpul (menyatakan tidak ada PII production di artefak yang sudah masuk).
- A12 (guard dipakai untuk setiap perintah modifying) berlaku untuk rehearsal nanti — yang diminta sekarang hanya attestation kesiapan guard.

7. HASIL NEGATIF — WAJIB
- Guard tidak ada/ambigu/DATABASE_URL bisa resolve ke production → laporkan sebagai temuan STOP (environment ambiguity), JANGAN dianggap lolos.
- Tidak bisa mengattest → UNAVAILABLE dengan alasan; JANGAN diubah menjadi PASS.

8. YANG TIDAK DIMINTA
- Menjalankan backup/restore/migration/rehearsal; mengakses .env.production; menangani data karyawan nyata.

Balas dengan: RT-OP packet (A6, H2) atau UNAVAILABLE bermotivasikan.
```

### 4.5 M-5 — To: Independent reviewer (≠ collector)

```
SUBJECT: [HRIS-0022][STAGING ONLY] Reviewer assignment — verifikasi independen 47 artefak (RT-RV). Tidak ada result tanpa reviewer.

Kepada: Reviewer independen (individual ≠ collector per baris)
Dari: [pengirim resmi — isi saat dispatch]
Tiket / change record: [ID]

1. SCOPE & AUTHORITY
- Peran Anda: MEMERIKSA setiap artefak yang dikembalikan terhadap kontrak pack §2 (Metode verifikasi), label, kode redaksi, dan checksum yang dihitung ulang —
  lalu MENCATAT Result di staging intake register §3, receipt di §4, worksheet di §8.1.
- Anda tidak mengumpulkan bukti, tidak menjalankan query, tidak menyelesaikan gate. Gate G1-S–G5-S diselesaikan DBA + Application Lead setelah CONFIRMED.
- Tidak ada artefak yang boleh diperiksa oleh collector-nya sendiri (pack §1 rule 4; coordination §2.5/§3.5).

2. ENVIRONMENT
- Semua baris yang Anda review ber Env = staging. Artefak non-staging untuk baris staging = REJECT (bukan review).

3. YANG DIVERIFIKASI (semua 47, sesuai urutan wave §3 dokumen ini)
- Wave 1: A1–A5, A7 (isolation) dan D1–D5 + G1 (0020/build).
- Wave 2: B1–B5, C1–C9, E1–E6 (ledger/katalog/lineage).
- Wave 3: F1–F6, G2–G6 (backup/build).
- Wave 4: A6, H1–H2, H3 (attestations).

4. CHECKLIST VERIFIKASI PER ARTEFAK (templates §4.4 RT-RV; register §4 rules)
a. Filename = EVD-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext>; <item> cocok dengan ID artefak.
b. Label lengkap: Env=staging; nama database; Captured (UTC) ISO-8601 + TZ; Collector; Reviewer (≠ collector); change/ticket ID.
c. SHA-256 dihitung ulang saat receipt; cocok dengan checksum pelapor. Mismatch = STOP (pack §1 rule 9) — laporkan, jangan direkonsiliasi diam-diam.
d. Kode redaksi sesuai pack §5 dan benar-benar diterapkan (R1–R7/P1/P2). Bukti memuat secret/connection string/PII berlebih = evidence-hygiene STOP §4.11.
e. Contract-check: bandingkan isi artefak dengan sel Metode verifikasi baris pack §2 / register §3 (mis. C4: 11 baris + confdeltype='n' + CHECK ada;
   B2: min ≤ max + count = B1; E1: when > max; F6: yes+ref atau NO; D4: agregat count saja).
f. Hasil: CONFIRMED ( artefak mentah terlampir, label+checksum+redaksi+kontrak ok ) / NOT CONFIRMED ( ada tapi tidak cocok ) /
   UNAVAILABLE ( tidak bisa dikumpulkan — alasan wajib ) / PENDING ( belum diterima). PENDING → CONFIRMED tanpa artefak mentah = DILARANG.
g. Catat discrepancy + follow-up/owner (blocker terkait B-01…B-15) untuk setiap non-CONFIRMED.

5. FORMAT RESPONS
- RT-RV per-artifact verification record (templates §4.4) + batch reviewer sign-off per sesi (session UTC, jumlah Confirmed/Not-confirmed/Unavailable/Pending, STOP refs).
- Perbarui baris register §3 (Result/Discrepancy/Follow-up), log §4 (filename/SHA-256/redaction/reviewer≠collector), worksheet §8.1.
- PENTING: collector tidak pernah mencatat result sendirian; hanya reviewer yang mengisi Result.

6. PRASYARAT & DEPENDENSI
- Review dimulai saat artefak pertama masuk lewat kanal restricted-access yang disetujui (bukan Git/chat).
- Sebelum change record (H3) ada, catat tiket sebagai belum tersedia; artefak tanpa ticket ID tetap dapat direview tetapi follow-up ditandai.

7. HASIL NEGATIF — WAJIB
- Jangan mengubah UNAVAILABLE/NOT CONFIRMED menjadi PASS. Setiap UNAVAILABLE/NOT CONFIRMED pada butir wajib = STOP sampai gate pemilik menyelesaikannya.
- Jangan menerima result yang berasal dari fakta repository, output tes, atau klaim parent-task (handoff §6; audit O1).

8. YANG TIDAK DIMINTA
- Menyelesaikan gate, memberikan approval A1/A2, menyentuh baris production, atau menjalankan query apa pun.

Balas dengan: kesiapan reviewer + nama reviewer per wave (yang bersedia, ≠ collector terkait) dan jendela waktu review.
```

---

## 5. Operational intake checklist (per artefak, saat bukti diterima)

Gunakan untuk SEMUA 47 baris. Sumber: register §2/§3/§4/§8, pack §1/§5, handoff §5/§8, templates §3/§6. Tidak ada langkah yang boleh dilewati; kegagalan langkah mana pun = reject/STOP, bukan PASS.

### 5.1 Intake validation steps (V-1…V-10)

| # | Check | Criterion (source) | Fail handling |
| --- | --- | --- | --- |
| V-1 | Kanal & storage | Artefak diterima via lokasi restricted-access yang disetujui; bukan Git/chat/folder bersama luas (pack §1 rule 6; handoff §5.3) | Reject; minta kirim ulang via kanal resmi |
| V-2 | Filename pattern | `EVD-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext>`, `<item>` = ID pack titik→dash (pack §1 rule 5) | Reject sebagai mislabelled (audit O1 defect) |
| V-3 | Env label | Tepat `staging` + nama database (register §3) | Reject (staging/production cross-substitution dilarang, intake §0 rule 3) |
| V-4 | Captured (UTC) | ISO-8601 UTC + TZ ada; bukan backfilled/perkiraan (templates §3; coordination §3.5) | Reject; artifact tetap PENDING |
| V-5 | Collector/Reviewer | Keduanya bernama; **reviewer ≠ collector** (pack §1 rule 4) | Result tidak sah tanpa reviewer ≠ collector |
| V-6 | Checksum | SHA-256 dihitung ulang = checksum pelapor; console text `n/a` + session ID (handoff §5.3; register §4 rule 1) | Mismatch = STOP; laporkan, jangan rekonsiliasi diam-diam |
| V-7 | Redaction | Kode pack §5 sesuai baris (R1–R7/P1/P2) diterapkan & diverifikasi reviewer; tanpa secret/connection string/PII berlebih (pack §4.11) | Evidence-hygiene STOP; redact + re-capture |
| V-8 | Change/ticket ID | Ada dari change record H3/A3; bila change record belum ada → catat gap di follow-up | Artefak terekam; follow-up ditandai |
| V-9 | Contract check | Isi artefak vs sel Metode verifikasi pack §2 / register §3 (tabel §5.2) | Tidak cocok = NOT CONFIRMED + discrepancy + STOP ref |
| V-10 | Pencatatan | Intake §3 Result/Discrepancy/Follow-up diisi reviewer; receipt §4 (filename, received UTC, channel, type/size, SHA-256, redaction verified, reviewer≠collector); worksheet §8.1; handoff §8 return checklist per group DONE/PARTIAL/UNAVAILABLE/DISCREPANCY | Baris tetap PENDING sampai seluruhnya tercatat |

### 5.2 Contract-check ringkas per kelompok (ringkasan; teks baris pack §2 yang mengikat)

| Kelompok | Contract-check inti | STOP utama |
| --- | --- | --- |
| A1–A3, A5, A7 | Label + nilai verbatim; endpoint hanya host class/role; role grants tanpa overlap production; controller review lengkap (termasuk deploy path eksternal) | §4.1, §4.8, §4.10 |
| A4 | 7 kontrol isolation, tiap baris Attested? + evidence ref, tanpa sel kosong | §4.8 |
| A6 | Guard shell staging terevaluasi; nama variabel saja; fallback absen dinyatakan | env ambiguity |
| B1–B5 | Rows+count+konsistensi min/max; hash mapping penuh; absence = "no ledger row"; append-only | §4.3, §4.7 |
| C1–C9 | Kontrak kolom 0019/0020; 3 tabel+6 index 0021; 11 baris 0022 `confdeltype='n'` + CHECK; inventaris snapshot; nol CASCADE; nol unexplained; pre-apply BEFORE (11 `r`+NOT NULL, 0 CHECK, 11 deletable `r`) | §4.2, §4.5, §4.6 |
| D1–D5 | Kolom exist/absent jujur; build terpin; read-path against pinned build; agregat count saja; disposition persis satu dari tiga, joint | §4.4, §4.11 |
| E1–E6 | `when` > max dgn aritmetika tampil; anchor hash cocok atau no ledger row; klasifikasi ledger+catalog, nol unexplained; disposition snapshot-chain terekam; acceptance staging-only | §4.3, audit §4 |
| F1–F6 | Label backup pattern; complete-not-queued; restore ke disposable terbukti terisolasi; PITR/restore-only tegas; manifest private-file + orphans karantina; pernyataan yes+ref/NO | §4.9 |
| G1–G6 | Build↔SHA↔checksum; urutan migration-first terekam; control plane false/[] dari pinned build + output tes; checksum repo = anchor + re-verify in-rehearsal (B-14); kompatibilitas tegas | §4.3, §4.4, deploy-order/control-plane breach |
| H1–H3 | Pengakuan dua peran; attestation no-PII; change record 4 field + rencana §5.7/§5.8 | prerequisite tetap PENDING |

### 5.3 Negative-result handling (berlaku sama untuk semua penerima)

1. Bukti tidak tersedia/tidak bisa dikumpulkan → catat **`UNAVAILABLE`** + alasan. **Jangan** diubah menjadi PASS atau PENDING-positif.
2. Artefak ada tetapi tidak memenuhi kontrak → catat **`NOT CONFIRMED`** + discrepancy + STOP ref.
3. Setiap `UNAVAILABLE`/`NOT CONFIRMED` pada butir wajib = **STOP** sampai gate pemilik (`G1-S`–`G5-S`) menyelesaikannya (intake §0 rule 6).
4. Dilarang: menebak nilai, mengisi checksum/timestamp/approval/hasil pengujian yang tidak ada, memindahkan PENDING→CONFIRMED tanpa artefak mentah berlabel, mencatat result oleh collector sendiri.
5. STOP umum (handoff §7.2, checklist Part C): eskalasi ke DBA + Application Lead; preservasi bukti; tanpa deploy/retry/journal edit.

---

## 6. Local read-only verification performed 2026-10-19 (repository facts only)

Method: read-only inspection of `/opt/hris` (git `main`, working tree). **No
database was contacted; no query executed; no secret / `.env.production` /
connection string was read.** These are **repository facts and code/test
results** — inputs to compare against live staging evidence, never live proof
(handoff §6). They close no gate and confirm no artifact.

| # | Check | Result |
| --- | --- | --- |
| L-1 | `0019` SHA-256 | `21752cce27b490807854a5c27387d8525738d1a9fe718b9dada1e89b63042d27` — **matches** pack §0 anchor |
| L-2 | `0020` SHA-256 | `baf1887559aa0d8cb7905a17d5a71c8a8b506431624d9445747ca88d0f3a4eaa` — **matches** anchor |
| L-3 | `0021` SHA-256 | `0e234c6ee9d2551686b28e93949f0d1c2573df8240bf0ded7a3eb92b52407764` — **matches** anchor |
| L-4 | `0022` SHA-256 | `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` — **matches** anchor |
| L-5 | `_journal.json` | 20 entries, last `idx 19 = 0018_employee_custom_tabs`; no `0019`–`0022` tags (repo fact; absence ≠ "not applied") |
| L-6 | Snapshots | 15 files (`0000`–`0014`) |
| L-7 | Control plane (source) | `DELETION_EXECUTION_ENABLED = false` (`features/employees/deletion-control-policy.ts:100`); `RETENTION_ELIGIBLE_CATEGORIES = []` (line 79) — unchanged |
| L-8 | `npx tsc --noEmit` | **clean (exit 0)** |
| L-9 | `node --test tests/employees/*.test.ts` | **783 pass / 0 fail** (includes `employee-deletion-controls.test.ts` and `employee-retention-detach.test.ts`) |
| L-10 | Working tree | Prior changes preserved (modified + untracked doc/migration files intact); this document is the only file added by this task |

Code/test facts only. Runtime idempotency/rollback (`B-15`) remains **UNPROVEN**;
repository values alone are **not** the `G3`/`A14` gate (B-09 stays open until
config + test output from the pinned build are recorded via artifact `G3`).

---

## 7. State after this task (unchanged by this document)

| Category | Count | Items |
| --- | ---: | --- |
| Artifacts received | 0 | — |
| Artifacts `CONFIRMED` | 0 | — |
| Artifacts `NOT CONFIRMED` | 0 | — |
| Artifacts `UNAVAILABLE` | 0 | — |
| Artifacts `PENDING` | 47 | `A1`–`A7`, `B1`–`B5`, `C1`–`C9`, `D1`–`D5`, `E1`–`E6`, `F1`–`F6`, `G1`–`G6`, `H1`–`H3` |
| Blockers `OPEN` | 14 | `B-01`–`B-11`, `B-13`–`B-15` |
| Blockers `CLOSED` | 1 | `B-12` (documentation corrective action only; live catalog evidence tetap wajib via `C1`–`C9`) |
| Staging gates | 5 | `G1-S`–`G5-S` all `BLOCKED` — **no gate is `PASS`** |
| Part A | 14 | `A1`–`A14` all `PENDING` ☐ |
| Part B (production) | 13 | `B1`–`B13` all `PENDING` ☐ — out of scope, unchanged |

**Staging readiness: NOT READY. Production readiness: NOT READY.** Evidence
intake cannot complete until the authorized owners return artifacts through the
official channel and a reviewer ≠ collector records results. Messages M-1…M-5
are **prepared and not sent**; dispatch requires an authorized person and the
organization's official channel (§1: no connector available from this
workspace).

---

## 8. Explicit non-actions in producing this document

- **No message was sent; no owner was contacted.** No recipient name, email
  address, or identity was fabricated; recipients are roles only, with identity
  fields left blank for the dispatcher.
- **No database was contacted; no query was executed.** `TS-S1`–`TS-S10` remain
  proposals for DBA review only.
- **No migration was run, generated, pushed, applied, or journaled**; no
  `_journal.json`, snapshot, ledger, schema, or configuration was modified.
- **No seed, deployment, RBAC seeding, backup, restore, rehearsal, or employee
  deletion was performed or authorized.** `DELETION_EXECUTION_ENABLED` remains
  `false`; `RETENTION_ELIGIBLE_CATEGORIES` remains `[]`.
- **No secret, `.env.production`, connection string, or production endpoint was
  read or guessed.**
- **No `PENDING` row was advanced, no gate was set to `PASS`, no approval was
  recorded, and no evidence was fabricated.**
- **No existing document was modified and no prior working-tree change was
  reverted**; this document is new and additive.

**Conclusion:** the five ready-to-send evidence requests (M-1 DBA, M-2 joint
DBA + Application Lead, M-3 Application Lead, M-4 operator, M-5 independent
reviewer) and the operational per-artifact intake checklist (§5) are prepared
for manual dispatch through the official channel; no official outbound connector
exists in this workspace, so nothing was sent. All 47 artifacts remain `PENDING`,
14 blockers remain `OPEN`, all staging gates remain `BLOCKED`, and both staging
and production remain **NOT READY**.
