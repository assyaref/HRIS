import Link from "next/link";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

import { StatusBadge, type StatusTone } from "./status-badge";

export type AttendanceCardState =
  | "NOT_CHECKED_IN"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "REJECTED"
  | "ON_LEAVE"
  | "WEEKEND"
  | "HOLIDAY"
  | "UNAVAILABLE";

interface StateCopy {
  title: string;
  description: string;
  tone: StatusTone;
  label: string;
}

const STATE_COPY: Record<AttendanceCardState, StateCopy> = {
  NOT_CHECKED_IN: {
    title: "Presensi Hari Ini",
    description: "Anda belum melakukan presensi.",
    tone: "warning",
    label: "Belum Presensi",
  },
  CHECKED_IN: {
    title: "Good Job!",
    description: "Anda sudah melakukan presensi masuk hari ini.",
    tone: "success",
    label: "Sudah Masuk",
  },
  CHECKED_OUT: {
    title: "Good Job!",
    description: "Anda sudah melakukan presensi hari ini.",
    tone: "success",
    label: "Selesai",
  },
  REJECTED: {
    title: "Presensi Ditolak",
    description: "Presensi terakhir Anda ditolak. Silakan coba lagi.",
    tone: "danger",
    label: "Ditolak",
  },
  ON_LEAVE: {
    title: "Anda Sedang Cuti",
    description: "Tidak perlu presensi selama periode cuti Anda.",
    tone: "info",
    label: "Cuti",
  },
  WEEKEND: {
    title: "Hari Libur",
    description: "Selamat menikmati akhir pekan Anda.",
    tone: "neutral",
    label: "Akhir Pekan",
  },
  HOLIDAY: {
    title: "Hari Libur Nasional",
    description: "Tidak ada presensi pada hari libur.",
    tone: "neutral",
    label: "Libur",
  },
  UNAVAILABLE: {
    title: "Presensi Tidak Tersedia",
    description: "Profil kepegawaian Anda tidak aktif. Hubungi HR.",
    tone: "neutral",
    label: "Tidak Tersedia",
  },
};

export interface AttendanceStatusCardProps {
  state: AttendanceCardState;
  checkInLabel: string | null;
  checkOutLabel: string | null;
  durationLabel: string | null;
  verificationLabel: string | null;
  locationLabel: string | null;
  showAction: boolean;
  actionHref?: string;
}

/**
 * The primary employee-home attendance card. Every value is passed in from
 * server-resolved data for the authenticated employee; the example figures in
 * the design brief are never rendered.
 */
export function AttendanceStatusCard({
  state,
  checkInLabel,
  checkOutLabel,
  durationLabel,
  verificationLabel,
  locationLabel,
  showAction,
  actionHref = "/attendance",
}: AttendanceStatusCardProps) {
  const copy = STATE_COPY[state];
  const hasRecord = Boolean(checkInLabel || checkOutLabel);
  const success = state === "CHECKED_IN" || state === "CHECKED_OUT";

  return (
    <section
      className={cn(
        "emp-card relative overflow-hidden p-5",
        success && "ring-1 ring-emerald-100"
      )}
    >
      {success ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-12 size-40 rounded-full bg-emerald-50 blur-2xl"
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#172554]">{copy.title}</p>
          <p className="mt-0.5 text-sm text-[#64748b]">{copy.description}</p>
        </div>
        <StatusBadge
          tone={copy.tone}
          icon={
            success ? (
              <HrisIcon name="check" className="size-3.5" />
            ) : (
              <HrisIcon name="clock" className="size-3.5" />
            )
          }
        >
          {copy.label}
        </StatusBadge>
      </div>

      {hasRecord ? (
        <dl className="relative mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <dt className="text-xs font-medium text-[#64748b]">Jam Masuk</dt>
            <dd className="mt-0.5 text-lg font-semibold text-[#172554]">
              {checkInLabel ?? "—"}
            </dd>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3">
            <dt className="text-xs font-medium text-[#64748b]">Jam Pulang</dt>
            <dd className="mt-0.5 text-lg font-semibold text-[#172554]">
              {checkOutLabel ?? "—"}
            </dd>
          </div>
          {durationLabel ? (
            <div className="col-span-2 flex items-center justify-between rounded-2xl bg-blue-50/70 px-4 py-3">
              <dt className="text-xs font-medium text-[#64748b]">
                Durasi Kerja
              </dt>
              <dd className="text-sm font-semibold text-[#1677e8]">
                {durationLabel}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {hasRecord || verificationLabel || locationLabel ? (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {verificationLabel ? (
            <StatusBadge tone="success" icon={<HrisIcon name="scan" className="size-3.5" />}>
              {verificationLabel}
            </StatusBadge>
          ) : null}
          {locationLabel ? (
            <StatusBadge tone="info" icon={<HrisIcon name="map-pin" className="size-3.5" />}>
              {locationLabel}
            </StatusBadge>
          ) : null}
        </div>
      ) : null}

      {showAction ? (
        <Link
          href={actionHref}
          className="emp-gradient mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold text-white shadow-[0_12px_28px_-14px_rgba(22,119,232,0.8)] transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <HrisIcon name="scan" className="size-5" />
          PRESENSI SEKARANG
        </Link>
      ) : null}
    </section>
  );
}
