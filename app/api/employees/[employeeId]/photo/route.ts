import { getCurrentUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { readEmployeeProfilePhoto } from "@/lib/employees/profile-photo-storage";
import { getEmployeeById } from "@/features/employees/queries";

/**
 * Employee profile photo (authenticated image route).
 *
 * Who may see a photo:
 *  - the employee themself (linked user account);
 *  - any user of the SAME organization holding `employees.view`;
 *  - a Super Administrator (any organization, matching the profile page).
 * Unknown ids, foreign organizations and missing files all answer 404 so the
 * route never confirms cross-tenant existence. The organization is read from
 * the employee row, never from the request.
 */

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NO_STORE = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ employeeId: string }> }
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: NO_STORE });

  const { employeeId } = await context.params;
  if (typeof employeeId !== "string" || !UUID_PATTERN.test(employeeId)) {
    return new Response("Not Found", { status: 404, headers: NO_STORE });
  }

  const employee = await getEmployeeById(employeeId);
  if (!employee) return new Response("Not Found", { status: 404, headers: NO_STORE });

  const isSelf = employee.userId === user.id;
  let allowed = isSelf;
  if (!allowed) {
    const authorization = await getUserAuthorization(user.id);
    allowed =
      authorization.isSuperAdmin ||
      (user.organizationId === employee.organizationId &&
        authorization.permissionCodes.includes(PERMISSIONS.EMPLOYEES_VIEW));
  }
  if (!allowed) return new Response("Not Found", { status: 404, headers: NO_STORE });

  const photo = await readEmployeeProfilePhoto(employee.organizationId, employee.id);
  if (!photo) return new Response("Not Found", { status: 404, headers: NO_STORE });

  return new Response(new Uint8Array(photo.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(photo.bytes.length),
      "Content-Disposition": "inline",
      // The URL carries a version query, so a short private cache is safe.
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
