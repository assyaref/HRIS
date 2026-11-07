"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface ThemeContextValue {
  theme: "light" | "dark" | "system";
  setTheme: (next: "light" | "dark" | "system") => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
});

/**
 * Theme provider — light / dark mode.
 *
 * Reads the persisted preference from `localStorage` (key `hris-theme`) in a
 * lazy state initializer (never setState inside an effect), falls back to the
 * system `prefers-color-scheme`, and applies a `dark` class to `<html>` so
 * Tailwind's `dark:` variant and the CSS variable overrides in `globals.css`
 * take effect.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark" | "system">(() => {
    if (typeof window === "undefined") return "light";
    try {
      const stored = localStorage.getItem("hris-theme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
    } catch {
      // localStorage unavailable — keep light default.
    }
    return "light";
  });

  const resolvedTheme = useCallback((): "light" | "dark" => {
    if (theme === "system") {
      return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
      );
    }
    return theme;
  }, [theme]);

  // Apply the resolved theme to <html> (DOM only — not React state).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme() === "dark");
  }, [resolvedTheme]);

  // Follow system preference changes when in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      document.documentElement.classList.toggle("dark", media.matches);
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const setThemePersisted = useCallback(
    (next: "light" | "dark" | "system") => {
      setTheme(next);
      try {
        localStorage.setItem("hris-theme", next);
      } catch {
        // localStorage unavailable — keep in-memory state only.
      }
    },
    []
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemePersisted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
