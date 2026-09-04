CREATE TABLE "payroll_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"calculation_method" text NOT NULL,
	"default_amount" integer DEFAULT 0 NOT NULL,
	"active" text DEFAULT 'true' NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payroll_period_id" uuid,
	"actor_user_id" uuid,
	"event_type" text NOT NULL,
	"from_status" text,
	"to_status" text,
	"reason" text,
	"metadata" text,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_item_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"component_id" uuid,
	"component_code_snapshot" text NOT NULL,
	"component_name_snapshot" text NOT NULL,
	"component_type_snapshot" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payroll_run_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"employee_number_snapshot" text NOT NULL,
	"employee_name_snapshot" text NOT NULL,
	"gross_amount" integer DEFAULT 0 NOT NULL,
	"total_earnings" integer DEFAULT 0 NOT NULL,
	"total_deductions" integer DEFAULT 0 NOT NULL,
	"net_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payroll_period_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"calculated_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"submitted_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"locked_at" timestamp with time zone,
	"locked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payroll_item_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"payslip_number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'generated' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_components" ADD CONSTRAINT "payroll_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_events" ADD CONSTRAINT "payroll_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_events" ADD CONSTRAINT "payroll_events_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_events" ADD CONSTRAINT "payroll_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_components" ADD CONSTRAINT "payroll_item_components_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_components" ADD CONSTRAINT "payroll_item_components_payroll_item_id_payroll_items_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item_components" ADD CONSTRAINT "payroll_item_components_component_id_payroll_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."payroll_components"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_run_id_payroll_runs_id_fk" FOREIGN KEY ("payroll_run_id") REFERENCES "public"."payroll_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_item_id_payroll_items_id_fk" FOREIGN KEY ("payroll_item_id") REFERENCES "public"."payroll_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_components_org_code_unique" ON "payroll_components" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "payroll_components_org_idx" ON "payroll_components" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payroll_events_org_idx" ON "payroll_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payroll_events_period_idx" ON "payroll_events" USING btree ("payroll_period_id");--> statement-breakpoint
CREATE INDEX "payroll_events_org_event_at_idx" ON "payroll_events" USING btree ("organization_id","event_at");--> statement-breakpoint
CREATE INDEX "payroll_item_components_org_idx" ON "payroll_item_components" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payroll_item_components_item_idx" ON "payroll_item_components" USING btree ("payroll_item_id");--> statement-breakpoint
CREATE INDEX "payroll_item_components_component_idx" ON "payroll_item_components" USING btree ("component_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_items_run_employee_unique" ON "payroll_items" USING btree ("payroll_run_id","employee_id");--> statement-breakpoint
CREATE INDEX "payroll_items_org_idx" ON "payroll_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payroll_items_run_idx" ON "payroll_items" USING btree ("payroll_run_id");--> statement-breakpoint
CREATE INDEX "payroll_items_employee_idx" ON "payroll_items" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_periods_org_code_unique" ON "payroll_periods" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "payroll_periods_org_status_idx" ON "payroll_periods" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "payroll_periods_org_dates_idx" ON "payroll_periods" USING btree ("organization_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_runs_org_period_unique" ON "payroll_runs" USING btree ("organization_id","payroll_period_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_org_status_idx" ON "payroll_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payslips_org_payslip_number_unique" ON "payslips" USING btree ("organization_id","payslip_number");--> statement-breakpoint
CREATE INDEX "payslips_org_idx" ON "payslips" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payslips_employee_idx" ON "payslips" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payslips_item_idx" ON "payslips" USING btree ("payroll_item_id");