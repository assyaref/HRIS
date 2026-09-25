"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils/cn";
import type { NotifierEvent } from "@/lib/notifier";

interface ToastItem {
  id: number;
  tone: "success" | "error" | "warning";
  message: string;
}

const TOAST_DURATION_MS = 4500;

const toastToneClasses: Record<ToastItem["tone"], string> = {
  success:
    "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

const toastIcon: Record<ToastItem["tone"], string> = {
  success: "✓",
  error: "!",
  warning: "⚠",
};

const toneFromEvent = (eventName: string): ToastItem["tone"] => {
  switch (eventName) {
    case "notification:success":
      return "success";
    case "notification:error":
      return "error";
    case "notification:warning":
      return "warning";
    default:
      return "warning";
  }
}

/**
 * Global toast surface. Listens to the `notification:success|error|warning`
 * CustomEvents dispatched by `lib/notifier.ts` and renders a dismissible,
 * auto-expiring toast stack above all overlays.
 */
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    function handleEvent(event: Event) {
      const detail = (event as CustomEvent<{ message: string }>).detail;
      const message = detail?.message;
      if (!message) return;

      idRef.current += 1;
      const id = idRef.current;
      setToasts((current) => [
        ...current,
        { id, tone: toneFromEvent(event.type), message },
      ]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, TOAST_DURATION_MS);
    }

    const names: NotifierEvent[] = [
      "notification:success",
      "notification:error",
      "notification:warning",
    ];
    for (const name of names) {
      window.addEventListener(name, handleEvent);
    }
    return () => {
      for (const name of names) {
        window.removeEventListener(name, handleEvent);
      }
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-4 py-3 shadow-[0_8px_30px_rgba(15,23,42,0.10)]",
            toastToneClasses[toast.tone]
          )}
        >
          <span aria-hidden="true" className="mt-0.5 select-none font-bold">
            {toastIcon[toast.tone]}
          </span>
          <span className="text-sm leading-5">{toast.message}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() =>
              setToasts((current) =>
                current.filter((item) => item.id !== toast.id)
              )
            }
            className="ml-auto inline-flex size-6 shrink-0 items-center justify-center rounded-md text-current/70 transition-colors hover:bg-black/5 hover:text-current focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              className="size-3.5"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}