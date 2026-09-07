"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";

import {
  enrollFaceAction,
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
  const [feedback, setFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  const isEnrolled = status === "ACTIVE";
  const canEnroll = canManage && engineConfigured && !showCamera;

  function beginCapture() {
    setCaptureSession((current) => current + 1);
    setFeedback(null);
    setShowCamera(true);
  }

  function cancelCapture() {
    setShowCamera(false);
    setFeedback(null);
  }

  async function submitCapture(blob: Blob) {
    setFeedback(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("employeeId", employeeId);
      formData.append("reenroll", isEnrolled ? "true" : "false");
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
    </CardContent>
  );
}
