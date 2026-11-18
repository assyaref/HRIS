import { HrisIcon } from "@/components/layout/icons";

/** Shown by MCU / Training pages until migration 0023 is applied. */
export function ModuleNotReady({ module }: { module: string }) {
  return (
    <div className="hris-attention flex flex-col gap-3 rounded-[20px] p-5 sm:flex-row sm:items-start">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE7C2] text-[#D97706] dark:bg-surface-warning">
        <HrisIcon name="alert-triangle" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-foreground">Modul {module} belum aktif</p>
        <p className="mt-1 text-sm text-foreground/80">
          Tabel database untuk modul ini belum dibuat. Administrator server perlu
          menjalankan migrasi <code className="rounded bg-white/70 px-1">0023_compliance_mcu_training</code>{" "}
          (<code className="rounded bg-white/70 px-1">npm run db:migrate</code>) sesuai
          panduan di <code className="rounded bg-white/70 px-1">docs/compliance-mcu-training.md</code>.
          Halaman ini aktif otomatis setelahnya.
        </p>
      </div>
    </div>
  );
}
