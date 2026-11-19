-- 0028 — Letter templates with merge fields (SKK, SP, ST, SK). ADDITIVE
-- ONLY: one new table, no change to any existing table, no employee
-- reference. Apply in the approved window: DATABASE_URL=<prod> npm run
-- db:migrate (see docs/documents.md).
CREATE TABLE "letter_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "letter_templates" ADD CONSTRAINT "letter_templates_document_type_id_document_types_id_fk" FOREIGN KEY ("document_type_id") REFERENCES "public"."document_types"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "letter_templates_org_name_unique" ON "letter_templates" USING btree ("organization_id","name");
