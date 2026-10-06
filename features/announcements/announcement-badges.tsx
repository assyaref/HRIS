import { Badge, type BadgeVariant } from "@/components/ui/badge";
import {
  ANNOUNCEMENT_PRIORITY_LABELS,
  ANNOUNCEMENT_STATUS_LABELS,
  isAnnouncementPriority,
  isAnnouncementStatus,
} from "./constants";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  draft: "secondary",
  published: "primary",
  unpublished: "outline",
};

const PRIORITY_VARIANTS: Record<string, BadgeVariant> = {
  normal: "secondary",
  important: "outline",
  urgent: "destructive",
};

export function AnnouncementStatusBadge({ status }: { status: string }) {
  if (!isAnnouncementStatus(status)) {
    return <Badge variant="outline">{status}</Badge>;
  }
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? "secondary"}>
      {ANNOUNCEMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function AnnouncementPriorityBadge({
  priority,
}: {
  priority: string;
}) {
  if (!isAnnouncementPriority(priority)) {
    return <Badge variant="outline">{priority}</Badge>;
  }
  return (
    <Badge variant={PRIORITY_VARIANTS[priority] ?? "secondary"}>
      {ANNOUNCEMENT_PRIORITY_LABELS[priority]}
    </Badge>
  );
}
