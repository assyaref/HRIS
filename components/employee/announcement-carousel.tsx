"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export interface AnnouncementCarouselItem {
  id: string;
  title: string;
  excerpt: string;
  href: string;
  imageUrl: string | null;
  dateLabel: string | null;
  badgeLabel: string | null;
  badgeTone: "info" | "warning" | "danger" | "neutral";
  unread: boolean;
}

const badgeToneClasses: Record<AnnouncementCarouselItem["badgeTone"], string> = {
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-white/85 text-slate-600",
};

/**
 * Swipeable, auto-sliding announcement carousel for the employee home.
 *
 * Data is supplied by the server (existing announcements query). The component
 * holds only presentation state and never fetches or invents content. Touch
 * swipe, pagination dots and a pause-on-interaction auto-slide are included.
 */
export function AnnouncementCarousel({
  items,
  className,
}: {
  items: AnnouncementCarouselItem[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = items.length;

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [paused, count]);

  if (count === 0) return null;

  const onTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    setPaused(true);
  };

  const onTouchEnd = (event: TouchEvent) => {
    const start = touchStartX.current;
    const end = event.changedTouches[0]?.clientX ?? null;
    touchStartX.current = null;
    setPaused(false);
    if (start === null || end === null) return;
    const delta = end - start;
    if (Math.abs(delta) < 40) return;
    go(delta < 0 ? index + 1 : index - 1);
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Company announcements"
      className={cn("relative", className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="overflow-hidden rounded-[1.5rem]"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((item, itemIndex) => (
            <article
              key={item.id}
              aria-hidden={itemIndex !== index}
              className="relative w-full shrink-0"
            >
              <Link
                href={item.href}
                className="emp-card emp-card-tap relative block min-h-44 overflow-hidden"
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                  />
                ) : (
                  <div className="emp-gradient-soft absolute inset-0" />
                )}
                <div
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0",
                    item.imageUrl
                      ? "bg-gradient-to-t from-slate-900/85 via-slate-900/35 to-transparent"
                      : "bg-gradient-to-t from-white/95 via-white/70 to-white/30"
                  )}
                />
                <div className="relative flex min-h-44 flex-col justify-end gap-1.5 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase",
                        badgeToneClasses[item.badgeTone]
                      )}
                    >
                      {item.badgeLabel ?? "Pengumuman"}
                    </span>
                    {item.unread ? (
                      <span className="inline-flex items-center rounded-full bg-[#1677e8] px-2 py-0.5 text-[10px] font-semibold text-white">
                        Baru
                      </span>
                    ) : null}
                  </div>
                  <h3
                    className={cn(
                      "line-clamp-2 text-base font-semibold",
                      item.imageUrl ? "text-white" : "text-[#172554]"
                    )}
                  >
                    {item.title}
                  </h3>
                  <p
                    className={cn(
                      "line-clamp-2 text-sm",
                      item.imageUrl ? "text-white/85" : "text-[#64748b]"
                    )}
                  >
                    {item.excerpt}
                  </p>
                  {item.dateLabel ? (
                    <p
                      className={cn(
                        "text-xs",
                        item.imageUrl ? "text-white/70" : "text-[#94a3b8]"
                      )}
                    >
                      {item.dateLabel}
                    </p>
                  ) : null}
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>

      {count > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {items.map((item, dotIndex) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Go to announcement ${dotIndex + 1}`}
              aria-current={dotIndex === index}
              onClick={() => {
                setPaused(true);
                go(dotIndex);
              }}
              className={cn(
                "h-1.5 rounded-full transition-all",
                dotIndex === index
                  ? "w-5 bg-[#1677e8]"
                  : "w-1.5 bg-slate-300 hover:bg-slate-400"
              )}
            />
          ))}
        </div>
      ) : null}

      {count > 1 ? (
        <>
          <button
            type="button"
            aria-label="Previous announcement"
            onClick={() => go(index - 1)}
            className="absolute top-1/2 -left-1 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow ring-1 ring-slate-200 hover:text-[#1677e8] sm:flex"
          >
            <HrisIcon name="chevron-right" className="size-4 rotate-180" />
          </button>
          <button
            type="button"
            aria-label="Next announcement"
            onClick={() => go(index + 1)}
            className="absolute top-1/2 -right-1 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-500 shadow ring-1 ring-slate-200 hover:text-[#1677e8] sm:flex"
          >
            <HrisIcon name="chevron-right" className="size-4" />
          </button>
        </>
      ) : null}
    </section>
  );
}
