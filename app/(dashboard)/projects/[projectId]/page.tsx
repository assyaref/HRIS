import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getProjectById } from "@/features/projects/queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectEditForm } from "@/features/projects/project-edit-form";

function formatDate(date: Date | null) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function statusLabel(status: string) {
  switch (status) {
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

function statusVariant(
  status: string
): "primary" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "primary";
    case "completed":
      return "secondary";
    case "inactive":
      return "outline";
    default:
      return "outline";
  }
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUser();

  if (!user.organizationId) {
    throw new Error("Unauthorized");
  }

  await requirePermission(user.id, PERMISSIONS.PROJECTS_VIEW);

  const { projectId } = await params;

  const project = await getProjectById(
    user.organizationId,
    projectId
  );

  if (!project) {
    notFound();
  }

  let canManage = false;

  try {
    await requirePermission(user.id, PERMISSIONS.PROJECTS_MANAGE);
    canManage = true;
  } catch {
    canManage = false;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Back
          </Link>

          <div>
            <h1 className="text-2xl font-semibold">
              {project.name}
            </h1>
            <p className="text-muted-foreground">
              {project.code}
            </p>
          </div>
        </div>

        <ProjectEditForm
          project={project}
          canManage={canManage}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">Code</p>
          <p className="mt-1 font-medium">{project.code}</p>
        </div>

        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">Status</p>
          <div className="mt-2">
            <Badge variant={statusVariant(project.status)}>
              {statusLabel(project.status)}
            </Badge>
          </div>
        </div>

        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">Start Date</p>
          <p className="mt-1 font-medium">
            {formatDate(project.startDate)}
          </p>
        </div>

        <div className="rounded-lg border p-5">
          <p className="text-muted-foreground text-sm">End Date</p>
          <p className="mt-1 font-medium">
            {formatDate(project.endDate)}
          </p>
        </div>
      </div>
    </div>
  );
}
