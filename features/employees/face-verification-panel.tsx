"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";

import {
  verifyFaceAction,
} from "./face-verification.actions";
import {
  FaceEnrollmentCamera,
} from "./face-enrollment-camera";
import type { FaceVerificationActionResult } from "./face-verification";

/**
 * Face verification panel (Phase 10.3) — client capture + server decision.
 *
 * - Rendered only for an ACTIVE face enrollment on a managed deployment.
 * - The capture is one transient JPEG produced by explicit user action; the
 *   server action runs the ENTIRE verification chain (employee/enrollment
 *   lookup, template decryption, face processing, matching threshold) and
 *   returns ONLY a safe result. No score, threshold, template or embedding
 *   is ever rendered here.
 * - Reuses the same one-shot camera lifecycle as enrollment.
 */
export function FaceVerificationPanel({
  employeeId,
  employeeName,
  status,
  canVerify,
  engineConfigured,
}: {
  employeeId: string;
  employeeName: string;
  status: "NOT_ENROLLED" | "ACTIVE" | "REVOKED";
  canVerify: boolean;
  engineConfigured: boolean;
}) {
  const [captureSession, setCaptureSession] = useState(0);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    kind: "matched" | "not_matched" | "error";
    message: string;
  } | null>(null);

  const isActive = status === "ACTIVE";
  const canStart = canVerify && engineConfigured && isActive && !showCamera;

  function beginCapture() {
    setCaptureSession((current) => current + 1);
    setResult(null);
    setShowCamera(true);
  }

  function cancelCapture() {
    setShowCamera(false);
    setResult(null);
  }

  async function submitCapture(blob: Blob) {
    setResult(null);
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("employeeId", employeeId);
      formData.append("image", blob, `face-verification-${employeeId}.jpg`);
      const actionResult: FaceVerificationActionResult = await verifyFaceAction(
        undefined,
        formData
      );
      if (actionResult.ok && actionResult.matched) {
        setResult({ kind: "matched", message: actionResult.message });
      } else if (actionResult.ok && !actionResult.matched) {
        setResult({ kind: "not_matched", message: actionResult.message });
      } else {
        setResult({ kind: "error", message: actionResult.message });
      }
    } catch {
      setResult({
        kind: "error",
        message: "Verifikasi wajah gagal. Silakan coba lagi.",
      });
    } finally {
      setShowCamera(false);
      setSubmitting(false);
    }
  }

  const statusLabel = (() => {
    switch (status) {
      case "ACTIVE":
        return "Enrolled";
      case "REVOKED":
        return "Revoked";
      default:
        return "Not enrolled";
    }
  })();

  return (
    <CardContent className="space-y-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{employeeName}</p>
          <p className="text-xs text-muted-foreground">
            One-shot face verification against the active enrollment.
          </p>
        </div>
        <Badge variant={isActive ? "primary" : "outline"}>{statusLabel}</Badge>
      </div>

      {result ? (
        <p
          role="alert"
          className={
            result.kind === "matched"
              ? "text-sm text-emerald-600"
              : result.kind === "not_matched"
                ? "text-sm text-amber-600"
                : "text-sm text-destructive"
          }
        >
          {result.message}
        </p>
      ) : null}

      {!isActive ? (
        <p className="text-sm text-muted-foreground">
          Verifikasi wajah hanya tersedia untuk karyawan dengan data wajah
          aktif. Tidak ada gambar, template, atau skor yang pernah dikirim ke
          peramban.
        </p>
      ) : null}

      {!engineConfigured ? (
        <p className="text-sm text-muted-foreground">
          The face-recognition engine is not configured on this deployment. No
          verification can run until it is enabled.
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
            Foto hanya dipakai sekali untuk verifikasi dan tidak disimpan dalam
            bentuk asli. Hasil ditentukan sepenuhnya oleh server.
          </p>
        </div>
      ) : null}

      {canStart ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={beginCapture}
        >
          Verifikasi wajah
        </Button>
      ) : null}
    </CardContent>
  );
}
