"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { classifyCameraErrorName } from "./mobile-compat";

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "active" }
  | { kind: "denied" }
  | { kind: "unsupported" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

/**
 * Camera pre-flight component (Phase 6 + Phase 9.7 mobile compatibility).
 *
 * Purpose: confirm the device has a usable camera and that the user grants
 * permission — as an explicit user action. The stream is shown live only,
 * NEVER recorded, uploaded or persisted, and it is stopped on unmount AND when
 * the app is hidden/backgrounded (no stale live streams).
 *
 * IMPORTANT: a visible camera stream is NOT proof of identity. Attendance
 * identity verification remains `not_configured` and is enforced server-side;
 * this component contributes no verification result.
 */
export function AttendanceCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: "idle" });

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

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
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      const kind = classifyCameraErrorName(name || undefined);
      if (kind === "denied") {
        setState({ kind: "denied" });
      } else if (kind === "unavailable") {
        setState({ kind: "unavailable" });
      } else {
        setState({
          kind: "error",
          message: "Kamera tidak dapat dijalankan.",
        });
      }
    }
  }

  function stopCamera() {
    stopStream();
    setState({ kind: "idle" });
  }

  // Stop the live stream when the app is hidden/backgrounded and on unmount so
  // the camera never stays active without a visible page. No auto-start after
  // resume — the user must explicitly retry.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        stopStream();
        setState({ kind: "idle" });
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopStream();
    };
  }, []);

  const statusLabel = (() => {
    switch (state.kind) {
      case "idle":
        return "Kamera belum dijalankan.";
      case "requesting":
        return "Meminta akses kamera…";
      case "active":
        return "Pratinjau kamera aktif. Tidak ada yang direkam.";
      case "denied":
        return "Izin kamera ditolak.";
      case "unsupported":
        return "Browser ini tidak mendukung akses kamera.";
      case "unavailable":
        return "Tidak ada kamera yang tersedia di perangkat ini.";
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
          {state.kind === "requesting" ? "Memulai…" : "Gunakan kamera"}
        </Button>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={stopCamera}>
          Hentikan pratinjau
        </Button>
      )}
    </div>
  );
}
