ALTER TABLE "payslips" ALTER COLUMN "payroll_item_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payslips" ADD COLUMN "payroll_period_id" uuid;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payslips_period_idx" ON "payslips" USING btree ("payroll_period_id");--> statement-breakpoint
UPDATE "payslips" AS p
SET "payroll_period_id" = r."payroll_period_id"
FROM "payroll_items" AS i
JOIN "payroll_runs" AS r ON r."id" = i."payroll_run_id"
WHERE p."payroll_item_id" = i."id"
  AND p."payroll_period_id" IS NULL;