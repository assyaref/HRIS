const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Returns focusable elements inside a container, in DOM order. */
export function getFocusableElements(
  container: HTMLElement | null
): HTMLElement[] {
  if (!container) return [];
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
  );
}

/**
 * Returns a `Tab` keydown handler that keeps keyboard focus inside
 * `container` (focus trap). Used by modal surfaces such as Dialog.
 */
export function createTabTrap(
  container: HTMLElement | null
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key !== "Tab") return;

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;
    const hasFocusInside = container?.contains(activeElement) ?? false;

    if (event.shiftKey) {
      if (!hasFocusInside || activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      return;
    }

    if (!hasFocusInside || activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
