import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";

/** Sticky top bar: mobile menu + brand, with room for future actions. */
export function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:h-16 lg:px-6">
      <MobileNav />
      <div className="min-w-0 lg:hidden">
        <Brand />
      </div>
      <div className="flex-1" />
      <button
        type="button"
        disabled
        aria-label="Account menu will be available in a later phase"
        title="Account menu — later phase"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground disabled:opacity-40"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
          className="size-5"
        >
          <path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          <path d="M4.5 20.25a7.5 7.5 0 0 1 15 0" />
        </svg>
      </button>
    </header>
  );
}
