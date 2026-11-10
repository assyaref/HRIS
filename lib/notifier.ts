/**
 * Client-notification helper (toast/notifier).
 *
 * Events are dispatched on `window`, which is where the global `Toaster`
 * (components/ui/toaster.tsx) listens. (They used to be dispatched on
 * `document` without bubbling, so no toast ever reached the Toaster.)
 */
function emit(name: NotifierEvent, message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail: { message } }));
}

export const notifier = {
  success: (message: string) => emit("notification:success", message),
  error: (message: string) => emit("notification:error", message),
  warning: (message: string) => emit("notification:warning", message),
};

export type NotifierEvent =
  | "notification:success"
  | "notification:error"
  | "notification:warning";
