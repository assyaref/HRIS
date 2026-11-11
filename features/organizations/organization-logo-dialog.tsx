"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifier } from "@/lib/notifier";

import {
  removeOrganizationLogoAction,
  uploadOrganizationLogoAction,
} from "./logo.actions";

/**
 * Upload / replace / remove an organization's logo from the list page
 * (client leaf, SUPERADMIN-only surface). The actions re-check the role and
 * validate the file server-side (PNG/JPG by magic bytes, max 1 MB).
 */
export function OrganizationLogoDialog({
  organizationId,
  organizationName,
  logoUrl,
}: {
  organizationId: string;
  organizationName: string;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  function close() {
    setOpen(false);
    setError(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function upload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("Pilih berkas PNG atau JPG terlebih dahulu.");
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.append("logo", file);
    startTransition(async () => {
      const result = await uploadOrganizationLogoAction(organizationId, formData);
      if (result.ok) {
        notifier.success(result.message);
        close();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  function remove() {
    if (!window.confirm(`Hapus logo ${organizationName}?`)) return;
    setError(null);
    startTransition(async () => {
      const result = await removeOrganizationLogoAction(organizationId);
      if (result.ok) {
        notifier.success(result.message);
        close();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  const shown = preview ?? logoUrl;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Logo ${organizationName}`}
      >
        Logo
      </Button>
      <Dialog open={open} onOpenChange={(value) => (value ? setOpen(true) : close())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Logo organisasi</DialogTitle>
            <DialogDescription>
              Logo {organizationName} tampil menggantikan ikon gedung di sidebar,
              header, dan pemilih organisasi. PNG atau JPG, maksimal 1 MB; latar
              transparan atau putih memberi hasil terbaik.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={upload} className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white">
                {shown ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shown}
                    alt={`Logo ${organizationName}`}
                    className="size-full object-contain p-1.5"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-muted-foreground">
                    Belum ada logo
                  </span>
                )}
              </span>
              <Input
                ref={inputRef}
                type="file"
                name="logo"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                disabled={pending}
                onChange={onPick}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              {logoUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={remove}
                >
                  Hapus logo
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={close}
                >
                  Batal
                </Button>
                <Button type="submit" size="sm" disabled={pending}>
                  {pending ? "Menyimpan…" : logoUrl ? "Ganti logo" : "Unggah logo"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
