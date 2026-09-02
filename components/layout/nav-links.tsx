import Link from "next/link";
import { primaryNavigation } from "./navigation";

interface NavLinksProps {
  /** Called after a link is activated (e.g. close the mobile drawer). */
  onNavigate?: () => void;
}

/** Presentational link list shared by the desktop sidebar and mobile drawer. */
export function NavLinks({ onNavigate }: NavLinksProps) {
  return (
    <ul className="space-y-1">
      {primaryNavigation.map((item) => (
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
  );
}
