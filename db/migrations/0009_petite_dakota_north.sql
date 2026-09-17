CREATE TABLE "payslip_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"payslip_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text DEFAULT 'application/pdf' NOT NULL,
	"file_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_documents" ADD CONSTRAINT "payslip_documents_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payslip_documents_org_payslip_unique" ON "payslip_documents" USING btree ("organization_id","payslip_id");--> statement-breakpoint
CREATE INDEX "payslip_documents_org_idx" ON "payslip_documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payslip_documents_employee_idx" ON "payslip_documents" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payslip_documents_payslip_idx" ON "payslip_documents" USING btree ("payslip_id");