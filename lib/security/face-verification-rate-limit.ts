/**
 * Server-side rate limiting for face verification (Phase 10.4).
 *
 * Design (compatible with this project's architecture):
 * - The repository has no generic rate-limit abstraction. The only existing
 *   precedent is the in-process login throttle in `features/auth/actions.ts`,
 *   which is explicitly per-process and documented as consistent for the
 *   single-`next start` production layout (`hris.service`, one process on one
 *   host). This module follows the same model in a small, isolated abstraction
 *   instead of inventing a second ad-hoc limiter in the action.
 * - Bounded: an internal Map with a hard cap (`maxEntries`); stale windows are
 *   pruned and the oldest entries are evicted past the cap, so the ledger can
 *   never grow without bound.
 * - Keyed by `organizationId:userId` (the AUTHENTICATED user) — the target
 *   `employeeId` is deliberately NOT part of the key, so a client cannot
 *   bypass the limit by changing which employee they verify.
 * - Stores ONLY scalar attempt counters. It never stores an image, an
 *   embedding, a template, a score, or any biometric content.
 * - Enforcement is production-only (mirrors the login throttle); in
 *   development the ledger is inert so local flows are never locked out.
 * - Limitation: per-process only. Before horizontally scaling the deployment
 *   (multiple server processes) this must move to a shared store (Redis or
 *   PostgreSQL); the action documentation states that requirement.
 *
 * This module deliberately has no `server-only` marker so its pure ledger
 * logic can be unit-tested with `node --test`.
 */

export const FACE_VERIFY_RATE_LIMIT_MAX_ATTEMPTS = 10;
export const FACE_VERIFY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const FACE_VERIFY_RATE_LIMIT_MAX_ENTRIES = 5000;

export interface FaceVerificationRateLimiterOptions {
  /** Maximum attempts allowed inside one window before limiting. */
  maxAttempts?: number;
  /** Window length in milliseconds. */
  windowMs?: number;
  /** Hard cap on the number of tracked keys. */
  maxEntries?: number;
}

export interface FaceVerificationRateLimiter {
  /** True when the (organization, user) key has exhausted its window budget. */
  isLimited(organizationId: string, userId: string, now?: number): boolean;
  /** Record one verification attempt for the key (starts a new window when expired). */
  recordAttempt(organizationId: string, userId: string, now?: number): void;
  /** Clear the counter for a key (used by callers that must not be locked). */
  reset(organizationId: string, userId: string): void;
  /** Number of keys currently tracked (diagnostics only, no biometric data). */
  readonly size: number;
}

interface AttemptWindow {
  attempts: number;
  windowStart: number;
}

/**
 * Stable ledger key for an authenticated actor inside one organization.
 * Employee id is intentionally absent so rate limiting cannot be bypassed by
 * rotating the verification target.
 */
export function faceVerificationRateLimitKey(
  organizationId: string,
  userId: string
): string {
  return `${organizationId}:${userId}`;
}

/**
 * Create an isolated, bounded attempt ledger. Tests use this factory for
 * deterministic, self-contained fixtures; the application uses the exported
 * `faceVerificationRateLimiter` singleton below.
 */
export function createFaceVerificationRateLimiter(
  options: FaceVerificationRateLimiterOptions = {}
): FaceVerificationRateLimiter {
  const maxAttempts =
    options.maxAttempts ?? FACE_VERIFY_RATE_LIMIT_MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? FACE_VERIFY_RATE_LIMIT_WINDOW_MS;
  const maxEntries = options.maxEntries ?? FACE_VERIFY_RATE_LIMIT_MAX_ENTRIES;

  const ledger = new Map<string, AttemptWindow>();

  function pruneExpired(now: number): void {
    for (const [key, window] of ledger) {
      if (now - window.windowStart >= windowMs) {
        ledger.delete(key);
      }
    }
    // Hard bound: if pruning was not enough (e.g. every key is inside a live
    // window), evict the oldest keys until the cap is respected.
    while (ledger.size > maxEntries) {
      const oldestKey = ledger.keys().next().value;
      if (oldestKey === undefined) break;
      ledger.delete(oldestKey);
    }
  }

  function currentWindow(
    organizationId: string,
    userId: string,
    now: number
  ): AttemptWindow | undefined {
    const key = faceVerificationRateLimitKey(organizationId, userId);
    const window = ledger.get(key);
    if (!window) return undefined;
    if (now - window.windowStart >= windowMs) {
      ledger.delete(key);
      return undefined;
    }
    return window;
  }

  return {
    isLimited(organizationId, userId, now = Date.now()) {
      const window = currentWindow(organizationId, userId, now);
      if (!window) return false;
      return window.attempts >= maxAttempts;
    },

    recordAttempt(organizationId, userId, now = Date.now()) {
      pruneExpired(now);
      const key = faceVerificationRateLimitKey(organizationId, userId);
      const window = ledger.get(key);
      if (!window || now - window.windowStart >= windowMs) {
        ledger.set(key, { attempts: 1, windowStart: now });
      } else {
        window.attempts += 1;
      }
      // Hard bound applies to every insert/update path. With maxEntries >= 1,
      // size > maxEntries implies at least one OTHER key exists, so evicting
      // the oldest entry can never delete the key that was just recorded.
      while (ledger.size > maxEntries) {
        const oldestKey = ledger.keys().next().value;
        if (oldestKey === undefined) break;
        ledger.delete(oldestKey);
      }
    },

    reset(organizationId, userId) {
      ledger.delete(faceVerificationRateLimitKey(organizationId, userId));
    },

    get size() {
      return ledger.size;
    },
  };
}

/**
 * Application singleton used by the face-verification server action.
 * Per-process by design (see module docs); must move to a shared store before
 * horizontal scaling.
 */
export const faceVerificationRateLimiter: FaceVerificationRateLimiter =
  createFaceVerificationRateLimiter();
