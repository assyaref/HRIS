-- 0032 — Two-level approval (direct manager, then HR), opt-in per request
-- type. ADDITIVE ONLY: two new tables, no change to any existing table, no
-- employee reference. Apply in the approved window:
-- DATABASE_URL=<prod> npm run db:migrate (see docs/approval-chain.md).
CREATE TABLE "approval_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"manager_step" boolean DEFAULT false NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"request_type" text NOT NULL,
	"request_id" uuid NOT NULL,
	"step" text DEFAULT 'manager' NOT NULL,
	"approver_user_id" uuid,
	"decision" text NOT NULL,
	"note" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approval_settings" ADD CONSTRAINT "approval_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_approver_user_id_users_id_fk" FOREIGN KEY ("approver_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "approval_settings_org_type_unique" ON "approval_settings" USING btree ("organization_id","request_type");
--> statement-breakpoint
CREATE UNIQUE INDEX "approval_steps_request_step_unique" ON "approval_steps" USING btree ("organization_id","request_type","request_id","step");
