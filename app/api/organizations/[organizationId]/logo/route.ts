import { getCurrentUser } from "@/lib/auth/auth";
import { isSuperAdmin } from "@/lib/auth/rbac";
import {
  findOrganizationLogo,
  readOrganizationLogo,
} from "@/lib/organizations/logo-storage";

/**
 * Organization logo (authenticated image route).
 *
 * Members of the organization (session organization — the acting organization
 * for a Super Administrator) and Super Administrators may load it. Anything
 * else answers 404, including a missing logo, so the route never confirms a
 * foreign organization's existence.
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
  context: { params: Promise<{ organizationId: string }> }
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401, headers: NO_STORE });

  const { organizationId } = await context.params;
  if (typeof organizationId !== "string" || !UUID_PATTERN.test(organizationId)) {
    return new Response("Not Found", { status: 404, headers: NO_STORE });
  }

  const allowed =
    user.organizationId === organizationId || (await isSuperAdmin(user.id));
  if (!allowed) return new Response("Not Found", { status: 404, headers: NO_STORE });

  const logo = await findOrganizationLogo(organizationId);
  if (!logo) return new Response("Not Found", { status: 404, headers: NO_STORE });

  let bytes: Buffer;
  try {
    bytes = await readOrganizationLogo(organizationId, logo.kind);
  } catch {
    return new Response("Not Found", { status: 404, headers: NO_STORE });
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": logo.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
