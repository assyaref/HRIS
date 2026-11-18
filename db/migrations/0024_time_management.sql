-- 0024 — Time management: holiday calendar, shifts, work groups, overtime
-- requests (SPKL). ADDITIVE ONLY: five new tables, no change to any existing
-- table. Employee foreign keys are ON DELETE RESTRICT (no CASCADE); permanent
-- deletion / test-data purge remove these rows explicitly. Apply in the
-- approved window: DATABASE_URL=<prod> npm run db:migrate
-- (see docs/time-management.md).
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"holiday_date" date NOT NULL,
	"name" text NOT NULL,
	"holiday_type" text DEFAULT 'national' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overtime_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"overtime_date" date NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"total_minutes" integer NOT NULL,
	"spkl_number" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"submitted_by" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"reviewer_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#3B82F6' NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"break_minutes" integer DEFAULT 60 NOT NULL,
	"working_days" text DEFAULT '1,2,3,4,5' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"work_group_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"shift_id" uuid,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "overtime_requests" ADD CONSTRAINT "overtime_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_work_group_id_work_groups_id_fk" FOREIGN KEY ("work_group_id") REFERENCES "public"."work_groups"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_group_members" ADD CONSTRAINT "work_group_members_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_groups" ADD CONSTRAINT "work_groups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_groups" ADD CONSTRAINT "work_groups_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "holidays_org_date_name_unique" ON "holidays" USING btree ("organization_id","holiday_date","name");
--> statement-breakpoint
CREATE INDEX "overtime_requests_org_status_idx" ON "overtime_requests" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "overtime_requests_org_employee_idx" ON "overtime_requests" USING btree ("organization_id","employee_id","overtime_date");
--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_org_name_unique" ON "shifts" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "work_group_members_org_employee_unique" ON "work_group_members" USING btree ("organization_id","employee_id");
--> statement-breakpoint
CREATE INDEX "work_group_members_group_idx" ON "work_group_members" USING btree ("work_group_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "work_groups_org_name_unique" ON "work_groups" USING btree ("organization_id","name");
