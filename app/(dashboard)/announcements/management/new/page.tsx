import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { hasPermission } from "@/lib/auth/rbac";
import { PERMISSIONS } from "@/lib/auth/permissions";

import { listEmployeesFlatByOrganization } from "@/features/employees/queries";
import { AnnouncementForm } from "@/features/announcements/announcement-form";

export const metadata: Metadata = {
  title: "New Announcement",
};

/** Management form to create a draft announcement (R18). */
export default async function NewAnnouncementPage() {
  const user = await requireUser();
  if (!user.organizationId) {
    forbidden();
  }

  const canCreate = await hasPermission(
    user.id,
    PERMISSIONS.ANNOUNCEMENTS_CREATE
  );
  if (!canCreate) {
    forbidden();
  }

  const employees = await listEmployeesFlatByOrganization(
    user.organizationId
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          New announcement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Draft an announcement for all employees or a selected audience, then
          publish it from the management view.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Announcement details</CardTitle>
          <CardDescription>
            Plain-text content, optional attachments (up to 3 files, 10 MB
            each).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AnnouncementForm
            mode="create"
            employees={employees.map((employee) => ({
              id: employee.id,
              label: `${employee.employeeNumber} — ${employee.firstName} ${employee.lastName}`,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
