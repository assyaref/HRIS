import { Badge } from "@/components/ui/badge";
import {
  ATTENDANCE_LOCATION_STATUS_LABELS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_VERIFICATION_STATUS_LABELS,
  type AttendanceLocationStatus,
  type AttendanceStatus,
  type AttendanceVerificationStatus,
} from "./constants";
import {
  rejectionReasonLabel,
  rejectionReasonTone,
} from "./rejection-reasons";

export function AttendanceStatusBadge({ status }: { status: AttendanceStatus }) {
  const label = ATTENDANCE_STATUS_LABELS[status] ?? status;
  if (status === "present") return <Badge variant="primary">{label}</Badge>;
  if (status === "completed") return <Badge variant="secondary">{label}</Badge>;
  return <Badge variant="outline">{label}</Badge>;
}

export function LocationStatusBadge({
  status,
}: {
  status: string | null;
}) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const label =
    ATTENDANCE_LOCATION_STATUS_LABELS[
      status as AttendanceLocationStatus
    ] ?? status;
  if (status === "valid") return <Badge variant="primary">{label}</Badge>;
  if (status === "outside_geofence")
    return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

export function VerificationStatusBadge({
  status,
}: {
  status: string | null;
}) {
  if (!status) return <Badge variant="outline">—</Badge>;
  const label =
    ATTENDANCE_VERIFICATION_STATUS_LABELS[
      status as AttendanceVerificationStatus
    ] ?? status;
  if (status === "verified") return <Badge variant="primary">{label}</Badge>;
  if (status === "failed") return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

/**
 * Human-readable badge for a stored rejection reason (Phase 9.4).
 *
 * The machine-readable reason remains available via the badge `title`, while
 * the visible label is the deterministic Indonesian mapping. Unknown reasons
 * fall back to a safe generic label instead of exposing internal values.
 */
export function RejectionReasonBadge({ reason }: { reason: string | null }) {
  if (!reason) return <Badge variant="outline">—</Badge>;
  return (
    <Badge variant={rejectionReasonTone(reason)} title={reason}>
      {rejectionReasonLabel(reason)}
    </Badge>
  );
}
