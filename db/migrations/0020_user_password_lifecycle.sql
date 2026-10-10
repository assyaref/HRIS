-- 0020 — User password lifecycle (import provisioning + forced change + reset)
--
-- Purpose:
--   Support the Employee Import + Automatic Login Account Provisioning flow:
--     * accounts created through the import get the employee number as their
--       initial password and must change it on first login;
--     * administrators can reset an account's password and force a change on
--       the next login;
--     * the User Management list can show the account's last login.
--
--   Columns added to `users`:
--     * must_change_password  boolean NOT NULL DEFAULT false
--         While true, the authenticated session may only reach
--         /change-password and /logout (enforced server-side by
--         lib/auth/auth.ts `requireUser`).
--     * password_changed_at   timestamptz NULL
--         Set when the owner changes the password; cleared by an
--         administrative reset.
--     * last_login_at         timestamptz NULL
--         Best-effort timestamp refreshed on successful login.
--
-- SCOPE — SCHEMA / DDL ONLY:
--   No data rewrite, no credential material, no default that changes existing
--   behaviour. Every existing account keeps its current credentials and is NOT
--   forced to change anything (must_change_password defaults to false).
--
-- IDEMPOTENT:
--   Re-running is a no-op (`IF NOT EXISTS`).
--
-- CHANGELOG NOTE:
--   The `drizzle` journal entry for this migration is deliberately NOT
--   included, following the 0019 convention: the approved candidate journal
--   contains exactly 20 entries and must not be mutated from this worktree
--   (see docs/migration-reconciliation-runbook.md). The journal entry must be
--   appended in a separate, separately-approved change.
--
-- Rollback:
--   ALTER TABLE users
--     DROP COLUMN IF EXISTS must_change_password,
--     DROP COLUMN IF EXISTS password_changed_at,
--     DROP COLUMN IF EXISTS last_login_at;
--   (Application code that references the columns must be rolled back first.)
--
-- Tested first against:
--   hris_security_rotation_staging

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamp with time zone;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;
