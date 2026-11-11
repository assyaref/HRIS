"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * Hero widgets: live clock, local weather and the day's prayer schedule.
 *
 * Replaces the office illustration on the blue band. Everything runs in the
 * browser and follows the DEVICE: the clock uses the device time zone, and the
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
  className,
}: {
  /** Ask the device for its position (false = cached/default only). */
  geolocate?: boolean;
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
      ? "lokasi perangkat tidak tersedia — menampilkan Jakarta"
      : coords?.source === "cached"
        ? "lokasi tersimpan di perangkat ini"
        : null;

  return (
    <div
      className={cn(
        "hris-widgets flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 md:grid md:snap-none md:grid-cols-3 md:overflow-visible md:pb-0",
        className
      )}
      aria-label="Jam, cuaca dan jadwal shalat"
    >
      {/* Clock */}
      <section className="hris-widget snap-start" aria-label="Jam">
        <p className="hris-widget-title">Jam</p>
        <p
          className="font-mono text-[28px] leading-none font-extrabold tracking-tight tabular-nums lg:text-[32px]"
          suppressHydrationWarning
        >
          {clockLabel}
        </p>
        <p className="mt-1.5 text-[13px] leading-snug text-white/90" suppressHydrationWarning>
          {dateLabel || " "}
        </p>
        {timeZone ? (
          <p className="mt-0.5 truncate text-[11px] text-white/70">{timeZone}</p>
        ) : null}
      </section>

      {/* Weather */}
      <section className="hris-widget snap-start" aria-label="Cuaca">
        <p className="hris-widget-title">Cuaca</p>
        {weather && weatherText ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[30px] leading-none" aria-hidden="true">
                {weatherText.glyph}
              </span>
              <span className="text-[28px] leading-none font-extrabold tracking-tight tabular-nums lg:text-[32px]">
                {weather.temperature}°C
              </span>
            </div>
            <p className="mt-1.5 text-[13px] leading-snug font-medium text-white/95">
              {weatherText.label}
              <span className="font-normal text-white/75">
                {" "}· terasa {weather.apparent}°C
              </span>
            </p>
            <p className="mt-0.5 text-[11px] text-white/70">
              Kelembapan {weather.humidity}% · Angin {weather.windSpeed} km/j
            </p>
          </>
        ) : (
          <p className="text-[13px] text-white/80">
            {weatherError ? "Data cuaca tidak tersedia." : "Memuat cuaca…"}
          </p>
        )}
        <p className="mt-1.5 truncate text-[11px] text-white/75" title={placeNote ?? undefined}>
          📍 {placeLabel}
        </p>
      </section>

      {/* Prayer times */}
      <section className="hris-widget snap-start" aria-label="Jadwal shalat">
        <p className="hris-widget-title">Jadwal Shalat</p>
        {prayer ? (
          <>
            {nextPrayer ? (
              <p className="text-[13px] leading-snug text-white/95">
                Berikutnya{" "}
                <span className="font-bold">{nextPrayer.label}</span>{" "}
                <span className="font-mono font-bold tabular-nums">{nextPrayer.time}</span>
                <span className="text-white/75">
                  {" "}
                  ·{" "}
                  {nextPrayer.inMinutes >= 60
                    ? `${Math.floor(nextPrayer.inMinutes / 60)} j ${nextPrayer.inMinutes % 60} m lagi`
                    : `${nextPrayer.inMinutes} m lagi`}
                </span>
              </p>
            ) : null}
            <ul className="mt-1.5 grid grid-cols-3 gap-x-2 gap-y-1 text-[12px]">
              {prayer.timings
                .filter((entry) => entry.key !== "Sunrise")
                .map((entry) => (
                  <li
                    key={entry.key}
                    className={cn(
                      "flex items-baseline justify-between gap-1 rounded-md px-1.5 py-0.5",
                      nextPrayer?.key === entry.key && "bg-white/15 font-bold"
                    )}
                  >
                    <span className="text-white/80">{entry.label}</span>
                    <span className="font-mono tabular-nums">{entry.time}</span>
                  </li>
                ))}
            </ul>
            {prayer.hijri ? (
              <p className="mt-1 truncate text-[11px] text-white/70">
                {prayer.hijri} · Kemenag
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[13px] text-white/80">
            {prayerError ? "Jadwal shalat tidak tersedia." : "Memuat jadwal shalat…"}
          </p>
        )}
      </section>
    </div>
  );
}
