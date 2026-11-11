"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { HrisIcon } from "@/components/layout/icons";
import { useShell } from "@/components/layout/shell-context";
import { createTabTrap, getFocusableElements } from "@/lib/utils/focus";
import { cn } from "@/lib/utils/cn";

import { checkInAction, checkOutAction } from "./actions";
import {
  ATTENDANCE_PHOTO_CAPTURE_FILENAME,
  ATTENDANCE_PHOTO_CAPTURE_JPEG_QUALITY,
  ATTENDANCE_PHOTO_CAPTURE_MAX_DIMENSION,
} from "./attendance-photo-capture";
import {
  acquireGpsPosition,
  GPS_ENABLE_HIGH_ACCURACY,
  GPS_MAXIMUM_AGE_MS,
  GPS_TIMEOUT_MS,
  MAX_GPS_ATTEMPTS,
  type GpsPositionLike,
} from "./gps";
import { classifyCameraErrorName } from "./mobile-compat";
import { NETWORK_REQUIRED_MESSAGE, isBrowserOffline } from "./mobile-compat";
import {
  loadAttendanceSheetAction,
  type AttendanceSheetData,
} from "./sheet.actions";

/**
 * Face-attendance bottom sheet ("Absensi Kehadiran").
 *
 * Opened by the ABSEN button in the bottom navigation and by the home
 * "Absen Sekarang" card. It is a presentation layer over the EXISTING
 * attendance contract:
 * - Today's state, the eligible work locations and the permissions come from
 *   `loadAttendanceSheetAction` (server, session-resolved) when the sheet
 *   opens — never from the client.
 * - Check-in sends the same FormData the attendance page sends (project,
 *   work location, GPS fix or issue, one JPEG presence photo captured from the
 *   live preview at confirmation). Check-out sends the GPS payload only.
 * - The geofence decision, timestamps and identity policy stay server-side.
 *   The photo is PRESENCE EVIDENCE: the "Wajah Terdeteksi" badge is a local
 *   framing aid (browser FaceDetector when available) and never a
 *   verification result.
 * - Camera rules: starts when the user opens the sheet (explicit tap), is
 *   previewed live only, stopped on close / background / unmount; the single
 *   frame lives in memory and travels only as a FormData part.
 */

type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unsupported"
  | "unavailable"
  | "error";

type GpsStatus =
  | { kind: "idle" }
  | { kind: "requesting"; attempt: number }
  | { kind: "obtained"; latitude: number; longitude: number; accuracyMeters: number }
  | { kind: "denied" }
  | { kind: "unavailable" }
  | { kind: "timeout" }
  | { kind: "unsupported" };

type FaceFraming = "unsupported" | "searching" | "detected";

/** Minimal typing for the Shape Detection API (Chromium only). */
interface BrowserFaceDetector {
  detect(source: HTMLVideoElement): Promise<unknown[]>;
}
interface FaceDetectorWindow extends Window {
  FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetector;
}

function subscribeToSeconds(onTick: () => void): () => void {
  const timer = window.setInterval(onTick, 1000);
  return () => window.clearInterval(timer);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function CornerBrackets() {
  const base =
    "absolute size-9 border-white/95 drop-shadow-[0_0_6px_rgb(59_130_246/0.9)]";
  return (
    <>
      <span aria-hidden="true" className={cn(base, "top-[16%] left-[22%] rounded-tl-xl border-t-4 border-l-4")} />
      <span aria-hidden="true" className={cn(base, "top-[16%] right-[22%] rounded-tr-xl border-t-4 border-r-4")} />
      <span aria-hidden="true" className={cn(base, "bottom-[18%] left-[22%] rounded-bl-xl border-b-4 border-l-4")} />
      <span aria-hidden="true" className={cn(base, "right-[22%] bottom-[18%] rounded-br-xl border-r-4 border-b-4")} />
    </>
  );
}

function InfoChip({
  icon,
  label,
  children,
  className,
}: {
  icon: "map-pin" | "target" | "clock";
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("hris-card min-w-0 rounded-[18px] px-3 py-3", className)}>
      <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <HrisIcon name={icon} className="size-4 shrink-0 text-primary" />
        <span className="truncate">{label}</span>
      </p>
      <div className="mt-1 text-[17px] leading-tight font-bold text-foreground">{children}</div>
    </div>
  );
}

export function AttendanceSheet() {
  const { attendanceSheetOpen, closeAttendanceSheet, profile } = useShell();
  if (!attendanceSheetOpen) return null;
  return <AttendanceSheetDialog onClose={closeAttendanceSheet} organizationLogoUrl={profile.organizationLogoUrl ?? null} organizationName={profile.organizationName} />;
}

function AttendanceSheetDialog({
  onClose,
  organizationLogoUrl,
  organizationName,
}: {
  onClose: () => void;
  organizationLogoUrl: string | null;
  organizationName: string | null;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gpsBusyRef = useRef(false);

  const [data, setData] = useState<AttendanceSheetData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [camera, setCamera] = useState<CameraStatus>("idle");
  const [framing, setFraming] = useState<FaceFraming>("unsupported");
  const [gps, setGps] = useState<GpsStatus>({ kind: "idle" });
  const [selectedWorkLocationId, setSelectedWorkLocationId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [done, setDone] = useState<{ title: string; text: string } | null>(null);

  // Live clock for the "Waktu Absensi" chip (device time zone).
  const nowSeconds = useSyncExternalStore(
    subscribeToSeconds,
    () => Math.floor(Date.now() / 1000),
    () => 0
  );
  const now = nowSeconds === 0 ? null : new Date(nowSeconds * 1000);

  /* ---------- camera ---------- */
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const startCamera = useCallback(async () => {
    if (!("mediaDevices" in navigator) || !navigator.mediaDevices?.getUserMedia) {
      setCamera("unsupported");
      return;
    }
    setCamera("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        void video.play().catch(() => {});
      }
      setCamera("active");
    } catch (error) {
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String((error as { name?: unknown }).name ?? "")
          : "";
      const kind = classifyCameraErrorName(name || undefined);
      setCamera(kind === "denied" ? "denied" : kind === "unavailable" ? "unavailable" : "error");
    }
  }, []);

  /* ---------- GPS (one-shot, bounded retry; server decides the geofence) ---------- */
  const requestGps = useCallback(async () => {
    if (gpsBusyRef.current) return;
    if (!("geolocation" in navigator)) {
      setGps({ kind: "unsupported" });
      return;
    }
    gpsBusyRef.current = true;
    setGps({ kind: "requesting", attempt: 1 });
    const result = await acquireGpsPosition({
      getPosition: () =>
        new Promise<GpsPositionLike>((resolve, reject) => {
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
        }),
      maxAttempts: MAX_GPS_ATTEMPTS,
      onRetry: (attempt) => setGps({ kind: "requesting", attempt }),
    });
    gpsBusyRef.current = false;
    if (result.status === "obtained") {
      setGps({ kind: "obtained", ...result.fix });
    } else if (result.status === "denied") {
      setGps({ kind: "denied" });
    } else if (result.status === "timeout") {
      setGps({ kind: "timeout" });
    } else {
      setGps({ kind: "unavailable" });
    }
  }, []);

  /* ---------- open: load state, start camera + GPS ---------- */
  useEffect(() => {
    let cancelled = false;
    loadAttendanceSheetAction()
      .then((result) => {
        if (cancelled) return;
        setData(result);
        if (result.ok) setSelectedWorkLocationId(result.options[0]?.workLocationId ?? "");
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    // Deferred one tick so the effect body itself never sets state synchronously.
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      void startCamera();
      void requestGps();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [startCamera, requestGps]);

  // Stop the preview when the app is hidden/backgrounded and on unmount.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        stopStream();
        setCamera("idle");
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopStream();
    };
  }, [stopStream]);

  // Framing aid: Chromium's FaceDetector, when present. Never a verification.
  // State changes only happen inside the interval callback (external system).
  useEffect(() => {
    if (camera !== "active") return;
    const Detector = (window as FaceDetectorWindow).FaceDetector;
    if (!Detector) return;
    let detector: BrowserFaceDetector | null = null;
    let cancelled = false;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      if (!detector) {
        try {
          detector = new Detector({ fastMode: true, maxDetectedFaces: 1 });
        } catch {
          window.clearInterval(timer);
          return;
        }
      }
      detector
        .detect(video)
        .then((faces) => {
          if (!cancelled) setFraming(faces.length > 0 ? "detected" : "searching");
        })
        .catch(() => {
          if (!cancelled) {
            window.clearInterval(timer);
            setFraming("unsupported");
          }
        });
    }, 700);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [camera]);

  /* ---------- dialog chrome: focus trap, Escape, scroll lock ---------- */
  useEffect(() => {
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const trapTab = createTabTrap(panel);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      trapTab(event);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => getFocusableElements(panel)[0]?.focus());
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  /* ---------- derived ---------- */
  const ready = data?.ok ? data : null;
  const options = useMemo(() => ready?.options ?? [], [ready]);
  const currentOption =
    options.find((option) => option.workLocationId === selectedWorkLocationId) ?? options[0];
  const canMasuk = Boolean(ready && ready.state === "NOT_CHECKED_IN" && ready.canCheckIn && options.length > 0);
  const canPulang = Boolean(ready && ready.state === "CHECKED_IN" && ready.canCheckOut);
  const mode: "check_in" | "check_out" | null = canMasuk ? "check_in" : canPulang ? "check_out" : null;

  const blockedReason = (() => {
    if (!ready) return null;
    if (mode) return null;
    switch (ready.state) {
      case "CHECKED_OUT":
        return "Absensi hari ini sudah selesai.";
      case "CHECKED_IN":
        return "Anda tidak memiliki izin absensi pulang.";
      case "REJECTED":
        return "Absensi hari ini ditolak. Hubungi HR.";
      case "UNAVAILABLE":
        return "Profil kepegawaian Anda tidak aktif.";
      default:
        if (!ready.canCheckIn) return "Anda tidak memiliki izin absensi masuk.";
        return "Belum ada penugasan proyek dengan lokasi kerja aktif. Hubungi administrator.";
    }
  })();

  const locationName =
    mode === "check_out"
      ? (ready?.openLocationName ?? "—")
      : (currentOption?.workLocationName ?? "—");

  const gpsLabel = (() => {
    switch (gps.kind) {
      case "obtained":
        return `${Math.round(gps.accuracyMeters)} m`;
      case "requesting":
        return gps.attempt > 1 ? `Mencoba ${gps.attempt}/${MAX_GPS_ATTEMPTS}…` : "Mencari…";
      case "denied":
        return "Ditolak";
      case "timeout":
        return "Tidak terjawab";
      case "unsupported":
        return "Tidak didukung";
      case "unavailable":
        return "Tidak tersedia";
      default:
        return "—";
    }
  })();

  const timeLabel = now ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` : "--:--:--";
  const dateLabel = now
    ? new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric" }).format(now)
    : "";

  const gpsResolved = gps.kind === "obtained" || gps.kind === "denied" || gps.kind === "unavailable" || gps.kind === "timeout" || gps.kind === "unsupported";
  const submitEnabled =
    Boolean(mode) && gpsResolved && !pending && (mode === "check_out" || camera === "active");

  const badge = (() => {
    switch (camera) {
      case "active":
        if (framing === "detected") return { tone: "bg-[#16A34A] text-white", icon: "check" as const, text: "Wajah Terdeteksi" };
        if (framing === "searching") return { tone: "bg-[#F59E0B] text-white", icon: "face" as const, text: "Posisikan wajah di bingkai" };
        return { tone: "bg-primary text-white", icon: "camera" as const, text: "Kamera Aktif" };
      case "requesting":
        return { tone: "bg-slate-700 text-white", icon: "camera" as const, text: "Menyalakan kamera…" };
      default:
        return null;
    }
  })();

  const cameraProblem = (() => {
    switch (camera) {
      case "denied":
        return "Izin kamera ditolak. Aktifkan akses kamera untuk situs ini, lalu coba lagi.";
      case "unsupported":
        return "Browser ini tidak mendukung akses kamera.";
      case "unavailable":
        return "Tidak ada kamera yang tersedia di perangkat ini.";
      case "error":
        return "Kamera tidak dapat dijalankan.";
      case "idle":
        return "Kamera belum dinyalakan.";
      default:
        return null;
    }
  })();

  /* ---------- submit ---------- */
  function buildLocationPayload() {
    if (gps.kind === "obtained") {
      return {
        status: "obtained" as const,
        latitude: gps.latitude,
        longitude: gps.longitude,
        accuracyMeters: gps.accuracyMeters,
      };
    }
    if (gps.kind === "denied") return { status: "denied" as const };
    if (gps.kind === "unavailable" || gps.kind === "timeout" || gps.kind === "unsupported") {
      return { status: "unavailable" as const };
    }
    return null;
  }

  async function captureFrame(): Promise<Blob | null> {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const { videoWidth, videoHeight } = video;
    const scale = Math.min(1, ATTENDANCE_PHOTO_CAPTURE_MAX_DIMENSION / Math.max(videoWidth, videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(videoWidth * scale));
    canvas.height = Math.max(1, Math.round(videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", ATTENDANCE_PHOTO_CAPTURE_JPEG_QUALITY)
    );
    return blob && blob.size > 0 ? blob : null;
  }

  function submit() {
    if (!mode || pending) return;
    if (typeof navigator !== "undefined" && isBrowserOffline(navigator.onLine)) {
      setMessage({ tone: "error", text: NETWORK_REQUIRED_MESSAGE });
      return;
    }
    const locationPayload = buildLocationPayload();
    if (!locationPayload) {
      setMessage({ tone: "error", text: "Menunggu lokasi GPS Anda…" });
      return;
    }
    if (mode === "check_in" && (!currentOption || camera !== "active")) {
      setMessage({ tone: "error", text: "Kamera diperlukan untuk mengambil foto kehadiran." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      try {
        let result;
        if (mode === "check_in") {
          const photo = await captureFrame();
          if (!photo || !currentOption) {
            setMessage({ tone: "error", text: "Foto kehadiran tidak valid. Silakan coba lagi." });
            return;
          }
          const formData = new FormData();
          formData.append("projectId", currentOption.projectId);
          formData.append("workLocationId", currentOption.workLocationId);
          formData.append("location", JSON.stringify(locationPayload));
          formData.append("photo", photo, ATTENDANCE_PHOTO_CAPTURE_FILENAME);
          result = await checkInAction(formData);
        } else {
          result = await checkOutAction({ location: locationPayload });
        }
        if (result.ok) {
          stopStream();
          setCamera("idle");
          setDone({
            title: mode === "check_in" ? "Absensi masuk tercatat" : "Absensi pulang tercatat",
            text: result.message,
          });
          router.refresh();
        } else {
          setMessage({ tone: "error", text: result.message });
        }
      } catch {
        setMessage({ tone: "error", text: NETWORK_REQUIRED_MESSAGE });
      }
    });
  }

  const confirmLabel = mode === "check_out" ? "Konfirmasi Absensi Pulang" : "Konfirmasi Absensi Masuk";

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="attendance-sheet-title"
        aria-describedby="attendance-sheet-description"
        className="absolute inset-x-0 bottom-0 flex max-h-[94svh] flex-col rounded-t-[30px] bg-background shadow-[0_-24px_60px_-30px_rgb(2_6_23/0.6)] outline-none sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[30px]"
      >
        <span aria-hidden="true" className="mx-auto mt-2.5 h-1.5 w-12 shrink-0 rounded-full bg-slate-300/80 sm:hidden" />

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-6 sm:px-5">
          {/* Header */}
          <div className="flex items-start gap-3">
            <span className="flex size-14 shrink-0 items-center justify-center text-primary">
              <HrisIcon name="face" className="size-12" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <h2 id="attendance-sheet-title" className="text-[22px] leading-tight font-extrabold tracking-tight text-foreground">
                Absensi Kehadiran
              </h2>
              <p id="attendance-sheet-description" className="mt-0.5 text-[15px] text-muted-foreground">
                Verifikasi wajah untuk mencatat absensi
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none dark:hover:bg-slate-700"
            >
              <HrisIcon name="close" className="size-6" />
            </button>
          </div>

          {done ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-[22px] bg-[#EAF9EF] px-5 py-8 text-center dark:bg-[#12301F]">
              <span className="flex size-16 items-center justify-center rounded-full bg-[#16A34A] text-white">
                <HrisIcon name="check" className="size-9" />
              </span>
              <p className="text-lg font-bold text-foreground">{done.title}</p>
              <p className="text-sm text-muted-foreground" role="status">{done.text}</p>
              <p className="text-sm font-semibold text-foreground tabular-nums">{timeLabel} · {dateLabel}</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 inline-flex min-h-12 items-center justify-center rounded-full bg-primary px-8 text-sm font-bold text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Selesai
              </button>
            </div>
          ) : (
            <>
              {/* Camera preview */}
              <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-[24px] bg-slate-900 ring-1 ring-black/5">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={cn(
                    "size-full -scale-x-100 object-cover",
                    camera === "active" ? "" : "hidden"
                  )}
                />
                {camera === "active" || camera === "requesting" ? <CornerBrackets /> : null}
                {camera !== "active" && camera !== "requesting" ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white">
                    <HrisIcon name="camera" className="size-10 text-white/80" />
                    <p className="text-sm text-white/85" aria-live="polite">{cameraProblem}</p>
                    {camera !== "unsupported" && camera !== "unavailable" ? (
                      <button
                        type="button"
                        onClick={() => void startCamera()}
                        className="inline-flex min-h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-bold text-primary focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                      >
                        Nyalakan Kamera
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {badge ? (
                  <span
                    aria-live="polite"
                    className={cn(
                      "absolute bottom-4 left-1/2 inline-flex -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold whitespace-nowrap shadow-lg",
                      badge.tone
                    )}
                  >
                    <HrisIcon name={badge.icon} className="size-5" />
                    {badge.text}
                  </span>
                ) : null}
                {organizationLogoUrl && organizationName ? (
                  // Authenticated image route; next/image cannot optimise it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={organizationLogoUrl}
                    alt={organizationName}
                    className="absolute right-3 bottom-3 h-5 w-auto max-w-[6rem] rounded-md bg-white/90 px-1.5 py-0.5 object-contain"
                  />
                ) : null}
              </div>

              {/* Facts */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <InfoChip icon="map-pin" label="Lokasi">
                  {mode === "check_in" && options.length > 1 ? (
                    <select
                      aria-label="Pilih lokasi kerja"
                      value={selectedWorkLocationId}
                      onChange={(event) => setSelectedWorkLocationId(event.target.value)}
                      disabled={pending}
                      className="w-full max-w-full truncate bg-transparent text-[16px] font-bold text-foreground outline-none"
                    >
                      {options.map((option) => (
                        <option key={option.workLocationId} value={option.workLocationId}>
                          {option.workLocationName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="block truncate" title={locationName}>{locationName}</span>
                  )}
                </InfoChip>
                <InfoChip icon="target" label="Akurasi GPS">
                  {gps.kind === "obtained" || gps.kind === "requesting" ? (
                    <span className="block truncate tabular-nums">{gpsLabel}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void requestGps()}
                      className="block max-w-full truncate text-left text-[15px] text-[#B45309] underline-offset-2 hover:underline"
                    >
                      {gpsLabel} · ulangi
                    </button>
                  )}
                </InfoChip>
                <InfoChip icon="clock" label="Waktu Absensi">
                  <span className="block tabular-nums" suppressHydrationWarning>{timeLabel}</span>
                  <span className="block text-[11px] font-medium text-muted-foreground" suppressHydrationWarning>{dateLabel}</span>
                </InfoChip>
              </div>

              {/* Type */}
              <p className="mt-4 text-[17px] font-bold text-foreground">Jenis Absensi</p>
              <div className="mt-2 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Jenis absensi">
                <TypeCard
                  label="Masuk"
                  icon="check-in"
                  tone="green"
                  selected={mode === "check_in"}
                  disabled={!canMasuk}
                />
                <TypeCard
                  label="Pulang"
                  icon="check-out"
                  tone="red"
                  selected={mode === "check_out"}
                  disabled={!canPulang}
                />
              </div>

              {/* Status / errors */}
              {!data && !loadFailed ? (
                <p className="mt-3 text-sm text-muted-foreground" aria-live="polite">Memuat status absensi…</p>
              ) : null}
              {loadFailed ? (
                <p role="alert" className="mt-3 rounded-xl bg-surface-danger px-3 py-2 text-sm text-danger">
                  Status absensi tidak dapat dimuat. Periksa koneksi lalu buka kembali.
                </p>
              ) : null}
              {data && !data.ok ? (
                <p role="alert" className="mt-3 rounded-xl bg-surface-danger px-3 py-2 text-sm text-danger">{data.message}</p>
              ) : null}
              {blockedReason ? (
                <p role="status" className="mt-3 rounded-xl bg-surface-primary px-3 py-2 text-sm text-foreground">
                  {blockedReason}
                  {ready?.checkInLabel ? ` Masuk ${ready.checkInLabel}` : ""}
                  {ready?.checkOutLabel ? ` · Pulang ${ready.checkOutLabel}` : ""}
                </p>
              ) : null}
              {message ? (
                <p
                  role={message.tone === "error" ? "alert" : "status"}
                  className={cn(
                    "mt-3 rounded-xl px-3 py-2 text-sm",
                    message.tone === "error" ? "bg-surface-danger text-danger" : "bg-surface-success text-success"
                  )}
                >
                  {message.text}
                </p>
              ) : null}

              <button
                type="button"
                onClick={submit}
                disabled={!submitEnabled}
                className="hris-band mt-4 flex min-h-14 w-full items-center justify-center gap-3 rounded-full px-5 text-[17px] font-bold text-white shadow-[0_16px_30px_-16px_rgb(11_92_197/0.9)] transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none enabled:active:scale-[0.99] disabled:opacity-50"
              >
                <HrisIcon name="fingerprint" className="size-6" />
                {pending ? "Memproses…" : confirmLabel}
              </button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                {mode === "check_out"
                  ? "Pratinjau kamera tidak direkam saat pulang. Lokasi dan waktu diverifikasi oleh server."
                  : "Foto diambil saat konfirmasi sebagai bukti kehadiran. Lokasi dan waktu diverifikasi oleh server."}
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TypeCard({
  label,
  icon,
  tone,
  selected,
  disabled,
}: {
  label: string;
  icon: "check-in" | "check-out";
  tone: "green" | "red";
  selected: boolean;
  disabled: boolean;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      aria-disabled={disabled || undefined}
      className={cn(
        "relative flex min-h-[104px] flex-col items-center justify-center gap-2 rounded-[20px] border-2 bg-card text-[19px] font-bold text-foreground transition-colors",
        selected
          ? tone === "green"
            ? "border-[#22C55E] bg-[#EAF9EF] dark:bg-[#12301F]"
            : "border-[#EF4444] bg-[#FEECEC] dark:bg-[#3A1618]"
          : "border-[var(--card-border)]",
        disabled && !selected && "opacity-50"
      )}
    >
      {selected ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-white",
            tone === "green" ? "bg-[#16A34A]" : "bg-[#DC2626]"
          )}
        >
          <HrisIcon name="check" className="size-4" />
        </span>
      ) : null}
      <HrisIcon
        name={icon}
        className={cn("size-9", tone === "green" ? "text-[#16A34A]" : "text-[#DC2626]")}
      />
      {label}
    </div>
  );
}
