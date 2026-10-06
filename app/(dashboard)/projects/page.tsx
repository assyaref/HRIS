import { requirePermission } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listOrganizationProjects } from "@/features/projects/queries";
import { ProjectCreateDialog } from "@/features/projects/project-create-dialog";
import { ProjectTable } from "@/features/projects/project-table";

export default async function ProjectsPage() {
  const user = await requireUser();

  await requirePermission(user.id, PERMISSIONS.PROJECTS_VIEW);

  if (!user.organizationId) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            No organization is associated with this account.
          </p>
        </div>
      </div>
    );
  }

  const projects = await listOrganizationProjects(user.organizationId);

  const canManage = await hasProjectManagePermission(user.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground">
            Manage organizational projects.
          </p>
        </div>

        {canManage && <ProjectCreateDialog />}
      </div>

      <ProjectTable projects={projects} />
    </div>
  );
}

async function hasProjectManagePermission(userId: string) {
  try {
    await requirePermission(userId, PERMISSIONS.PROJECTS_MANAGE);
    return true;
  } catch {
    return false;
  }
}
