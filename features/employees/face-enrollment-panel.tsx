"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";

import {
  enrollFaceAction,
  revokeFaceEnrollmentAction,
  type FaceEnrollmentActionResult,
} from "./face-enrollment.actions";
import {
  FaceEnrollmentCamera,
} from "./face-enrollment-camera";
import type { FaceEnrollmentPresentationStatus } from "./face-enrollment";

const STATUS_LABELS: Record<FaceEnrollmentPresentationStatus, string> = {
  NOT_ENROLLED: "Not enrolled",
  ACTIVE: "Enrolled",
  REVOKED: "Revoked",
};

interface FaceEnrollmentPanelProps {
  employeeId: string;
  employeeName: string;
  status: FaceEnrollmentPresentationStatus;
  canManage: boolean;
  /** Server-side check: engine + model folder + encryption key configured. */
  engineConfigured: boolean;
}

/**
 * Face enrollment status + capture flow (Phase 10.1 + 10.2).
 *
 * - The status badge is always derived server-side.
 * - The full camera capture flow is only rendered when the server reports the
 *   recognition engine is configured (opt-in deployment setting).
 * - The capture is one transient JPEG produced by explicit user action; it is
 *   posted to the server action, which runs the entire authorization chain.
 * - Standalone revocation (Phase 10.7C-44) is available for an ACTIVE
 *   enrollment and goes through the server action too: this panel only renders
 *   an explicit confirm prompt, never any biometric value, and never opens the
 *   camera for a revoke.
 * - No raw template/embedding data is ever rendered here.
 */
export function FaceEnrollmentPanel({
  employeeId,
  employeeName,
  status,
  canManage,
  engineConfigured,
}: FaceEnrollmentPanelProps) {
  const router = useRouter();
  const [captureSession, setCaptureSession] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const isEnrolled = status === "ACTIVE";
  const canEnroll =
    canManage && engineConfigured && !showCamera && consentChecked;

  function beginCapture() {
    setCaptureSession((current) => current + 1);
    setFeedback(null);
    setShowCamera(true);
  }

  function cancelCapture() {
    setShowCamera(false);
    setFeedback(null);
  }

  function cancelRevoke() {
    setConfirmingRevoke(false);
    setFeedback(null);
  }

  /**
   * Standalone revoke always runs through the server action. The browser never
   * touches the database, never renders biometric material, and never opens the
   * camera here — revocation is a removal of capability, not a capture.
   */
  async function confirmRevoke() {
    setFeedback(null);
    setRevoking(true);
    try {
      const formData = new FormData();
      formData.append("employeeId", employeeId);
      const result: FaceEnrollmentActionResult =
        await revokeFaceEnrollmentAction(undefined, formData);
      if (result.ok) {
        setConfirmingRevoke(false);
        setFeedback({
          kind: "success",
          message: result.message ?? "Data wajah karyawan berhasil direvoke.",
        });
        router.refresh();
      } else {
        setConfirmingRevoke(false);
        setFeedback({
          kind: "error",
          message:
            result.message ?? "Revoke data wajah gagal. Silakan coba lagi.",
        });
      }
    } catch {
      setConfirmingRevoke(false);
      setFeedback({
        kind: "error",
        message: "Revoke data wajah gagal. Silakan coba lagi.",
      });
    } finally {
      setRevoking(false);
    }
  }

  async function submitCapture(blob: Blob) {
    setFeedback(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("employeeId", employeeId);
      formData.append("reenroll", isEnrolled ? "true" : "false");
      formData.append("consent", consentChecked ? "true" : "false");
      formData.append(
        "image",
        blob,
        `face-enrollment-${employeeId}.jpg`
      );
      const result: FaceEnrollmentActionResult = await enrollFaceAction(
        undefined,
        formData
      );
      if (result.ok) {
        setShowCamera(false);
        setFeedback({
          kind: "success",
          message: result.message ?? "Enrollment wajah berhasil.",
        });
        router.refresh();
      } else {
        setShowCamera(false);
        setFeedback({
          kind: "error",
          message:
            result.message ??
            "Enrollment wajah gagal. Silakan coba lagi.",
        });
      }
    } catch {
      setShowCamera(false);
      setFeedback({
        kind: "error",
        message: "Enrollment wajah gagal. Silakan coba lagi.",
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
            Face identity enrollment status.
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

      {!engineConfigured ? (
        <p className="text-sm text-muted-foreground">
          The face-recognition engine is not configured on this deployment. No
          enrollment can be completed until it is enabled; nothing is stored or
          claimed as verified.
        </p>
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

      {canManage && engineConfigured && !showCamera ? (
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Wajah Anda diproses menjadi template biometrik terenkripsi yang
            hanya digunakan untuk verifikasi identitas. Foto asli tidak
            disimpan. Enrollment/perbaruan hanya dilakukan oleh pihak yang
            berwenang (HR/Admin). Masa simpan, pencabutan, dan penghapusan data
            diatur dalam kebijakan privasi perusahaan.
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

      {confirmingRevoke ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-sm font-medium">Revoke face enrollment?</p>
          <p className="text-xs text-muted-foreground">
            Data biometrik wajah {employeeName} akan dihapus permanen dan
            verifikasi wajah tidak lagi tersedia. Enrollment wajah baru
            diperlukan untuk mengaktifkan kembali.
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={revoking}
              onClick={cancelRevoke}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={revoking}
              onClick={() => void confirmRevoke()}
            >
              {revoking ? "Revoking..." : "Revoke"}
            </Button>
          </div>
        </div>
      ) : null}

      {!showCamera && !confirmingRevoke ? (
        <div className="flex flex-wrap items-center gap-2">
          {canEnroll ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={beginCapture}
            >
              {isEnrolled ? "Perbarui data wajah" : "Enroll face"}
            </Button>
          ) : null}
          {canManage && isEnrolled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setConfirmingRevoke(true)}
            >
              Revoke face data
            </Button>
          ) : null}
        </div>
      ) : null}
    </CardContent>
  );
}
