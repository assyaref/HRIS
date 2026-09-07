"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";

import { createAssignmentAction, endAssignmentAction } from "./assignments.actions";
import type { EmployeeAssignment } from "./assignments.queries";
import type { AssignmentActionState } from "./assignments.schemas";

const initialState: AssignmentActionState = { status: "idle" };

export interface ProjectAssignmentManagerProps {
  employeeId: string;
  assignments: EmployeeAssignment[];
  /** Active org projects not already actively assigned (server still re-checks). */
  assignableProjects: { id: string; name: string; code: string }[];
}

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

/**
 * Project assignment manager (client leaf, Phase 9.2).
 *
 * Renders the employee's assignment history and an "Assign to project"
 * dialog. Every mutation re-runs server-side authorization
 * (`attendance.manage`), organization ownership and eligibility checks; the
 * UI is only a convenience surface, never a security boundary.
 */
export function ProjectAssignmentManager({
  employeeId,
  assignments,
  assignableProjects,
}: ProjectAssignmentManagerProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [createState, setCreateState] =
    useState<AssignmentActionState>(initialState);
  const [isSubmitting, startTransition] = useTransition();

  const activeAssignments = assignments.filter((assignment) => assignment.active);

  async function handleAssignSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setCreateState(initialState);
    startTransition(async () => {
      const result = await createAssignmentAction(employeeId, initialState, formData);
      if (result.ok) {
        setDialogOpen(false);
        router.refresh();
      } else {
        setCreateState(result);
      }
    });
  }

  async function handleEndAssignment(assignmentId: string) {
    setEndingId(assignmentId);
    setActionMessage(null);
    const result = await endAssignmentAction(assignmentId);
    setEndingId(null);
    if (result.ok) {
      router.refresh();
    } else {
      setActionMessage(result.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Project assignments</CardTitle>
            <CardDescription>
              Projects this employee may attend. Active assignments must resolve
              to an active project and active work location for check-in.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDialogOpen(true)}
            disabled={assignableProjects.length === 0}
            title={
              assignableProjects.length === 0
                ? "No active projects available."
                : undefined
            }
          >
            Assign to project
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {actionMessage ? (
          <div
            role="alert"
            className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {actionMessage}
          </div>
        ) : null}

        {assignableProjects.length === 0 ? (
          <p className="mb-4 text-xs text-muted-foreground">
            No active projects available in this organization. Create a project
            before assigning employees.
          </p>
        ) : null}

        {assignments.length === 0 ? (
          <EmptyState
            title="No project assignments"
            description="This employee is not assigned to any project yet. Assign a project to make them eligible for attendance check-ins."
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {assignment.projectName}
                    <span className="font-mono text-xs text-muted-foreground">
                      {assignment.projectCode}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Assigned: {formatDate(assignment.assignedAt)}
                    {assignment.endedAt
                      ? ` · Ended: ${formatDate(assignment.endedAt)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={assignment.active ? "primary" : "secondary"}>
                    {assignment.active ? "Active" : "Ended"}
                  </Badge>
                  {assignment.active ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={endingId === assignment.id || isSubmitting}
                      onClick={() => handleEndAssignment(assignment.id)}
                    >
                      {endingId === assignment.id
                        ? "Ending..."
                        : "End assignment"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>Assign employee to project</DialogTitle>
              <DialogDescription>
                The employee becomes eligible to check in at active work
                locations bound to the selected project.
              </DialogDescription>
            </DialogHeader>

            {createState.message && createState.status === "error" ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {createState.message}
              </div>
            ) : null}

            <form onSubmit={handleAssignSubmit} noValidate className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="assignment-project">Project</Label>
                <select
                  id="assignment-project"
                  name="projectId"
                  required
                  defaultValue=""
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="" disabled>
                    Select a project
                  </option>
                  {assignableProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name} ({project.code})
                    </option>
                  ))}
                </select>
                {createState.fieldErrors?.projectId ? (
                  <p className="text-sm text-destructive">
                    {createState.fieldErrors.projectId}
                  </p>
                ) : null}
              </div>

              {activeAssignments.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  The employee may hold multiple active assignments (one per
                  project). Only active projects appear above.
                </p>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Assigning..." : "Assign"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
