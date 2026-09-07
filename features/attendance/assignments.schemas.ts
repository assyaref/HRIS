import { z } from "zod";

/**
 * Employee ↔ project assignment input validation (Phase 9.2).
 *
 * Pure module (no server imports) so the schema is unit-testable with the
 * same Node `node:test` foundation used for the geofence engine.
 *
 * The schema validates ONLY shape and UUID format. Authorization,
 * organization ownership and business rules (active employee/project,
 * duplicate active assignment) are enforced in the server action through
 * `assignments.guard.ts` against org-scoped DB reads.
 */

export const ASSIGNMENT_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const employeeIdSchema = z
  .string()
  .regex(ASSIGNMENT_UUID_PATTERN, "Employee is required.");

const projectIdSchema = z
  .string()
  .regex(ASSIGNMENT_UUID_PATTERN, "Project is required.");

export const assignmentCreateSchema = z.object({
  employeeId: employeeIdSchema,
  projectId: projectIdSchema,
});

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;

/** Structured server-action state shared by assignment mutations. */
export interface AssignmentActionState {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}
