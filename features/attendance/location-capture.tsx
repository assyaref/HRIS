"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface AcquiredLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export type LocationIssue = "denied" | "unavailable" | "timeout";

interface LocationCaptureProps {
  onAcquired: (location: AcquiredLocation) => void;
  onIssue: (issue: LocationIssue) => void;
  disabled?: boolean;
}

type LocationState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "acquired"; accuracyMeters: number }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" }
  | { kind: "unsupported" };

/**
 * One-shot GPS capture (Phase 6).
 *
 * Location is requested only after an explicit user click, uses a single
 * `getCurrentPosition` call (no continuous/background tracking), and sends
 * only latitude/longitude/accuracy upward. The server performs the geofence
 * calculation — the client never claims to be "inside".
 */
export function LocationCapture({
  onAcquired,
  onIssue,
  disabled,
}: LocationCaptureProps) {
  const [state, setState] = useState<LocationState>({ kind: "idle" });

  function requestLocation() {
    if (!("geolocation" in navigator)) {
      setState({ kind: "unsupported" });
      return;
    }
    setState({ kind: "requesting" });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setState({ kind: "acquired", accuracyMeters: accuracy });
        onAcquired({ latitude, longitude, accuracyMeters: accuracy });
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setState({ kind: "denied" });
          onIssue("denied");
        } else if (error.code === error.TIMEOUT) {
          setState({ kind: "timeout" });
          onIssue("timeout");
        } else {
          setState({ kind: "unavailable" });
          onIssue("unavailable");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  const statusLabel = (() => {
    switch (state.kind) {
      case "idle":
        return "Location not captured yet.";
      case "requesting":
        return "Detecting location…";
      case "acquired":
        return `Location acquired (accuracy ±${Math.round(
          state.accuracyMeters
        )} m).`;
      case "denied":
        return "Location permission was denied.";
      case "unavailable":
        return "Your location is currently unavailable.";
      case "timeout":
        return "Location request timed out. Try again.";
      case "unsupported":
        return "This browser does not support geolocation.";
    }
  })();

  return (
    <div className="space-y-2">
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {statusLabel}
      </div>
      {state.kind === "acquired" ? (
        <p className="text-xs text-muted-foreground">
          The server verifies you are inside the work-location geofence before
          recording attendance.
        </p>
      ) : null}
      {state.kind === "acquired" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestLocation}
          disabled={disabled}
        >
          Refresh location
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestLocation}
          disabled={disabled || state.kind === "requesting"}
        >
          {state.kind === "requesting" ? "Detecting…" : "Get GPS location"}
        </Button>
      )}
    </div>
  );
}
