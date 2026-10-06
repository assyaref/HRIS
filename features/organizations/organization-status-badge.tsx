import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { isOrganizationStatus } from "./constants";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  active: "primary",
  inactive: "outline",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
};

export function OrganizationStatusBadge({ status }: { status: string }) {
  const known = isOrganizationStatus(status);
  const variant = known ? STATUS_VARIANTS[status] ?? "secondary" : "secondary";
  return <Badge variant={variant}>{STATUS_LABELS[status] ?? status}</Badge>;
}
