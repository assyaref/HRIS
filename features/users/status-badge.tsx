import { Badge } from "@/components/ui/badge";

import { STATUS_DISPLAY, type UserStatus } from "./policy";

/** Renders an account status (Active/Inactive/Invited/Locked) as a badge. */
export function UserStatusBadge({ status }: { status: UserStatus }) {
  const display = STATUS_DISPLAY[status];

  if (!display) return <Badge variant="secondary">{status}</Badge>;

  const variant: "primary" | "secondary" | "outline" | "destructive" =
    display.tone === "ok"
      ? "primary"
      : display.tone === "warn"
        ? "secondary"
        : display.tone === "danger"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{display.label}</Badge>;
}