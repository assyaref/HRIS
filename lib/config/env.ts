import "server-only";

/**
 * Safe, environment-only configuration access.
 *
 * Rules enforced by this module:
 * - Secrets are never hardcoded; they come from the process environment only.
 * - Values are read lazily (per call) and are never bundled to the client.
 * - Only variables prefixed with `NEXT_PUBLIC_` are safe for client components;
 *   every other variable must stay on the server. This file is marked
 *   `server-only` so importing it from a client component fails at build time.
 *
 * No variables are required in Phase 1. Later phases add their contract to
 * `.env.example` (shape only — real values live in the platform secret store).
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Returns an optional environment variable, or `undefined` when unset. */
export function getEnv(name: string): string | undefined {
  return read(name);
}

/** Returns a required environment variable, throwing when unset. */
export function getRequiredEnv(name: string): string {
  const value = read(name);
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Returns an optional integer environment variable. */
export function getEnvInteger(name: string): number | undefined {
  const value = read(name);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `Environment variable "${name}" must be an integer. Received: ${value}`
    );
  }
  return parsed;
}

/** Returns an optional boolean environment variable ("true" | "false"). */
export function getEnvBoolean(name: string): boolean | undefined {
  const value = read(name);
  if (value === undefined) return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(
    `Environment variable "${name}" must be "true" or "false". Received: ${value}`
  );
}

/** True when running the production build/runtime. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
