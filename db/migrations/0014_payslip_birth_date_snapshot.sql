ALTER TABLE "payslips" ADD COLUMN "birth_date_snapshot" date;--> statement-breakpoint
/*
 * DATA BACKFILL — historical PDF password stability (Phase 11).
 *
 * The payslip PDF password contract is
 * `employee_number_snapshot + DDMMYYYY(birth_date_snapshot)`.
 * Existing payslips are backfilled from the employee record. This only records
 * an identity snapshot; no PDF is moved, deleted, or re-encrypted, no payroll
 * amount is touched, no payslip status changes, and no document version is
 * modified.
 *
 * Idempotent: the IS NULL guard prevents overwriting a snapshot if re-run.
 *
 * This migration is additive and must NOT be applied automatically.
 */
UPDATE "payslips" AS p
SET "birth_date_snapshot" = e."birth_date"
FROM "employees" AS e
WHERE p."employee_id" = e."id"
  AND p."birth_date_snapshot" IS NULL;
