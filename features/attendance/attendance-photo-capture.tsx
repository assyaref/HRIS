"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { classifyCameraErrorName } from "./mobile-compat";

/**
 * Attendance photo capture leaf (Phase 10.7C-56).
 *
 * One-shot JPEG capture modelled on the proven FaceEnrollmentCamera lifecycle:
 * - Camera starts only after an explicit user action and is previewed live.
 * - A single JPEG frame is produced only when the user presses "Ambil foto".
 * - The Blob is held TRANSIENTLY in component state and reported to the parent
 *   via `onPhotoChange`; it is never written to browser storage, cookies, URL
 *   parameters, a query string or the filesystem.
 * - No `toDataURL()`, no `data:image/*`, no `URL.createObjectURL()` — the Blob
 *   itself is the transport object (attached to FormData by the parent).
 * - Camera tracks are stopped after capture/cancel/unmount and when the page
 *   becomes hidden (no background camera, no continuous frame capture).
 *
 * A captured photo is PRESENCE EVIDENCE ONLY: it never implies identity
 * verification, geofence success, or authorization — all server decisions.
 */

export const ATTENDANCE_PHOTO_CAPTURE_JPEG_QUALITY = 0.85;
/** Smallest resolution that keeps useful visual evidence under the 900 KB cap. */
export const ATTENDANCE_PHOTO_CAPTURE_MAX_DIMENSION = 640;
export const ATTENDANCE_PHOTO_CAPTURE_FILENAME = "attendance-check-in.jpg";

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "active" }
  | { kind: "denied" }
  | { kind: "unsupported" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export interface AttendancePhotoCaptureProps {
  /** Called with the freshly captured Blob, or `null` when cleared/retaken. */
  onPhotoChange: (blob: Blob | null) => void;
  disabled?: boolean;
}

export function AttendancePhotoCapture({
  onPhotoChange,
  disabled = false,
}: AttendancePhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: "idle" });
  const [capturing, setCapturing] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);

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
        setState({ kind: "error", message: "Kamera tidak dapat dijalankan." });
      }
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || state.kind !== "active") return;
    setCapturing(true);
    try {
      const { videoWidth, videoHeight } = video;
      const scale = Math.min(
        1,
        ATTENDANCE_PHOTO_CAPTURE_MAX_DIMENSION /
          Math.max(videoWidth, videoHeight)
      );
      const width = Math.max(1, Math.round(videoWidth * scale));
      const height = Math.max(1, Math.round(videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        setState({
          kind: "error",
          message: "Kamera tidak dapat digunakan untuk mengambil foto.",
        });
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(
          resolve,
          "image/jpeg",
          ATTENDANCE_PHOTO_CAPTURE_JPEG_QUALITY
        )
      );
      if (!blob || blob.size === 0) {
        setState({
          kind: "error",
          message: "Foto kehadiran tidak valid. Silakan coba lagi.",
        });
        return;
      }
      stopStream();
      setState({ kind: "idle" });
      setCapturedBlob(blob);
      onPhotoChange(blob);
    } finally {
      setCapturing(false);
    }
  }

  function clearCaptured() {
    stopStream();
    setCapturedBlob(null);
    setState({ kind: "idle" });
    onPhotoChange(null);
  }

  function cancelCamera() {
    stopStream();
    setState({ kind: "idle" });
  }

  // Stop the live stream when the app is hidden/backgrounded and on unmount.
  // The camera never auto-starts after resume; the user must retry explicitly.
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

  const busy = capturing;

  return (
    <div className="space-y-3">
      {capturedBlob ? (
        <div className="space-y-3">
          <p aria-live="polite" className="text-sm text-muted-foreground">
            Foto kehadiran berhasil diambil. Foto ini hanya bukti kehadiran dan
            tidak digunakan sebagai verifikasi wajah.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={clearCaptured}
            disabled={disabled}
          >
            Ambil ulang foto
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div aria-live="polite" className="text-sm text-muted-foreground">
            {(() => {
              switch (state.kind) {
                case "idle":
                  return "Belum ada foto kehadiran. Mulai kamera lalu ambil foto.";
                case "requesting":
                  return "Meminta akses kamera…";
                case "active":
                  return "Pratinjau kamera aktif.";
                case "denied":
                  return "Izin kamera ditolak.";
                case "unsupported":
                  return "Browser ini tidak mendukung akses kamera.";
                case "unavailable":
                  return "Tidak ada kamera yang tersedia di perangkat ini.";
                case "error":
                  return state.message;
              }
            })()}
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

          <div className="flex flex-wrap items-center gap-2">
            {state.kind !== "active" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void startCamera()}
                disabled={state.kind === "requesting" || disabled}
              >
                {state.kind === "requesting" ? "Memulai…" : "Mulai kamera"}
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => void captureFrame()}
                disabled={busy || disabled}
              >
                {busy ? "Memproses…" : "Ambil Foto"}
              </Button>
            )}
            {state.kind !== "idle" ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelCamera}
                disabled={busy || disabled}
              >
                Batal
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
