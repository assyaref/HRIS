/**
 * Announcements — access / lifecycle policy (pure, unit-testable).
 *
 * Free of `server-only`, database and Next.js imports so the rules can be
 * exercised with `node --test` (mirroring `features/work-locations/guardrails.ts`).
 *
 * These rules answer "may this user perform this action on this announcement?",
 * given pre-resolved authorization flags. Every caller combines this policy
 * with the org-scoped row lookup — the database query carries `organization_id` =
 * the acting user's organization, so cross-tenant data can never reach these
 * rules.
 */

import {
  isAnnouncementStatus,
  type AnnouncementStatus,
} from "./constants.ts";

export type AnnouncementPolicyReason =
  | "permission.missing"
  | "not.found"
  | "org.mismatch"
  | "mismatched.status"
  | "mismatched.target"
  | "published.locked"
  | "requires.publish"
  | "invalid.transition"
  | "blocked.reads"
  | "attachment.not.found"
  | "attachment.belongs.elsewhere"
  | "employee.unlinked";

export type AnnouncementDecision =
  | { allowed: true }
  | { allowed: false; reason: AnnouncementPolicyReason };

export function allow(): AnnouncementDecision {
  return { allowed: true };
}

export function deny(
  reason: AnnouncementPolicyReason
): AnnouncementDecision {
  return { allowed: false, reason };
}

export type AnnouncementAction =
  | "create"
  | "read"
  | "update"
  | "change_target"
  | "add_attachment"
  | "remove_attachment"
  | "publish"
  | "unpublish"
  | "delete";

export interface AnnouncementActionContext {
  action: AnnouncementAction;
  /** Current status (undefined for "create"). */
  status?: AnnouncementStatus | string;
  /** True when ANY employee has read the announcement. */
  hasReads?: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canPublish: boolean;
}

/**
 * Authorize a management action against announcement state.
 */
export function buildAnnouncementActionDecision(
  context: AnnouncementActionContext
): AnnouncementDecision {
  const statusValue = context.status;
  const status: AnnouncementStatus | null =
    statusValue != null && isAnnouncementStatus(statusValue)
      ? statusValue
      : null;

  switch (context.action) {
    case "create":
      return context.canCreate ? allow() : deny("permission.missing");

    case "read":
      return context.canView ? allow() : deny("permission.missing");

    case "update": {
      if (!context.canUpdate) return deny("permission.missing");
      if (status === "published" && !context.canPublish) {
        return deny("requires.publish");
      }
      return allow();
    }

    case "change_target":
    case "add_attachment":
    case "remove_attachment": {
      if (status === "published") return deny("published.locked");
      if (!context.canUpdate) return deny("permission.missing");
      return allow();
    }

    case "publish": {
      if (!context.canPublish) return deny("permission.missing");
      if (status === "published") return allow();
      if (status === "draft" || status === "unpublished") return allow();
      return deny("invalid.transition");
    }

    case "unpublish": {
      if (!context.canPublish) return deny("permission.missing");
      if (status === "published") return allow();
      return deny("invalid.transition");
    }

    case "delete":
      return buildAnnouncementDeletionDecision({
        status,
        hasReads: Boolean(context.hasReads),
        canDelete: context.canDelete,
        canPublish: context.canPublish,
      });
  }
}

export interface AnnouncementDeletionContext {
  status: AnnouncementStatus | string | null | undefined;
  hasReads: boolean;
  canDelete: boolean;
  canPublish: boolean;
}

/**
 * Deletion guard. An announcement that has been read by even one employee is
 * append-only and can never be removed — the read record would be lost.
 */
export function buildAnnouncementDeletionDecision(
  context: AnnouncementDeletionContext
): AnnouncementDecision {
  if (context.hasReads) return deny("blocked.reads");
  if (!context.canDelete) return deny("permission.missing");
  if (context.status === "published" && !context.canPublish) {
    return deny("requires.publish");
  }
  return allow();
}

export interface AnnouncementTransitionContext {
  status: AnnouncementStatus;
  nextStatus: AnnouncementStatus;
  canPublish: boolean;
}

/**
 * Whether moving an announcement between published/unpublished states is
 * allowed. Only draft/unpublished → published and published → unpublished are
 * valid lifecycle moves; there is deliberately no draft ↔ unpublished move.
 */
export function canTransitionAnnouncementStatus(
  context: AnnouncementTransitionContext
): boolean {
  if (!context.canPublish) return false;
  if (context.status === "published" && context.nextStatus === "unpublished") {
    return true;
  }
  if (
    context.status !== "published" &&
    context.nextStatus === "published"
  ) {
    return true;
  }
  return false;
}

/**
 * Announcements are replaceable among these states without going through
 * "published" (used for filter round-tripping / display sanity only).
 */
export function isAnnouncementStateSensitiveStatus(
  status: AnnouncementStatus
): boolean {
  return status === "published";
}

/**
 * Kill-switch helper for the downloads/visibility path: TRUE when the
 * announcement is currently visible to a given employee under the business
 * rules (published + within the schedule/expiry window + recipient match).
 */
export function buildAnnouncementVisibility(input: {
  status: string;
  targetType: string;
  scheduledAt: Date | string | null;
  expiresAt: Date | string | null;
  hasRecipient: boolean;
  asOf: Date | string;
}): boolean {
  if (input.status !== "published") return false;

  const asOf = new Date(input.asOf);
  if (input.scheduledAt && asOf < new Date(input.scheduledAt)) return false;
  if (input.expiresAt && asOf >= new Date(input.expiresAt)) return false;

  if (input.targetType === "selected_employees" && !input.hasRecipient) {
    return false;
  }
  return true;
}