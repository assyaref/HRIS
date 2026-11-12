/**
 * Plain data for the home "Status" tile. Kept out of the client module
 * (home-actions.tsx): a server page cannot read values exported from a
 * "use client" file, only render its components.
 */
/** Today's attendance state for the status tiles. */
export type TodayState =
  | "NOT_CHECKED_IN"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "ON_LEAVE"
  | "WEEKEND"
  | "REJECTED"
  | "UNAVAILABLE";

export const TODAY_STATUS: Record<TodayState, { label: string; pill: string }> = {
  NOT_CHECKED_IN: {
    label: "Belum Absen",
    pill: "bg-[#FFE7D6] text-[#C2410C] dark:bg-[#3A2216] dark:text-[#FDBA74]",
  },
  CHECKED_IN: {
    label: "Sudah Masuk",
    pill: "bg-[#DBEAFE] text-[#1D4ED8] dark:bg-[#16264A] dark:text-[#93C5FD]",
  },
  CHECKED_OUT: {
    label: "Selesai",
    pill: "bg-[#DCFCE7] text-[#15803D] dark:bg-[#16301C] dark:text-[#86EFAC]",
  },
  ON_LEAVE: {
    label: "Cuti",
    pill: "bg-[#EDE9FE] text-[#6D28D9] dark:bg-[#251E45] dark:text-[#C4B5FD]",
  },
  WEEKEND: {
    label: "Libur",
    pill: "bg-[#E2E8F0] text-[#475569] dark:bg-[#1A2233] dark:text-[#CBD5E1]",
  },
  REJECTED: {
    label: "Ditolak",
    pill: "bg-[#FEE2E2] text-[#B91C1C] dark:bg-[#3A1616] dark:text-[#FCA5A5]",
  },
  UNAVAILABLE: {
    label: "Tidak Aktif",
    pill: "bg-[#E2E8F0] text-[#475569] dark:bg-[#1A2233] dark:text-[#CBD5E1]",
  },
};
