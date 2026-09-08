import { getCurrentUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/rbac";

import { getActiveAttendancePhoto } from "@/features/attendance/attendance-photo.queries";

/**
 * PHASE 10.7C-57 — Management/HR same-day attendance photo route handler.
 *
 * Security model (every request MUST satisfy all of these):
 * 1. Authenticated session (getCurrentUser — cookie backed).
 * 2. ATTENDANCE_MANAGE permission → ADMIN / MANAGEMENT / HR only
 *    (SUPERVISOR and EMPLOYEE are denied because they hold only
 *    attendance.view/approve).
 * 3. Organization scope — the organization ALWAYS comes from the session.
 * 4. attendanceId is validated and resolved together with the session org by
 *    getActiveAttendancePhoto, which also enforces `expires_at > now()` at the
 *    query level (expired rows are reported as absent).
 *
 * Client-authority fields (organizationId/employeeId/photoId/…) as query
 * parameters are rejected outright. The only client input is the attendanceId
 * path segment. No public caching: private, no-store, nosniff. Bytes are
 * returned directly as image/jpeg — never Base64/JSON.
 */

export const dynamic = "force-dynamic";

const ATTENDANCE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FORBIDDEN_QUERY_KEYS = ["organizationId", "employeeId", "photoId", "expiresAt"] as const;

export async function GET(
  request: Request,
  context: { params: Promise<{ attendanceId: string }> }
): Promise<Response> {
  // Reject any attempt to smuggle tenant/authority identifiers as query params.
  const search = new URL(request.url).searchParams;
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (search.has(key)) {
      return new Response("Bad Request", { status: 400 });
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!user.organizationId) {
    // No tenant context: same safe not-found response as a missing record.
    return new Response("Not Found", { status: 404 });
  }
  if (!(await hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE))) {
    return new Response("Forbidden", { status: 403 });
  }

  const { attendanceId } = await context.params;
  if (typeof attendanceId !== "string" || !ATTENDANCE_ID_PATTERN.test(attendanceId)) {
    return new Response("Not Found", { status: 404 });
  }

  // Org-scoped lookup + server-side `expires_at > now()` guard. A photo that
  // exists in another organization, or that has expired, resolves to null and
  // returns the same generic not-found — tenant existence is never revealed.
  const photo = await getActiveAttendancePhoto(user.organizationId, attendanceId);
  if (!photo) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(new Uint8Array(photo.data), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
