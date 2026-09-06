import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { listWorkLocationsAction } from "@/features/work-locations/actions";
import { listWorkLocationProjectOptions } from "@/features/work-locations/queries";
import { CreateWorkLocationDialog } from "@/features/work-locations/work-location-create-dialog";

export const metadata: Metadata = {
  title: "Work Locations",
};

/**
 * Work Location Administration page (Phase 8.2).
 *
 * Only work locations belonging to the caller's own organization are listed.
 * All mutations are enforced server-side with proper organization scoping.
 */
export default async function WorkLocationsPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_VIEW);

  const canManage = await hasPermission(user.id, PERMISSIONS.WORK_LOCATIONS_MANAGE);

  const result = await listWorkLocationsAction();
  const locations = result.ok ? result.locations : [];

  // Active projects of the caller's organization, for the Create dialog
  // selector. organizationId comes from the session, never the client.
  const projects = user.organizationId
    ? await listWorkLocationProjectOptions(user.organizationId)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Work Locations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Manage geofenced work locations for attendance check-ins.
          </p>
        </div>
        {canManage ? <CreateWorkLocationDialog projects={projects} /> : null}
      </div>

      {!user.organizationId ? (
        <EmptyState
          title="No organization assigned"
          description="Your account is not linked to an organization, so there are no work locations to administer."
        />
      ) : locations.length === 0 ? (
        <EmptyState
          title="No work locations yet"
          description="Create your first work location to enable geofenced attendance check-ins for your organization."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Location</TableHead>
                <TableHead>Coordinates</TableHead>
                <TableHead>Radius</TableHead>
                <TableHead>Timezone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((location) => (
                <TableRow key={location.id}>
                  <TableCell className="font-medium">
                    {location.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {location.projectId
                        ? `Project: ${location.projectName ?? ""}`
                        : "Project: Not Assigned"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {location.latitude && location.longitude ? (
                      <span className="text-sm font-mono">
                        {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {location.radiusMeters ? (
                      <span className="text-sm">{location.radiusMeters}m</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {location.timezone ? (
                      <span className="text-sm">{location.timezone}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not set</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={location.status === "active" ? "primary" : "secondary"}>
                      {location.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/settings/work-locations/${location.id}`}
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          Edit
                        </Link>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}