"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import { classifyCameraErrorName } from "@/features/attendance/mobile-compat";

type CameraState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "active" }
  | { kind: "denied" }
  | { kind: "unsupported" }
  | { kind: "unavailable" }
  | { kind: "error"; message: string };

export const FACE_CAPTURE_JPEG_QUALITY = 0.85;
export const FACE_CAPTURE_MAX_DIMENSION = 800;

export interface FaceEnrollmentCameraProps {
  onCaptured: (blob: Blob) => void;
  onCancel: () => void;
  disabled?: boolean;
}

/**
 * One-shot face enrollment camera (Phase 10.2).
 *
 * Reuses the proven Phase 9.7 camera lifecycle rules: camera starts only after
 * an explicit user action, the stream stops when the app is hidden/backgrounded
 * or on unmount, nothing is recorded continuously, and a single JPEG frame is
 * produced only when the user presses "Ambil foto". The frame lives in memory
 * only; it is never written to browser storage or a query string.
 */
export function FaceEnrollmentCamera({
  onCaptured,
  onCancel,
  disabled = false,
}: FaceEnrollmentCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>({ kind: "idle" });
  const [capturing, setCapturing] = useState(false);

  function stopStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    if (
      !("mediaDevices" in navigator) ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setState({ kind: "unsupported" });
      return;
    }
    setState({ kind: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
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

  function cancelCamera() {
    stopStream();
    onCancel();
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || state.kind !== "active") return;
    setCapturing(true);
    try {
      const { videoWidth, videoHeight } = video;
      const scale = Math.min(
        1,
        FACE_CAPTURE_MAX_DIMENSION / Math.max(videoWidth, videoHeight)
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
          message: "Kamera tidak dapat dijalankan.",
        });
        return;
      }
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", FACE_CAPTURE_JPEG_QUALITY)
      );
      if (!blob || blob.size === 0) {
        setState({
          kind: "error",
          message: "Gambar wajah tidak valid. Silakan coba lagi.",
        });
        return;
      }
      stopStream();
      onCaptured(blob);
    } finally {
      setCapturing(false);
    }
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

  const statusLabel = (() => {
    switch (state.kind) {
      case "idle":
        return "Kamera belum dijalankan.";
      case "requesting":
        return "Meminta akses kamera…";
      case "active":
        return "Pratinjau kamera aktif. Atur posisi wajah, lalu ambil foto.";
      case "denied":
        return "Izin kamera diperlukan untuk melakukan enrollment wajah.";
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

      <div className="flex flex-wrap items-center gap-2">
        {state.kind !== "active" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startCamera}
            disabled={state.kind === "requesting" || disabled}
          >
            {state.kind === "requesting" ? "Memulai…" : "Mulai kamera"}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={captureFrame}
            disabled={capturing || disabled}
          >
            {capturing ? "Memproses…" : "Ambil foto"}
          </Button>
        )}
        {state.kind !== "idle" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={cancelCamera}
            disabled={capturing || disabled}
          >
            Batal
          </Button>
        ) : null}
      </div>
    </div>
  );
}
