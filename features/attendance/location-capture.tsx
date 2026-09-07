"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  acquireGpsPosition,
  GPS_ENABLE_HIGH_ACCURACY,
  GPS_MAXIMUM_AGE_MS,
  GPS_TIMEOUT_MS,
  isGpsAccuracyPoor,
  MAX_GPS_ATTEMPTS,
  type GpsPositionLike,
} from "./gps";

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
  | { kind: "retrying"; attempt: number }
  | { kind: "acquired"; accuracyMeters: number }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" }
  | { kind: "unsupported" };

/**
 * GPS capture with bounded retry and accuracy-aware UX (Phase 9.3).
 *
 * - GPS is requested only on an explicit user click — a single-shot
 *   `getCurrentPosition` flow with NO background/continuous tracking.
 * - Timeout auto-retries up to `MAX_GPS_ATTEMPTS` with a short backoff;
 *   permission-denied and position-unavailable are terminal (no repeated
 *   prompts).
 * - Only raw latitude/longitude/accuracy are sent upward. The server performs
 *   the geofence calculation — the client never claims to be "inside" and
 *   accuracy feedback here is UX only.
 */
export function LocationCapture({
  onAcquired,
  onIssue,
  disabled,
}: LocationCaptureProps) {
  const [state, setState] = useState<LocationState>({ kind: "idle" });
  const mountedRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    function handleVisibilityChange() {
      // If the app is hidden/backgrounded while a GPS request is pending,
      // reset the transient state to idle. No auto-restart after resume — the
      // user must explicitly request the location again.
      if (document.hidden && busyRef.current) {
        busyRef.current = false;
        safeSetState({ kind: "idle" });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  function safeSetState(next: LocationState) {
    if (mountedRef.current) {
      setState(next);
    }
  }

  function getBrowserPosition(): Promise<GpsPositionLike> {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            coords: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          }),
        (error) => reject(error),
        {
          enableHighAccuracy: GPS_ENABLE_HIGH_ACCURACY,
          timeout: GPS_TIMEOUT_MS,
          maximumAge: GPS_MAXIMUM_AGE_MS,
        }
      );
    });
  }

  async function requestLocation() {
    if (disabled || busyRef.current) return;

    if (!("geolocation" in navigator)) {
      safeSetState({ kind: "unsupported" });
      return;
    }

    busyRef.current = true;
    safeSetState({ kind: "requesting" });

    const result = await acquireGpsPosition({
      getPosition: getBrowserPosition,
      maxAttempts: MAX_GPS_ATTEMPTS,
      onRetry: (attempt) => safeSetState({ kind: "retrying", attempt }),
    });

    busyRef.current = false;

    // A fix that resolves after the user backgrounded the app is not surfaced
    // automatically; the user must explicitly request location again.
    if (document.hidden) {
      safeSetState({ kind: "idle" });
      return;
    }

    if (result.status === "obtained") {
      const { latitude, longitude, accuracyMeters } = result.fix;
      safeSetState({ kind: "acquired", accuracyMeters });
      onAcquired({ latitude, longitude, accuracyMeters });
      return;
    }
    if (result.status === "denied") {
      safeSetState({ kind: "denied" });
      onIssue("denied");
      return;
    }
    if (result.status === "timeout") {
      safeSetState({ kind: "timeout" });
      onIssue("timeout");
      return;
    }
    safeSetState({ kind: "unavailable" });
    onIssue("unavailable");
  }

  const busy = state.kind === "requesting" || state.kind === "retrying";
  const poorAccuracy =
    state.kind === "acquired" && isGpsAccuracyPoor(state.accuracyMeters);

  const statusLabel = (() => {
    switch (state.kind) {
      case "idle":
        return "Lokasi belum diambil.";
      case "requesting":
        return "Mengambil lokasi Anda…";
      case "retrying":
        return `Permintaan lokasi tidak terjawab. Mencoba ulang (percobaan ${state.attempt} dari ${MAX_GPS_ATTEMPTS})…`;
      case "acquired":
        return `Lokasi didapatkan (akurasi ±${Math.round(state.accuracyMeters)} m).`;
      case "denied":
        return "Izin lokasi ditolak.";
      case "unavailable":
        return "Lokasi Anda saat ini tidak tersedia.";
      case "timeout":
        return "Permintaan lokasi tidak terjawab. Silakan coba lagi.";
      case "unsupported":
        return "Browser ini tidak mendukung geolokasi.";
    }
  })();

  const guidance = (() => {
    switch (state.kind) {
      case "acquired":
        if (poorAccuracy) {
          return "Kualitas lokasi: Buruk. Server dapat menolak lokasi ini jika akurasi GPS melebihi batas yang diizinkan — coba segarkan lokasi di area terbuka.";
        }
        return "Kualitas lokasi: Baik. Server memverifikasi Anda berada di dalam area kerja sebelum mencatat absensi.";
      case "denied":
        return "Izin lokasi diperlukan untuk absensi. Aktifkan akses lokasi untuk situs ini di pengaturan browser/perangkat Anda, lalu coba lagi.";
      case "unavailable":
        return "Pindah ke area terbuka dengan pandangan jelas ke langit, aktifkan GPS/Wi-Fi, lalu coba lagi.";
      case "timeout":
        return "Perangkat tidak mengembalikan posisi tepat waktu. Periksa koneksi Anda dan coba lagi.";
      case "unsupported":
        return "Gunakan browser yang mendukung akses lokasi (konteks HTTPS yang aman) untuk melakukan absensi.";
      default:
        return null;
    }
  })();

  return (
    <div className="space-y-2">
      <div aria-live="polite" className="text-sm text-muted-foreground">
        {statusLabel}
      </div>
      {guidance ? (
        <p
          className={
            poorAccuracy
              ? "text-xs text-amber-700 dark:text-amber-400"
              : "text-xs text-muted-foreground"
          }
        >
          {guidance}
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
          Perbarui lokasi
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={requestLocation}
          disabled={disabled || busy}
        >
          {state.kind === "requesting"
            ? "Mendeteksi…"
            : state.kind === "retrying"
              ? `Mencoba ulang (${state.attempt}/${MAX_GPS_ATTEMPTS})…`
              : state.kind === "idle"
                ? "Ambil lokasi GPS"
                : "Coba lagi"}
        </Button>
      )}
    </div>
  );
}
