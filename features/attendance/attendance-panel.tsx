"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { checkInAction, checkOutAction } from "./actions";
import { AttendanceCamera } from "./attendance-camera";
import {
  AttendancePhotoCapture,
  ATTENDANCE_PHOTO_CAPTURE_FILENAME,
} from "./attendance-photo-capture";
import {
  LocationCapture,
  type AcquiredLocation,
  type LocationIssue,
} from "./location-capture";
import {
  NETWORK_REQUIRED_MESSAGE,
  isBrowserOffline,
} from "./mobile-compat";
import type { AttendanceOption } from "./queries";

type LocationSelection =
  | ({ status: "obtained" } & AcquiredLocation)
  | { status: "denied" | "unavailable" | "timeout" };

export interface AttendancePanelProps {
  mode: "check_in" | "check_out";
  /** Eligible project/work-location pairs (check-in only). */
  options: AttendanceOption[];
  disabled?: boolean;
  disabledReason?: string;
}

/**
 * Interactive check-in/check-out panel (client leaf).
 *
 * The browser collects ONLY: selected project/location, GPS fix (or an
 * explicit issue), and optional notes. Everything else — employee, org,
 * timestamps, geofence decision, verification — is resolved by the server
 * actions, which are the single authority.
 */
export function AttendancePanel({
  mode,
  options,
  disabled = false,
  disabledReason,
}: AttendancePanelProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [notes, setNotes] = useState("");
  const [selectedWorkLocationId, setSelectedWorkLocationId] = useState(
    options[0]?.workLocationId ?? ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState(
    options[0]?.projectId ?? ""
  );
  // Transient attendance photo Blob (presence evidence). Held only in memory;
  // cleared after submit, retake/cancel and unmount.
  const [photo, setPhoto] = useState<Blob | null>(null);

  const currentOption = useMemo(
    () =>
      options.find(
        (option) => option.workLocationId === selectedWorkLocationId
      ) ?? options[0],
    [options, selectedWorkLocationId]
  );

  function chooseOption(workLocationId: string) {
    const option = options.find((item) => item.workLocationId === workLocationId);
    setSelectedWorkLocationId(workLocationId);
    setSelectedProjectId(option?.projectId ?? "");
  }

  function onAcquired(acquired: AcquiredLocation) {
    setMessage(null);
    setLocation({ status: "obtained", ...acquired });
  }

  function onIssue(issue: LocationIssue) {
    setMessage(null);
    setLocation({ status: issue });
  }

  function buildLocationPayload() {
    if (!location) return null;
    if (location.status === "obtained") {
      return {
        status: "obtained" as const,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracyMeters: location.accuracyMeters,
      };
    }
    return {
      status:
        location.status === "timeout"
          ? ("unavailable" as const)
          : (location.status as "denied" | "unavailable"),
    };
  }

  function submit() {
    if (disabled || pending) return;

    // Attendance is NEVER queued offline: the server validation chain must
    // run for every submission. If the browser already reports offline, tell
    // the user and stop instead of attempting a request that cannot validate.
    if (
      typeof navigator !== "undefined" &&
      isBrowserOffline(navigator.onLine)
    ) {
      setMessage({ tone: "error", text: NETWORK_REQUIRED_MESSAGE });
      return;
    }

    const locationPayload = buildLocationPayload();
    if (!locationPayload) {
      setMessage({
        tone: "error",
        text: "Ambil lokasi GPS Anda terlebih dahulu.",
      });
      return;
    }

    if (mode === "check_in" && !photo) {
      setMessage({
        tone: "error",
        text: "Ambil foto kehadiran terlebih dahulu.",
      });
      return;
    }

    /**
     * Check-in payload transport: FormData so the transient JPEG Blob travels
     * as a real file part. Metadata stays in plain fields — image bytes are
     * NEVER serialized into JSON or a data URL. The employee/org/date/timezone
     * are NOT included; the server resolves them from the authenticated
     * session.
     */
    function buildCheckInFormData(): FormData {
      const formData = new FormData();
      formData.append("projectId", selectedProjectId);
      formData.append("workLocationId", selectedWorkLocationId);
      formData.append("location", JSON.stringify(locationPayload));
      if (notes.trim() !== "") {
        formData.append("notes", notes.trim());
      }
      if (photo) {
        formData.append("photo", photo, ATTENDANCE_PHOTO_CAPTURE_FILENAME);
      }
      return formData;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        const result =
          mode === "check_in"
            ? await checkInAction(buildCheckInFormData())
            : await checkOutAction({
                notes: notes.trim() || undefined,
                location: locationPayload,
              });

        if (result.ok) {
          setLocation(null);
          setNotes("");
          setPhoto(null);
          setMessage({ tone: "success", text: result.message });
          router.refresh();
        } else {
          setMessage({ tone: "error", text: result.message });
        }
      } catch {
        // Network/server transport failure: keep the captured GPS fix so the
        // user can retry once connectivity returns. Nothing was queued.
        setMessage({ tone: "error", text: NETWORK_REQUIRED_MESSAGE });
      }
    });
  }

  const isCheckIn = mode === "check_in";
  const actionLabel = isCheckIn ? "Check in" : "Check out";

  /* RENDER */
  return (
    <Card>
      <CardHeader>
        <CardTitle>{isCheckIn ? "Check in" : "Check out"}</CardTitle>
        <CardDescription>
          {isCheckIn
            ? "Select your project and work location, then capture your location."
            : "Capture your location again to complete today's attendance."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {message ? (
          <div
            role={message.tone === "error" ? "alert" : "status"}
            className={`rounded-md border px-3 py-2 text-sm ${
              message.tone === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {message.text}
          </div>
        ) : null}

        {disabledReason ? (
          <p className="text-sm text-muted-foreground">{disabledReason}</p>
        ) : null}

        {isCheckIn && options.length > 0 ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="attendance-work-location">Work location</Label>
              <select
                id="attendance-work-location"
                value={selectedWorkLocationId}
                onChange={(event) => chooseOption(event.target.value)}
                disabled={disabled || pending}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {options.map((option) => (
                  <option
                    key={option.workLocationId}
                    value={option.workLocationId}
                  >
                    {option.projectName} / {option.workLocationName}
                  </option>
                ))}
              </select>
            </div>
            {currentOption ? (
              <p className="text-xs text-muted-foreground">
                Project: {currentOption.projectName} (
                {currentOption.projectCode})
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>GPS status</Label>
          <LocationCapture
            onAcquired={onAcquired}
            onIssue={onIssue}
            disabled={disabled || pending}
          />
        </div>

        {isCheckIn ? (
          <div className="space-y-2">
            <Label>Foto kehadiran (bukti)</Label>
            <p className="text-sm text-muted-foreground">
              Foto ini hanya bukti kehadiran dan tidak digunakan sebagai
              verifikasi wajah. Ambil satu foto sebelum check-in.
            </p>
            <AttendancePhotoCapture
              onPhotoChange={setPhoto}
              disabled={disabled || pending}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label>Identity verification</Label>
          <p className="text-sm text-muted-foreground">
            Identity verification is not configured. Opening a camera is not
            treated as proof of identity in Phase 6.
          </p>
          <AttendanceCamera />
        </div>

        <div className="space-y-2">
          <Label htmlFor="attendance-notes">Notes (optional)</Label>
          <Input
            id="attendance-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
            placeholder="Optional note for this attendance"
            disabled={disabled || pending}
          />
        </div>

        <div className="flex justify-end border-t border-border pt-4">
          <Button
            type="button"
            onClick={submit}
            disabled={
              disabled ||
              pending ||
              !location ||
              !currentOption ||
              (isCheckIn && !photo)
            }
          >
            {pending ? "Processing…" : actionLabel}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
