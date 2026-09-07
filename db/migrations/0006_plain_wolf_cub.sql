CREATE TABLE "face_enrollment_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"enrollment_id" uuid NOT NULL,
	"template_version" text NOT NULL,
	"secret" "bytea" NOT NULL,
	"key_version" text DEFAULT 'v1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "face_enrollment_templates" ADD CONSTRAINT "face_enrollment_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_enrollment_templates" ADD CONSTRAINT "face_enrollment_templates_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "face_enrollment_templates" ADD CONSTRAINT "face_enrollment_templates_enrollment_id_employee_face_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."employee_face_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "face_enrollment_templates_enrollment_unique" ON "face_enrollment_templates" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "face_enrollment_templates_org_idx" ON "face_enrollment_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "face_enrollment_templates_employee_idx" ON "face_enrollment_templates" USING btree ("employee_id");