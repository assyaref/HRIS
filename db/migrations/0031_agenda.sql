-- 0031 — Company agenda / planner with RSVP. ADDITIVE ONLY: two new tables,
-- no change to any existing table. agenda_responses.employee_id is ON DELETE
-- RESTRICT; permanent deletion / test-data purge remove responses
-- explicitly. Apply in the approved window: DATABASE_URL=<prod> npm run
-- db:migrate (see docs/agenda.md).
CREATE TABLE "agenda_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'meeting' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"audience_departments" text[] DEFAULT '{}' NOT NULL,
	"require_rsvp" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"response" text NOT NULL,
	"note" text,
	"responded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agenda_responses" ADD CONSTRAINT "agenda_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agenda_responses" ADD CONSTRAINT "agenda_responses_event_id_agenda_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."agenda_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agenda_responses" ADD CONSTRAINT "agenda_responses_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agenda_events_org_start_idx" ON "agenda_events" USING btree ("organization_id","start_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_responses_event_employee_unique" ON "agenda_responses" USING btree ("event_id","employee_id");
--> statement-breakpoint
CREATE INDEX "agenda_responses_org_employee_idx" ON "agenda_responses" USING btree ("organization_id","employee_id");
