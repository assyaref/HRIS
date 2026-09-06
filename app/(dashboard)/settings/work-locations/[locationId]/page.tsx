import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { getWorkLocationAction } from "@/features/work-locations/actions";
import { listWorkLocationProjectOptions } from "@/features/work-locations/queries";
import { WorkLocationEditForm } from "@/features/work-locations/work-location-edit-form";

interface PageProps {
  params: {
    locationId: string;
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return {
    title: `Edit ${params.locationId}`,
  };
}

export default async function EditWorkLocationPage({ params }: PageProps) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.WORK_LOCATIONS_VIEW);

  const result = await getWorkLocationAction(params.locationId);
  if (!result.ok || !result.location) {
    redirect("/settings/work-locations");
  }

  const location = result.location;

  // Active projects of the caller's organization, for the Edit form selector.
  // organizationId comes from the session, never the client.
  const projects = user.organizationId
    ? await listWorkLocationProjectOptions(user.organizationId)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/settings/work-locations"
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background hover:bg-accent hover:text-accent-foreground h-9 w-9 p-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="sr-only">Back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit {location.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Update work location details and geofence settings.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Location details</CardTitle>
            <CardDescription>
              Update the basic information and geofence coordinates for this work location.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WorkLocationEditForm location={location} projects={projects} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Location information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">ID</p>
                  <p className="font-mono">{location.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Project</p>
                  <p>{location.projectName ?? "Not Assigned"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p>{location.status}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p>{new Date(location.createdAt).toLocaleDateString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Updated</p>
                  <p>{new Date(location.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
              {location.latitude && location.longitude && (
                <div>
                  <p className="text-muted-foreground text-sm">Coordinates</p>
                  <p className="font-mono text-sm">
                    {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}