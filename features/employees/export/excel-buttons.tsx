"use client";

import { useState } from "react";
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
import { notifier } from "@/lib/notifier";

/**
 * Excel toolbar buttons for the employees page (client leaf).
 *
 * The template and (all/filtered) Excel exports link straight at the
 * authenticated route, which re-checks RBAC server-side, applies the page's
 * filters and masks sensitive columns per role. "Export Selected" collects
 * the row checkboxes and hands the ids to the same route — the server still
 * validates every id against the caller's organization, so the browser only
 * carries a selection, never authority.
 */
export function EmployeeExcelButtons({
  search = "",
  canExport = false,
  canTemplate = false,
}: {
  search?: string;
  canExport?: boolean;
  canTemplate?: boolean;
}) {
  const router = useRouter();
  const [selectedOpen, setSelectedOpen] = useState(false);

  function selectedIds(): string[] {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        "input[data-employee-select]:checked"
      )
    )
      .map((input) => input.value)
      .filter((value) => value.length > 0)
      .slice(0, 1000);
  }

  function openSelectedDialog() {
    if (selectedIds().length === 0) {
      notifier.warning("Select at least one employee row to export.");
      return;
    }
    setSelectedOpen(true);
  }

  function exportSelected() {
    const ids = selectedIds();
    if (ids.length === 0) return;
    const params = new URLSearchParams();
    params.set("format", "excel");
    params.set("ids", ids.join(","));
    window.location.assign(`/api/employees/export?${params.toString()}`);
    setSelectedOpen(false);
    router.refresh();
  }

  if (!canExport && !canTemplate) return null;

  return (
    <>
      {canTemplate ? (
        <a
          href="/api/employees/export?format=template"
          className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
          aria-label="Download Excel import template"
        >
          Template Excel
        </a>
      ) : null}
      {canExport ? (
        <>
          <a
            href={`/api/employees/export?format=excel${
              search.trim() ? `&q=${encodeURIComponent(search.trim())}` : ""
            }`}
            className="inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-foreground/80 transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Export employees to Excel"
          >
            Export Excel
          </a>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={openSelectedDialog}
            aria-label="Export selected employees to Excel"
          >
            Export Selected
          </Button>
        </>
      ) : null}
      <Dialog open={selectedOpen} onOpenChange={setSelectedOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export selected employees</DialogTitle>
            <DialogDescription>
              Downloads a multi-sheet Excel workbook (Employees, Addresses,
              Insurance, Bank Accounts, Family, Education, Documents, Custom
              Fields) for the selected rows only. Sensitive columns are
              masked unless your role may reveal them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={exportSelected}>
              Download Excel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
