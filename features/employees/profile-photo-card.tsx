"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { notifier } from "@/lib/notifier";

import type { FaceEnrollmentPresentationStatus } from "./face-enrollment";
import {
  enrollFaceFromProfilePhotoAction,
  removeEmployeeProfilePhotoAction,
  uploadEmployeeProfilePhotoAction,
} from "./profile-photo.actions";

/** Longest side of the uploaded JPEG; matches the Face ID capture size. */
export const PROFILE_PHOTO_MAX_DIMENSION = 800;
const PROFILE_PHOTO_JPEG_QUALITY = 0.85;

const FACE_LABELS: Record<FaceEnrollmentPresentationStatus, string> = {
  NOT_ENROLLED: "Face ID belum terdaftar",
  ACTIVE: "Face ID terdaftar",
  REVOKED: "Face ID dicabut",
};

/**
 * Re-encode any browser-decodable picture (PNG, HEIC on Safari, large JPEG…)
 * into a bounded JPEG so the server receives the single format the face
 * engine accepts. Runs on the device; the original file never leaves it.
 */
async function toJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(
    1,
    PROFILE_PHOTO_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", PROFILE_PHOTO_JPEG_QUALITY)
  );
  if (!blob || blob.size === 0) throw new Error("encode failed");
  return blob;
}

export interface ProfilePhotoCardProps {
  /** Employee to manage, or null for the signed-in user's own record. */
  employeeId: string | null;
  displayName: string;
  photoUrl: string | null;
  canEdit: boolean;
  faceStatus: FaceEnrollmentPresentationStatus;
  engineConfigured: boolean;
  employeeActive: boolean;
  /** Compact copy for the self-service pages. */
  selfService?: boolean;
}

/**
 * Profile photo upload with the Face ID link: a new photo can enrol the face
 * in the same step, and an existing photo can enrol it later. Nothing here is
 * an authorization boundary — the server actions re-check everything.
 */
export function ProfilePhotoCard({
  employeeId,
  displayName,
  photoUrl,
  canEdit,
  faceStatus,
  engineConfigured,
  employeeActive,
  selfService = false,
}: ProfilePhotoCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const faceEligible = engineConfigured && employeeActive;
  const [enrollFace, setEnrollFace] = useState(false);
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFeedback(null);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setFeedback({ kind: "error", message: "Pilih foto terlebih dahulu." });
      return;
    }
    setFeedback(null);
    startTransition(async () => {
      let jpeg: Blob;
      try {
        jpeg = await toJpeg(file);
      } catch {
        setFeedback({ kind: "error", message: "Foto tidak dapat dibaca. Gunakan JPG atau PNG." });
        return;
      }
      const formData = new FormData();
      if (employeeId) formData.append("employeeId", employeeId);
      formData.append("image", jpeg, "profile-photo.jpg");
      formData.append("enrollFace", enrollFace && faceEligible ? "true" : "false");
      formData.append("consent", consent ? "true" : "false");
      const result = await uploadEmployeeProfilePhotoAction(undefined, formData);
      setFeedback({ kind: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        notifier.success(result.message);
        if (inputRef.current) inputRef.current.value = "";
        setPreview(null);
        router.refresh();
      }
    });
  }

  function remove() {
    if (!window.confirm("Hapus foto profil?")) return;
    setFeedback(null);
    startTransition(async () => {
      const result = await removeEmployeeProfilePhotoAction(employeeId);
      setFeedback({ kind: result.ok ? "success" : "error", message: result.message });
      if (result.ok) router.refresh();
    });
  }

  function enrollFromPhoto() {
    setFeedback(null);
    startTransition(async () => {
      const result = await enrollFaceFromProfilePhotoAction(employeeId, consent);
      setFeedback({ kind: result.ok ? "success" : "error", message: result.message });
      if (result.ok) {
        notifier.success(result.message);
        router.refresh();
      }
    });
  }

  const shown = preview ?? photoUrl;
  const needsFace = faceStatus !== "ACTIVE";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto profil</CardTitle>
        <CardDescription>
          {selfService
            ? "Foto ini menjadi acuan Face ID untuk absensi wajah. Jika Face ID sudah direkam lewat kamera, foto profil terisi otomatis."
            : "Foto profil karyawan sekaligus acuan Face ID untuk absensi wajah — unggah foto atau rekam lewat kamera, salah satunya cukup."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="flex items-start gap-4">
          <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-muted">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt={displayName} className="size-full object-cover" />
            ) : (
              <span className="px-2 text-center text-xs text-muted-foreground">Belum ada foto</span>
            )}
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{displayName}</span>
              <Badge variant={faceStatus === "ACTIVE" ? "primary" : "outline"}>
                {FACE_LABELS[faceStatus]}
              </Badge>
            </div>
            {canEdit ? (
              <form onSubmit={upload} className="space-y-2">
                <Input
                  ref={inputRef}
                  type="file"
                  name="photo"
                  accept="image/*"
                  capture="user"
                  onChange={onFileChange}
                  disabled={pending}
                />
                {faceEligible && needsFace ? (
                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={enrollFace}
                      onChange={(event) => setEnrollFace(event.target.checked)}
                      disabled={pending}
                    />
                    <span>Daftarkan Face ID dari foto ini (wajah harus terlihat jelas, satu orang).</span>
                  </label>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" disabled={pending}>
                    {pending ? "Menyimpan…" : photoUrl ? "Ganti foto" : "Unggah foto"}
                  </Button>
                  {photoUrl ? (
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={remove}>
                      Hapus foto
                    </Button>
                  ) : null}
                  {photoUrl && faceEligible && needsFace ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={pending || !consent}
                      title={consent ? undefined : "Centang persetujuan biometrik terlebih dahulu."}
                      onClick={enrollFromPhoto}
                    >
                      Gunakan foto profil untuk Face ID
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
          </div>
        </div>

        {canEdit && faceEligible && needsFace ? (
          <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={pending}
            />
            <span>
              {selfService
                ? "Saya menyetujui pemrosesan data biometrik wajah saya untuk keperluan verifikasi identitas, sesuai kebijakan privasi perusahaan."
                : "Karyawan telah menyetujui pemrosesan data biometrik wajahnya untuk verifikasi identitas, sesuai kebijakan privasi perusahaan."}
            </span>
          </label>
        ) : null}
        {canEdit && !engineConfigured && needsFace ? (
          <p className="text-xs text-muted-foreground">
            Mesin pengenalan wajah belum dikonfigurasi; foto tetap tersimpan sebagai foto profil.
          </p>
        ) : null}

        {feedback ? (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={feedback.kind === "success" ? "text-emerald-600" : "text-destructive"}
          >
            {feedback.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
