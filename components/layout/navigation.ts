import { PERMISSIONS } from "@/lib/auth/permissions";
import type { NavItem, NavSection } from "@/types/navigation";

/**
 * Application shell navigation (HRIS Lite Enterprise v2.0).
 *
 * Items are pure data (safe for client imports). Items with a `permission`
 * are filtered server-side by `getAuthorizedSections` before being rendered,
 * so the client never decides what to show based on stored roles. Groups
 * (`children`) collapse in the sidebar; a group the user can only see one
 * child of is flattened into that child.
 */
export const primaryNavigation: NavItem[] = [
  { title: "Beranda", href: "/dashboard", icon: "home" },
  {
    title: "Notifikasi",
    href: "/notifications",
    icon: "bell",
    badge: "notifications",
  },
  {
    title: "Persetujuan",
    href: "/approvals",
    anyPermission: [
      PERMISSIONS.LEAVE_APPROVE,
      PERMISSIONS.LEAVE_MANAGE,
      PERMISSIONS.PERMISSION_APPROVE,
      PERMISSIONS.PERMISSION_MANAGE,
      PERMISSIONS.ATTENDANCE_APPROVE,
      PERMISSIONS.ATTENDANCE_MANAGE,
      PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE,
    ],
    icon: "shield",
  },
  {
    title: "Karyawan",
    href: "/employees",
    permission: PERMISSIONS.EMPLOYEES_VIEW,
    icon: "user",
  },
  {
    title: "Absensi",
    href: "#absensi",
    icon: "calendar-check",
    children: [
      {
        title: "Absensi Saya",
        href: "/attendance",
        permission: PERMISSIONS.ATTENDANCE_VIEW,
        icon: "calendar-check",
      },
      { title: "Face ID", href: "/face-id", icon: "face" },
      {
        title: "Kelola Absensi",
        href: "/attendance/management",
        permission: PERMISSIONS.ATTENDANCE_MANAGE,
        icon: "attendance",
      },
      {
        title: "Rekap Absensi",
        href: "/attendance/recap",
        permission: PERMISSIONS.ATTENDANCE_MANAGE,
        icon: "bar-chart",
      },
      {
        title: "Lembur Saya",
        href: "/overtime",
        permission: PERMISSIONS.ATTENDANCE_VIEW,
        icon: "clock",
      },
      {
        title: "Kelola Lembur",
        href: "/overtime/management",
        anyPermission: [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE],
        icon: "clock",
      },
      {
        title: "Timesheet Saya",
        href: "/timesheet",
        permission: PERMISSIONS.ATTENDANCE_VIEW,
        icon: "clipboard",
      },
      {
        title: "Kelola Timesheet",
        href: "/timesheet/management",
        anyPermission: [PERMISSIONS.ATTENDANCE_APPROVE, PERMISSIONS.ATTENDANCE_MANAGE],
        icon: "clipboard",
      },
      {
        title: "Kalender Libur",
        href: "/time/calendar",
        permission: PERMISSIONS.ATTENDANCE_VIEW,
        icon: "calendar",
      },
      {
        title: "Shift & Grup Kerja",
        href: "/time/shifts",
        permission: PERMISSIONS.ATTENDANCE_MANAGE,
        icon: "users-cog",
      },
      {
        title: "Kepatuhan Jadwal",
        href: "/time/schedule-report",
        permission: PERMISSIONS.ATTENDANCE_MANAGE,
        icon: "bar-chart",
      },
    ],
  },
  {
    title: "Cuti & Izin",
    href: "#cuti-izin",
    icon: "plane",
    children: [
      {
        title: "Pengajuan Cuti",
        href: "/leave",
        permission: PERMISSIONS.LEAVE_VIEW,
        icon: "plane",
      },
      {
        title: "Izin Kegiatan",
        href: "/permission",
        permission: PERMISSIONS.PERMISSION_VIEW,
        icon: "clipboard",
      },
      {
        title: "Persetujuan Cuti",
        href: "/leave/management",
        anyPermission: [PERMISSIONS.LEAVE_APPROVE, PERMISSIONS.LEAVE_MANAGE],
        icon: "plane",
      },
      {
        title: "Persetujuan Izin",
        href: "/permission/management",
        anyPermission: [
          PERMISSIONS.PERMISSION_APPROVE,
          PERMISSIONS.PERMISSION_MANAGE,
        ],
        icon: "clipboard",
      },
      {
        title: "Jenis & Saldo Cuti",
        href: "/leave/types",
        permission: PERMISSIONS.LEAVE_MANAGE,
        icon: "plane",
      },
    ],
  },
  {
    title: "Penggajian",
    href: "#penggajian",
    icon: "wallet",
    children: [
      {
        title: "Periode Payroll",
        href: "/payroll",
        permission: PERMISSIONS.PAYROLL_VIEW,
        icon: "wallet",
      },
      {
        title: "Komponen Gaji",
        href: "/payroll/components",
        permission: PERMISSIONS.PAYROLL_MANAGE,
        icon: "wallet",
      },
      {
        title: "Kelola Slip Gaji",
        href: "/payroll/payslips",
        permission: PERMISSIONS.PAYROLL_VIEW,
        anyPermission: [
          PERMISSIONS.PAYSLIP_PUBLISH,
          PERMISSIONS.PAYSLIP_MANAGE,
          PERMISSIONS.PAYROLL_MANAGE,
        ],
        icon: "payslip",
      },
      {
        title: "Slip Gaji Saya",
        href: "/payslip",
        permission: PERMISSIONS.PAYSLIP_VIEW,
        icon: "payslip",
      },
    ],
  },
  { title: "Pengumuman", href: "/announcements", icon: "megaphone" },
  // Company agenda: everyone sees the events they are invited to.
  { title: "Agenda", href: "/agenda", icon: "calendar" },
  // Every signed-in user may ask HR; the page needs a linked employee.
  { title: "Tanya Admin", href: "/helpdesk", icon: "help" },
];

export const managementNavigation: NavItem[] = [
  {
    title: "Organisasi",
    href: "/settings/organizations",
    icon: "network",
    // SUPERADMIN-only (R19): decided by the system-level role, not by the
    // organizations.* permission codes seeded to the Super Administrator.
    superadminOnly: true,
  },
  {
    title: "Proyek",
    href: "/projects",
    icon: "layers",
    // SUPERADMIN-only: the page and every project server action re-verify
    // requireSuperAdmin.
    superadminOnly: true,
  },
  {
    title: "Struktur Organisasi",
    href: "/organization/chart",
    permission: PERMISSIONS.EMPLOYEES_VIEW,
    icon: "network",
  },
  {
    title: "Master Organisasi",
    href: "/organization/master",
    permission: PERMISSIONS.EMPLOYEES_VIEW,
    icon: "layers",
  },
  {
    title: "Perubahan Data Karyawan",
    href: "/profile-changes",
    permission: PERMISSIONS.EMPLOYEES_PERSONAL_VIEW,
    anyPermission: [PERMISSIONS.EMPLOYEES_VIEW],
    icon: "edit",
  },
  {
    title: "Kelola Tiket Helpdesk",
    href: "/helpdesk/management",
    permission: PERMISSIONS.EMPLOYEES_UPDATE,
    anyPermission: [PERMISSIONS.EMPLOYEES_VIEW],
    icon: "help",
  },
  {
    title: "Surat & PKWT",
    href: "/documents",
    permission: PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW,
    anyPermission: [PERMISSIONS.EMPLOYEES_VIEW],
    icon: "document",
  },
  {
    title: "Kelola Pengumuman",
    href: "/announcements/management",
    permission: PERMISSIONS.ANNOUNCEMENTS_VIEW,
    icon: "megaphone",
  },
];

/** Compliance monitoring and reports (read-only views over existing data). */
export const monitoringNavigation: NavItem[] = [
  {
    title: "Monitoring Kontrak",
    href: "/monitoring/contracts",
    // Both are required by the page (employee list + Employment data).
    permission: PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW,
    anyPermission: [PERMISSIONS.EMPLOYEES_VIEW],
    icon: "document",
  },
  {
    title: "Medical Check Up",
    href: "/compliance/mcu",
    // Health data is personal data: same rule as the profile's Personal tab.
    permission: PERMISSIONS.EMPLOYEES_PERSONAL_VIEW,
    anyPermission: [PERMISSIONS.EMPLOYEES_VIEW],
    icon: "shield",
  },
  {
    title: "Training",
    href: "/compliance/trainings",
    permission: PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW,
    anyPermission: [PERMISSIONS.EMPLOYEES_VIEW],
    icon: "trend-up",
  },
  {
    title: "Laporan",
    href: "#laporan",
    icon: "bar-chart",
    children: [
      {
        title: "Laporan Karyawan",
        href: "/reports/employees",
        permission: PERMISSIONS.REPORTS_VIEW,
        icon: "trend-up",
      },
      {
        title: "Laporan Cuti",
        href: "/reports/leave",
        permission: PERMISSIONS.REPORTS_VIEW,
        icon: "plane",
      },
    ],
  },
];

export const settingsNavigation: NavItem[] = [
  {
    title: "Pengaturan",
    href: "#pengaturan",
    icon: "settings",
    children: [
      {
        title: "Lokasi Kerja",
        href: "/settings/work-locations",
        permission: PERMISSIONS.WORK_LOCATIONS_VIEW,
        icon: "map-pin",
      },
      {
        title: "Field Karyawan",
        href: "/settings/employee-fields",
        permission: PERMISSIONS.EMPLOYEE_FIELDS_VIEW,
        icon: "employee-fields",
      },
      {
        title: "Data Uji",
        href: "/settings/test-data",
        icon: "test-data",
        // SUPERADMIN-only, alongside Organizations: the purge needs
        // `employees.test_data_purge` AND the system-level SUPERADMIN role.
        superadminOnly: true,
      },
      { title: "Akun Saya", href: "/settings/account", icon: "profile" },
    ],
  },
  {
    title: "Pengguna & Role",
    href: "#pengguna-role",
    icon: "users-cog",
    children: [
      {
        title: "Pengguna",
        href: "/settings/users",
        permission: PERMISSIONS.USERS_VIEW,
        icon: "users",
      },
      {
        title: "Role",
        href: "/settings/roles",
        permission: PERMISSIONS.ROLES_VIEW,
        icon: "roles",
      },
      {
        title: "Hak Akses",
        href: "/settings/permissions",
        permission: PERMISSIONS.PERMISSIONS_VIEW,
        icon: "permissions",
      },
      {
        title: "Audit Trail",
        href: "/settings/audit-trail",
        permission: PERMISSIONS.AUDIT_VIEW,
        icon: "history",
      },
    ],
  },
];

/**
 * All navigation sections in display order.
 *
 * Sections are purely descriptive; `getAuthorizedSections` filters items by
 * permission server-side before they reach the shell. Empty sections drop
 * out automatically, so an employee's drawer never shows management
 * modules and an admin always keeps full access to the authorized set.
 */
export const navigationSections: NavSection[] = [
  { title: "Menu Utama", items: primaryNavigation },
  { title: "Manajemen", items: managementNavigation },
  { title: "Monitoring & Laporan", items: monitoringNavigation },
  { title: "Pengaturan", items: settingsNavigation },
];

/** Every concrete (linkable) href in the given sections, groups flattened. */
export function flattenNavHrefs(sections: NavSection[]): string[] {
  const out: string[] = [];
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      if (item.children) walk(item.children);
      else out.push(item.href);
    }
  };
  for (const section of sections) walk(section.items);
  return out;
}

/**
 * The single href that should render as active for `pathname`: the longest
 * authorized href that equals the path or is a parent segment of it. Keeps
 * "/announcements" inactive while "/announcements/management" is open.
 */
export function resolveActiveHref(
  pathname: string,
  hrefs: string[]
): string | null {
  let best: string | null = null;
  for (const href of hrefs) {
    const match =
      href === "/dashboard"
        ? pathname === "/dashboard" || pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`);
    if (match && (!best || href.length > best.length)) best = href;
  }
  return best;
}

/** Where the current page sits in the navigation (band breadcrumb). */
export interface NavTrail {
  /** Section heading ("Manajemen"); absent for untitled sections. */
  section?: string;
  /** Collapsible group the page belongs to ("Penggajian"). */
  group?: NavItem;
  /** The matched navigation item. */
  item: NavItem;
  /** True when the path is below the item (a detail / edit page). */
  nested: boolean;
}

/** Resolve the breadcrumb trail for `pathname` within the authorized sections. */
export function resolveNavTrail(
  pathname: string,
  sections: NavSection[]
): NavTrail | null {
  const activeHref = resolveActiveHref(pathname, flattenNavHrefs(sections));
  if (!activeHref) return null;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.children) {
        const child = item.children.find((c) => c.href === activeHref);
        if (child) {
          return {
            section: section.title,
            group: item,
            item: child,
            nested: pathname !== activeHref,
          };
        }
      } else if (item.href === activeHref) {
        return { section: section.title, item, nested: pathname !== activeHref };
      }
    }
  }
  return null;
}
