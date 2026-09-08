"use client";

import { useEffect, useRef, useState } from "react";

type PhotoStatus = "loading" | "available" | "unavailable" | "error";

export interface AttendancePhotoViewProps {
  /** Server-validated attendance record id (path segment of the photo route). */
  attendanceId: string;
}

/**
 * PHASE 10.7C-57 — Management/HR same-day attendance photo viewer.
 *
 * Renders the temporary attendance photo for the attendance detail page.
 * This is VIEW ONLY and read-only:
 * - The browser performs an authenticated GET (session cookie) to
 *   `/api/attendance/{attendanceId}/photo` with `cache: "no-store"`.
 * - The server authorizes ATTENDANCE_MANAGE, resolves the session
 *   organization, and enforces `expires_at > now()` — the client NEVER
 *   decides availability.
 * - Response bytes are turned into an EPHEMERAL object URL strictly for
 *   rendering and are revoked on unmount/replacement. Nothing is persisted:
 *   no localStorage/sessionStorage/IndexedDB, no query parameters, no logs.
 *
 * Security: this component never uses toDataURL/data URL/Base64 transport and
 * never exposes internal photo ids, byte arrays or storage paths.
 */

export function AttendancePhotoView({
  attendanceId,
}: AttendancePhotoViewProps) {
  const [status, setStatus] = useState<PhotoStatus>("loading");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadPhoto() {
      try {
        const response = await fetch(
          `/api/attendance/${encodeURIComponent(attendanceId)}/photo`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          // 401/403/404 all surface the same safe message.
          if (active) setStatus("unavailable");
          return;
        }
        const blob = await response.blob();
        if (!active) return;
        const nextUrl = URL.createObjectURL(blob);
        objectUrlRef.current = nextUrl;
        setImageUrl(nextUrl);
        setStatus("available");
      } catch {
        if (active) setStatus("error");
      }
    }

    void loadPhoto();

    return () => {
      active = false;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [attendanceId]);

  if (status === "loading") {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Memuat foto kehadiran…
      </p>
    );
  }

  if (status === "unavailable") {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Foto kehadiran sudah tidak tersedia.
      </p>
    );
  }

  if (status === "error" || !imageUrl) {
    return (
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Foto kehadiran tidak dapat dimuat.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- ephemeral object URL render */}
      <img
        src={imageUrl}
        alt="Foto kehadiran"
        className="max-h-80 w-auto max-w-full rounded-md border border-border"
      />
      <p className="text-xs text-muted-foreground">
        Foto hanya tersedia sampai akhir hari kerja dan tidak digunakan sebagai
        verifikasi wajah.
      </p>
    </div>
  );
}
