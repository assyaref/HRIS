"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils/cn";

import { HrisIcon } from "./icons";

/**
 * Home widgets: live clock, local weather and the day's prayer schedule, as
 * three cards right below the blue band. Everything runs in the browser and
 * follows the DEVICE: the clock uses the device time zone, and the
 * weather / prayer times use the device position (Geolocation API, asked once
 * after an explicit mount with `geolocate`). When the position is denied or
 * unavailable the widgets fall back to the last known position stored in this
 * browser, then to Jakarta, and say so. External data comes from keyless public
 * APIs (Open-Meteo for weather, Aladhan with the Kemenag method for prayer
 * times, BigDataCloud for the locality name); each call is best-effort and a
 * failure only hides its own card content — never the page.
 */

interface Coords {
  latitude: number;
  longitude: number;
  /** Locality label once resolved; null until reverse geocoding answers. */
  label: string | null;
  /** How the position was obtained — shown to the user. */
  source: "device" | "cached" | "default";
}

interface Weather {
  temperature: number;
  apparent: number;
  humidity: number;
  windSpeed: number;
  code: number;
  isDay: boolean;
}

interface PrayerTimes {
  dateLabel: string;
  hijri: string | null;
  timings: { key: string; label: string; time: string }[];
}

const DEFAULT_COORDS: Coords = {
  latitude: -6.2088,
  longitude: 106.8456,
  label: "Jakarta",
  source: "default",
};

const COORDS_STORAGE_KEY = "hris-hero-coords-v1";

const PRAYER_LABELS: Record<string, string> = {
  Fajr: "Subuh",
  Sunrise: "Terbit",
  Dhuhr: "Dzuhur",
  Asr: "Ashar",
  Maghrib: "Maghrib",
  Isha: "Isya",
};
const PRAYER_ORDER = ["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"];

/** WMO weather interpretation codes → Indonesian label + glyph. */
function describeWeather(code: number, isDay: boolean): { label: string; glyph: string } {
  if (code === 0) return { label: "Cerah", glyph: isDay ? "☀️" : "🌙" };
  if (code <= 2) return { label: "Cerah berawan", glyph: isDay ? "🌤️" : "☁️" };
  if (code === 3) return { label: "Berawan", glyph: "☁️" };
  if (code === 45 || code === 48) return { label: "Berkabut", glyph: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Gerimis", glyph: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Hujan", glyph: "🌧️" };
  if (code >= 71 && code <= 77) return { label: "Salju", glyph: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Hujan lokal", glyph: "🌦️" };
  if (code >= 95) return { label: "Badai petir", glyph: "⛈️" };
  return { label: "Cuaca", glyph: "🌡️" };
}

function readCachedCoords(): Coords | null {
  try {
    const raw = window.localStorage.getItem(COORDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Coords>;
    if (
      typeof parsed.latitude !== "number" ||
      typeof parsed.longitude !== "number"
    ) {
      return null;
    }
    return {
      latitude: parsed.latitude,
      longitude: parsed.longitude,
      label: typeof parsed.label === "string" ? parsed.label : null,
      source: "cached",
    };
  } catch {
    return null;
  }
}

function writeCachedCoords(coords: Coords): void {
  try {
    window.localStorage.setItem(
      COORDS_STORAGE_KEY,
      JSON.stringify({
        latitude: coords.latitude,
        longitude: coords.longitude,
        label: coords.label,
      })
    );
  } catch {
    // Storage may be unavailable (private mode); the widgets still work.
  }
}

function subscribeToSeconds(onTick: () => void): () => void {
  const timer = window.setInterval(onTick, 1000);
  return () => window.clearInterval(timer);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  return (hours || 0) * 60 + (minutes || 0);
}

export function HeroWidgets({
  geolocate = true,
  compact = false,
  className,
}: {
  /** Ask the device for its position (false = cached/default only). */
  geolocate?: boolean;
  /**
   * Smaller cards for the self-service home. Sizes follow the width of the
   * nearest `@container` (cqw) instead of viewport breakpoints, so the cards
   * keep the same arrangement on every phone.
   */
  compact?: boolean;
  className?: string;
}) {
  // Live clock (device time zone): a 1 s external tick; the server snapshot is
  // 0 so SSR and the first client render agree ("--:--:--").
  const nowSeconds = useSyncExternalStore(
    subscribeToSeconds,
    () => Math.floor(Date.now() / 1000),
    () => 0
  );
  const now = useMemo(
    () => (nowSeconds === 0 ? null : new Date(nowSeconds * 1000)),
    [nowSeconds]
  );
  const [coords, setCoords] = useState<Coords | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [prayer, setPrayer] = useState<PrayerTimes | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const [prayerError, setPrayerError] = useState(false);

  // Position: device → cached → default. Deferred one tick so the effect body
  // itself never sets state synchronously (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      const cached = readCachedCoords();
      if (cached) setCoords(cached);
      if (!geolocate || !("geolocation" in navigator)) {
        if (!cached) setCoords(DEFAULT_COORDS);
        return;
      }
      navigator.geolocation.getCurrentPosition(
      (position) => {
        if (cancelled) return;
        const next: Coords = {
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
          label: null,
          source: "device",
        };
        setCoords(next);
      },
      () => {
        if (cancelled) return;
        setCoords((current) => current ?? DEFAULT_COORDS);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
      );
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [geolocate]);

  // Weather + prayer times + locality for the resolved position.
  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    const { latitude, longitude } = coords;
    const today = new Date();
    const dateParam = `${pad(today.getDate())}-${pad(today.getMonth() + 1)}-${today.getFullYear()}`;

    // Reset the per-position errors on the next tick (not synchronously).
    const resetHandle = window.setTimeout(() => {
      setWeatherError(false);
      setPrayerError(false);
    }, 0);

    void fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day&timezone=auto`,
      { signal: controller.signal }
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { current?: Record<string, number> }) => {
        const current = data.current;
        if (!current) throw new Error("no current weather");
        setWeather({
          temperature: Math.round(current.temperature_2m),
          apparent: Math.round(current.apparent_temperature),
          humidity: Math.round(current.relative_humidity_2m),
          windSpeed: Math.round(current.wind_speed_10m),
          code: current.weather_code,
          isDay: current.is_day === 1,
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) setWeatherError(true);
      });

    void fetch(
      `https://api.aladhan.com/v1/timings/${dateParam}?latitude=${latitude}&longitude=${longitude}&method=20`,
      { signal: controller.signal }
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then(
        (data: {
          data?: {
            timings?: Record<string, string>;
            date?: {
              readable?: string;
              hijri?: { day?: string; month?: { en?: string }; year?: string };
            };
          };
        }) => {
          const timings = data.data?.timings;
          if (!timings) throw new Error("no timings");
          const hijri = data.data?.date?.hijri;
          setPrayer({
            dateLabel: data.data?.date?.readable ?? "",
            hijri:
              hijri?.day && hijri.month?.en && hijri.year
                ? `${hijri.day} ${hijri.month.en} ${hijri.year} H`
                : null,
            timings: PRAYER_ORDER.filter((key) => timings[key]).map((key) => ({
              key,
              label: PRAYER_LABELS[key] ?? key,
              // Aladhan may append the zone, e.g. "04:32 (WIB)".
              time: timings[key].slice(0, 5),
            })),
          });
        }
      )
      .catch(() => {
        if (!controller.signal.aborted) setPrayerError(true);
      });

    if (!coords.label) {
      void fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`,
        { signal: controller.signal }
      )
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((data: { city?: string; locality?: string; principalSubdivision?: string }) => {
          const label =
            [data.city || data.locality, data.principalSubdivision]
              .filter(Boolean)
              .join(", ") || null;
          setCoords((current) =>
            current && current.latitude === latitude && current.longitude === longitude
              ? { ...current, label }
              : current
          );
          if (label) writeCachedCoords({ ...coords, label });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          writeCachedCoords(coords);
        });
    } else if (coords.source === "device") {
      writeCachedCoords(coords);
    }

    return () => {
      window.clearTimeout(resetHandle);
      controller.abort();
    };
    // Re-run only when the position itself changes, not when its label resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.latitude, coords?.longitude]);

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "";
    }
  }, []);

  const nextPrayer = useMemo(() => {
    if (!prayer || !now) return null;
    const minutesNow = now.getHours() * 60 + now.getMinutes();
    const candidates = prayer.timings.filter((entry) => entry.key !== "Sunrise");
    const upcoming = candidates.find((entry) => minutesOf(entry.time) > minutesNow);
    if (upcoming) {
      const diff = minutesOf(upcoming.time) - minutesNow;
      return { ...upcoming, inMinutes: diff, tomorrow: false };
    }
    const first = candidates[0];
    if (!first) return null;
    return {
      ...first,
      inMinutes: 24 * 60 - minutesNow + minutesOf(first.time),
      tomorrow: true,
    };
  }, [prayer, now]);

  // Explicit re-request of the device position (the gear on the prayer card).
  const refreshPosition = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
          label: null,
          source: "device",
        });
      },
      () => {
        setCoords((current) => current ?? DEFAULT_COORDS);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 0 }
    );
  }, []);

  const dateLabel = now
    ? new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now)
    : "";
  const clockLabel = now
    ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : "--:--:--";
  const weatherText = weather ? describeWeather(weather.code, weather.isDay) : null;
  const placeLabel =
    coords?.label ??
    (coords?.source === "device"
      ? "Lokasi perangkat"
      : coords?.source === "cached"
        ? "Lokasi terakhir"
        : coords
          ? `${coords.latitude}, ${coords.longitude}`
          : "Mencari lokasi…");
  const placeNote =
    coords?.source === "default"
      ? "Lokasi perangkat tidak tersedia — menampilkan Jakarta"
      : coords?.source === "cached"
        ? "Lokasi tersimpan di perangkat ini"
        : null;
  const visibleTimings = prayer
    ? prayer.timings.filter((entry) => entry.key !== "Sunrise")
    : [];

  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-2 gap-2.5"
          : "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-[1fr_1fr_1.7fr]",
        className
      )}
      aria-label="Jam, cuaca dan jadwal shalat"
    >
      {/* Clock — blue card */}
      <section
        className={cn(
          "hris-clock-card relative overflow-hidden text-white",
          compact ? "rounded-[18px] px-3.5 py-3" : "rounded-[22px] px-4 py-4 sm:px-5"
        )}
        aria-label="Jam saat ini"
      >
        <p
          className={cn(
            "flex items-center font-medium text-white/90",
            compact ? "gap-1.5 text-[12.5px]" : "gap-2 text-[15px]"
          )}
        >
          <HrisIcon name="clock" className={cn("shrink-0", compact ? "size-4" : "size-5")} />
          Jam Saat Ini
        </p>
        <p
          className={cn(
            "leading-none font-extrabold tracking-wide tabular-nums",
            compact
              ? "mt-2 text-[clamp(21px,6.2cqw,27px)]"
              : "mt-3 text-[28px] min-[400px]:text-[32px] lg:text-[36px]"
          )}
          suppressHydrationWarning
        >
          {clockLabel}
        </p>
        <p
          className={cn(
            "flex items-center leading-snug text-white/90",
            compact ? "mt-2 gap-1.5 text-[11px]" : "mt-3 gap-2 text-[13px]"
          )}
          suppressHydrationWarning
        >
          <HrisIcon name="calendar" className={cn("shrink-0", compact ? "size-3.5" : "size-4")} />
          <span className={cn("min-w-0", compact && "truncate")}>{dateLabel || "\u00a0"}</span>
        </p>
        {timeZone ? <span className="sr-only">{timeZone}</span> : null}
      </section>

      {/* Weather — white card */}
      <section
        className={cn(
          "hris-card flex min-w-0 flex-col",
          compact ? "rounded-[18px] px-3 py-2.5" : "rounded-[22px] px-4 py-4 sm:px-5"
        )}
        aria-label="Cuaca saat ini"
      >
        {weather && weatherText ? (
          <>
            <div className="flex items-center gap-2">
              <span
                className={cn("leading-none", compact ? "text-[30px]" : "text-[40px]")}
                aria-hidden="true"
              >
                {weatherText.glyph}
              </span>
              <div className="min-w-0 flex-1 text-center">
                <p
                  className={cn(
                    "text-muted-foreground",
                    compact ? "truncate text-[11px]" : "text-[13px]"
                  )}
                >
                  Cuaca Saat Ini
                </p>
                <p
                  className={cn(
                    "leading-none font-extrabold tracking-tight text-foreground tabular-nums",
                    compact ? "mt-0.5 text-[22px]" : "text-[28px]"
                  )}
                >
                  {weather.temperature}
                  <span className={cn("align-top", compact ? "text-sm" : "text-xl")}>°C</span>
                </p>
              </div>
            </div>
            <p
              className={cn(
                "text-center font-bold text-foreground",
                compact ? "mt-1 truncate text-[13px]" : "mt-1.5 text-[15px]"
              )}
            >
              {weatherText.label}
            </p>
            <ul
              className={cn(
                "text-foreground/85",
                compact ? "mt-1 space-y-0.5 text-[11px]" : "mt-2 space-y-1 text-[13px]"
              )}
            >
              <li className="flex items-center gap-2">
                <HrisIcon name="droplet" className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">Kelembapan {weather.humidity}%</span>
              </li>
              <li className="flex items-center gap-2" title={placeNote ?? undefined}>
                <HrisIcon name="map-pin" className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 truncate">Lokasi: {placeLabel}</span>
              </li>
            </ul>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">Cuaca Saat Ini</p>
            <p className="mt-2 text-sm text-foreground/80">
              {weatherError ? "Data cuaca tidak tersedia." : "Memuat cuaca…"}
            </p>
            <p className="mt-auto flex items-center gap-2 pt-2 text-[13px] text-foreground/85">
              <HrisIcon name="map-pin" className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 truncate">Lokasi: {placeLabel}</span>
            </p>
          </>
        )}
      </section>

      {/* Prayer schedule — full-width card */}
      <section
        className={cn(
          "hris-card col-span-2 flex items-stretch overflow-hidden",
          compact ? "gap-2.5 rounded-[18px]" : "gap-3 rounded-[22px] lg:col-span-1"
        )}
        aria-label="Jadwal shalat"
      >
        <MosqueArt compact={compact} />
        <div
          className={cn(
            "min-w-0 flex-1",
            compact ? "py-2 pr-2.5" : "py-3 pr-2.5 min-[400px]:pr-3"
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p
                className={cn(
                  "flex items-center leading-tight font-bold text-primary",
                  compact ? "gap-1.5 text-[14px]" : "gap-2 text-[17px]"
                )}
              >
                <HrisIcon
                  name="mosque"
                  className={cn("shrink-0 text-[#0D9488]", compact ? "size-4" : "size-5")}
                />
                Jadwal Shalat
              </p>
              <p
                className={cn(
                  "mt-0.5 truncate text-muted-foreground",
                  compact ? "text-[11px]" : "text-[13px]"
                )}
                suppressHydrationWarning
              >
                {dateLabel || "\u00a0"}
              </p>
              {prayer?.hijri ? <span className="sr-only">{prayer.hijri} (Kemenag)</span> : null}
            </div>
            <button
              type="button"
              onClick={refreshPosition}
              aria-label="Perbarui lokasi perangkat untuk jadwal shalat dan cuaca"
              title={placeNote ?? `Lokasi: ${placeLabel}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-surface-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <HrisIcon name="settings" className="size-5" />
            </button>
          </div>
          {prayer ? (
            <ul
              className={cn(
                "grid grid-cols-5",
                compact ? "mt-1.5 gap-1" : "mt-2 gap-1 min-[400px]:gap-1.5"
              )}
            >
              {visibleTimings.map((entry) => {
                const isNext = nextPrayer?.key === entry.key;
                return (
                  <li
                    key={entry.key}
                    className={cn(
                      "text-center",
                      compact
                        ? "rounded-lg px-0.5 py-1"
                        : "rounded-xl px-0.5 py-1.5 min-[400px]:px-1",
                      isNext
                        ? "bg-primary text-white shadow-[0_8px_18px_-10px_rgb(11_92_197/0.9)]"
                        : "bg-[#EEF3FB] text-foreground dark:bg-muted"
                    )}
                    aria-current={isNext ? "time" : undefined}
                  >
                    <span
                      className={cn(
                        "block whitespace-nowrap leading-tight font-semibold",
                        compact
                          ? "text-[clamp(9px,2.3cqw,10.5px)]"
                          : "text-[10px] min-[400px]:text-[11px]",
                        isNext ? "text-[#FFD54F]" : "text-muted-foreground"
                      )}
                    >
                      {entry.label}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block leading-tight font-extrabold tabular-nums",
                        compact
                          ? "text-[clamp(11.5px,3cqw,13.5px)]"
                          : "text-[13px] min-[400px]:text-[15px]"
                      )}
                    >
                      {entry.time}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className={cn("text-foreground/80", compact ? "mt-2 text-[13px]" : "mt-3 text-sm")}>
              {prayerError ? "Jadwal shalat tidak tersedia." : "Memuat jadwal shalat…"}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

/** Soft mosque illustration on the left of the prayer card (decorative). */
function MosqueArt({ compact = false }: { compact?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 96 112"
      className={cn(
        "hris-prayer-art h-auto shrink-0 self-stretch",
        compact ? "w-[clamp(52px,15cqw,72px)]" : "w-[64px] min-[400px]:w-[84px] sm:w-[96px]"
      )}
      preserveAspectRatio="xMidYMax slice"
    >
      <defs>
        <linearGradient id="hris-mosque-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#CFE3FF" />
          <stop offset="1" stopColor="#EEF5FF" />
        </linearGradient>
        <linearGradient id="hris-mosque-dome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2F86E8" />
          <stop offset="1" stopColor="#0B5CC5" />
        </linearGradient>
      </defs>
      <rect width="96" height="112" fill="url(#hris-mosque-sky)" />
      {/* crescent */}
      <circle cx="70" cy="22" r="9" fill="#FFD54F" />
      <circle cx="74" cy="19" r="8" fill="#DCEBFF" />
      {/* minaret */}
      <rect x="16" y="40" width="9" height="56" rx="2" fill="#FFFFFF" />
      <path d="M14 42h13l-6.5-9z" fill="#2F86E8" />
      <rect x="18" y="58" width="5" height="7" rx="1.5" fill="#0B5CC5" />
      {/* hall */}
      <rect x="28" y="66" width="56" height="30" rx="3" fill="#FFFFFF" />
      <path d="M32 66c0-14 8-22 24-24 16 2 24 10 24 24z" fill="url(#hris-mosque-dome)" />
      <rect x="55" y="36" width="2" height="7" fill="#FFD54F" />
      <path d="M50 96v-13a6 6 0 0 1 12 0v13z" fill="#0B5CC5" />
      <path d="M36 96v-9a4 4 0 0 1 8 0v9zM68 96v-9a4 4 0 0 1 8 0v9z" fill="#BFD9FF" />
      {/* greenery + ground */}
      <ellipse cx="12" cy="98" rx="12" ry="7" fill="#7CC97F" />
      <ellipse cx="86" cy="99" rx="12" ry="7" fill="#9AD69C" />
      <rect x="0" y="100" width="96" height="12" fill="#D4E6FF" />
    </svg>
  );
}
