-- Employee Custom Tabs 2.0: dynamic employee profile tab definitions.
--
-- IMPORTANT: this file is intentionally NOT registered in
-- `db/migrations/meta/_journal.json` (the migration ledger is mid-
-- reconciliation for 0011-0017; see docs/employees.md §12 and
-- docs/migration-reconciliation-runbook.md). It is a forward-only,
-- additive CREATE TABLE/CREATE INDEX migration prepared for review.
-- It has NOT been applied to any database by this change. It must be
-- journaled and applied only through the separately approved
-- reconciliation/deployment process. It renames, renumbers and rewrites
-- nothing that exists today.

CREATE TABLE IF NOT EXISTS "employee_custom_tabs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"tab_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"visibility_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_custom_tabs" ADD CONSTRAINT "employee_custom_tabs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "employee_custom_tabs" ADD CONSTRAINT "employee_custom_tabs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "employee_custom_tabs_org_key_unique" ON "employee_custom_tabs" ("organization_id","tab_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "employee_custom_tabs_org_status_idx" ON "employee_custom_tabs" ("organization_id","status");
