/** Client-notification helper (toast/notifier). */
export const notifier = {
  success: (message: string) => {
    // Trigger a success toast — the UI component handles the display
    const event = new CustomEvent("notification:success", {
      detail: { message },
    });
    document.dispatchEvent(event);
  },
  error: (message: string) => {
    const event = new CustomEvent("notification:error", {
      detail: { message },
    });
    document.dispatchEvent(event);
  },
  warning: (message: string) => {
    const event = new CustomEvent("notification:warning", {
      detail: { message },
    });
    document.dispatchEvent(event);
  },
};

export type NotifierEvent =
  | "notification:success"
  | "notification:error"
  | "notification:warning";