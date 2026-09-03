import Link from "next/link";
import type { NavSection } from "@/types/navigation";

interface NavLinksProps {
  /** Navigation sections to render (already permission-filtered server-side). */
  sections: NavSection[];
  /** Called after a link is activated (e.g. close the mobile drawer). */
  onNavigate?: () => void;
}

/** Presentational link list shared by the desktop sidebar and mobile drawer. */
export function NavLinks({ sections, onNavigate }: NavLinksProps) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <nav
          key={section.title ?? "primary"}
          aria-label={section.title ?? "Main navigation"}
        >
          {section.title ? (
            <h2 className="px-3 pb-1.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {section.title}
            </h2>
          ) : null}
          <ul className="space-y-1">
            {section.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>
  );
}

