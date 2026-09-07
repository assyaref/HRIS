CREATE TABLE "employee_face_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"provider_template_ref" text,
	"enrolled_by_user_id" uuid,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_by_user_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_face_enrollments" ADD CONSTRAINT "employee_face_enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_face_enrollments" ADD CONSTRAINT "employee_face_enrollments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_face_enrollments" ADD CONSTRAINT "employee_face_enrollments_enrolled_by_user_id_users_id_fk" FOREIGN KEY ("enrolled_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_face_enrollments" ADD CONSTRAINT "employee_face_enrollments_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employee_face_enrollments_org_idx" ON "employee_face_enrollments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "employee_face_enrollments_employee_idx" ON "employee_face_enrollments" USING btree ("employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_face_enrollments_active_unique" ON "employee_face_enrollments" USING btree ("organization_id","employee_id") WHERE status = 'active';