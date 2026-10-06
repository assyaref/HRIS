ALTER TABLE "users" ADD COLUMN "name" text;--> statement-breakpoint
/*
 * USER ACCOUNT CRUD (Phase 12) — display name for user accounts.
 *
 * Adds an additive, nullable display-name column to the `users` table so the
 * User Management module can show and edit an account name independently of
 * the linked Employee record. NULL keeps legacy accounts valid; the UI falls
 * back to the linked employee's name and finally the email address.
 *
 * Additive only: no data is modified, no existing constraint changes, and no
 * other table is touched.
 */