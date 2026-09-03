#!/usr/bin/env node
/**
 * RBAC seed — roles, permissions and role→permission grants (Phase 4).
 *
 * Deterministic and idempotent: running it repeatedly never duplicates rows.
 * It may be run at any time to (re)sync the system catalog:
 *
 *   npm run db:seed:rbac
 *   node scripts/seed-rbac.mts
 *
 * What it does:
 *   1. Upserts the global permission catalog (`permissions`), keyed by code.
 *   2. Ensures the reserved SYSTEM organization (hosts system-level roles).
 *   3. Seeds SUPERADMIN into the SYSTEM organization and the six
 *      organization-level catalog roles (ADMIN, MANAGEMENT, HR, FINANCE,
 *      SUPERVISOR, EMPLOYEE) into every real organization.
 *   4. Replaces each seeded role's `role_permissions` grants to match the
 *      matrix below (seed is authoritative for catalog roles).
 *
 * What it never does: it creates NO users, NO passwords and NO credentials.
 *
 * Security notes:
 *   - Permission codes come from the single TS catalog
 *     (`lib/auth/permissions.ts`) — no strings are duplicated here.
 *   - SUPERADMIN exists only under the SYSTEM organization, so tenant
 *     organizations structurally cannot hold or administer it.
 *
 * Requires Node with native TypeScript support (>= 23.6, or Node 22.6+ with
 * `--experimental-strip-types`). The project is developed against Node 24.
 */

import { config as loadEnv } from "dotenv";
import pg from "pg";

import {
  PERMISSION_CATALOG,
  PERMISSIONS,
  type Permission,
} from "../lib/auth/permissions.ts";
import {
  ORGANIZATION_ROLE_CODES,
  ROLE_CATALOG,
  ROLE_CODES,
  SUPERADMIN_ROLE_CODE,
  SYSTEM_ORGANIZATION_CODE,
  SYSTEM_ORGANIZATION_NAME,
  type RoleCode,
} from "../lib/auth/roles.ts";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    "DATABASE_URL is not set. Create .env.local from .env.example first."
  );
  process.exit(1);
}

/** All catalog codes — the SUPERADMIN grant set. */
const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_CATALOG.map(
  (definition) => definition.code
);

/**
 * Role → permission matrix (source of truth for the seed).
 *
 * `resource.action` codes MUST come from the PERMISSIONS catalog above.
 * Grant nothing unnecessarily; the catalog is the only vocabulary.
 */
const ROLE_PERMISSION_MATRIX: Record<RoleCode, readonly Permission[]> = {
  // System-level: unrestricted administrative access to every capability.
  [ROLE_CODES.SUPERADMIN]: ALL_PERMISSIONS,

  // Organization-level administration.
  [ROLE_CODES.ADMIN]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.USERS_VIEW,
    PERMISSIONS.USERS_CREATE,
    PERMISSIONS.USERS_UPDATE,
    PERMISSIONS.USERS_DELETE,
    PERMISSIONS.ROLES_VIEW,
    PERMISSIONS.ROLES_CREATE,
    PERMISSIONS.ROLES_UPDATE,
    PERMISSIONS.ROLES_DELETE,
    PERMISSIONS.PERMISSIONS_VIEW,
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.EMPLOYEES_CREATE,
    PERMISSIONS.EMPLOYEES_UPDATE,
    PERMISSIONS.EMPLOYEES_DELETE,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.ATTENDANCE_CHECK_IN,
    PERMISSIONS.ATTENDANCE_CHECK_OUT,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_CREATE,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.PERMISSION_VIEW,
    PERMISSIONS.PERMISSION_CREATE,
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.SETTINGS_VIEW,
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_UPDATE,
  ],

  // Management dashboards, org-scoped visibility and reports.
  [ROLE_CODES.MANAGEMENT]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.PERMISSION_VIEW,
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_UPDATE,
  ],

  // HR administration.
  [ROLE_CODES.HR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.EMPLOYEES_CREATE,
    PERMISSIONS.EMPLOYEES_UPDATE,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_MANAGE,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_CREATE,
    PERMISSIONS.LEAVE_MANAGE,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.PERMISSION_VIEW,
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.PERMISSION_MANAGE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_UPDATE,
  ],

  // Finance / payroll.
  [ROLE_CODES.FINANCE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.PAYROLL_VIEW,
    PERMISSIONS.PAYROLL_MANAGE,
    PERMISSIONS.PAYSLIP_VIEW,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_UPDATE,
  ],

  // Team supervision / approvals.
  [ROLE_CODES.SUPERVISOR]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.EMPLOYEES_VIEW,
    PERMISSIONS.PROJECTS_VIEW,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_APPROVE,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_APPROVE,
    PERMISSIONS.PERMISSION_VIEW,
    PERMISSIONS.PERMISSION_APPROVE,
    PERMISSIONS.REPORTS_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_UPDATE,
  ],

  // Self-service.
  [ROLE_CODES.EMPLOYEE]: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PROFILE_VIEW,
    PERMISSIONS.PROFILE_UPDATE,
    PERMISSIONS.ATTENDANCE_VIEW,
    PERMISSIONS.ATTENDANCE_CHECK_IN,
    PERMISSIONS.ATTENDANCE_CHECK_OUT,
    PERMISSIONS.LEAVE_VIEW,
    PERMISSIONS.LEAVE_CREATE,
    PERMISSIONS.PERMISSION_VIEW,
    PERMISSIONS.PERMISSION_CREATE,
    PERMISSIONS.PAYSLIP_VIEW,
  ],
};

const pool = new pg.Pool({ connectionString: databaseUrl });

async function main(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Upsert the global permission catalog.
    for (const definition of PERMISSION_CATALOG) {
      await client.query(
        `INSERT INTO permissions (code, module, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE
           SET module = EXCLUDED.module,
               description = EXCLUDED.description`,
        [definition.code, definition.module, definition.description]
      );
    }

    const permissionResult = await client.query(
      `SELECT id, code FROM permissions`
    );
    const permissionIdByCode = new Map<string, string>(
      permissionResult.rows.map((row: { id: string; code: string }) => [
        row.code,
        row.id,
      ])
    );

    // 2) Ensure the reserved SYSTEM organization exists.
    await client.query(
      `INSERT INTO organizations (name, code, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name`,
      [SYSTEM_ORGANIZATION_NAME, SYSTEM_ORGANIZATION_CODE]
    );

    const orgResult = await client.query(
      `SELECT id, code FROM organizations ORDER BY code`
    );
    const organizations = orgResult.rows as Array<{
      id: string;
      code: string;
    }>;

    // 3) Seed the catalog roles per organization.
    const roleRows: Array<{
      id: string;
      organizationId: string;
      code: string;
    }> = [];

    for (const organization of organizations) {
      const isSystemOrganization =
        organization.code === SYSTEM_ORGANIZATION_CODE;
      const roleCodes: readonly RoleCode[] = isSystemOrganization
        ? [SUPERADMIN_ROLE_CODE]
        : ORGANIZATION_ROLE_CODES;

      for (const roleCode of roleCodes) {
        const definition = ROLE_CATALOG[roleCode];
        const inserted = await client.query(
          `INSERT INTO roles (organization_id, code, name, description, is_system)
           VALUES ($1, $2, $3, $4, true)
           ON CONFLICT (organization_id, code) DO UPDATE
             SET name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 is_system = true
           RETURNING id`,
          [
            organization.id,
            definition.code,
            definition.name,
            definition.description,
          ]
        );
        roleRows.push({
          id: inserted.rows[0].id as string,
          organizationId: organization.id,
          code: definition.code,
        });
      }
    }

    // 4) Sync each seeded role's permission grants to the matrix.
    for (const role of roleRows) {
      const grantCodes = ROLE_PERMISSION_MATRIX[role.code as RoleCode] ?? [];
      await client.query(
        `DELETE FROM role_permissions WHERE role_id = $1`,
        [role.id]
      );
      for (const code of grantCodes) {
        const permissionId = permissionIdByCode.get(code);
        if (!permissionId) {
          throw new Error(
            `Permission "${code}" was not found after catalog upsert.`
          );
        }
        await client.query(
          `INSERT INTO role_permissions (role_id, permission_id)
           VALUES ($1, $2)`,
          [role.id, permissionId]
        );
      }
    }

    await client.query("COMMIT");

    const permissionCount = permissionIdByCode.size;
    const organizationCount = organizations.length;
    const roleCount = roleRows.length;
    console.log("RBAC seed complete.");
    console.log(`  permissions: ${permissionCount}`);
    console.log(`  organizations: ${organizationCount} (incl. reserved SYSTEM)`);
    console.log(`  seeded roles: ${roleCount}`);
    console.log(
      "Next: create a user in the SYSTEM org and grant SUPERADMIN for full access, or assign organization roles to your tenant users."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

main()
  .catch((error) => {
    console.error("RBAC seed failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

