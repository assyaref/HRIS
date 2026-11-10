"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { notifier } from "@/lib/notifier";
import { Button, buttonVariants } from "@/components/ui/button";

import { toggleWorkLocationStatusAction } from "./actions";
import {
  WorkLocationDeleteDialog,
  type DeletableWorkLocation,
} from "./work-location-delete-dialog";

/**
 * Per-row actions on the Work Locations list: Edit, quick Activate/Deactivate,
 * and (SUPERADMIN only) Delete. All authorization, org scoping, activation
 * guardrails and delete checks run server-side in ./actions.
 */
export function WorkLocationRowActions({
  location,
  canDelete,
}: {
  location: DeletableWorkLocation;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [togglePending, startToggle] = useTransition();
  const isActive = location.status === "active";

  function toggleStatus() {
    startToggle(async () => {
      const result = await toggleWorkLocationStatusAction(
        location.id,
        isActive ? "inactive" : "active"
      );
      if (result.ok) {
        notifier.success(result.message ?? "Status updated.");
        router.refresh();
      } else {
        notifier.error(result.message ?? "Could not change the location status.");
      }
    });
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Link
        href={`/settings/work-locations/${location.id}`}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        Edit
      </Link>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={togglePending}
        onClick={toggleStatus}
      >
        {togglePending ? "Saving..." : isActive ? "Deactivate" : "Activate"}
      </Button>
      {canDelete ? <WorkLocationDeleteDialog location={location} compact /> : null}
    </div>
  );
}
