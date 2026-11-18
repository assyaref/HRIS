"use client";

import { HrisIcon } from "@/components/layout/icons";
import { Button } from "@/components/ui/button";

/** Opens the browser print dialog (print / save as PDF). */
export function PrintButton() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      <HrisIcon name="document" className="size-4" />
      Cetak / PDF
    </Button>
  );
}
