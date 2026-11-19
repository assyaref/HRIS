-- 0029 — Timesheets: daily hours per project / task, submitted per week and
-- approved per employee-week. ADDITIVE ONLY: one new table, no change to any
-- existing table. employee_id is ON DELETE RESTRICT; permanent deletion /
-- test-data purge remove these rows explicitly. Apply in the approved window:
-- DATABASE_URL=<prod> npm run db:migrate (see docs/timesheets.md).
CREATE TABLE "timesheet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"work_date" date NOT NULL,
	"week_start" date NOT NULL,
	"project_id" uuid,
	"task" text NOT NULL,
	"minutes" integer NOT NULL,
	"notes" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewer_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "timesheet_entries_org_employee_week_idx" ON "timesheet_entries" USING btree ("organization_id","employee_id","week_start");
--> statement-breakpoint
CREATE INDEX "timesheet_entries_org_week_status_idx" ON "timesheet_entries" USING btree ("organization_id","week_start","status");
