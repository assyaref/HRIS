/**
 * Attendance rejection reason presentation (Phase 9.4) — PURE module.
 *
 * Maps the EXISTING machine-readable rejection reasons (stored in
 * `attendance_events.reason` and produced by the server actions) to
 * deterministic Indonesian labels, tones and employee-facing messages.
 *
 * Rules:
 * - Machine-readable reason strings are NEVER rewritten here or elsewhere;
 *   this module only adds presentation on top of them.
 * - Messages are built from values the server already derived (distance,
 *   radius, GPS accuracy). A value that is absent is never fabricated — the
 *   message simply omits it instead of showing misleading data.
 * - Unknown reasons fall back to a safe, generic Indonesian message/label so
 *   the UI never leaks internal details or stack traces.
 */

/** Short Indonesian labels shown in badges and lists. */
export const REJECTION_REASON_LABELS: Record<string, string> = {
  outside_geofence: "Di Luar Area",
  poor_accuracy: "GPS Kurang Akurat",
  missing_accuracy: "Akurasi GPS Tidak Tersedia",
  geofence_not_configured: "Geofence Belum Dikonfigurasi",
  invalid_coordinates: "Koordinat Tidak Valid",
  denied: "Izin Lokasi Ditolak",
  location_permission_denied: "Izin Lokasi Ditolak",
  unavailable: "Lokasi Tidak Tersedia",
  location_unavailable: "Lokasi Tidak Tersedia",
  work_location_missing: "Lokasi Kerja Tidak Ditemukan",
  project_or_location_not_eligible: "Lokasi Tidak Tersedia",
  employee_inactive: "Karyawan Tidak Aktif",
  duplicate_check_in: "Absensi Ganda",
  identity_verification_failed: "Verifikasi Gagal",
  identity_verification_not_configured: "Verifikasi Belum Dikonfigurasi",
};

/** Complete Indonesian sentences used when no numeric context is available. */
const REJECTION_REASON_MESSAGES: Record<string, string> = {
  outside_geofence:
    "Anda berada di luar area kerja. Silakan berada di dalam area kerja dan coba lagi.",
  poor_accuracy:
    "Lokasi GPS kurang akurat. Silakan tunggu beberapa saat atau pindah ke area dengan sinyal GPS yang lebih baik, lalu coba lagi.",
  missing_accuracy:
    "Data akurasi GPS tidak tersedia. Silakan aktifkan GPS dan coba lagi.",
  geofence_not_configured:
    "Area kerja belum dikonfigurasi dengan lengkap. Silakan hubungi Management/HR.",
  invalid_coordinates:
    "Koordinat lokasi tidak valid. Silakan perbarui lokasi dan coba lagi.",
  denied:
    "Izin lokasi diperlukan untuk melakukan absensi. Aktifkan izin lokasi pada browser/perangkat Anda, kemudian coba lagi.",
  location_permission_denied:
    "Izin lokasi diperlukan untuk melakukan absensi. Aktifkan izin lokasi pada browser/perangkat Anda, kemudian coba lagi.",
  unavailable:
    "Lokasi tidak dapat ditentukan. Silakan pindah ke area terbuka dengan sinyal GPS yang baik, lalu coba lagi.",
  location_unavailable:
    "Lokasi tidak dapat ditentukan. Silakan pindah ke area terbuka dengan sinyal GPS yang baik, lalu coba lagi.",
  work_location_missing:
    "Lokasi kerja tidak ditemukan. Silakan hubungi Management/HR.",
  project_or_location_not_eligible:
    "Proyek atau lokasi kerja tidak tersedia untuk Anda. Silakan hubungi Management/HR.",
  employee_inactive: "Karyawan tidak aktif. Silakan hubungi Management/HR.",
  duplicate_check_in: "Anda sudah memiliki absensi yang sedang berjalan.",
  identity_verification_failed: "Verifikasi identitas gagal. Silakan coba lagi.",
  identity_verification_not_configured:
    "Verifikasi identitas belum dikonfigurasi.",
};

const UNKNOWN_LABEL = "Alasan Tidak Diketahui";
const UNKNOWN_MESSAGE =
  "Absensi tidak dapat diproses. Silakan coba lagi atau hubungi Management/HR.";

/** Indonesian short label for a machine reason (safe fallback for unknown). */
export function rejectionReasonLabel(
  reason: string | null | undefined
): string {
  if (!reason) return "—";
  return REJECTION_REASON_LABELS[reason] ?? UNKNOWN_LABEL;
}

/** Indonesian sentence for a machine reason when no numeric context exists. */
export function rejectionReasonMessage(
  reason: string | null | undefined
): string {
  if (!reason) return UNKNOWN_MESSAGE;
  return REJECTION_REASON_MESSAGES[reason] ?? UNKNOWN_MESSAGE;
}

/** Badge tone used by the UI (deterministic; safe fallback to outline). */
export type RejectionReasonTone = "destructive" | "secondary" | "outline";

export function rejectionReasonTone(
  reason: string | null | undefined
): RejectionReasonTone {
  if (!reason) return "outline";
  if (
    reason === "outside_geofence" ||
    reason === "poor_accuracy" ||
    reason === "invalid_coordinates" ||
    reason === "denied" ||
    reason === "location_permission_denied" ||
    reason === "identity_verification_failed"
  ) {
    return "destructive";
  }
  if (REJECTION_REASON_LABELS[reason]) return "secondary";
  return "outline";
}

export interface LocationRejectionContext {
  /** Server-derived great-circle distance to the work-location center. */
  distanceMeters?: number | null;
  /** Work-location geofence radius (server value). */
  radiusMeters?: number | null;
  /** Reported GPS accuracy (server-validated). */
  accuracyMeters?: number | null;
}

/**
 * Employee-facing Indonesian message for a rejection. Includes server-derived
 * numeric context ONLY when it is actually available; otherwise the relevant
 * clause is omitted (no misleading "Jarak/Radius/Akurasi" line).
 */
export function buildLocationRejectionMessage(
  reason: string,
  context: LocationRejectionContext = {}
): string {
  const distance =
    typeof context.distanceMeters === "number"
      ? Math.round(context.distanceMeters)
      : null;
  const radius =
    typeof context.radiusMeters === "number"
      ? Math.round(context.radiusMeters)
      : null;
  const accuracy =
    typeof context.accuracyMeters === "number"
      ? Math.round(context.accuracyMeters)
      : null;

  switch (reason) {
    case "outside_geofence": {
      if (distance !== null && radius !== null) {
        return `Anda berada di luar area kerja. Jarak Anda: ${distance} m, radius yang diizinkan: ${radius} m. Silakan berada di dalam area kerja dan coba lagi.`;
      }
      if (distance !== null) {
        return `Anda berada di luar area kerja. Jarak Anda: ${distance} m. Silakan berada di dalam area kerja dan coba lagi.`;
      }
      return REJECTION_REASON_MESSAGES.outside_geofence;
    }
    case "poor_accuracy": {
      if (accuracy !== null) {
        return `Lokasi GPS kurang akurat (akurasi ±${accuracy} m). Silakan tunggu beberapa saat atau pindah ke area dengan sinyal GPS yang lebih baik, lalu coba lagi.`;
      }
      return REJECTION_REASON_MESSAGES.poor_accuracy;
    }
    default:
      return REJECTION_REASON_MESSAGES[reason] ?? UNKNOWN_MESSAGE;
  }
}
