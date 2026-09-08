CREATE TABLE "attendance_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"attendance_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mime_type" text DEFAULT 'image/jpeg' NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_photos" ADD CONSTRAINT "attendance_photos_attendance_id_attendance_records_id_fk" FOREIGN KEY ("attendance_id") REFERENCES "public"."attendance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_photos_org_attendance_idx" ON "attendance_photos" USING btree ("organization_id","attendance_id");--> statement-breakpoint
CREATE INDEX "attendance_photos_expires_at_idx" ON "attendance_photos" USING btree ("expires_at");