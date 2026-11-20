/**
 * Centralized permission catalog (RBAC, Phase 4).
 *
 * This module is the single source of truth for permission identifiers in the
 * application. Rules:
 * - Permission strings are written in exactly one place: the `PERMISSIONS`
 *   record below.
 * - Features import `PERMISSIONS.X` / `PERMISSION_CATALOG` — never hardcode a
 *   code elsewhere.
 * - This module is intentionally free of `server-only`: it is pure, inert data
 *   that client components may import for display (e.g. permission checkboxes).
 *   Authorization is NEVER decided from these constants on the client; the
 *   server (`lib/auth/rbac.ts`) is the only enforcement point.
 *
 * Naming contract: `resource.action` (e.g. `users.view`, `attendance.approve`).
 * `module` groups permissions by feature area (the `permissions.module` column).
 */

/** Application modules that own permissions. */
export const PERMISSION_MODULES = {
  DASHBOARD: "dashboard",
  PROFILE: "profile",
  USERS: "users",
  ROLES: "roles",
  PERMISSIONS: "permissions",
  EMPLOYEES: "employees",
  ATTENDANCE: "attendance",
  LEAVE: "leave",
  PERMISSION: "permission",
  PAYROLL: "payroll",
  PAYSLIP: "payslip",
  PROJECTS: "projects",
  REPORTS: "reports",
  SETTINGS: "settings",
  WORK_LOCATIONS: "work_locations",
  AUDIT: "audit",
  ANNOUNCEMENTS: "announcements",
  ORGANIZATIONS: "organizations",
} as const;

export type PermissionModule =
  (typeof PERMISSION_MODULES)[keyof typeof PERMISSION_MODULES];

/**
 * Every application capability. The Phase 4 catalog is RBAC-only: the
 * Employee/Attendance/Leave/Payroll/etc. modules land in later phases and will
 * check these same identifiers.
 */
export const PERMISSIONS = {
  DASHBOARD_VIEW: "dashboard.view",
  PROFILE_VIEW: "profile.view",
  PROFILE_UPDATE: "profile.update",
  USERS_VIEW: "users.view",
  USERS_CREATE: "users.create",
  USERS_UPDATE: "users.update",
  USERS_DELETE: "users.delete",
  USERS_PASSWORD_RESET: "users.password.reset",
  ROLES_VIEW: "roles.view",
  ROLES_CREATE: "roles.create",
  ROLES_UPDATE: "roles.update",
  ROLES_DELETE: "roles.delete",
  PERMISSIONS_VIEW: "permissions.view",
  PERMISSIONS_MANAGE: "permissions.manage",
  EMPLOYEES_VIEW: "employees.view",
  EMPLOYEES_CREATE: "employees.create",
  EMPLOYEES_UPDATE: "employees.update",
  EMPLOYEES_DELETE: "employees.delete",
  EMPLOYEES_PERMANENT_DELETE: "employees.permanent_delete",
  EMPLOYEES_LEGAL_HOLD: "employees.legal_hold",
  EMPLOYEES_DELETION_APPROVE: "employees.deletion_approve",
  EMPLOYEES_TEST_DATA_PURGE: "employees.test_data_purge",
  EMPLOYEES_IMPORT: "employees.import",
  EMPLOYEES_EXPORT: "employees.export",
  EMPLOYEES_PERSONAL_VIEW: "employees.personal.view",
  EMPLOYEES_PERSONAL_UPDATE: "employees.personal.update",
  EMPLOYEES_EMPLOYMENT_VIEW: "employees.employment.view",
  EMPLOYEES_EMPLOYMENT_UPDATE: "employees.employment.update",
  EMPLOYEES_ADDRESS_VIEW: "employees.address.view",
  EMPLOYEES_ADDRESS_UPDATE: "employees.address.update",
  EMPLOYEES_INSURANCE_VIEW: "employees.insurance.view",
  EMPLOYEES_INSURANCE_UPDATE: "employees.insurance.update",
  EMPLOYEES_BANK_VIEW: "employees.bank.view",
  EMPLOYEES_BANK_UPDATE: "employees.bank.update",
  EMPLOYEES_FAMILY_VIEW: "employees.family.view",
  EMPLOYEES_FAMILY_UPDATE: "employees.family.update",
  EMPLOYEES_EDUCATION_VIEW: "employees.education.view",
  EMPLOYEES_EDUCATION_UPDATE: "employees.education.update",
  EMPLOYEES_DOCUMENT_VIEW: "employees.document.view",
  EMPLOYEES_DOCUMENT_UPLOAD: "employees.document.upload",
  EMPLOYEES_DOCUMENT_DELETE: "employees.document.delete",
  EMPLOYEE_FIELDS_VIEW: "employee_fields.view",
  EMPLOYEE_FIELDS_CREATE: "employee_fields.create",
  EMPLOYEE_FIELDS_UPDATE: "employee_fields.update",
  EMPLOYEE_FIELDS_DELETE: "employee_fields.delete",
  EMPLOYEE_CUSTOM_DATA_VIEW: "employee_custom_data.view",
  EMPLOYEE_CUSTOM_DATA_CREATE: "employee_custom_data.create",
  EMPLOYEE_CUSTOM_DATA_UPDATE: "employee_custom_data.update",
  EMPLOYEE_CUSTOM_DATA_DELETE: "employee_custom_data.delete",
  ATTENDANCE_VIEW: "attendance.view",
  ATTENDANCE_MANAGE: "attendance.manage",
  ATTENDANCE_APPROVE: "attendance.approve",
  ATTENDANCE_CHECK_IN: "attendance.check_in",
  ATTENDANCE_CHECK_OUT: "attendance.check_out",
  ANNOUNCEMENTS_VIEW: "announcements.view",
  ANNOUNCEMENTS_CREATE: "announcements.create",
  ANNOUNCEMENTS_UPDATE: "announcements.update",
  ANNOUNCEMENTS_DELETE: "announcements.delete",
  ANNOUNCEMENTS_PUBLISH: "announcements.publish",
  ORGANIZATIONS_VIEW: "organizations.view",
  ORGANIZATIONS_CREATE: "organizations.create",
  ORGANIZATIONS_UPDATE: "organizations.update",
  ORGANIZATIONS_DELETE: "organizations.delete",
  LEAVE_VIEW: "leave.view",
  LEAVE_CREATE: "leave.create",
  LEAVE_MANAGE: "leave.manage",
  LEAVE_APPROVE: "leave.approve",
  PERMISSION_VIEW: "permission.view",
  PERMISSION_CREATE: "permission.create",
  PERMISSION_APPROVE: "permission.approve",
  PERMISSION_MANAGE: "permission.manage",
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_CREATE: "payroll.create",
  PAYROLL_CALCULATE: "payroll.calculate",
  PAYROLL_UPDATE: "payroll.update",
  PAYROLL_PERIOD_VIEW: "payroll.period.view",
  PAYROLL_PERIOD_CREATE: "payroll.period.create",
  PAYROLL_PERIOD_UPDATE: "payroll.period.update",
  PAYROLL_PERIOD_DELETE: "payroll.period.delete",
  PAYROLL_APPROVE: "payroll.approve",
  PAYROLL_LOCK: "payroll.lock",
  PAYROLL_MANAGE: "payroll.manage",
  PAYSLIP_VIEW: "payslip.view",
  PAYSLIP_PUBLISH: "payslip.publish",
  PAYSLIP_MANAGE: "payslip.manage",
  PROJECTS_VIEW: "projects.view",
  PROJECTS_MANAGE: "projects.manage",
  REPORTS_VIEW: "reports.view",
  SETTINGS_VIEW: "settings.view",
  SETTINGS_MANAGE: "settings.manage",
  AUDIT_VIEW: "audit.view",
  WORK_LOCATIONS_VIEW: "work_locations.view",
  WORK_LOCATIONS_MANAGE: "work_locations.manage",
} as const;

export type Permission =
  (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Readable catalog row used by the admin UI and the seed. */
export interface PermissionDefinition {
  code: Permission;
  module: PermissionModule;
  description: string;
}

export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  // Dashboard
  {
    code: PERMISSIONS.DASHBOARD_VIEW,
    module: PERMISSION_MODULES.DASHBOARD,
    description: "Melihat dasbor HRIS.",
  },
  // Profile (own record)
  {
    code: PERMISSIONS.PROFILE_VIEW,
    module: PERMISSION_MODULES.PROFILE,
    description: "Melihat profil sendiri.",
  },
  {
    code: PERMISSIONS.PROFILE_UPDATE,
    module: PERMISSION_MODULES.PROFILE,
    description: "Memperbarui profil sendiri.",
  },
  // Users
  {
    code: PERMISSIONS.USERS_VIEW,
    module: PERMISSION_MODULES.USERS,
    description: "Melihat akun pengguna.",
  },
  {
    code: PERMISSIONS.USERS_CREATE,
    module: PERMISSION_MODULES.USERS,
    description: "Membuat akun pengguna.",
  },
  {
    code: PERMISSIONS.USERS_UPDATE,
    module: PERMISSION_MODULES.USERS,
    description: "Memperbarui akun pengguna.",
  },
  {
    code: PERMISSIONS.USERS_DELETE,
    module: PERMISSION_MODULES.USERS,
    description: "Menghapus akun pengguna.",
  },
  {
    code: PERMISSIONS.USERS_PASSWORD_RESET,
    module: PERMISSION_MODULES.USERS,
    description:
      "Reset kata sandi akun pengguna dan wajibkan penggantian kata sandi saat login berikutnya.",
  },
  // Roles
  {
    code: PERMISSIONS.ROLES_VIEW,
    module: PERMISSION_MODULES.ROLES,
    description: "Melihat peran dan hak aksesnya.",
  },
  {
    code: PERMISSIONS.ROLES_CREATE,
    module: PERMISSION_MODULES.ROLES,
    description: "Membuat peran kustom.",
  },
  {
    code: PERMISSIONS.ROLES_UPDATE,
    module: PERMISSION_MODULES.ROLES,
    description: "Mengubah peran dan menetapkan hak akses.",
  },
  {
    code: PERMISSIONS.ROLES_DELETE,
    module: PERMISSION_MODULES.ROLES,
    description: "Menghapus peran kustom.",
  },
  // Permissions (catalog)
  {
    code: PERMISSIONS.PERMISSIONS_VIEW,
    module: PERMISSION_MODULES.PERMISSIONS,
    description: "Melihat katalog hak akses.",
  },
  {
    code: PERMISSIONS.PERMISSIONS_MANAGE,
    module: PERMISSION_MODULES.PERMISSIONS,
    description: "Kelola katalog hak akses (tingkat sistem).",
  },
  // Employees
  {
    code: PERMISSIONS.EMPLOYEES_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat data karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_CREATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Membuat data karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui data karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Menghapus data karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_PERMANENT_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description:
      "Menghapus permanen data karyawan beserta data terkait yang dapat dihapus (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_LEGAL_HOLD,
    module: PERMISSION_MODULES.EMPLOYEES,
    description:
      "Memasang atau melepas penahanan hukum pada data karyawan (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DELETION_APPROVE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description:
      "Menyetujui atau menolak permintaan hapus permanen (khusus Super Administrator, bukan pemohon).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description:
      "Menghapus permanen data yang ditandai sebagai data TEST dari produksi (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_IMPORT,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Mengimpor karyawan dari Excel/CSV.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EXPORT,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Mengekspor karyawan ke Excel/CSV.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_PERSONAL_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat data pribadi karyawan (NIK, keluarga, pendidikan).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui data pribadi karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat data kepegawaian karyawan (jabatan, departemen, kontrak).",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui data kepegawaian karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_ADDRESS_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat alamat karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui alamat karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_INSURANCE_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat nomor asuransi dan pajak karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_INSURANCE_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui nomor asuransi dan pajak karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_BANK_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat rekening bank karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_BANK_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui rekening bank karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_FAMILY_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat keluarga/tanggungan karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_FAMILY_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui keluarga/tanggungan karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EDUCATION_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat riwayat pendidikan karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_EDUCATION_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui riwayat pendidikan karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat dokumen karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Mengunggah dokumen karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEES_DOCUMENT_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Menghapus dokumen karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat definisi field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_CREATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Membuat definisi field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui definisi field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_FIELDS_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Mengarsipkan/menghapus definisi field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Melihat nilai field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_CREATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Membuat nilai field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Memperbarui nilai field kustom karyawan.",
  },
  {
    code: PERMISSIONS.EMPLOYEE_CUSTOM_DATA_DELETE,
    module: PERMISSION_MODULES.EMPLOYEES,
    description: "Menghapus nilai field kustom karyawan.",
  },
  // Attendance
  {
    code: PERMISSIONS.ATTENDANCE_VIEW,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Melihat data absensi.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_MANAGE,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Mengelola data absensi.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_APPROVE,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Menyetujui entri absensi.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_CHECK_IN,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Melakukan absen masuk.",
  },
  {
    code: PERMISSIONS.ATTENDANCE_CHECK_OUT,
    module: PERMISSION_MODULES.ATTENDANCE,
    description: "Melakukan absen pulang.",
  },
  // Announcements (management publications / employee information center)
  {
    code: PERMISSIONS.ANNOUNCEMENTS_VIEW,
    module: PERMISSION_MODULES.ANNOUNCEMENTS,
    description: "Melihat pengumuman.",
  },
  {
    code: PERMISSIONS.ANNOUNCEMENTS_CREATE,
    module: PERMISSION_MODULES.ANNOUNCEMENTS,
    description: "Membuat pengumuman.",
  },
  {
    code: PERMISSIONS.ANNOUNCEMENTS_UPDATE,
    module: PERMISSION_MODULES.ANNOUNCEMENTS,
    description: "Memperbarui pengumuman.",
  },
  {
    code: PERMISSIONS.ANNOUNCEMENTS_DELETE,
    module: PERMISSION_MODULES.ANNOUNCEMENTS,
    description: "Menghapus pengumuman.",
  },
  {
    code: PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
    module: PERMISSION_MODULES.ANNOUNCEMENTS,
    description: "Menerbitkan dan menarik pengumuman.",
  },
  // Leave
  {
    code: PERMISSIONS.LEAVE_VIEW,
    module: PERMISSION_MODULES.LEAVE,
    description: "Melihat data cuti.",
  },
  {
    code: PERMISSIONS.LEAVE_CREATE,
    module: PERMISSION_MODULES.LEAVE,
    description: "Mengajukan cuti.",
  },
  {
    code: PERMISSIONS.LEAVE_MANAGE,
    module: PERMISSION_MODULES.LEAVE,
    description: "Mengelola data dan saldo cuti.",
  },
  {
    code: PERMISSIONS.LEAVE_APPROVE,
    module: PERMISSION_MODULES.LEAVE,
    description: "Menyetujui pengajuan cuti.",
  },
  // Permission requests (time-based absences, not the permission catalog)
  {
    code: PERMISSIONS.PERMISSION_VIEW,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Melihat pengajuan izin (ketidakhadiran).",
  },
  {
    code: PERMISSIONS.PERMISSION_CREATE,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Mengajukan izin (ketidakhadiran).",
  },
  {
    code: PERMISSIONS.PERMISSION_APPROVE,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Menyetujui pengajuan izin (ketidakhadiran).",
  },
  {
    code: PERMISSIONS.PERMISSION_MANAGE,
    module: PERMISSION_MODULES.PERMISSION,
    description: "Kelola pengajuan izin (ketidakhadiran).",
  },
  // Payroll
  {
    code: PERMISSIONS.PAYROLL_VIEW,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Melihat proses payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_PERIOD_VIEW,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Melihat periode payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_PERIOD_CREATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Membuat periode payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_PERIOD_UPDATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Memperbarui periode payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_PERIOD_DELETE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Menghapus periode payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_CREATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Membuat periode payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_CALCULATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Menghitung payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_UPDATE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Memperbarui periode dan proses payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_APPROVE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Menyetujui payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_LOCK,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Kunci dan finalisasi payroll.",
  },
  {
    code: PERMISSIONS.PAYROLL_MANAGE,
    module: PERMISSION_MODULES.PAYROLL,
    description: "Kelola periode dan proses payroll.",
  },
  // Payslip
  {
    code: PERMISSIONS.PAYSLIP_VIEW,
    module: PERMISSION_MODULES.PAYSLIP,
    description: "Melihat slip gaji.",
  },
  {
    code: PERMISSIONS.PAYSLIP_PUBLISH,
    module: PERMISSION_MODULES.PAYSLIP,
    description: "Menerbitkan slip gaji ke karyawan.",
  },
  {
    code: PERMISSIONS.PAYSLIP_MANAGE,
    module: PERMISSION_MODULES.PAYSLIP,
    description: "Kelola penerbitan slip gaji.",
  },
  // Projects (menu is SUPERADMIN-only; every projects page and server action
  // re-checks the system-level SUPERADMIN role server-side, so these codes are
  // catalog/audit expressibility only — a tenant role holding them still
  // cannot access the Projects CRUD surface).
  {
    code: PERMISSIONS.PROJECTS_VIEW,
    module: PERMISSION_MODULES.PROJECTS,
    description: "Melihat proyek (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.PROJECTS_MANAGE,
    module: PERMISSION_MODULES.PROJECTS,
    description: "Administer projects (Super Administrator only).",
  },
  // Reports
  {
    code: PERMISSIONS.REPORTS_VIEW,
    module: PERMISSION_MODULES.REPORTS,
    description: "Melihat laporan dan dasbor.",
  },
  // Settings
  {
    code: PERMISSIONS.SETTINGS_VIEW,
    module: PERMISSION_MODULES.SETTINGS,
    description: "Melihat pengaturan aplikasi.",
  },
  {
    code: PERMISSIONS.SETTINGS_MANAGE,
    module: PERMISSION_MODULES.SETTINGS,
    description: "Kelola pengaturan aplikasi.",
  },
  // Work Locations
  {
    code: PERMISSIONS.WORK_LOCATIONS_VIEW,
    module: PERMISSION_MODULES.WORK_LOCATIONS,
    description: "Melihat lokasi kerja organisasi.",
  },
  {
    code: PERMISSIONS.WORK_LOCATIONS_MANAGE,
    module: PERMISSION_MODULES.WORK_LOCATIONS,
    description: "Kelola lokasi kerja organisasi.",
  },

  // Audit
  {
    code: PERMISSIONS.AUDIT_VIEW,
    module: PERMISSION_MODULES.AUDIT,
    description: "Melihat log audit.",
  },
  // Organizations (SUPERADMIN-only tenant administration, R19).
  // These codes exist so the capability is expressible in the catalog and
  // auditable in the permission matrix; the seed grants them to SUPERADMIN
  // exclusively. Every organizations action additionally re-checks the
  // system-level SUPERADMIN role server-side, so a tenant that somehow
  // receives one of these codes still cannot manage organizations.
  {
    code: PERMISSIONS.ORGANIZATIONS_VIEW,
    module: PERMISSION_MODULES.ORGANIZATIONS,
    description: "Melihat organisasi tenant (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.ORGANIZATIONS_CREATE,
    module: PERMISSION_MODULES.ORGANIZATIONS,
    description: "Membuat organisasi tenant (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.ORGANIZATIONS_UPDATE,
    module: PERMISSION_MODULES.ORGANIZATIONS,
    description: "Memperbarui organisasi tenant (khusus Super Administrator).",
  },
  {
    code: PERMISSIONS.ORGANIZATIONS_DELETE,
    module: PERMISSION_MODULES.ORGANIZATIONS,
    description: "Menghapus organisasi tenant (khusus Super Administrator).",
  },
];

/** All catalog codes, in display order. */
export const ALL_PERMISSION_CODES: readonly Permission[] =
  PERMISSION_CATALOG.map((definition) => definition.code);

/**
 * Permissions that only a SUPERADMIN may ever hold.
 *
 * These gate system-level capabilities that no tenant role must be able to
 * reach, directly or by delegation. `employees.permanent_delete` is one: a
 * tenant administrator holding `roles.update` must not be able to grant the
 * ability to destroy employee records to their own role, and even if such a
 * grant were written, the server action re-checks the SUPERADMIN flag.
 *
 * Used by the RBAC seed (refuses to write these into an organization role) and
 * by the role editor (never offers them for a non-SUPERADMIN role).
 */
export const SYSTEM_ONLY_PERMISSION_CODES: readonly Permission[] = [
  PERMISSIONS.EMPLOYEES_PERMANENT_DELETE,
  PERMISSIONS.EMPLOYEES_LEGAL_HOLD,
  PERMISSIONS.EMPLOYEES_DELETION_APPROVE,
  PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE,
];

/** Whether a permission may only be held by a SUPERADMIN. */
export function isSystemOnlyPermission(code: Permission): boolean {
  return SYSTEM_ONLY_PERMISSION_CODES.includes(code);
}

/** Ordered module labels for grouped displays. */
export const PERMISSION_MODULE_LABELS: Record<PermissionModule, string> = {
  dashboard: "Dashboard",
  profile: "Profile",
  users: "Users",
  roles: "Roles",
  permissions: "Permissions",
  employees: "Employees",
  attendance: "Attendance",
  leave: "Leave",
  permission: "Permission Requests",
  payroll: "Payroll",
  payslip: "Payslips",
  projects: "Projects",
  reports: "Reports",
  settings: "Settings",
  work_locations: "Work Locations",
  audit: "Audit",
  announcements: "Announcements",
  organizations: "Organizations",
};

/** Split a `resource.action` code into its resource and action parts. */
export function splitPermissionCode(code: Permission): {
  resource: string;
  action: string;
} {
  const separatorIndex = code.indexOf(".");
  if (separatorIndex === -1) {
    return { resource: code, action: "" };
  }
  return {
    resource: code.slice(0, separatorIndex),
    action: code.slice(separatorIndex + 1),
  };
}