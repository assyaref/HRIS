# Migration 0022 — Staging Evidence Response Templates & Coordination Consistency Validation (A1–H3)

**Document type:** RESPONSE-TEMPLATE PACK + READ-ONLY CONSISTENCY VALIDATION —
**staging scope only**. This is **not** an approval, a change record, a
verification result, a gate decision, or an execution instruction. It authorizes
nothing and must not be read as one.

**Status:** OPEN — dispatchable, **no evidence received**. All **47** artifacts
(`A1`–`H3`) remain `PENDING`, all staging gates (`G1-S`–`G5-S`) remain `BLOCKED`,
all Part A rows (`A1`–`A14`) remain `PENDING` ☐. **No artifact is `CONFIRMED`;
no gate is `PASS`.**

**Date prepared:** 2026-10-16
**Repository:** `/opt/hris` (git `main`, working tree; no commit made)
**Continues from:** `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md`
(the coordination package). This document adds the **response templates** and the
**receipt process** the coordination package calls for; it redefines nothing.

**Built from / validated against (unchanged; this pack only references them):**

| Source document | Role here |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` (coordination) | Dispatch layer; owner/source/format/redaction/reviewer/stop groupings; Part A checklist |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` (pack) | Authoritative artifact rows (governs on conflict) |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` (staging register) | Receiving side; intake §3/§4/§8 worksheets |
| `docs/employee-permanent-delete-0022-staging-readiness-audit.md` (audit) | Gate matrix, stop conditions, dependency order |
| `docs/employee-permanent-delete-dba-handoff.md` (handoff) | Labeling §5.2, storage §5.3, redaction §5.4, return checklist §8 |
| `docs/employee-permanent-delete-0022-approval-checklist.md` (checklist) | Part A `A1`–`A14`, Part B `B1`–`B13`, Part C stop conditions |

> **Hard boundary observed in producing this pack.** No database was contacted
> and **no query was executed**. No migration, seed, deployment, journal,
> snapshot, ledger, schema, configuration, or employee record was run, read, or
> changed. No secret, `.env.production`, or connection string was read or
> guessed. No existing document was modified. No `PENDING` row was advanced, no
> gate was set to `PASS`, no result was recorded, and **no rehearsal was started
> or authorized**. **No evidence was simulated or fabricated**, and no template
> below contains any value presented as if it came from an actual database.
> Control plane unchanged: `DELETION_EXECUTION_ENABLED = false`,
> `RETENTION_ELIGIBLE_CATEGORIES = []`.

---

## 0. Purpose, scope, and how the templates are used

The coordination package defines **who returns what**; this pack defines **the
exact form each party returns it in** so that returned artifacts can be accepted
through the approved restricted-access channel and independently verified
without re-reading the pack.

**In scope:** staging evidence collection only; artifacts `A1`–`H3` (47); the
four response roles (DBA, Application Lead, operator, independent reviewer);
priority waves; the mandatory label/checksum/redaction fields; the receipt
workflow. Nothing here authorizes a database action.

**Out of scope (unchanged):** every production evidence row, gates `G1-P`–`G4-P`,
Part B `B1`–`B13`, policy §4 retention sign-off, any apply/rehearsal, any
`generate`/`push`, journal or ledger edit, seed, deployment, or employee
deletion.

**Template set (four separate role templates):** `RT-DBA` (§4.1),
`RT-APP` (§4.2), `RT-OP` (§4.3), `RT-RV` (§4.4). Each is independently
copy-able; a returned packet is **not** evidence until a reviewer ≠ collector
records the `Result` in the staging register (staging register §3/§4/§8;
coordination §3).

---

## 1. Validation of the coordination package (read-only, static)

**Method:** the coordination package was cross-read against the pack, the
staging intake register, the readiness audit, the DBA handoff, and the approval
checklist. Counts and cross-references were recomputed from the document text.
**No database or secret was touched.** This validates the package's internal and
cross-document consistency; it establishes **no evidence and advances no gate**.

### 1.1 Structural checks (recomputed)

| # | Check | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| W-1 | Artifact rows `A1`–`H3` | 47 | 47 | ✅ MATCH |
| W-2 | Duplicate artifact IDs | none | none | ✅ MATCH |
| W-3 | Group counts A/B/C/D/E/F/G/H | 7/5/9/5/6/6/6/3 | 7/5/9/5/6/6/6/3 | ✅ MATCH |
| W-4 | Owner slices: DBA sole / App Lead sole / joint / operator | 27/7/11/2 = 47 | 27/7/11/2 = 47 | ✅ MATCH |
| W-5 | Owner slices reconcile to pack `Penanggung jawab` column | exact | exact (incl. `B3` corroborate+map, `C7` capture+classify, `C8` joint, `E4` accepted) | ✅ MATCH |
| W-6 | Format grouping `.txt`/`.csv`/`.log`/`.md` | 18/4/2/23 = 47 | 18/4/2/23 = 47 | ✅ MATCH |
| W-7 | Artifacts carrying ≥1 redaction code | 17 | 17 (`A1`–`A7`,`D2`,`D4`,`F1`–`F5`,`G1`,`G6`,`H2`) | ✅ MATCH |
| W-8 | Redaction code → artifact mapping vs pack §5 | exact | exact (`R1`–`R7`,`P1`,`P2`) | ✅ MATCH |
| W-9 | Blocker set `B-01`–`B-15` | 15, contiguous | 15; 14 `OPEN`, `B-12` `CLOSED` | ✅ MATCH |
| W-10 | Gate states `G1-S`–`G5-S` | all `BLOCKED` | all `BLOCKED` | ✅ MATCH |
| W-11 | Part A `A1`–`A14` | all `PENDING` ☐ | all `PENDING` ☐ | ✅ MATCH |
| W-12 | Filename pattern / `EVD-<item>-<ts>-<seq>.<ext>` citations | conform | conform | ✅ MATCH |
| W-13 | Stop-condition codes §4.1–§4.11 map to defined artifacts | all resolve | all resolve | ✅ MATCH |
| W-14 | "Evidence not yet received" counts by group | 7/5/9/5/6/6/6/3 = 47 | 47, all `PENDING` | ✅ MATCH |

### 1.2 Cross-document consistency (five source documents)

| # | Property | Coordination | Pack | Staging register | Audit | Handoff | Checklist | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| X-1 | Artifact set present as `A1`–`H3` (47) | yes | yes | §3 | mapped via `E*` rows | mapped via `E*` | — | ✅ MATCH |
| X-2 | Blocker set `B-01`–`B-15`; `B-12` closed by documentation action | yes | §4 | §6 | §1.1 O1 | — | — | ✅ MATCH |
| X-3 | Staging gates all `BLOCKED` / Part A all `PENDING` | yes | §3 | §7 | §3.1–§3.2 | §7 | Part A ☐ | ✅ MATCH |
| X-4 | `0022` anchor `724db82db69769763ead7009be9378b9863a900539a6a1254e446e0dd72c765c` | §4 A6 | §0 | §3 `G4` | §2.1 | §1.1 | `A6` | ✅ MATCH |
| X-5 | `0019`–`0022` full anchors | referenced | §0 | §3 | §2.1 | §1.1 | — | ✅ MATCH |
| X-6 | Control plane `false` / `[]` | §8 | §0 | §11 R-3 | §2.2 | — | `A14` | ✅ MATCH |
| X-7 | Staging vs production separation (Part A vs Part B) | §5 | §6 | §7 | §3.4 | §7.1 | Part A/B | ✅ MATCH |
| X-8 | Reviewer ≠ collector required for every row | §2.5,§3 | §1.4 | §0.5 | — | §6 | — | ✅ MATCH |
| X-9 | No result from repository facts / parent-task claim | §3.5 | §0 | §0.2 | §1.1 O1 | §6 | — | ✅ MATCH |
| X-10 | Priority items `A1`–`A5`,`A7` + `D1`–`D5` | §6 | §8.2/§8.4 | §11 action | §5.1/§5.3 | §2 | — | ✅ MATCH |

### 1.3 Findings (documentation defects; no state change)

Findings below are recorded so the record is accurate. None changes whether
evidence exists; none advances or blocks a gate; each is a navigational/coverage
defect in the coordination package. Pack row text **governs** on any conflict
(pack §2, pack title note). The `F-01`–`F-03` corrections were **applied** on
2026-10-16 to `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md`
only (coordination §2.2, §2.5, §2.6). The `F-04` correction (added 2026-10-16,
FASE 1) was applied to the coordination request, the pack, the intake register,
the readiness audit, and the approval checklist to fix a mis-attributed source
citation. Each row is marked `RESOLVED`; none of the corrections changes an
artifact count, owner slice, status, blocker, gate, or Part A state.

| # | Location | Finding | Impact | Recommended correction |
| --- | --- | --- | --- | --- |
| F-01 | Coordination §2.2 (source groupings for `A3`, `A4`, `D5`) | Cites "intake §4 worksheet" (`A3`), "intake §5 `G5` table" (`A4`), and "Intake §5 `G1` staging row" (`D5`). Within this package "intake" names the **staging** intake register, whose §4 is the received-artifact log and §5 is secret/PII handling. The intended referent is `employee-permanent-delete-dba-evidence-intake.md` §4 (cross-environment inventory) and §5 (decision gates `G1`–`G5`). | Navigational only; no artifact is unreachable (pack row `Sumber` governs). | Qualify as "DBA evidence intake §4/§5" in the three cells. **RESOLVED 2026-10-16** — coordination §2.2 now names `docs/employee-permanent-delete-dba-evidence-intake.md` explicitly in the `A3` (§4), `A4` (§5 `G5`) and `D5` (§5 `G1`) cells; the `A4` and `A7`/`G6` source rows were separated so §5 `G5` attaches only to `A4`. |
| F-02 | Coordination §2.5 (grouped by reviewer) | DBA redaction-reviewer slice is `A1,A2,A3,A4,A5,A6,D4,F1,F2,F3,F4,G6`; it omits `A7`, although `A7` carries `R1` (DBA reviewer) per coordination §2.4 and pack §5. `G6` (also `R1`) is correctly listed. | Reviewer-mapping coverage gap only; the general reviewer ≠ collector rule still applies to `A7`. | Add `A7` to the DBA code-`R1` reviewer row. **RESOLVED 2026-10-16** — coordination §2.5 DBA row now reads `…, A5, A6, A7, D4, …`; `A7` also stays in the `R5` Application Lead row. |
| F-03 | Coordination §2.6 (stop-condition grouping) | Maps STOP `§4.4` to include `D1`; pack row `D1` defers the incident test to `D3`/`D5` and does not itself cite `§4.4`. | Over-inclusive list only; `§2.6` states the pack row text governs. | Optional: annotate `D1` as "indirect (`§4.4` via `D3`/`D5`)". **RESOLVED 2026-10-16** — coordination §2.6 `§4.4` row now reads `` `C2`, `D2`, `D3`, `D5`, `G1`, `G5`; `D1` indirect (`§4.4` via `D3`/`D5`) ``. |
| F-04 | Coordination §2.2 (`H2` source); pack §2.H `H2` `Sumber`; register §3 `H2` `Sumber`; and the `A13` evidence cells in coordination §4, approval-checklist Part A, readiness-audit §3.2 | Cites the synthetic-data / no-production-PII rule (`A13`) as "intake §0 rule 7". The intake documents' §0 rule 7 is the **redaction** rule (`employee-permanent-delete-dba-evidence-intake.md` §0 rule 7 — no secrets/keys/connection strings/unnecessary PII in an artifact); the **synthetic-employees-only** rule is defined verbatim only in `employee-permanent-delete-0022-staging-runbook.md` §0 rule 7. | Navigational/attribution only; the requirement text in the `H2`/`A13` rows is unchanged and no artifact is unreachable. | Cite `runbook §0 rule 7` (`§0.7`) as the source; drop the mis-attributed "intake §0 rule 7". **RESOLVED 2026-10-16 (FASE 1)** — the source is now `runbook §0 rule 7 (`§0.7`)` in the pack, register, and coordination §2.2; the `A13` evidence cells in coordination §4, the approval checklist, and the readiness audit now name `runbook §0 rule 7 (`§0.7`)`. The redaction rule remains cited separately through the `H2` redaction codes `P1`/`P2` (pack §5). |
| F-05 | Pack §2.G `G6` `Redaksi` cell; staging register §3 `G6` `Redaksi` cell | Both cells read `R5` only, while the authoritative redaction register (pack §5 `R1`, register §5 `R1`, coordination §2.4 `R1`, and §1.1 W-8/C-4 above) includes `G6` in `R1` as well as `R5`. The `G6` capture is the same controller review as `A7`, whose `R1` scope (host/connection detail; job/CI configuration secrets) therefore applies to it. | Redaction-coverage inconsistency only: a collector reading only the §2.G/§3 row cells could submit `G6` without the `R1` redaction the register already requires. No status, owner, blocker, gate, or Part A state involved. | Align the two row cells with pack §5: set `G6` `Redaksi` to `R1, R5`. **RESOLVED 2026-10-19** — pack §2.G and staging register §3 `G6` cells now read `R1, R5`; pack §5, register §5, and coordination §2.4 were already correct and were not changed. |
| F-06 | Coordination §2.5 (grouped by reviewer), DBA row parenthetical | The DBA row lists `A6`, but its code list reads `R1`/`R2`/`R3`/`R6`/`R7`/`P1` and omits `R4` — the only code `A6` carries, and the code under which pack §5 assigns the DBA as its redaction reviewer (`operator + DBA`). | Code-annotation coverage gap only; row membership and the reviewer ≠ collector rule were already correct. | Add `R4` to the parenthetical. **RESOLVED 2026-10-19** — coordination §2.5 DBA row now reads `R1`/`R2`/`R3`/`R4`/`R6`/`R7`/`P1`. |

### 1.4 Verdict

The coordination package is **internally consistent** and consistent with the
pack, the staging intake register, the readiness audit, the DBA handoff, and the
approval checklist for its artifact set (47), blocker set (15), template set
(10), gate set (`G1-S`–`G5-S`), and Part A set (`A1`–`A14`). The findings
`F-01`–`F-06` were navigational/coverage-only; none changed control scope, and
all six are now `RESOLVED` (`F-01`–`F-04` corrected 2026-10-16; `F-05`/`F-06`
corrected 2026-10-19 — redaction-cell/annotation alignment only).
**No artifact may be treated as received because of this validation.**

### 1.5 Post-correction consistency check (read-only, static)

The `F-01`–`F-03` corrections were cross-read against the five source documents;
only the coordination package was edited for those (`F-01`–`F-03`). The `F-04`
correction (added 2026-10-16, FASE 1) edited the coordination request, the pack,
the intake register, the readiness audit, and the approval checklist. Every
checked property was already consistent and remains so, and the `H2`/`A13`
correction is a source-citation fix only. **No state change.**

The `F-05`/`F-06` corrections (added 2026-10-19, FASE 3) edited the pack §2.G
`G6` redaction cell, the staging register §3 `G6` redaction cell, and the
coordination §2.5 DBA-row code list; they align row cells with the already-correct
redaction register (pack §5 / register §5 / coordination §2.4). **No state
change:** the set of artifacts carrying ≥1 redaction code stays 17, and no
artifact, owner slice, status, blocker, gate, or Part A row moved.

| # | Corrected item | Cross-document evidence checked (pack / register / audit / handoff / checklist) | Result |
| --- | --- | --- | --- |
| C-1 | `A3` source = DBA evidence intake §4, staging row | pack §2.A `A3`; register §3 `A3` (`Sumber`); handoff §8 `E1.3` | ✅ MATCH |
| C-2 | `A4` source includes DBA evidence intake §5 `G5` table | pack §2.A `A4`; register §3 `A4` + §5 `R2`/`R6`; audit §3.2 `A4`; checklist Part A `A4` | ✅ MATCH |
| C-3 | `D5` source = DBA evidence intake §5 `G1` staging row | pack §2.D `D5`; register §3 `D5`; audit §3.1 `G1-S`; handoff §2/§8 (`E4.2`/`E4.3`) | ✅ MATCH |
| C-4 | `A7` DBA reviewer (code `R1`) | pack §5 `R1` (`A1,A3,A7,G6`); register §3 `A7` Redaksi `R1, R5` + §5 `R1`; audit §3.2 `A7`; handoff §8 `E6.4`; checklist Part A `A7` | ✅ MATCH |
| C-5 | `A7` Application Lead reviewer (code `R5`) retained | pack §5 `R5` (`A7,D2,G1,G6`); register §3 `A7`; handoff §8 `E6.4` | ✅ MATCH |
| C-6 | `D1` stop condition = absent-column test deferred to `D3`/`D5` (not itself `§4.4`) | pack §2.D `D1` ("columns absent → see `D3`"); register §3 `D1` | ✅ MATCH |
| C-7 | Artifact count / owner slices / redaction-code count unchanged by the edits | pack §3 (47 `PENDING`); register §3 totals 47; pack-wide owner/redaction slices 27/7/11/2 and 17 (see §1.1 W-3/W-4/W-7) | ✅ MATCH |
| C-8 | Gates `G1-S`–`G5-S` `BLOCKED`; Part A `A1`–`A14` `PENDING`; artifacts `PENDING` | pack §3; register §7; audit §3.1–§3.2; handoff §7; checklist Part A | ✅ MATCH |
| C-9 | Control plane `false` / `[]` unchanged | pack §0; register §11 R-3; audit §2.2; checklist `A14` | ✅ MATCH |
| C-10 | `H2`/`A13` source = `runbook §0 rule 7` (`§0.7`) | pack §2.H `H2`; register §3 `H2`; coordination §2.2 + §4 `A13`; audit §3.2 `A13`; checklist Part A `A13`; runbook §0 rule 7 | ✅ MATCH |
| C-11 | `G6` redaction = `R1, R5` across every location | pack §2.G `G6` (`R1, R5`); pack §5 `R1`/`R5`; register §3 `G6` (`R1, R5`) + §5 `R1`/`R5`; coordination §2.4 `R1`/`R5` + §2.5; response-templates §1.1 W-7/W-8 | ✅ MATCH (after `F-05`) |
| C-12 | Coordination §2.5 DBA row codes cover every artifact in that row | row = `A1,A2,A3,A4,A5,A6,A7,D4,F1–F4,G6`; codes `R1`(A1,A3,A7,G6)/`R2`(A2,A4)/`R3`(A5)/`R4`(A6)/`R6`(A4,F1–F3)/`R7`(F4)/`P1`(D4) — full coverage after `F-06` | ✅ MATCH (after `F-06`) |

**Observation (resolved as `F-04`).** The pack and the intake register
also wrote bare "intake §4/§5" (rows `A3`, `A4`, `D5`) and "intake §0 rule 7"
(`H2`). There "intake" consistently denotes
`docs/employee-permanent-delete-dba-evidence-intake.md` (the pack's other
"intake §…" citations — §0 rules 3/5/6, §7.1 — resolve only there), so those two
documents were internally consistent as written. The ambiguity was unique to the
coordination package, whose §0 source table binds "intake" to the **staging**
register (`F-01`). The `H2` "intake §0 rule 7" reference was originally left
unchanged because it was outside `F-01`'s scope; on **2026-10-16 (FASE 1)** a
dedicated check showed the assumption was wrong — the assertion it cites
("synthetic employees only; no production PII in staging evidence") is defined
verbatim only in `runbook §0 rule 7` (`§0.7`), while the intake documents' §0
rule 7 is the redaction rule. `F-04` therefore corrects the `H2`/`A13` source to
`runbook §0 rule 7 (`§0.7`)` in the coordination request, the pack, the intake
register, the readiness audit, and the approval checklist. The requirement text
and every status (`PENDING`/`BLOCKED`) are unchanged.

---

## 2. Priority waves

Read-only collection may run in parallel where independent (pack §8). The waves
below order the work; **no wave authorizes an apply, a rehearsal, or a database
change**, and completing a wave advances no gate until a reviewer ≠ collector
records the `Result`.

| Wave | Artifacts | Owners | Why first | Gates/blockers touched (not closed) |
| --- | --- | --- | --- | --- |
| **1 — Identity / isolation** | `A1`, `A2`, `A3`, `A4`, `A5`, `A7` | DBA (sole: `A1`,`A2`,`A3`,`A5`,`A7`); DBA + App Lead (`A4`) | Environment identity and isolation must be provable before any other artifact can be trusted; `A1`–`A5`/`A7` are the `B-01`/`B-08` row set and feed `G5-S`/`A4` | `B-01`, `B-08`; `G5-S` |
| **1 — `0020` urgent status** | `D1`, `D2`, `D3`, `D4`, `D5` (+ `G1` as the pinning input) | DBA (`D1`,`D4`); App Lead (`D2`,`D3`); DBA + App Lead (`D5`) | `0020` is unverified since 2026-10-10 (handoff §2 URGENT); a build reading `must_change_password` over a missing column is an active incident | `B-04`, `B-07`; `G1-S` |
| **2 — Ledger / catalog / lineage** | `B1`–`B5`, `C1`–`C9`, `E1`–`E6` | DBA; joint for `B3`,`C7`,`C8`,`E1`,`E3`,`E4`,`E6` | Needed to classify `0019`–`0022` applied/not-applied on live ledger **plus** live catalog | `B-02`, `B-03`, `B-05`; `G2-S`, `G3-S` |
| **3 — Backup / build** | `F1`–`F6`, `G1`–`G6` | DBA (`F*`,`G6`); App Lead (`G1`–`G5`) | Restore-tested backup + pinned build + fixed deploy order | `B-06`, `B-07`, `B-09`, `B-14`; `G4-S`, `A5`, `A8`, `A14` |
| **4 — Cross-cutting attestations** | `A6`, `H1`, `H2`, `H3` | operator (`A6`,`H2`); DBA + App Lead (`H1`,`H3`) | Guard, synthetic-data, evidence/STOP acknowledgement, change-record header | `B-08`, `B-10`, `B-13`; `A3`, `A11`, `A12`, `A13` |

**Supporting input for Wave 1:** `G1` (staging deployment record / pinned build
ID) must accompany `D2`/`D3`/`D5` so the `0020` disposition can name the deployed
build; `G1` is owned by the Application Lead.

### 2.1 Wave 1 dispatch request list (A1–A5, A7, D1–D5, G1)

The exact artifacts to request now, split by owner. Every row is `PENDING` — no
artifact has been received, and no row may be set to `CONFIRMED` without the raw
labelled file and a reviewer ≠ collector (coordination §3; §1.5 C-8). Filenames
follow the §5 pattern; the reviewer column is the independent role, not the
collector.

**DBA — sole-owned (`RT-DBA`, §4.1):**

| Artifact | Required artifact (filename) | Source / template | Redaction | Reviewer (≠ collector) | Status |
| --- | --- | --- | --- | --- | --- |
| `A1` | DB name, full server version, timezone, encoding, extensions — `EVD-E1-1-<ts>-01.txt` | §7 TS-S1 (extends `T1`) | `R1` | Application Lead (or second DBA) | `PENDING` |
| `A2` | Redacted endpoint identity + role class — `EVD-E1-2-<ts>-01.txt` | `T1` + §7 TS-S1 | `R2` | Application Lead (or second DBA) | `PENDING` |
| `A3` | Staging row of the full environment inventory — `EVD-E1-3-<ts>-01.txt` | `docs/employee-permanent-delete-dba-evidence-intake.md` §4 | `R1` | Application Lead (or second DBA) | `PENDING` |
| `A5` | Staging role/grant export (dedicated roles) — `EVD-ROLE-C3-<ts>-01.csv` | master §C.3 / §7 TS-S2 | `R3` | Application Lead (or second DBA) | `PENDING` |
| `A7` | Deployment-controller review (no auto schema change) — `EVD-E6-4-<ts>-01.md` | `E6.4` / master §G.2 | `R1`, `R5` | Application Lead (`R5`) + DBA (`R1`) | `PENDING` |
| `D1` | `0020` column confirmation (same capture as `C2`) — `EVD-E4-1-<ts>-01.txt` | `T4` / §7 TS-S4 | — | Application Lead (or second DBA) | `PENDING` |
| `D4` | `must_change_password` value distribution (counts only) — `EVD-E4-4-<ts>-01.txt` | `E4.4` / §7 TS-S5 | `P1` | Application Lead (or second DBA) | `PENDING` |

**DBA + Application Lead — joint (`A4`, `D5`):**

| Artifact | Required artifact (filename) | Source / template | Redaction | Reviewer (≠ collector) | Status |
| --- | --- | --- | --- | --- | --- |
| `A4` | Isolation-matrix attestation, all 7 controls — `EVD-ISO-C1-<ts>-01.md` | master §C.1 + `docs/employee-permanent-delete-dba-evidence-intake.md` §5 `G5` table | `R2`, `R6` | Named individual who did not produce the file | `PENDING` |
| `D5` | `G1` staging disposition (`routine`/`not-yet-deployed`/`incident`) — `EVD-G1-DISP-<ts>-01.md` | `docs/employee-permanent-delete-dba-evidence-intake.md` §5 `G1` (staging row) | — | Named individual who did not produce the file | `PENDING` |

**Application Lead — sole-owned (`RT-APP`, §4.2):**

| Artifact | Required artifact (filename) | Source / template | Redaction | Reviewer (≠ collector) | Status |
| --- | --- | --- | --- | --- | --- |
| `D2` | Deployed staging build ID / release record — `EVD-E4-2-<ts>-01.md` | release/CI record; `E4.2` | `R5` | DBA | `PENDING` |
| `D3` | Does the pinned build read `users.must_change_password`? — `EVD-E4-3-<ts>-01.md` | `E4.3`; repo read paths + pinned build (`D2`) | — | DBA | `PENDING` |
| `G1` | Staging deployment record / pinned build ID (supporting input for `D2`/`D3`/`D5`) — `EVD-E6-2-<ts>-01.md` | `E6.2` + `E4.2` | `R5` | DBA | `PENDING` |

**Dispatch rule:** all Wave-1 files go only to the approved restricted-access
evidence location over the approved secure channel (§5.1); `G1` is a supporting
input, not a Wave-1 closure artifact. Receiving these rows does **not** advance
`G1-S`/`G5-S` or any `A*` row until a reviewer ≠ collector records the `Result`
(coordination §3.8).

---

## 3. Mandatory label block and field rules (every returned artifact)

Every returned artifact — regardless of role or format — must carry, or have a
covering note carrying, the fields below (handoff §5.2–§5.4; pack §1 rules 4–7;
staging register §2). An artifact missing an environment label or a capture
timestamp is **rejected at intake** (staging register §3; audit observation O1 is
exactly this defect).

| Field | Rule |
| --- | --- |
| **Artifact ID** | Pack ID (`A1`–`H3`); one ID per file. |
| **Env** | Must be exactly `staging`. Any other value → reject. |
| **Database name** | Staging DB name, or the redacted approved form where `R1`/`R2` applies. |
| **Captured (UTC) / TZ** | ISO-8601 UTC capture time; server/report timezone. Never backfilled or approximated (coordination §3.5). |
| **Collector** | Named person who produced the raw artifact. |
| **Reviewer (≠ collector)** | Named independent reviewer; **must not** equal the collector. |
| **Change / ticket ID** | From the opened change record (`H3`/`A3`); absent until then. |
| **Source / template** | `Sumber` cell from the pack (e.g. `§7 TS-S1`, `T4`). |
| **Checksum (SHA-256)** | Recomputed on receipt; equal to the submitter's checksum. `n/a` for direct console text, with the console/session ID noted. |
| **Redaction code applied** | `R1`–`R7`/`P1`/`P2` where the pack assigns one; confirm it was applied before submission. |
| **Storage ref** | Approved restricted-access evidence location only — **never** Git, chat, or a broadly shared folder. |
| **Result** | `PENDING` / `CONFIRMED` / `NOT CONFIRMED` / `UNAVAILABLE` — **recorded by the reviewer ≠ collector** (staging register §0.5). |
| **Discrepancy / STOP ref** | Any mismatch vs the contract, or the STOP code (§4.1–§4.11 / checklist Part C / audit §4). |

**Prohibited transitions** (unchanged from coordination §3.5): `PENDING` →
`CONFIRMED` without an attached raw labelled artifact; a result recorded by the
collector alone; a result derived from repository facts, test output, or a
parent-task claim; an environment label other than `staging`; a backfilled or
approximate capture timestamp. A checksum mismatch on transfer is a STOP
(pack §1 rule 9).

---

## 4. Response templates

> The templates are **blank forms**. Completing one does not create evidence; a
> returned artifact is not evidence until a reviewer ≠ collector records the
> `Result`. Do **not** enter any real secret, connection string, or PII into a
> template line; redact first (`R*`/`P*`).

### 4.1 `RT-DBA` — DBA response template (sole-owned + joint-contribution rows)

**Owner:** DBA. **Covers:** sole `A1`,`A2`,`A3`,`A5`,`A7`,`B1`,`B2`,`B4`,`B5`,
`C1`–`C6`,`C9`,`D1`,`D4`,`E2`,`E5`,`F1`–`F6`,`G6`; joint contributions to `A4`,
`B3`, `C7`, `C8`, `D5`, `E1`, `E3`, `E4`, `E6`, `H1`, `H3`.

**Packet header (fill once):**

```
RT-DBA packet
Env: staging
Database name: ______________________
Change / ticket ID: ______________________
Capture window (UTC): ______________________
Collector (name): ______________________
Reviewer (name, != collector): ______________________
Storage ref (approved restricted-access location): ______________________
Submitted (UTC): ______________________
Read-only attestation: every artifact below came from a SELECT/SHOW/current_setting
query or a read-only external record; no INSERT/UPDATE/DELETE/DDL/VACUUM/ANALYZE,
no drizzle-kit migrate/generate/push, no ledger/journal edit was executed.
```

**Per-artifact return lines (one per returned file):**

```
Artifact ID: ____  (e.g. A1)
File (EVD-<item>-<ts>-<seq>.<ext>): ______________________
Captured (UTC) / TZ: ______________________
Source / template: ______________________  (e.g. §7 TS-S1)
Checksum (SHA-256): ______________________
Redaction code applied: ______________________  (R1..R7/P1/P2 or —)
Status (DONE / PARTIAL / UNAVAILABLE / DISCREPANCY): ______________________
Discrepancy / STOP ref: ______________________
Raw artifact attached at storage ref?: ☐
```

**Return checklist (mark each; handoff §8 form, staging IDs):**

| # | Evidence item (staging) | Artifact ID | File(s) | Status | Discrepancy / note |
| --- | --- | --- | --- | --- | --- |
| E1.1 | Environment identity | `A1` | | ☐ | |
| E1.2 | Redacted endpoint + role class | `A2` | | ☐ | |
| E1.3 | Full environment inventory | `A3` | | ☐ | |
| C.1/§C isolation matrix | Isolation attestation (joint) | `A4` | | ☐ | |
| C.3 | Staging role/grant export | `A5` | | ☐ | |
| E6.4 | Deployment-controller review (no auto schema change) | `A7` | | ☐ | |
| E2.1 | Ledger rows `id, hash, created_at` | `B1` | | ☐ | |
| E2.2 | Ledger count + min/max `created_at` | `B2` | | ☐ | |
| E2.3 | Hash→file mapping + unmapped flags (joint) | `B3` | | ☐ | |
| E2.4 | Ledger rows for `0019`–`0022` (id, created_at) | `B4` | | ☐ | |
| E2.5 | Ledger append-only confirmation | `B5` | | ☐ | |
| E3.1 | `0019` `key_version` default/null/type | `C1` | | ☐ | |
| E3.2 | `0020` `users` password-lifecycle columns | `C2` | | ☐ | |
| E3.3 | `0021` tables + indexes + FK actions | `C3` | | ☐ | |
| E3.4 | `0022` 11 PROTECTED tables (nullability/FK/CHECK) | `C4` | | ☐ | |
| E3.4 | Snapshot-column inventory | `C5` | | ☐ | |
| E3.4 | Employee-FK CASCADE scan | `C6` | | ☐ | |
| E3.5 | Full table inventory (joint classification input) | `C7` | | ☐ | |
| E3.6 | Live-but-unledgered object list (joint) | `C8` | | ☐ | |
| §5.5 | Pre-apply BEFORE contract | `C9` | | ☐ | |
| E4.1 | `0020` column confirmation | `D1` | | ☐ | |
| E4.4 | `must_change_password` value distribution (counts only) | `D4` | | ☐ | |
| — | `G1` staging disposition (joint; inputs `D1`–`D4`) | `D5` | | ☐ | |
| E6.1 | DBA-held checksums `0015`–`0022` | `E5` | | ☐ | |
| E2.2/E2.4 | `max(created_at)` + candidate safe `when` (joint) | `E1` | | ☐ | |
| E5.1 | Most recent verified backup (label/time/location/manifest) | `F1` | | ☐ | |
| E5.2 | Backup verification output | `F2` | | ☐ | |
| E5.3 | Restore test into disposable DB | `F3` | | ☐ | |
| E5.4 | PITR posture (`wal_level`, `archive_mode`, tool, RPO/RTO) | `F4` | | ☐ | |
| E5.5 | Private-file storage restore verification (joint) | `F5` | | ☐ | |
| E5.6 | Explicit: restore-tested backup exists? | `F6` | | ☐ | |
| E6.4 | Controller review cross-ref for app deploy (code `R1`/`R5`) | `G6` | | ☐ | |

**DBA confirmation:** every artifact above is read-only, redaction-verified,
stored in the approved restricted-access evidence location, and timestamp- and
checksum-labelled; no artifact was pasted into chat or committed to Git; no ledger
row was created, updated, or deleted.

### 4.2 `RT-APP` — Application Lead response template

**Owner:** Application Lead. **Covers:** sole `D2`, `D3`, `G1`, `G2`, `G3`, `G4`,
`G5`; joint contributions to `A4`, `B3`, `C7`, `C8`, `D5`, `E1`, `E3`, `E4`,
`E6`, `H1`, `H3`; classification worksheet for `C7`/`C8`.

**Packet header (fill once):**

```
RT-APP packet
Env: staging
Change / ticket ID: ______________________
Pinned staging build ID / release: ______________________
Commit SHA: ______________________
Collector (name): ______________________
Reviewer (name, != collector): ______________________
Storage ref (approved restricted-access location): ______________________
Submitted (UTC): ______________________
```

**Per-artifact return lines:**

```
Artifact ID: ____  (e.g. D2)
File (EVD-<item>-<ts>-<seq>.<ext>): ______________________
Captured (UTC) / TZ: ______________________
Source / template: ______________________  (e.g. E4.2; runbook §3)
Checksum (SHA-256): ______________________
Redaction code applied: ______________________  (R5 or —)
Status (DONE / PARTIAL / UNAVAILABLE / DISCREPANCY): ______________________
Discrepancy / STOP ref: ______________________
```

**Required statements (must be present in the artifact text):**

| # | Statement | Artifact |
| --- | --- | --- |
| 1 | Deployed staging build ID pinned to a commit SHA; build identified unambiguously | `G1` / `D2` |
| 2 | Does the **pinned** build read `users.must_change_password`? (against the pinned build, not an arbitrary working tree) | `D3` |
| 3 | Fixed deployment order: migration first, then compatible build; no app deploy before §5.5/§5.8 | `G2` |
| 4 | Control plane from the pinned build **and** attached test output: `DELETION_EXECUTION_ENABLED = false`, `RETENTION_ELIGIBLE_CATEGORIES = []` | `G3` |
| 5 | Repository-side preflight checksums + commit SHA for `0019`–`0022` and `_journal.json` | `G4` |
| 6 | Compatibility statement: named pinned build, code paths referencing `employeeNameSnapshot`, pre-0022 fail-closed (`23503`) | `G5` |
| 7 | `G1` staging disposition (joint with DBA): exactly one of `routine` / `not-yet-deployed` / `incident`, with UTC + refs `D1`–`D4` | `D5` |

**Object-classification worksheet (`C7`/`C8`; every object):**

```
Object (table) | Env | Class (expected-approved / production-only /
repository-only / unexplained) | Ledger row? | Evidence ref | Result
_______________|_____|________________________________________________|_____________|______________|_______
```

**Rule:** any `unexplained` object is a STOP (§4.2). `C8` records live-but-
unledgered objects as an observation with a ticket ref; the ledger is **never**
edited to "fix" it (§4.7).

### 4.3 `RT-OP` — Rehearsal operator attestation template

**Owner:** operator. **Covers:** `A6` (staging guard for the rehearsal shell) and
`H2` (synthetic-data / no-production-PII). Reviewed by DBA + Application Lead.

**Per-artifact return lines:**

```
RT-OP packet
Env: staging
Change / ticket ID: ______________________
Attestor (name / operator): ______________________
Reviewer (name, != attestor): ______________________
Storage ref (approved restricted-access location): ______________________
Submitted (UTC): ______________________

A6 — Staging guard attestation for the rehearsal shell
Session used (psql/pg_dump shell): ______________________
HRIS_ENV value observed: staging
STAGING_DATABASE_URL: variable NAME only = ______________________  (VALUE REDACTED, R4)
DATABASE_URL fallback absent? ☐ yes  (state explicitly)
Guard snippet present and evaluated in this session?: ☐
Host class (redacted): ______________________
Guard evaluation result: ______________________
Captured (UTC) / TZ: ______________________
File (EVD-GUARD-A12-<ts>-01.md): ______________________
SHA-256: ______________________

H2 — Synthetic-data / no-production-PII attestation
Statement: no production PII entered any staging artifact. ☐
If any PII was found: redact + re-capture (do NOT submit as-is). ☐
File (EVD-A13-ATTEST-<ts>-01.md): ______________________
SHA-256: ______________________
```

**Scope note:** `A6` attests the **rehearsal shell** guard only (the application
itself has no `STAGING_DATABASE_URL` concept; staging register §11 R-1).
Application isolation is evidenced separately by `A2`/`A4`/`A5`.

### 4.4 `RT-RV` — Independent reviewer verification record

**Owner:** named reviewer **≠ collector** (per row). This template is the
receiving-side verification record; it feeds staging register §3, §4, and §8.1.

**Per-artifact verification line:**

```
RT-RV verification record
Artifact ID: ______________________
Evidence ref (filename): ______________________
Env: staging
Captured (UTC) / TZ: ______________________
Collector (who produced it): ______________________
Reviewer (self; MUST differ from collector): ______________________
Checksum recomputed on receipt (SHA-256): ______________________
Matches submitter checksum? ☐   (mismatch = STOP, pack §1 rule 9)
Redaction code applied + verified? ☐  (code: ______)
Label complete (env / DB / UTC / collector / reviewer / ticket)? ☐
Contract checked against (pack `Metode verifikasi`): ______________________
Result (CONFIRMED / NOT CONFIRMED / UNAVAILABLE / PENDING): ______________________
Discrepancy / STOP ref: ______________________
Follow-up / owner: ______________________
Received (UTC) / channel: ______________________
Staging register row updated (§3 / §4 / §8.1)? ☐
```

**Reviewer rules (non-negotiable):**

1. The reviewer must be **different from the collector**; the collector never
   records the `Result` alone (coordination §2.5, §3.5; pack §1 rule 4).
2. `CONFIRMED` requires an **attached raw labelled artifact** plus a recomputed
   checksum and a verified redaction code. No raw artifact → `PENDING` (or
   `UNAVAILABLE`), never `CONFIRMED`.
3. A result derived from repository facts, test output, or a parent-task claim is
   prohibited (`UNAVAILABLE`/`NOT CONFIRMED` at best).
4. Any `NOT CONFIRMED` / `UNAVAILABLE` on a required item is a **STOP** until the
   owning gate resolves it (staging register §0.6).
5. The reviewer records only into the staging register; production rows are never
   touched.

**Batch reviewer sign-off (per receiving session):**

```
Session (UTC): ______________________
Artifacts reviewed this session: ______________________
Confirmed / Not-confirmed / Unavailable / Pending counts: ____ / ____ / ____ / ____
STOP conditions raised (refs): ______________________
Reviewer (name, != all collectors): ______________________
```

---

## 5. Submission channel, naming, checksum, and redaction

1. **Channel (approved only).** Raw artifacts go **only** to the approved
   restricted-access evidence location, transferred over the approved secure
   channel — **never** in Git, never in chat, never in a broadly shared folder
   (pack §1 rule 6; handoff §5.3; staging register §5.1).
2. **Filename.** `EVD-<item>-<YYYYMMDDTHHMMSSZ>-<seq>.<ext>`, `<item>` = pack ID
   with dots replaced by dashes (e.g. `EVD-E3-4-20261016T090000Z-01.txt`).
3. **Labeling.** The §3 mandatory label block on every artifact.
4. **Checksum.** SHA-256 per file artifact, recomputed on receipt and compared;
   mismatch = STOP. Direct console text uses `n/a` + session ID.
5. **Redaction before submission.** Apply `R1`–`R7`/`P1`/`P2` as assigned.
   Evidence containing secrets, connection strings, or unnecessary PII is itself
   a STOP (§4.11) — redact and re-capture, never submit as-is.
6. **No PII by default.** No employee names, numbers, birth dates, or other
   personal data unless an item explicitly demands them, and then only as counts
   (handoff §5.4).

---

## 6. Receipt workflow (no `PENDING` → `CONFIRMED` before verification)

```
collect (owner)  →  store at approved location  →  reviewer != collector
      →  recompute SHA-256  →  verify label + redaction + contract
      →  record Result in staging register §3, receipt in §4, worksheet §8.1
      →  resolve gates G1-S..G5-S ONLY after CONFIRMED  →  seek A1/A2 last (B-11)
```

**Forbidden:** a `CONFIRMED` without a raw labelled artifact; a result recorded by
the collector alone; a result inferred from repository facts/test output/a
parent-task claim; a non-`staging` env label; a backfilled capture timestamp; a
silent checksum reconciliation. Gate resolution happens only after artifacts are
`CONFIRMED` (coordination §3.8). This document performs none of it.

---

## 7. Evidence not yet received and active blockers (as of 2026-10-16)

| Group | Requested | Received | `CONFIRMED` | Status |
| --- | ---: | ---: | ---: | --- |
| A — Environment identity + isolation (`A1`–`A7`) | 7 | 0 | 0 | all `PENDING` |
| B — Migration ledger (`B1`–`B5`) | 5 | 0 | 0 | all `PENDING` |
| C — Catalog 0019–0022 (`C1`–`C9`) | 9 | 0 | 0 | all `PENDING` |
| D — Actual `0020` status (`D1`–`D5`) | 5 | 0 | 0 | all `PENDING` |
| E — Lineage + `max(created_at)` (`E1`–`E6`) | 6 | 0 | 0 | all `PENDING` |
| F — Backup + disposable restore (`F1`–`F6`) | 6 | 0 | 0 | all `PENDING` |
| G — Build compatibility (`G1`–`G6`) | 6 | 0 | 0 | all `PENDING` |
| H — Cross-cutting attestations (`H1`–`H3`) | 3 | 0 | 0 | all `PENDING` |
| **Total** | **47** | **0** | **0** | **47 `PENDING`** |

**Blockers:** 14 of 15 `OPEN` — `B-01`…`B-11`, `B-13`, `B-14`, `B-15` (`B-12`
`CLOSED` by a documentation corrective action, 2026-10-16; no gate advanced).
`B-15` is closed only by rehearsal §5.6/§5.7, which is out of scope here.

**Gates:** `G1-S`, `G2-S`, `G3-S`, `G4-S`, `G5-S` — all `BLOCKED`.
**Part A:** `A1`–`A14` — all `PENDING` ☐.

**Wave-1 blockers (priority):** `B-01`/`B-08` (identity/isolation `A1`–`A5`,`A7`)
and `B-04`/`B-07` (`0020` status `D1`–`D5` + `G1`).

---

## 8. Owners and next actions

| Owner | Template | First artifacts to return | Blocks (until `CONFIRMED`) |
| --- | --- | --- | --- |
| DBA | `RT-DBA` | `A1`,`A2`,`A3`,`A5`,`A7`; `D1`,`D4`; then `B1`,`B2`,`B4`,`B5`,`C1`–`C6`,`C9`,`E2`,`E5`,`F1`–`F6`,`G6` | `B-01`,`B-02`,`B-03`,`B-06`; feeds `G5-S`,`G2-S`,`G4-S` |
| Application Lead | `RT-APP` | `D2`,`D3`,`G1`; `C7` classification; `G2`–`G5` | `B-04`,`B-07`,`B-09`,`B-14`; feeds `G1-S`,`A8`,`A14` |
| Operator | `RT-OP` | `A6`,`H2` | `B-08`,`B-13`; feeds `A12`,`A13` |
| Reviewer (≠ collector) | `RT-RV` | verify every returned artifact | no `Result` valid without it |

**Ordering rule:** `A1`/`A2` authorization (`B-11`) is signed **last**, only after
`B-01`…`B-10` are evidenced (coordination §4.1). A staging pass, when someday
achieved, authorizes nothing beyond "0022 rehearsed on staging"; production stays
gated separately by Part B `B1`–`B13`.

---

## 9. Explicit non-actions in producing this pack

- No database was contacted; **no query was executed**. `TS-S1`–`TS-S10` remain
  proposals for DBA review only.
- No migration was run, generated, pushed, applied, or journaled; no
  `_journal.json`, snapshot, ledger, schema, or configuration was modified.
- No seed, deployment, RBAC seeding, or employee record was created, modified, or
  deleted. `DELETION_EXECUTION_ENABLED` remains `false`;
  `RETENTION_ELIGIBLE_CATEGORIES` remains `[]`.
- No secret, `.env.production`, connection string, or production endpoint was read
  or guessed.
- **No evidence was simulated, fabricated, or marked `CONFIRMED`.** Every
  template is blank; every row is `PENDING`; every gate is `BLOCKED`.
- When created, no existing document was modified; this pack was a **new,
  additive** document. In the follow-up task (2026-10-16) the **only** existing
  document edited was
  `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md`
  (§2.2, §2.5, §2.6 + a header revision note) to apply `F-01`–`F-03`; this pack
  received its own `§1.3`/`§1.4`/`§1.5`/`§2.1`/`§10` updates. In the Wave-1
  evidence-coordination task (2026-10-19, FASE 3) the **only** existing
  documents edited were the coordination request (§2.5 code list + header note),
  the pack (§2.G `G6` redaction cell), the staging intake register (§3 `G6`
  redaction cell), and this document (`F-05`/`F-06` log) — documentation cells
  only, to apply the two redaction-coverage findings; no application source,
  migration, journal, snapshot, schema, configuration, test, or status cell was
  touched.
- No `PENDING` row was advanced, no gate was set to `PASS`, and **no rehearsal
  was started or authorized**.

**Conclusion:** four role-separated response templates (`RT-DBA`, `RT-APP`,
`RT-OP`, `RT-RV`), a priority-wave order that puts staging identity/isolation
(`A1`–`A5`, `A7`) and the `0020` disposition (`D1`–`D5` + `G1`) first, and a
read-only validation confirming the coordination package is consistent across
the pack, staging intake register, readiness audit, DBA handoff, and approval
checklist. Six findings (`F-01`–`F-06`) are recorded and **all are RESOLVED**
(`F-01`–`F-04` 2026-10-16; `F-05`/`F-06` 2026-10-19 — redaction-coverage cells
only, no state change). Migration `0022` remains unapplied and unjournaled;
staging is **NOT READY** and production is **NOT READY**.

---

## 10. Files changed in this task

This document was **created** in the pack task, then **modified** in the
follow-up navigation/Wave-1 task; the coordination package was corrected in the
same follow-up.

| File | Change |
| --- | --- |
| `docs/employee-permanent-delete-0022-staging-evidence-response-templates.md` | **created**, then **modified** in follow-up: `§1.3` findings marked `RESOLVED`; `§1.4` verdict updated; `§1.5` post-correction consistency check added; `§2.1` Wave-1 dispatch request list added; `§9` non-actions and conclusion updated; `§10` this table |
| `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` | **modified** (navigational only): `§2.2` `A3`/`A4`/`D5` intake references now name `docs/employee-permanent-delete-dba-evidence-intake.md` (`A4` and `A7`/`G6` source rows separated); `§2.5` DBA reviewer row now includes `A7`; `§2.6` `§4.4` row annotates `D1` as indirect; header revision note added; **2026-10-16 (FASE 1):** `§2.2` `H2` source corrected to `Runbook §0 rule 7` (`§0.7`) and `§4` `A13` evidence cell qualified (`F-04`) |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` | **modified** 2026-10-16 (FASE 1): `§2.H` `H2` `Sumber` corrected to `runbook §0 rule 7` (`§0.7`) (`F-04`) |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` | **modified** 2026-10-16 (FASE 1): `§3` `H2` `Sumber` corrected to `runbook §0 rule 7` (`§0.7`) (`F-04`) |
| `docs/employee-permanent-delete-0022-staging-readiness-audit.md` | **modified** 2026-10-16 (FASE 1): `§3.2` `A13` evidence cell qualified to `runbook §0 rule 7` (`§0.7`) (`F-04`) |
| `docs/employee-permanent-delete-0022-approval-checklist.md` | **modified** 2026-10-16 (FASE 1): Part A `A13` evidence cell qualified to `runbook §0 rule 7` (`§0.7`) (`F-04`) |
| `docs/employee-permanent-delete-0022-staging-evidence-response-templates.md` | **modified** 2026-10-19 (FASE 3): `§1.3` `F-05`/`F-06` findings added (RESOLVED); `§1.4`/`§1.5` verdict + post-correction check updated (`C-11`/`C-12` added); `§9` non-actions + conclusion updated; `§10` this table |
| `docs/employee-permanent-delete-0022-staging-evidence-request-pack.md` | **modified** 2026-10-19 (FASE 3): `§2.G` `G6` `Redaksi` cell `R5` → `R1, R5` (`F-05`) |
| `docs/employee-permanent-delete-0022-staging-evidence-intake-register.md` | **modified** 2026-10-19 (FASE 3): `§3` `G6` `Redaksi` cell `R5` → `R1, R5` (`F-05`) |
| `docs/employee-permanent-delete-0022-staging-evidence-coordination-request.md` | **modified** 2026-10-19 (FASE 3): `§2.5` DBA row code list now includes `R4` (`F-06`); header revision note added |

No migration, journal, snapshot, schema, configuration, test, or application
source file was touched. All prior working-tree changes are preserved. The
`F-04` corrections are source-citation edits and the `F-05`/`F-06` corrections
are redaction-cell/code-list alignment edits only: no artifact, gate, blocker,
Part A, or Part B state changed.
