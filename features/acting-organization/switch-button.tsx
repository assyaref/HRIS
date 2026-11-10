"use client";

import { useTransition } from "react";

import { Button } from "@/components/ui/button";

import { switchActingOrganizationAction } from "./actions";

/** Switch the Super Administrator's acting organization, staying on `returnTo`. */
export function SwitchOrganizationButton({
  organizationId,
  returnTo,
  children,
}: {
  organizationId: string;
  returnTo: string;
  children: React.ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await switchActingOrganizationAction(organizationId, returnTo, true);
        })
      }
    >
      {pending ? "Mengganti…" : children}
    </Button>
  );
}
