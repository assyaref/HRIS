"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

/**
 * Professional HRIS sign-in form.
 * Server-action powered (no client-side database access, no token storage);
 * loading, validation and authentication errors are all rendered here.
 * Accepts Employee Number OR Email as identifier.
 */
export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);

  const identifierError = state.fieldErrors?.identifier;
  const passwordError = state.fieldErrors?.password;

  return (
    <form action={formAction} noValidate className="space-y-5">
      {state.error ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="identifier">Employee Number / Email</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="Contoh: EMP-0021 atau andi@company.com"
          required
          autoFocus
          invalid={Boolean(identifierError)}
          aria-invalid={Boolean(identifierError)}
          aria-describedby={identifierError ? "identifier-error" : undefined}
        />
        {identifierError ? (
          <p id="identifier-error" className="text-sm text-destructive">
            {identifierError}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Masukkan password"
          required
          invalid={Boolean(passwordError)}
          aria-invalid={Boolean(passwordError)}
          aria-describedby={passwordError ? "password-error" : undefined}
        />
        {passwordError ? (
          <p id="password-error" className="text-sm text-destructive">
            {passwordError}
          </p>
        ) : null}
      </div>

      <SubmitButton />
    </form>
  );
}