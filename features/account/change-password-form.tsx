"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifier } from "@/lib/notifier";

import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {
  status: "idle",
};

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  error,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  placeholder: string;
  error?: string;
}) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={showPassword ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          invalid={Boolean(error)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="pr-10"
        />
        <button
          type="button"
          aria-label={showPassword ? "Hide password" : "Show password"}
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-4"
          >
            {showPassword ? (
              <>
                <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                <line x1="2" x2="22" y1="2" y2="22" />
              </>
            ) : (
              <>
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
        </button>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ pending }: { pending: boolean }) {
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Mengubah Password..." : "Ganti Password"}
    </Button>
  );
}

export function ChangePasswordForm() {
  const router = useRouter();
  const [state, formAction] = useActionState(changePasswordAction, initialState);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (state.status === "success") {
      notifier.success(state.message ?? "Password berhasil diubah.");
      const timeout = window.setTimeout(() => {
        router.push("/login");
        router.refresh();
      }, 500);
      return () => window.clearTimeout(timeout);
    }
    if (state.status === "error" && state.message) {
      notifier.error(state.message);
    }
  }, [state, router]);

  return (
    <form
      action={(formData) => {
        startTransition(() => {
          formAction(formData);
        });
      }}
      noValidate
      className="space-y-5"
    >
      <PasswordInput
        id="currentPassword"
        name="currentPassword"
        label="Password Saat Ini"
        autoComplete="current-password"
        placeholder="Masukkan password saat ini"
        error={state.fieldErrors?.currentPassword}
      />
      <PasswordInput
        id="newPassword"
        name="newPassword"
        label="Password Baru"
        autoComplete="new-password"
        placeholder="Masukkan password baru"
        error={state.fieldErrors?.newPassword}
      />
      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label="Konfirmasi Password Baru"
        autoComplete="new-password"
        placeholder="Konfirmasi password baru"
        error={state.fieldErrors?.confirmPassword}
      />

      <div className="flex flex-wrap gap-3">
        <SubmitButton pending={pending || state.status === "success"} />
      </div>
    </form>
  );
}
