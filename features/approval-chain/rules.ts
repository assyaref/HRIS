/**
 * Two-level approval rules — PURE (unit-tested).
 */

export type ApprovalRequestType = "leave" | "permission" | "overtime";

export const REQUEST_TYPE_LABELS: Record<ApprovalRequestType, string> = {
  leave: "Cuti",
  permission: "Izin",
  overtime: "Lembur",
};

export interface GateInput {
  /** Manager step switched on for this request type. */
  enabled: boolean;
  /** The employee's direct manager account (null = no manager / no account). */
  managerUserId: string | null;
  /** The employee's own account (a manager never approves themselves). */
  employeeUserId: string | null;
  /** Recorded manager decision, if any. */
  managerDecision: "approved" | "rejected" | null;
  /** The account trying to take the final (HR) decision. */
  actorUserId: string;
}

export type GateResult =
  | { state: "not_required" }
  | { state: "done" }
  | { state: "actor_is_manager" }
  | { state: "waiting" };

/**
 * Whether the final approver may decide now. The manager step applies only
 * when it is enabled and the employee has a manager account other than
 * their own. A final approver who IS that manager may decide directly.
 */
export function hrGate(input: GateInput): GateResult {
  if (!input.enabled || !input.managerUserId || input.managerUserId === input.employeeUserId) {
    return { state: "not_required" };
  }
  if (input.managerDecision === "approved") return { state: "done" };
  if (input.actorUserId === input.managerUserId) return { state: "actor_is_manager" };
  return { state: "waiting" };
}

/** Whether a request still needs its manager's decision. */
export function needsManager(input: Omit<GateInput, "actorUserId">): boolean {
  return (
    input.enabled &&
    Boolean(input.managerUserId) &&
    input.managerUserId !== input.employeeUserId &&
    input.managerDecision === null
  );
}
