CREATE TABLE "employee_project_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attendance_id" uuid,
	"employee_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"accuracy_meters" numeric(10, 2),
	"distance_meters" numeric(10, 2),
	"verification_method" text,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"project_id" uuid,
	"work_location_id" uuid,
	"attendance_date" date NOT NULL,
	"check_in_at" timestamp with time zone,
	"check_in_latitude" numeric(10, 7),
	"check_in_longitude" numeric(10, 7),
	"check_in_accuracy_meters" numeric(10, 2),
	"check_in_distance_meters" numeric(10, 2),
	"check_in_location_status" text,
	"check_in_verification_status" text,
	"check_in_method" text,
	"check_out_at" timestamp with time zone,
	"check_out_latitude" numeric(10, 7),
	"check_out_longitude" numeric(10, 7),
	"check_out_accuracy_meters" numeric(10, 2),
	"check_out_distance_meters" numeric(10, 2),
	"check_out_location_status" text,
	"check_out_verification_status" text,
	"check_out_method" text,
	"status" text DEFAULT 'present' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_project_assignments" ADD CONSTRAINT "employee_project_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_project_assignments" ADD CONSTRAINT "employee_project_assignments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_project_assignments" ADD CONSTRAINT "employee_project_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_attendance_id_attendance_records_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_project_assignments_org_idx" ON "employee_project_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employee_project_assignments_employee_idx" ON "employee_project_assignments" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "employee_project_assignments_project_idx" ON "employee_project_assignments" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_project_assignments_active_unique" ON "employee_project_assignments" USING btree ("organization_id","employee_id","project_id") WHERE active = true;--> statement-breakpoint
CREATE INDEX "attendance_events_org_idx" ON "attendance_events" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "attendance_events_attendance_id_idx" ON "attendance_events" USING btree ("attendance_id");--> statement-breakpoint
CREATE INDEX "attendance_events_employee_id_idx" ON "attendance_events" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "attendance_events_org_event_at_idx" ON "attendance_events" USING btree ("organization_id","event_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_records_employee_date_unique" ON "attendance_records" USING btree ("employee_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_records_org_date_idx" ON "attendance_records" USING btree ("organization_id","attendance_date");--> statement-breakpoint
CREATE INDEX "attendance_records_project_id_idx" ON "attendance_records" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "attendance_records_work_location_id_idx" ON "attendance_records" USING btree ("work_location_id");--> statement-breakpoint
CREATE INDEX "attendance_records_status_idx" ON "attendance_records" USING btree ("status");