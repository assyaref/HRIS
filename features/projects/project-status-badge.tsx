import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUSES, type ProjectStatus } from "./schemas";

export function isProjectStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  completed: "Completed",
};

export function projectStatusLabel(status: string): string {
  return isProjectStatus(status) ? STATUS_LABELS[status] : status;
}

export function projectStatusVariant(
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

export function ProjectStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={projectStatusVariant(status)}>
      {projectStatusLabel(status)}
    </Badge>
  );
}
