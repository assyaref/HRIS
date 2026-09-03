import { Badge } from "@/components/ui/badge";
import {
  ATTENDANCE_LOCATION_STATUS_LABELS,
  ATTENDANCE_STATUS_LABELS,
  ATTENDANCE_VERIFICATION_STATUS_LABELS,
  type AttendanceLocationStatus,
  type AttendanceStatus,
  type AttendanceVerificationStatus,
} from "./constants";

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
