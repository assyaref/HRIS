CREATE TABLE "employee_payroll_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"component_id" uuid NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_payroll_components_amount_nonnegative" CHECK ("employee_payroll_components"."amount" >= 0),
	CONSTRAINT "employee_payroll_components_date_range_check" CHECK ("employee_payroll_components"."effective_to" IS NULL OR "employee_payroll_components"."effective_to" > "employee_payroll_components"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "employee_payroll_components" ADD CONSTRAINT "employee_payroll_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_components" ADD CONSTRAINT "employee_payroll_components_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_payroll_components" ADD CONSTRAINT "employee_payroll_components_component_id_payroll_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."payroll_components"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_payroll_components_org_idx" ON "employee_payroll_components" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employee_payroll_components_employee_idx" ON "employee_payroll_components" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_payroll_components_component_idx" ON "employee_payroll_components" USING btree ("component_id");--> statement-breakpoint
CREATE INDEX "employee_payroll_components_effective_idx" ON "employee_payroll_components" USING btree ("organization_id","employee_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_payroll_components_active_unique" ON "employee_payroll_components" USING btree ("organization_id","employee_id","component_id") WHERE active = true;