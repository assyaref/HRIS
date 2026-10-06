import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProjectListItem } from "./queries";

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

function formatDate(date: Date | null) {
  if (!date) return "-";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

type ProjectTableProps = {
  projects: ProjectListItem[];
};

export function ProjectTable({ projects }: ProjectTableProps) {
  if (projects.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center">
        <p className="text-sm font-medium">No projects found.</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Create a project to make it available for project assignments
          and work locations.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Start Date</TableHead>
            <TableHead>End Date</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {projects.map((project) => (
            <TableRow key={project.id}>
              <TableCell className="font-medium">
                {project.code}
              </TableCell>

              <TableCell>{project.name}</TableCell>

              <TableCell>
                <Badge variant={statusVariant(project.status)}>
                  {statusLabel(project.status)}
                </Badge>
              </TableCell>

              <TableCell>{formatDate(project.startDate)}</TableCell>

              <TableCell>{formatDate(project.endDate)}</TableCell>

              <TableCell className="text-right">
                <Link
                  href={`/projects/${project.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
