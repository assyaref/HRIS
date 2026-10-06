/**
 * R18 — Management Announcements / Employee Information Center.
 *
 * Exercises the PURE announcement modules with `node --test`:
 * constants, zod validation, lifecycle policy, audience visibility, RBAC
 * grants/resolver, attachment classification, and static wiring checks on
 * the seed/navigation/audit integration points. No database, no browser,
 * no network.
 *
 * Spec cases 1-16 are numbered in `describe` titles.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  ANNOUNCEMENT_ATTACHMENT_MAX_SIZE_BYTES,
  ANNOUNCEMENT_CONTENT_MAX_LENGTH,
  ANNOUNCEMENT_MAX_ATTACHMENTS,
  ANNOUNCEMENT_PRIORITIES,
  ANNOUNCEMENT_PRIORITY_LABELS,
  ANNOUNCEMENT_STATUSES,
  ANNOUNCEMENT_STATUS_LABELS,
  ANNOUNCEMENT_TARGET_LABELS,
  ANNOUNCEMENT_TARGET_TYPES,
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  isAnnouncementPriority,
  isAnnouncementStatus,
  isAnnouncementTargetType,
} from "../../features/announcements/constants.ts";
import {
  buildAnnouncementActionDecision,
  buildAnnouncementDeletionDecision,
  buildAnnouncementVisibility,
  canTransitionAnnouncementStatus,
} from "../../features/announcements/policy.ts";
import {
  ANNOUNCEMENT_ROLE_GRANTS,
  resolveAnnouncementPermissions,
} from "../../features/announcements/permissions.ts";
import {
  createAnnouncementSchema,
  extractCreateAnnouncementFormData,
  extractUpdateAnnouncementFormData,
  updateAnnouncementSchema,
} from "../../features/announcements/validation.ts";
import {
  classifyAttachment,
  extractExtension,
  sanitizeOriginalFilename,
} from "../../features/announcements/attachment-metadata.ts";
import { PERMISSION_CATALOG, PERMISSIONS } from "../../lib/auth/permissions.ts";
import { ROLE_CODES } from "../../lib/auth/roles.ts";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const FULL_GRANT = {
  canView: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canPublish: true,
};

const validCreate = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  title: "Office closure",
  content: "The office will close on Friday for maintenance.",
  priority: "normal",
  pinned: "on",
  scheduledAt: "",
  expiresAt: "",
  targetType: "all_employees",
  employeeIds: [],
  ...overrides,
});

describe("R18 case 1: status/priority/target constants form closed contracts", () => {
  it("exposes exactly the documented lifecycle values", () => {
    assert.deepEqual([...ANNOUNCEMENT_STATUSES], [
      "draft",
      "published",
      "unpublished",
    ]);
    assert.deepEqual([...ANNOUNCEMENT_PRIORITIES], [
      "normal",
      "important",
      "urgent",
    ]);
    assert.deepEqual([...ANNOUNCEMENT_TARGET_TYPES], [
      "all_employees",
      "selected_employees",
    ]);
  });

  it("label maps and type guards agree with the contracts", () => {
    for (const status of ANNOUNCEMENT_STATUSES) {
      assert.equal(isAnnouncementStatus(status), true);
      assert.equal(typeof ANNOUNCEMENT_STATUS_LABELS[status], "string");
    }
    for (const priority of ANNOUNCEMENT_PRIORITIES) {
      assert.equal(isAnnouncementPriority(priority), true);
      assert.equal(typeof ANNOUNCEMENT_PRIORITY_LABELS[priority], "string");
    }
    for (const target of ANNOUNCEMENT_TARGET_TYPES) {
      assert.equal(isAnnouncementTargetType(target), true);
      assert.equal(typeof ANNOUNCEMENT_TARGET_LABELS[target], "string");
    }
    assert.equal(isAnnouncementStatus("archived"), false);
    assert.equal(isAnnouncementPriority("critical"), false);
    assert.equal(isAnnouncementTargetType("departments"), false);
  });
});

describe("R18 case 2: content and attachment limits", () => {
  it("pins the agreed caps", () => {
    assert.equal(ANNOUNCEMENT_TITLE_MAX_LENGTH, 200);
    assert.equal(ANNOUNCEMENT_CONTENT_MAX_LENGTH, 10_000);
    assert.equal(ANNOUNCEMENT_MAX_ATTACHMENTS, 3);
    assert.equal(ANNOUNCEMENT_ATTACHMENT_MAX_SIZE_BYTES, 10 * 1024 * 1024);
  });
});

describe("R18 case 3: create validation — required fields", () => {
  it("rejects empty or whitespace-only title/content", () => {
    assert.equal(
      createAnnouncementSchema.safeParse(validCreate({ title: "  " })).success,
      false
    );
    assert.equal(
      createAnnouncementSchema.safeParse(validCreate({ content: "" })).success,
      false
    );
    assert.equal(createAnnouncementSchema.safeParse(validCreate()).success, true);
  });

  it("rejects oversized title and content", () => {
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({ title: "x".repeat(ANNOUNCEMENT_TITLE_MAX_LENGTH + 1) })
      ).success,
      false
    );
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({ content: "y".repeat(ANNOUNCEMENT_CONTENT_MAX_LENGTH + 1) })
      ).success,
      false
    );
  });
});

describe("R18 case 4: create validation — plain text only", () => {
  it("rejects HTML markup in title and content", () => {
    const titleResult = createAnnouncementSchema.safeParse(
      validCreate({ title: "<script>alert(1)</script>" })
    );
    assert.equal(titleResult.success, false);

    const contentResult = createAnnouncementSchema.safeParse(
      validCreate({ content: "<b>bold</b> announcement" })
    );
    assert.equal(contentResult.success, false);
  });
});

describe("R18 case 5: create validation — schedule/expiry ordering", () => {
  it("rejects scheduled times after the expiry time", () => {
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({
          scheduledAt: "2030-06-02T09:00",
          expiresAt: "2030-06-01T09:00",
        })
      ).success,
      false
    );
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({
          scheduledAt: "2030-06-01T09:00",
          expiresAt: "2030-06-02T09:00",
        })
      ).success,
      true
    );
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({ scheduledAt: "01/06/2030" })
      ).success,
      false
    );
  });

  it("normalizes empty datetimes to null and the checkbox to a boolean", () => {
    const parsed = createAnnouncementSchema.parse(
      validCreate({ scheduledAt: "", expiresAt: "", pinned: undefined })
    );
    assert.equal(parsed.scheduledAt, null);
    assert.equal(parsed.expiresAt, null);
    assert.equal(parsed.pinned, false);
    assert.equal(
      createAnnouncementSchema.parse(validCreate({ pinned: "on" })).pinned,
      true
    );
  });
});

describe("R18 case 6: create validation — audience rules", () => {
  it("requires at least one selected employee and valid uuids", () => {
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({ targetType: "selected_employees", employeeIds: [] })
      ).success,
      false
    );
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({
          targetType: "selected_employees",
          employeeIds: ["not-a-uuid"],
        })
      ).success,
      false
    );
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({
          targetType: "selected_employees",
          employeeIds: [UUID_A, UUID_B],
        })
      ).success,
      true
    );
    assert.equal(
      createAnnouncementSchema.safeParse(
        validCreate({ targetType: "departments", employeeIds: [UUID_A] })
      ).success,
      false
    );
  });
});

describe("R18 case 7: update validation — audience is immutable", () => {
  it("accepts content edits and rejects target fields / bad ordering", () => {
    const parsed = updateAnnouncementSchema.safeParse({
      title: "Corrected title",
      content: "Corrected content.",
      priority: "important",
      pinned: "on",
      scheduledAt: "",
      expiresAt: "",
    });
    assert.equal(parsed.success, true);
    assert.equal(
      updateAnnouncementSchema.safeParse({
        title: "x",
        content: "y",
        priority: "normal",
        pinned: false,
        scheduledAt: "2030-06-02T00:00",
        expiresAt: "2030-06-01T00:00",
      }).success,
      false
    );
  });

  it("FormData extractors keep multipart defaults sane", () => {
    const createForm = new FormData();
    createForm.set("title", " T ");
    const extractedCreate = extractCreateAnnouncementFormData(createForm);
    assert.equal(extractedCreate.title, " T ");
    assert.equal(extractedCreate.priority, "normal");
    assert.deepEqual(extractedCreate.employeeIds, []);

    const updateForm = new FormData();
    updateForm.set("title", "T");
    updateForm.set("content", "C");
    updateForm.set("pinned", "on");
    const extractedUpdate = extractUpdateAnnouncementFormData(updateForm);
    assert.equal(extractedUpdate.pinned, "on");
    assert.equal(extractedUpdate.scheduledAt, null);
  });
});

describe("R18 case 8: action policy — permission matrix", () => {
  it("gates every management action on its capability", () => {
    const denied = {
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canPublish: false,
    };
    assert.deepEqual(
      buildAnnouncementActionDecision({ action: "create", ...denied }),
      { allowed: false, reason: "permission.missing" }
    );
    assert.deepEqual(
      buildAnnouncementActionDecision({
        action: "read",
        status: "draft",
        ...denied,
      }),
      { allowed: false, reason: "permission.missing" }
    );
    assert.deepEqual(
      buildAnnouncementActionDecision({ action: "create", ...FULL_GRANT }),
      { allowed: true }
    );
    assert.deepEqual(
      buildAnnouncementActionDecision({
        action: "publish",
        status: "draft",
        ...FULL_GRANT,
        canPublish: false,
      }),
      { allowed: false, reason: "permission.missing" }
    );
  });

  it("locks published content for non-publish holders and locks audience always", () => {
    assert.deepEqual(
      buildAnnouncementActionDecision({
        action: "update",
        status: "published",
        canView: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canPublish: false,
      }),
      { allowed: false, reason: "requires.publish" }
    );
    assert.deepEqual(
      buildAnnouncementActionDecision({
        action: "update",
        status: "published",
        ...FULL_GRANT,
      }),
      { allowed: true }
    );
    for (const action of ["change_target", "add_attachment", "remove_attachment"] as const) {
      assert.deepEqual(
        buildAnnouncementActionDecision({
          action,
          status: "published",
          ...FULL_GRANT,
        }),
        { allowed: false, reason: "published.locked" }
      );
    }
  });

  it("publish/unpublish only via valid lifecycle moves", () => {
    assert.deepEqual(
      buildAnnouncementActionDecision({
        action: "unpublish",
        status: "draft",
        ...FULL_GRANT,
      }),
      { allowed: false, reason: "invalid.transition" }
    );
    assert.deepEqual(
      buildAnnouncementActionDecision({
        action: "unpublish",
        status: "published",
        ...FULL_GRANT,
      }),
      { allowed: true }
    );
    assert.equal(
      canTransitionAnnouncementStatus({
        status: "unpublished",
        nextStatus: "published",
        canPublish: true,
      }),
      true
    );
    assert.equal(
      canTransitionAnnouncementStatus({
        status: "draft",
        nextStatus: "unpublished",
        canPublish: true,
      }),
      false
    );
    assert.equal(
      canTransitionAnnouncementStatus({
        status: "draft",
        nextStatus: "published",
        canPublish: false,
      }),
      false
    );
  });
});

describe("R18 case 9: deletion policy — reads are append-only", () => {
  it("blocks deletion once ANY employee has read the announcement", () => {
    assert.deepEqual(
      buildAnnouncementDeletionDecision({
        status: "published",
        hasReads: true,
        canDelete: true,
        canPublish: true,
      }),
      { allowed: false, reason: "blocked.reads" }
    );
    assert.deepEqual(
      buildAnnouncementDeletionDecision({
        status: "draft",
        hasReads: false,
        canDelete: false,
        canPublish: true,
      }),
      { allowed: false, reason: "permission.missing" }
    );
    assert.deepEqual(
      buildAnnouncementDeletionDecision({
        status: "published",
        hasReads: false,
        canDelete: true,
        canPublish: false,
      }),
      { allowed: false, reason: "requires.publish" }
    );
    assert.deepEqual(
      buildAnnouncementDeletionDecision({
        status: "draft",
        hasReads: false,
        canDelete: true,
        canPublish: false,
      }),
      { allowed: true }
    );
  });
});

describe("R18 case 10: visibility — audience and time windows", () => {
  const published = {
    status: "published",
    targetType: "all_employees",
    scheduledAt: null,
    expiresAt: null,
    hasRecipient: false,
  };
  const now = new Date("2030-01-15T12:00:00Z");

  it("hides non-published, unscheduled-future and expired items", () => {
    assert.equal(buildAnnouncementVisibility({ ...published, asOf: now }), true);
    assert.equal(
      buildAnnouncementVisibility({ ...published, status: "draft", asOf: now }),
      false
    );
    assert.equal(
      buildAnnouncementVisibility({
        ...published,
        scheduledAt: new Date("2030-01-16T00:00:00Z"),
        asOf: now,
      }),
      false
    );
    assert.equal(
      buildAnnouncementVisibility({
        ...published,
        expiresAt: new Date("2030-01-15T12:00:00Z"),
        asOf: now,
      }),
      false,
      "expiry is exclusive at the boundary"
    );
    assert.equal(
      buildAnnouncementVisibility({
        ...published,
        expiresAt: new Date("2030-01-15T12:00:01Z"),
        asOf: now,
      }),
      true
    );
  });

  it("enforces selected-audience recipient membership", () => {
    assert.equal(
      buildAnnouncementVisibility({
        ...published,
        targetType: "selected_employees",
        hasRecipient: false,
        asOf: now,
      }),
      false
    );
    assert.equal(
      buildAnnouncementVisibility({
        ...published,
        targetType: "selected_employees",
        hasRecipient: true,
        asOf: now,
      }),
      true
    );
  });
});

describe("R18 case 11: permission resolver", () => {
  it("derives capability flags from permission codes", () => {
    assert.deepEqual(resolveAnnouncementPermissions([]), {
      canView: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canPublish: false,
      canManage: false,
    });
    const viewOnly = resolveAnnouncementPermissions([
      PERMISSIONS.ANNOUNCEMENTS_VIEW,
    ]);
    assert.equal(viewOnly.canView, true);
    assert.equal(viewOnly.canCreate, false);
    assert.equal(viewOnly.canManage, true);
    const full = resolveAnnouncementPermissions(
      Object.values(PERMISSIONS).filter((code) =>
        code.startsWith("announcements.")
      )
    );
    assert.equal(full.canManage, true);
    assert.equal(full.canDelete, true);
  });
});

describe("R18 case 12: RBAC role grants", () => {
  it("gives admins full control, management/HR everything but delete, staff nothing", () => {
    assert.deepEqual(ANNOUNCEMENT_ROLE_GRANTS[ROLE_CODES.SUPERADMIN], [
      PERMISSIONS.ANNOUNCEMENTS_VIEW,
      PERMISSIONS.ANNOUNCEMENTS_CREATE,
      PERMISSIONS.ANNOUNCEMENTS_UPDATE,
      PERMISSIONS.ANNOUNCEMENTS_DELETE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
    ]);
    assert.deepEqual(ANNOUNCEMENT_ROLE_GRANTS[ROLE_CODES.ADMIN], [
      PERMISSIONS.ANNOUNCEMENTS_VIEW,
      PERMISSIONS.ANNOUNCEMENTS_CREATE,
      PERMISSIONS.ANNOUNCEMENTS_UPDATE,
      PERMISSIONS.ANNOUNCEMENTS_DELETE,
      PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
    ]);
    for (const role of [ROLE_CODES.MANAGEMENT, ROLE_CODES.HR] as const) {
      assert.equal(
        ANNOUNCEMENT_ROLE_GRANTS[role].includes(
          PERMISSIONS.ANNOUNCEMENTS_DELETE
        ),
        false,
        `${role} must not hold announcements.delete`
      );
      assert.deepEqual([...ANNOUNCEMENT_ROLE_GRANTS[role]], [
        PERMISSIONS.ANNOUNCEMENTS_VIEW,
        PERMISSIONS.ANNOUNCEMENTS_CREATE,
        PERMISSIONS.ANNOUNCEMENTS_UPDATE,
        PERMISSIONS.ANNOUNCEMENTS_PUBLISH,
      ]);
    }
    for (const role of [
      ROLE_CODES.FINANCE,
      ROLE_CODES.SUPERVISOR,
      ROLE_CODES.EMPLOYEE,
    ] as const) {
      assert.deepEqual(ANNOUNCEMENT_ROLE_GRANTS[role], []);
    }
  });

  it("every granted code exists in the central catalog", () => {
    const catalogCodes = new Set(
      PERMISSION_CATALOG.map((entry) => entry.code)
    );
    for (const grants of Object.values(ANNOUNCEMENT_ROLE_GRANTS)) {
      for (const code of grants) {
        assert.equal(catalogCodes.has(code), true, `${code} not in catalog`);
      }
    }
  });
});

describe("R18 case 13: attachment classification — magic bytes, extension, MIME", () => {
  const pdfMagic = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  const pngMagic = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const zipMagic = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
  const oleMagic = new Uint8Array([
    0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
  ]);

  it("accepts files whose three signals align", () => {
    assert.deepEqual(
      classifyAttachment({
        filename: "notice.pdf",
        mimeType: "application/pdf",
        magic: pdfMagic,
      }),
      { ok: true, kind: "pdf", extension: "pdf", mimeType: "application/pdf" }
    );
    assert.equal(
      classifyAttachment({
        filename: "photo.PNG",
        mimeType: "image/png",
        magic: pngMagic,
      }).ok,
      true
    );
    assert.equal(
      classifyAttachment({
        filename: "policy.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        magic: zipMagic,
      }).ok,
      true
    );
    assert.equal(
      classifyAttachment({
        filename: "legacy.doc",
        mimeType: "application/msword",
        magic: oleMagic,
      }).ok,
      true
    );
  });

  it("rejects disguised, extensionless and non-whitelisted files", () => {
    assert.deepEqual(
      classifyAttachment({
        filename: "evil.pdf",
        mimeType: "application/pdf",
        magic: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
      }),
      { ok: false, reason: "magic.mismatch" }
    );
    assert.deepEqual(
      classifyAttachment({
        filename: "README",
        mimeType: "text/plain",
        magic: pdfMagic,
      }),
      { ok: false, reason: "filename.extension" }
    );
    assert.deepEqual(
      classifyAttachment({
        filename: "payload.exe",
        mimeType: "application/octet-stream",
        magic: new Uint8Array([0x4d, 0x5a]),
      }),
      { ok: false, reason: "filename.extension" }
    );
    assert.deepEqual(
      classifyAttachment({
        filename: "wrong.pdf",
        mimeType: "text/html",
        magic: pdfMagic,
      }),
      { ok: false, reason: "mime.mismatch" }
    );
  });

  it("sanitizes display filenames and extracts extensions", () => {
    assert.equal(
      sanitizeOriginalFilename("../../etc/pas\\sword.txt"),
      "etcpassword.txt"
    );
    assert.equal(sanitizeOriginalFilename("   "), "attachment");
    assert.equal(
      sanitizeOriginalFilename("x".repeat(300)).length,
      255
    );
    assert.equal(extractExtension("archive.tar.gz"), "gz");
    assert.equal(extractExtension("noext"), "");
    assert.equal(extractExtension(".hidden"), "");
  });
});

describe("R18 case 14: audit integration", () => {
  it("announces every lifecycle event through audit actions", () => {
    const auditSource = readRepoFile("lib/auth/audit.ts");
    const actionsSource = readRepoFile("features/announcements/actions.ts");
    for (const action of [
      "announcement.created",
      "announcement.updated",
      "announcement.published",
      "announcement.unpublished",
      "announcement.deleted",
      "announcement.read",
      "announcement.attachment.uploaded",
      "announcement.attachment.deleted",
      "announcement.attachment.downloaded",
    ]) {
      assert.equal(
        auditSource.includes(`"${action}"`),
        true,
        `${action} must be a declared audit action`
      );
    }
    assert.equal(actionsSource.includes("writeAuditLog"), true);
  });
});

describe("R18 case 15: seed + catalog wiring (static)", () => {
  it("seed imports the shared grant matrix for ADMIN and MANAGEMENT", () => {
    const seedSource = readRepoFile("scripts/seed-rbac.mts");
    assert.equal(
      seedSource.includes(
        'import { ANNOUNCEMENT_ROLE_GRANTS } from "../features/announcements/permissions.ts"'
      ),
      true
    );
    for (const role of ["ADMIN", "MANAGEMENT"]) {
      assert.equal(
        seedSource.includes(`...ANNOUNCEMENT_ROLE_GRANTS[ROLE_CODES.${role}]`),
        true,
        `seed matrix ${role} block must spread the announcements grants`
      );
    }
    const permissionsSource = readRepoFile("lib/auth/permissions.ts");
    for (const code of [
      "announcements.view",
      "announcements.create",
      "announcements.update",
      "announcements.delete",
      "announcements.publish",
    ]) {
      assert.equal(
        permissionsSource.includes(`"${code}"`),
        true,
        `${code} must exist in the catalog`
      );
    }
  });
});

describe("R18 case 16: navigation + route wiring (static)", () => {
  it("exposes the employee feed to everyone and management view by permission", () => {
    const navigationSource = readRepoFile("components/layout/navigation.ts");
    assert.equal(navigationSource.includes('href: "/announcements"'), true);
    assert.equal(
      navigationSource.includes('href: "/announcements/management"'),
      true
    );
    assert.equal(
      navigationSource.includes("PERMISSIONS.ANNOUNCEMENTS_VIEW"),
      true
    );
    const typesSource = readRepoFile("types/navigation.ts");
    assert.equal(typesSource.includes('"announcements"'), true);
  });

  it("ships the management/detail/create/edit routes and the authorized download API", () => {
    readRepoFile("app/(dashboard)/announcements/page.tsx");
    readRepoFile("app/(dashboard)/announcements/[announcementId]/page.tsx");
    readRepoFile("app/(dashboard)/announcements/management/page.tsx");
    readRepoFile("app/(dashboard)/announcements/management/new/page.tsx");
    readRepoFile(
      "app/(dashboard)/announcements/management/[announcementId]/edit/page.tsx"
    );
    const downloadRoute = readRepoFile(
      "app/api/announcements/[attachmentId]/download/route.ts"
    );
    assert.equal(downloadRoute.includes("getCurrentUser"), true);
    assert.equal(downloadRoute.includes("buildAnnouncementVisibility"), true);
    assert.equal(downloadRoute.includes('"private, no-store"'), true);
    assert.equal(
      downloadRoute.includes("announcement.attachment.downloaded"),
      true
    );
  });

  it("attaches the feed to the employee dashboard with an unread count", () => {
    const employeeDashboard = readRepoFile(
      "features/dashboard/employee-dashboard.tsx"
    );
    assert.equal(
      employeeDashboard.includes("countMyUnreadAnnouncements"),
      true
    );
    assert.equal(employeeDashboard.includes("listMyAnnouncements"), true);
    assert.equal(employeeDashboard.includes("/announcements"), true);
  });
});
