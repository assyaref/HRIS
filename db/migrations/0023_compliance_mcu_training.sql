-- 0023 — Compliance: medical check-ups, training masters, employee trainings,
-- position × training matrix. ADDITIVE ONLY: four new tables, no change to
-- any existing table. Employee foreign keys are ON DELETE RESTRICT (no
-- CASCADE); permanent deletion / test-data purge remove these rows
-- explicitly. Apply in the approved window: DATABASE_URL=<prod> npm run db:migrate
-- (see docs/compliance-mcu-training.md).
CREATE TABLE "employee_trainings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"training_master_id" uuid,
	"title" text NOT NULL,
	"certificate_number" text,
	"issuer" text,
	"location" text,
	"training_date" date NOT NULL,
	"valid_until" date,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_checkups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"checkup_date" date NOT NULL,
	"valid_until" date,
	"provider" text,
	"location" text,
	"doctor" text,
	"result" text DEFAULT 'fit' NOT NULL,
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_masters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"training_type" text DEFAULT 'internal' NOT NULL,
	"duration_hours" integer,
	"organizer" text,
	"validity_months" integer,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"position" text NOT NULL,
	"training_master_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_training_master_id_training_masters_id_fk" FOREIGN KEY ("training_master_id") REFERENCES "public"."training_masters"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_trainings" ADD CONSTRAINT "employee_trainings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "medical_checkups" ADD CONSTRAINT "medical_checkups_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "medical_checkups" ADD CONSTRAINT "medical_checkups_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "medical_checkups" ADD CONSTRAINT "medical_checkups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_masters" ADD CONSTRAINT "training_masters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "training_requirements" ADD CONSTRAINT "training_requirements_training_master_id_training_masters_id_fk" FOREIGN KEY ("training_master_id") REFERENCES "public"."training_masters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "employee_trainings_org_employee_idx" ON "employee_trainings" USING btree ("organization_id","employee_id");
--> statement-breakpoint
CREATE INDEX "employee_trainings_org_valid_until_idx" ON "employee_trainings" USING btree ("organization_id","valid_until");
--> statement-breakpoint
CREATE INDEX "employee_trainings_master_idx" ON "employee_trainings" USING btree ("training_master_id");
--> statement-breakpoint
CREATE INDEX "medical_checkups_org_employee_idx" ON "medical_checkups" USING btree ("organization_id","employee_id");
--> statement-breakpoint
CREATE INDEX "medical_checkups_org_valid_until_idx" ON "medical_checkups" USING btree ("organization_id","valid_until");
--> statement-breakpoint
CREATE UNIQUE INDEX "training_masters_org_name_unique" ON "training_masters" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE UNIQUE INDEX "training_requirements_unique" ON "training_requirements" USING btree ("organization_id","position","training_master_id");
