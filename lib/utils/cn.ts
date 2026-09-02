export type ClassValue = string | number | null | undefined | false;

/**
 * Join class names, dropping falsy values.
 * Kept dependency-free for the foundation phase.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
