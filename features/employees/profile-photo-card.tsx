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
import { HrisIcon } from "@/components/layout/icons";
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
  /**
   * `profile`: the employee "Profil Saya" section (round photo with a camera
   * badge, file pill, pill buttons, Face ID note). Defaults to the card.
   */
  layout?: "card" | "profile";
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
  layout = "card",
}: ProfilePhotoCardProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const faceEligible = engineConfigured && employeeActive;
  const [enrollFace, setEnrollFace] = useState(false);
  const [consent, setConsent] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFeedback(null);
    setFileName(file?.name ?? null);
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
        setFileName(null);
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

  if (layout === "profile") {
    const initials =
      displayName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join("") || "?";
    const pick = () => inputRef.current?.click();
    return (
      <section
        id="foto-profil"
        aria-labelledby="foto-profil-title"
        className="scroll-mt-4 rounded-[22px] border border-[var(--card-border)] bg-card px-4 pt-4 pb-4 hris-card"
      >
        <h2 id="foto-profil-title" className="text-[17px] font-bold tracking-tight text-foreground">
          Foto Profil
        </h2>
        <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">
          Gunakan foto yang jelas dan menampilkan wajah dengan baik.
        </p>

        <form onSubmit={upload} className="mt-4 space-y-3">
          <div className="flex justify-center">
            <span className="relative">
              <span className="flex size-[112px] items-center justify-center overflow-hidden rounded-full bg-surface-primary shadow-[0_10px_24px_-12px_rgb(15_60_160/0.55)] ring-4 ring-card outline outline-1 outline-[var(--card-border)]">
                {shown ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shown} alt={displayName} className="size-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary">{initials}</span>
                )}
              </span>
              {canEdit ? (
                <button
                  type="button"
                  onClick={pick}
                  disabled={pending}
                  aria-label="Pilih foto profil"
                  className="hris-band absolute right-0 bottom-0.5 flex size-10 !min-h-0 items-center justify-center rounded-full ring-[3px] ring-card focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                >
                  <HrisIcon name="camera" className="size-5" />
                </button>
              ) : null}
            </span>
          </div>

          <p className="text-center">
            <span
              className={
                faceStatus === "ACTIVE"
                  ? "inline-flex items-center gap-1.5 rounded-full bg-[#E3F6E8] px-2.5 py-1 text-[12px] font-semibold text-[#15803D] dark:bg-[#16301C] dark:text-[#86EFAC]"
                  : "inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground"
              }
            >
              <HrisIcon name="face" className="size-3.5" />
              {FACE_LABELS[faceStatus]}
            </span>
          </p>

          {canEdit ? (
            <>
              <label className="mx-auto flex h-12 w-full max-w-[300px] cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--card-border)] bg-background/60 px-3.5 text-[14px] text-foreground transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted">
                <HrisIcon name="camera" className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{fileName ?? "Pilih file foto"}</span>
                <input
                  ref={inputRef}
                  type="file"
                  name="photo"
                  accept="image/*"
                  onChange={onFileChange}
                  disabled={pending}
                  className="sr-only"
                />
              </label>
              <p className="text-center text-[11.5px] text-muted-foreground">
                Format: JPG/PNG • Dikompres otomatis
              </p>

              {faceEligible && needsFace ? (
                <div className="space-y-2 rounded-xl bg-muted/50 p-3 text-[12.5px] leading-snug">
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={enrollFace}
                      onChange={(event) => setEnrollFace(event.target.checked)}
                      disabled={pending}
                    />
                    <span>Daftarkan Face ID dari foto ini (wajah terlihat jelas, satu orang).</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      disabled={pending}
                    />
                    <span>
                      Saya menyetujui pemrosesan data biometrik wajah saya untuk verifikasi
                      identitas, sesuai kebijakan privasi perusahaan.
                    </span>
                  </label>
                </div>
              ) : null}

              <div className="flex justify-center gap-2.5">
                <button
                  type={preview ? "submit" : "button"}
                  onClick={preview ? undefined : pick}
                  disabled={pending}
                  className="hris-band inline-flex h-11 min-w-0 flex-1 basis-0 items-center justify-center rounded-full px-4 text-[14.5px] font-semibold shadow-[0_10px_20px_-12px_rgb(30_94_235/0.9)] transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] disabled:opacity-60"
                >
                  {pending ? "Menyimpan…" : preview ? "Simpan Foto" : photoUrl ? "Ganti Foto" : "Unggah Foto"}
                </button>
                {preview ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      if (inputRef.current) inputRef.current.value = "";
                      setPreview(null);
                      setFileName(null);
                    }}
                    className="inline-flex h-11 min-w-0 flex-1 basis-0 items-center justify-center rounded-full border border-primary/30 bg-card px-4 text-[14.5px] font-semibold text-primary transition-colors hover:bg-surface-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  >
                    Batal
                  </button>
                ) : photoUrl ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={remove}
                    className="inline-flex h-11 min-w-0 flex-1 basis-0 items-center justify-center rounded-full border border-primary/30 bg-card px-4 text-[14.5px] font-semibold text-primary transition-colors hover:bg-surface-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
                  >
                    Hapus Foto
                  </button>
                ) : null}
              </div>

              {photoUrl && !preview && faceEligible && needsFace ? (
                <button
                  type="button"
                  disabled={pending || !consent}
                  title={consent ? undefined : "Centang persetujuan biometrik terlebih dahulu."}
                  onClick={enrollFromPhoto}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-surface-primary px-4 text-[14px] font-semibold text-primary transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
                >
                  <HrisIcon name="face" className="size-5" />
                  Pakai foto ini untuk Face ID
                </button>
              ) : null}
            </>
          ) : null}

          {feedback ? (
            <p
              role={feedback.kind === "error" ? "alert" : "status"}
              className={
                feedback.kind === "success"
                  ? "text-center text-[13px] text-emerald-600"
                  : "text-center text-[13px] text-destructive"
              }
            >
              {feedback.message}
            </p>
          ) : null}

          <div className="flex items-start gap-2.5 rounded-xl bg-surface-primary px-3.5 py-3 text-[12.5px] leading-snug text-foreground/85">
            <HrisIcon name="info" className="mt-px size-5 shrink-0 text-primary" />
            <p>
              Foto ini juga digunakan untuk Face ID absensi jika sudah diaktifkan oleh perusahaan.
              {canEdit && !engineConfigured && needsFace
                ? " Mesin pengenalan wajah belum dikonfigurasi; foto tetap tersimpan sebagai foto profil."
                : ""}
            </p>
          </div>
        </form>
      </section>
    );
  }

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
