import type { Metadata } from "next";

import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { requireSuperAdmin } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/auth";
import { APP_TIME_ZONE } from "@/lib/utils/greeting";
import { cn } from "@/lib/utils/cn";

import { getSystemStatus } from "@/features/system/status";

import packageJson from "../../../../package.json";

export const metadata: Metadata = { title: "Status Sistem" };
export const dynamic = "force-dynamic";

/**
 * Operational status for the Super Administrator: database, migrations
 * (applied / pending / skipped vs the journal) and which feature modules are
 * active. Read-only.
 */
export default async function SystemStatusPage() {
  const user = await requireUser();
  await requireSuperAdmin(user.id);
  const status = await getSystemStatus();
  const { migrations, modules, database } = status;
  const inactive = modules.filter((m) => !m.ready);
  const pendingTags = migrations.items.filter((i) => i.state !== "applied");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Status Sistem"
        description="Kondisi database, migrasi, dan modul. Gunakan setelah deploy untuk memastikan semua migrasi sudah dijalankan."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={database.ok ? "check" : "alert-triangle"}
          label="Database"
          value={database.ok ? "Terhubung" : "Gagal"}
          hint={database.ok ? `${database.latencyMs} ms · PostgreSQL ${database.version}` : (database.error ?? "")}
          tone={database.ok ? "green" : "rose"}
        />
        <StatCard
          icon="layers"
          label="Migrasi"
          value={`${migrations.applied}/${migrations.items.length}`}
          hint={migrations.pending || migrations.skipped ? `${migrations.pending} belum dijalankan${migrations.skipped ? ` · ${migrations.skipped} terlewat` : ""}` : "Semua sudah dijalankan"}
          tone={migrations.pending || migrations.skipped ? "amber" : "green"}
        />
        <StatCard icon="grid" label="Modul aktif" value={`${modules.length - inactive.length}/${modules.length}`} hint={inactive.length ? `${inactive.length} menunggu migrasi` : "Semua modul aktif"} tone={inactive.length ? "amber" : "blue"} />
        <StatCard icon="info" label="Aplikasi" value={`v${packageJson.version}`} hint={`Node ${process.version} · ${APP_TIME_ZONE}${database.size ? ` · DB ${database.size}` : ""}`} tone="slate" />
      </div>

      {pendingTags.length > 0 ? (
        <section className="hris-attention space-y-2 rounded-[20px] p-5">
          <h2 className="font-semibold text-foreground">Migrasi perlu dijalankan</h2>
          <p className="text-sm text-foreground/80">
            Backup database dulu, lalu dari folder rilis di server jalankan{" "}
            <code className="rounded bg-white/70 px-1">npm run db:migrate</code>, kemudian cek dengan{" "}
            <code className="rounded bg-white/70 px-1">npm run db:status</code>. Panduan: <code className="rounded bg-white/70 px-1">docs/release-runbook.md</code>.
          </p>
          {migrations.skipped ? (
            <p className="text-sm font-semibold text-destructive">
              Ada migrasi berstatus “terlewat” (lebih lama dari migrasi terakhir yang tercatat): drizzle-kit tidak akan menjalankannya otomatis.
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="hris-card rounded-[20px] border bg-card p-5">
          <h2 className="text-[17px] font-semibold">Modul</h2>
          <ul className="mt-3 divide-y divide-border">
            {modules.map((m) => (
              <li key={m.migration} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{m.name}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{m.migration}</span>
                </span>
                <Badge variant={m.ready ? "success" : "warning"}>{m.ready ? "Aktif" : "Belum aktif"}</Badge>
              </li>
            ))}
          </ul>
        </section>
        <section className="hris-card rounded-[20px] border bg-card p-5">
          <h2 className="text-[17px] font-semibold">Riwayat migrasi</h2>
          <ul className="mt-3 max-h-[540px] divide-y divide-border overflow-y-auto">
            {[...migrations.items].reverse().map((m) => (
              <li key={m.tag} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono text-xs">{m.tag}</span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    m.state === "applied" ? "text-muted-foreground" : m.state === "pending" ? "text-[#B45309]" : "text-destructive"
                  )}
                >
                  {m.state === "applied" ? "sudah" : m.state === "pending" ? "belum" : "terlewat"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
