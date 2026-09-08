"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";

import {
  selfEnrollFaceAction,
  type FaceEnrollmentActionResult,
} from "./face-enrollment.actions";
import { FaceEnrollmentCamera } from "./face-enrollment-camera";
import type { FaceEnrollmentPresentationStatus } from "./face-enrollment";

const STATUS_LABELS: Record<FaceEnrollmentPresentationStatus, string> = {
  NOT_ENROLLED: "Belum terdaftar",
  ACTIVE: "Terdaftar",
  REVOKED: "Dicabut",
};

interface SelfFaceEnrollmentPanelProps {
  employeeName: string;
  /** Server-derived enrollment status of the authenticated user's own record. */
  status: FaceEnrollmentPresentationStatus;
  /** Linked employee `employmentStatus === "active"` (server-side). */
  employeeActive: boolean;
  /** Server-side check: engine + model folder + encryption key configured. */
  engineConfigured: boolean;
}

/**
 * Employee SELF-SERVICE face enrollment panel (Phase 10.7C-50D).
 *
 * - No employee selector and NO employeeId is ever sent: the server resolves
 *   the authenticated user's own linked employee. This panel only collects an
 *   explicit consent acknowledgement and one transient JPEG capture.
 * - The status badge comes from the server; the camera is reused unchanged and
 *   opens only after an explicit user action.
 * - All decisions are made by the server action; the browser never receives or
 *   renders templates, embeddings or scores.
 */
export function SelfFaceEnrollmentPanel({
  employeeName,
  status,
  employeeActive,
  engineConfigured,
}: SelfFaceEnrollmentPanelProps) {
  const router = useRouter();
  const [captureSession, setCaptureSession] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const isEnrolled = status === "ACTIVE";
  const canEnroll =
    engineConfigured && employeeActive && !showCamera && consentChecked;

  function beginCapture() {
    setCaptureSession((current) => current + 1);
    setFeedback(null);
    setShowCamera(true);
  }

  function cancelCapture() {
    setShowCamera(false);
    setFeedback(null);
  }

  /**
   * Submits ONLY consent + reenroll + one JPEG to the self-service server
   * action. There is no employeeId field: the identity is resolved server-side
   * from the authenticated session, so a modified form cannot enroll anyone
   * else.
   */
  async function submitCapture(blob: Blob) {
    setFeedback(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("reenroll", isEnrolled ? "true" : "false");
      formData.append("consent", consentChecked ? "true" : "false");
      formData.append("image", blob, "face-self-enrollment.jpg");
      const result: FaceEnrollmentActionResult = await selfEnrollFaceAction(
        undefined,
        formData
      );
      if (result.ok) {
        setShowCamera(false);
        setFeedback({
          kind: "success",
          message: result.message ?? "Data wajah Anda berhasil didaftarkan.",
        });
        router.refresh();
      } else {
        setShowCamera(false);
        setFeedback({
          kind: "error",
          message:
            result.message ??
            "Pendaftaran data wajah gagal. Silakan coba lagi.",
        });
      }
    } catch {
      setShowCamera(false);
      setFeedback({
        kind: "error",
        message: "Pendaftaran data wajah gagal. Silakan coba lagi.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CardContent className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{employeeName}</p>
          <p className="text-xs text-muted-foreground">
            Status data wajah untuk verifikasi identitas Anda.
          </p>
        </div>
        <Badge variant={isEnrolled ? "primary" : "outline"}>
          {STATUS_LABELS[status]}
        </Badge>
      </div>

      {feedback ? (
        <p
          role="alert"
          className={
            feedback.kind === "success"
              ? "text-sm text-emerald-600"
              : "text-sm text-destructive"
          }
        >
          {feedback.message}
        </p>
      ) : null}

      {!employeeActive ? (
        <p className="text-sm text-muted-foreground">
          Data karyawan Anda berstatus tidak aktif, sehingga data wajah tidak
          dapat didaftarkan.
        </p>
      ) : null}

      {!engineConfigured ? (
        <p className="text-sm text-muted-foreground">
          Mesin pengenalan wajah belum dikonfigurasi pada aplikasi ini. Data
          wajah belum dapat didaftarkan hingga mesin diaktifkan; tidak ada data
          yang disimpan atau diklaim terverifikasi.
        </p>
      ) : null}

      {engineConfigured && employeeActive && !showCamera ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Wajah Anda diproses menjadi template biometrik terenkripsi yang
            hanya digunakan untuk verifikasi identitas Anda. Foto asli tidak
            disimpan. Masa simpan, pencabutan, dan penghapusan data diatur
            dalam kebijakan privasi perusahaan.
          </p>
          <label className="flex items-start gap-2 text-xs font-normal">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(event) => setConsentChecked(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Saya menyetujui pemrosesan data biometrik wajah saya untuk
              keperluan verifikasi identitas, sesuai kebijakan privasi
              perusahaan.
            </span>
          </label>
        </div>
      ) : null}

      {showCamera ? (
        <div className="space-y-2">
          <FaceEnrollmentCamera
            key={captureSession}
            onCaptured={(blob) => void submitCapture(blob)}
            onCancel={cancelCapture}
            disabled={submitting}
          />
          <p className="text-xs text-muted-foreground">
            Foto hanya dipakai sekali untuk enrollment dan tidak disimpan dalam
            bentuk asli. Pastikan satu wajah terlihat jelas.
          </p>
        </div>
      ) : null}

      {canEnroll ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={beginCapture}
          >
            {isEnrolled ? "Perbarui data wajah" : "Daftarkan Wajah"}
          </Button>
        </div>
      ) : null}
    </CardContent>
  );
}