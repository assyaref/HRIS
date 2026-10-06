CREATE TABLE "payslip_document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payslip_document_id" uuid NOT NULL,
	"payslip_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"file_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payslip_document_versions_version_positive" CHECK ("payslip_document_versions"."version" >= 1),
	CONSTRAINT "payslip_document_versions_source_valid" CHECK ("payslip_document_versions"."source" in ('generated', 'uploaded', 'legacy'))
);
--> statement-breakpoint
ALTER TABLE "payslip_document_versions" ADD CONSTRAINT "payslip_document_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_document_versions" ADD CONSTRAINT "payslip_document_versions_payslip_document_id_payslip_documents_id_fk" FOREIGN KEY ("payslip_document_id") REFERENCES "public"."payslip_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_document_versions" ADD CONSTRAINT "payslip_document_versions_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_document_versions" ADD CONSTRAINT "payslip_document_versions_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payslip_document_versions_org_document_version_unique" ON "payslip_document_versions" USING btree ("organization_id","payslip_document_id","version");--> statement-breakpoint
CREATE INDEX "payslip_document_versions_org_idx" ON "payslip_document_versions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payslip_document_versions_payslip_idx" ON "payslip_document_versions" USING btree ("payslip_id");--> statement-breakpoint
CREATE INDEX "payslip_document_versions_document_idx" ON "payslip_document_versions" USING btree ("payslip_document_id");
--> statement-breakpoint
/*
 * DATA BACKFILL — safe initial version representation.
 *
 * Every existing "payslip_documents" row predates version history, so it is
 * recorded here as version 1. Legacy manual uploads cannot be distinguished
 * from automatically generated documents, therefore all pre-existing rows are
 * backfilled with source = 'legacy' (origin not provable).
 *
 * The current encrypted file is retained untouched: this statement only adds
 * metadata rows, it never moves, deletes, or re-encrypts a stored PDF.
 *
 * Idempotent: the NOT EXISTS guard prevents a duplicate version 1 row if the
 * statement is ever re-run.
 *
 * This migration is additive and must NOT be applied automatically.
 */
INSERT INTO "payslip_document_versions" (
	"organization_id",
	"payslip_document_id",
	"payslip_id",
	"employee_id",
	"version",
	"storage_key",
	"original_filename",
	"mime_type",
	"file_size",
	"sha256",
	"source",
	"created_at"
)
SELECT
	document."organization_id",
	document."id",
	document."payslip_id",
	document."employee_id",
	1,
	document."storage_key",
	document."original_filename",
	document."mime_type",
	document."file_size",
	document."sha256",
	'legacy',
	document."created_at"
FROM "payslip_documents" AS document
WHERE NOT EXISTS (
	SELECT 1
	FROM "payslip_document_versions" AS version
	WHERE version."organization_id" = document."organization_id"
	  AND version."payslip_document_id" = document."id"
	  AND version."version" = 1
);