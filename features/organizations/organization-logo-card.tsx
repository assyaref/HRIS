"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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

import {
  removeOrganizationLogoAction,
  uploadOrganizationLogoAction,
} from "./logo.actions";

/**
 * Upload / replace / remove the organization's custom logo (client leaf).
 * Rendered on the SUPERADMIN-only organization page; the actions re-check the
 * role and validate the file server-side.
 */
export function OrganizationLogoCard({
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
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
        if (inputRef.current) inputRef.current.value = "";
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
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo organisasi</CardTitle>
        <CardDescription>
          Logo tampil di sidebar, header, dan pemilih organisasi. PNG atau JPG,
          maksimal 1 MB; latar transparan atau putih memberi hasil terbaik.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-white">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={`Logo ${organizationName}`} className="size-full object-contain p-1.5" />
            ) : (
              <span className="px-2 text-center text-xs text-muted-foreground">
                Belum ada logo
              </span>
            )}
          </span>
          <form onSubmit={upload} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              ref={inputRef}
              type="file"
              name="logo"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              disabled={pending}
              className="sm:max-w-xs"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Menyimpan…" : logoUrl ? "Ganti logo" : "Unggah logo"}
              </Button>
              {logoUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={remove}
                >
                  Hapus logo
                </Button>
              ) : null}
            </div>
          </form>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
