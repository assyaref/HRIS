/*
 * EMPLOYEE MASTER DATA 2.0 — additive, production-safe migration.
 *
 * Adds personal/employment columns to `employees` (all nullable so existing
 * rows remain valid) and creates the related master-data tables:
 *   employee_addresses, employee_insurances, employee_bank_accounts,
 *   employee_dependents, employee_educations, employee_documents,
 *   employee_employment_history, employee_custom_field_definitions,
 *   employee_custom_field_values.
 *
 * No existing column, index or row is modified. No DROP / TRUNCATE statements.
 */
--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "nickname" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "birth_place" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "religion" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "marital_status" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "personal_email" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "profile_photo_url" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "division" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "position" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "work_location_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "manager_id" uuid;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_start" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "contract_end" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "resignation_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "termination_date" date;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "reason_for_leaving" text;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_org_status_idx" ON "employees" USING btree ("organization_id","employment_status");--> statement-breakpoint
CREATE INDEX "employees_org_dept_idx" ON "employees" USING btree ("organization_id","department");--> statement-breakpoint
CREATE INDEX "employees_org_position_idx" ON "employees" USING btree ("organization_id","position");--> statement-breakpoint
CREATE INDEX "employees_work_location_idx" ON "employees" USING btree ("organization_id","work_location_id");--> statement-breakpoint
CREATE INDEX "employees_manager_idx" ON "employees" USING btree ("organization_id","manager_id");--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"type" text NOT NULL,
	"address" text,
	"rt_rw" text,
	"village" text,
	"district" text,
	"city" text,
	"province" text,
	"postal_code" text,
	"same_as_ktp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_addresses_employee_type_unique" UNIQUE("organization_id","employee_id","type")
);--> statement-breakpoint
CREATE INDEX "employee_addresses_org_employee_idx" ON "employee_addresses" USING btree ("organization_id","employee_id");--> statement-breakpoint
ALTER TABLE "employee_addresses" ADD CONSTRAINT "employee_addresses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_addresses" ADD CONSTRAINT "employee_addresses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_insurances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"npwp" text,
	"bpjs_kesehatan_number" text,
	"bpjs_kesehatan_status" text,
	"bpjs_kesehatan_class" text,
	"bpjs_ketenagakerjaan_number" text,
	"bpjs_ketenagakerjaan_status" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_insurances_employee_unique" UNIQUE("organization_id","employee_id")
);--> statement-breakpoint
CREATE INDEX "employee_insurances_org_idx" ON "employee_insurances" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "employee_insurances" ADD CONSTRAINT "employee_insurances_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_insurances" ADD CONSTRAINT "employee_insurances_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"bank_name" text NOT NULL,
	"account_number" text NOT NULL,
	"account_holder" text NOT NULL,
	"branch" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "employee_bank_accounts_org_employee_idx" ON "employee_bank_accounts" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_bank_accounts_primary_unique" ON "employee_bank_accounts" USING btree ("organization_id","employee_id") WHERE is_primary = true;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_bank_accounts" ADD CONSTRAINT "employee_bank_accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_dependents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"name" text NOT NULL,
	"relationship" text NOT NULL,
	"nik" text,
	"birth_date" date,
	"gender" text,
	"occupation" text,
	"dependent_status" text,
	"bpjs_status" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "employee_dependents_org_employee_idx" ON "employee_dependents" USING btree ("organization_id","employee_id");--> statement-breakpoint
ALTER TABLE "employee_dependents" ADD CONSTRAINT "employee_dependents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_dependents" ADD CONSTRAINT "employee_dependents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_educations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"education_level" text NOT NULL,
	"institution" text NOT NULL,
	"major" text,
	"start_year" integer,
	"graduation_year" integer,
	"gpa_score" text,
	"certificate_number" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "employee_educations_org_employee_idx" ON "employee_educations" USING btree ("organization_id","employee_id");--> statement-breakpoint
ALTER TABLE "employee_educations" ADD CONSTRAINT "employee_educations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_educations" ADD CONSTRAINT "employee_educations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"document_number" text,
	"original_filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"uploaded_by_user_id" uuid,
	"expiry_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "employee_documents_org_employee_idx" ON "employee_documents" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_documents_uploader_idx" ON "employee_documents" USING btree ("uploaded_by_user_id");--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_employment_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"position" text,
	"department" text,
	"division" text,
	"manager_id" uuid,
	"work_location_id" uuid,
	"employment_type" text,
	"employment_status" text,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX "employee_employment_history_org_employee_idx" ON "employee_employment_history" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "employee_employment_history_effective_idx" ON "employee_employment_history" USING btree ("employee_id","effective_from");--> statement-breakpoint
ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_manager_id_employees_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_employment_history" ADD CONSTRAINT "employee_employment_history_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_custom_field_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"field_key" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"field_type" text NOT NULL,
	"section" text DEFAULT 'Other' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"visibility_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"editable_by_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "employee_custom_field_definitions_org_key_unique" UNIQUE("organization_id","field_key")
);--> statement-breakpoint
CREATE INDEX "employee_custom_field_definitions_org_status_idx" ON "employee_custom_field_definitions" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "employee_custom_field_definitions_org_section_idx" ON "employee_custom_field_definitions" USING btree ("organization_id","section");--> statement-breakpoint
ALTER TABLE "employee_custom_field_definitions" ADD CONSTRAINT "employee_custom_field_definitions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_custom_field_definitions" ADD CONSTRAINT "employee_custom_field_definitions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
--> statement-breakpoint
CREATE TABLE "employee_custom_field_values" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"field_definition_id" uuid NOT NULL,
	"value_text" text,
	"value_number" numeric,
	"value_date" timestamp with time zone,
	"value_boolean" boolean,
	"value_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_custom_field_values_employee_field_unique" UNIQUE("organization_id","employee_id","field_definition_id")
);--> statement-breakpoint
CREATE INDEX "employee_custom_field_values_org_field_idx" ON "employee_custom_field_values" USING btree ("organization_id","field_definition_id");--> statement-breakpoint
CREATE INDEX "employee_custom_field_values_org_employee_idx" ON "employee_custom_field_values" USING btree ("organization_id","employee_id");--> statement-breakpoint
ALTER TABLE "employee_custom_field_values" ADD CONSTRAINT "employee_custom_field_values_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_custom_field_values" ADD CONSTRAINT "employee_custom_field_values_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_custom_field_values" ADD CONSTRAINT "employee_custom_field_values_field_definition_id_employee_custom_field_definitions_id_fk" FOREIGN KEY ("field_definition_id") REFERENCES "public"."employee_custom_field_definitions"("id") ON DELETE restrict ON UPDATE no action;