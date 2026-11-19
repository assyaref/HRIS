-- 0027 — Letter numbering (No Surat) and generated letters (PKWT).
-- ADDITIVE ONLY: two new tables, no change to any existing table.
-- issued_documents.employee_id is optional and ON DELETE RESTRICT; permanent
-- deletion / test-data purge remove the employee's letters explicitly.
-- Apply in the approved window: DATABASE_URL=<prod> npm run db:migrate
-- (see docs/documents.md).
CREATE TABLE "document_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"number_format" text NOT NULL,
	"sequence_padding" integer DEFAULT 3 NOT NULL,
	"reset_period" text DEFAULT 'yearly' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issued_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"period" text NOT NULL,
	"sequence" integer NOT NULL,
	"document_number" text NOT NULL,
	"issued_date" date NOT NULL,
	"subject" text NOT NULL,
	"recipient" text,
	"employee_id" uuid,
	"content" jsonb,
	"notes" text,
	"voided" boolean DEFAULT false NOT NULL,
	"void_reason" text,
	"voided_at" timestamp with time zone,
	"issued_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_types" ADD CONSTRAINT "document_types_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "issued_documents" ADD CONSTRAINT "issued_documents_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "document_types_org_code_unique" ON "document_types" USING btree ("organization_id","code");
--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_type_period_seq_unique" ON "issued_documents" USING btree ("organization_id","document_type_id","period","sequence");
--> statement-breakpoint
CREATE UNIQUE INDEX "issued_documents_org_number_unique" ON "issued_documents" USING btree ("organization_id","document_number");
--> statement-breakpoint
CREATE INDEX "issued_documents_org_date_idx" ON "issued_documents" USING btree ("organization_id","issued_date");
--> statement-breakpoint
CREATE INDEX "issued_documents_org_employee_idx" ON "issued_documents" USING btree ("organization_id","employee_id");
