/**
 * Shared navigation contract for the application shell.
 * Foundation type only — feature routes are registered by later phases.
 */
export interface NavItem {
  title: string;
  href: string;
}
