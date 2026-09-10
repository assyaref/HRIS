import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard",
};

const modules = [
  {
    module: "Employees",
    phase: "Phase 5",
    note: "Employee records, search and organization-scoped management.",
  },
  {
    module: "Attendance",
    phase: "Phase 10.7C",
    note: "Attendance with geofencing, server-authoritative verification and attendance photo controls.",
  },
  {
    module: "Face ID",
    phase: "Phase 10.7C",
    note: "Face enrollment and server-side face verification controls.",
  },
  {
    module: "Leave",
    phase: "Phase 7",
    note: "Leave requests, balances and approval workflow.",
  },
  {
    module: "Permission",
    phase: "Phase 7",
    note: "Permission requests and approval workflow.",
  },
  {
    module: "Payroll",
    phase: "Phase 11",
    note: "Payroll runs, payslips and approval workflow.",
  },
  {
    module: "Roles",
    phase: "RBAC",
    note: "Role-based access control and authorized navigation.",
  },
  {
    module: "Work Locations",
    phase: "Settings",
    note: "Organization-scoped work locations and attendance configuration.",
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Enterprise HRIS overview and module access.
          </p>
        </div>

        <Badge variant="outline" className="w-fit">
          Production HRIS
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>HRIS Overview</CardTitle>
          <CardDescription>
            Integrated employee management, attendance, face verification,
            leave, permission, payroll and access control.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Core application services are deployed and protected by
            server-side authentication and organization-scoped authorization.
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="modules-heading">
        <div>
          <h2
            id="modules-heading"
            className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
          >
            HRIS Modules
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Available modules and their current implementation areas.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((item) => (
            <Card key={item.module} className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{item.module}</CardTitle>
                  <Badge variant="secondary">{item.phase}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription>{item.note}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
