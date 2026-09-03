"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "active" }
  | { kind: "denied" }
  | { kind: "unsupported" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

/**
 * Camera pre-flight component (Phase 6).
 *
 * Purpose: confirm the device has a usable camera and that the user grants
 * permission — as an explicit user action. The stream is shown live only,
 * NEVER recorded, uploaded or persisted, and it is stopped on unmount.
 *
 * IMPORTANT: a visible camera stream is NOT proof of identity. Attendance
 * identity verification remains `not_configured` in Phase 6 and is enforced
 * server-side; this component contributes no verification result.
 */
export function AttendanceCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: "idle" });

  async function startCamera() {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "unsupported" });
      return;
    }
    setState({ kind: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setState({ kind: "active" });
    } catch (error) {
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState({ kind: "denied" });
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
        setState({ kind: "unavailable" });
      } else if (name === "NotReadableError") {
        setState({ kind: "unavailable" });
      } else {
        setState({
          kind: "error",
          message: "The camera could not be started.",
        });
      }
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState({ kind: "idle" });
  }

  useEffect(() => stopCamera, []);

  const statusLabel = (() => {
    switch (state.kind) {
      case "idle":
        return "Camera not started.";
      case "requesting":
        return "Requesting camera…";
      case "active":
        return "Camera preview active. Nothing is recorded.";
      case "denied":
        return "Camera permission was denied.";
      case "unsupported":
        return "This browser does not support camera access.";
      case "unavailable":
        return "No camera is available on this device.";
      case "error":
        return state.message;
    }
  })();

  return (
    <div className="space-y-3">
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {statusLabel}
      </div>

      {state.kind === "active" ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="aspect-video w-full max-w-sm rounded-md border border-border bg-black"
        />
      ) : null}

      {state.kind !== "active" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={startCamera}
          disabled={state.kind === "requesting"}
        >
          {state.kind === "requesting" ? "Starting…" : "Use camera"}
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={stopCamera}>
          Stop preview
        </Button>
      )}
    </div>
  );
}
