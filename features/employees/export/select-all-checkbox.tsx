"use client";

import { useState } from "react";

/**
 * Header checkbox that toggles every row checkbox (`data-employee-select`)
 * in the employee table. Selection feeds the "Export Selected" Excel flow;
 * the actual download re-validates every id server-side (RBAC +
 * organization scoping), so the browser only carries the selection.
 */
export function SelectAllEmployees() {
  const [checked, setChecked] = useState(false);

  function toggleAll() {
    const boxes = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-employee-select]")
    );
    const next = !checked;
    for (const box of boxes) {
      box.checked = next;
    }
    setChecked(next);
  }

  return (
    <label className="flex items-center">
      <span className="sr-only">Select all employees on this page</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={toggleAll}
        className="h-4 w-4 rounded border-input"
      />
    </label>
  );
}
