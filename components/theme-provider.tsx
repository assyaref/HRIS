"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

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
  // The stored choice is an external store: the server snapshot is "light"
  // and hydration uses it too, then React switches to the stored value —
  // no hydration mismatch for dark-mode users (reading localStorage in the
  // first render used to cause one). A choice made in this tab overrides it.
  const stored = useSyncExternalStore(
    subscribeStoredTheme,
    readStoredTheme,
    () => "light" as const
  );
  const [override, setTheme] = useState<"light" | "dark" | "system" | null>(null);
  const theme = override ?? stored;

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

type ThemeChoice = "light" | "dark" | "system";

function readStoredTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem("hris-theme");
    if (value === "dark" || value === "system" || value === "light") return value;
  } catch {
    // localStorage unavailable — keep light default.
  }
  return "light";
}

/** Other tabs changing the theme ("storage" fires only cross-tab). */
function subscribeStoredTheme(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
