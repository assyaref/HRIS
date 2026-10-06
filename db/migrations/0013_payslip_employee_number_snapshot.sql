ALTER TABLE "payslips" ADD COLUMN "employee_number_snapshot" text;--> statement-breakpoint
/*
 * DATA BACKFILL — historical PDF password stability.
 *
 * The payslip PDF password contract is `employeeNumberSnapshot + DDMMYYYY`.
 * Existing payslips are backfilled from the immutable payroll item snapshot
 * when available (Mode A) and otherwise from the employee's current number
 * (Mode B / legacy). This only records metadata; no PDF is moved, deleted, or
 * re-encrypted, and no payroll amount is touched.
 *
 * Idempotent: the IS NULL guard prevents overwriting a snapshot if re-run.
 *
 * This migration is additive and must NOT be applied automatically.
 */
UPDATE "payslips" AS p
SET "employee_number_snapshot" = COALESCE(
	(
		SELECT item."employee_number_snapshot"
		FROM "payroll_items" AS item
		WHERE item."id" = p."payroll_item_id"
	),
	e."employee_number"
)
FROM "employees" AS e
WHERE p."employee_id" = e."id"
  AND p."employee_number_snapshot" IS NULL;
