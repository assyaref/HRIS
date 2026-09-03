import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = {
  title: "Dashboard",
};

const roadmap = [
  {
    module: "Employees",
    phase: "Phase 5",
    note: "Employee, department and position management.",
  },
  {
    module: "Attendance",
    phase: "Phase 7",
    note: "Clock in/out with face recognition and geofencing.",
  },
  {
    module: "Leave",
    phase: "Phase 10",
    note: "Leave types, balances and approval workflow.",
  },
  {
    module: "Payroll",
    phase: "Phase 11",
    note: "Payroll runs, payslips and approvals.",
  },
];

/**
 * Placeholder dashboard — the final HRIS dashboard ships in Phase 14.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Module overviews will appear here in a later phase.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">
          Phase 3 · Authentication
        </Badge>
      </div>

      <EmptyState
        title="Foundation is ready — modules are next"
        description="The application shell and design system primitives are in place. HRIS modules land incrementally in later phases."
      />

      <section aria-labelledby="module-roadmap-heading">
        <h2
          id="module-roadmap-heading"
          className="text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Module roadmap
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {roadmap.map((item) => (
            <Card key={item.module}>
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
