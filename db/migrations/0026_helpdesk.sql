-- 0026 — Helpdesk "Tanya Admin": categories, tickets, messages. ADDITIVE
-- ONLY: three new tables, no change to any existing table. Ticket
-- employee_id is ON DELETE RESTRICT; permanent deletion / test-data purge
-- remove tickets explicitly (messages cascade with their ticket). Apply in
-- the approved window: DATABASE_URL=<prod> npm run db:migrate
-- (see docs/helpdesk.md).
CREATE TABLE "helpdesk_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helpdesk_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_user_id" uuid,
	"from_agent" boolean DEFAULT false NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "helpdesk_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ticket_number" text NOT NULL,
	"employee_id" uuid NOT NULL,
	"category_id" uuid,
	"subject" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_by" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_from_agent" boolean DEFAULT false NOT NULL,
	"employee_last_read_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "helpdesk_categories" ADD CONSTRAINT "helpdesk_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_messages" ADD CONSTRAINT "helpdesk_messages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_messages" ADD CONSTRAINT "helpdesk_messages_ticket_id_helpdesk_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."helpdesk_tickets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_messages" ADD CONSTRAINT "helpdesk_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_category_id_helpdesk_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."helpdesk_categories"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "helpdesk_tickets" ADD CONSTRAINT "helpdesk_tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "helpdesk_categories_org_name_unique" ON "helpdesk_categories" USING btree ("organization_id","name");
--> statement-breakpoint
CREATE INDEX "helpdesk_messages_ticket_idx" ON "helpdesk_messages" USING btree ("ticket_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "helpdesk_tickets_org_number_unique" ON "helpdesk_tickets" USING btree ("organization_id","ticket_number");
--> statement-breakpoint
CREATE INDEX "helpdesk_tickets_org_status_idx" ON "helpdesk_tickets" USING btree ("organization_id","status");
--> statement-breakpoint
CREATE INDEX "helpdesk_tickets_org_employee_idx" ON "helpdesk_tickets" USING btree ("organization_id","employee_id");
