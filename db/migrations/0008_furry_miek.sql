ALTER TABLE "employees" ADD COLUMN "nik" text;--> statement-breakpoint
ALTER TABLE "employees" ADD COLUMN "birth_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_org_nik_unique" ON "employees" USING btree ("organization_id","nik");