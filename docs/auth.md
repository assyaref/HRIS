# Authentication — Phase 3

This document records the authentication design, security decisions and the
rate-limiting requirements deferred to a later hardening phase. It is a
companion to `docs/architecture.md` (PHASE 3).

## Design overview

Session-based, database-backed authentication built on the existing Phase 2
schema — no new identity/session tables were introduced.

| Concern | Location |
| --- | --- |
| Password hashing (`hashPassword`, `verifyPassword`) | `lib/auth/password.ts` |
| Sessions + cookies (`createSession`, `validateSession`, `revokeSession`, `revokeAllUserSessions`, cookie helpers) | `lib/auth/session.ts` |
| Orchestration (`authenticateUser`, `getCurrentUser`, `logoutUser`, `requireUser`) | `lib/auth/auth.ts` |
| Login/logout Server Actions | `features/auth/actions.ts` |
| Login form (client leaf) | `features/auth/login-form.tsx` |
| Login input validation (zod) | `features/auth/login-schema.ts` |

Login flow:

1. The client POSTs credentials to the `loginAction` Server Action
   (React `<form action>`; origin/host verified by the framework).
2. Input is validated with zod.
3. The user is looked up by (lower-cased) email.
4. Account status is checked (`users.status === "active"` only).
5. The password is verified against `users.password_hash` (Argon2id).
6. A 256-bit random session token is generated.
7. Only its SHA-256 hash (`token_hash`) is persisted to `sessions`.
8. A session row is inserted (`expires_at`, `last_activity_at`, IP/UA).
9. An HttpOnly, SameSite=Lax, Secure-in-production cookie is set.
10. The action redirects to `/dashboard`.

The raw session token exists in exactly two places: the generated return
value inside the login action and the browser cookie. It is never returned to
React components, never logged and never stored in PostgreSQL.

## Route protection

Auth guards are server-side, in Server Components:

- `app/page.tsx` redirects authenticated users to `/dashboard` and
  unauthenticated users to `/login`.
- `app/(dashboard)/layout.tsx` calls `requireUser()` — a server-side guard
  that redirects to `/login` when the session is missing, revoked, expired or
  the user is not `active`. Every route inside the `(dashboard)` group is
  protected by this single layout.

No middleware/proxy is used: session validation requires a PostgreSQL lookup,
and Next.js proxy runs separately from the render pipeline and must not share
DB modules. Layout guards are the documented pattern for DAL-backed auth.

## Account status

`users.status` semantics (Phase 2 contract): `pending | active | suspended |
locked`. Only `active` authenticates. Inactive accounts are rejected in
`validateSession` (existing sessions stop working) and in `authenticateUser`
(login). Status values were not modified; no new values were invented.

## Password hashing

- **Algorithm:** Argon2id (`@node-rs/argon2`, PHC string
  `$argon2id$v=19$m=19456,t=2,p=1`, 16-byte random salt per hash).
- Argon2id is the OWASP-recommended password KDF. `@node-rs/argon2` ships
  prebuilt N-API binaries (no compile step on Windows/Linux) and is in
  Next.js's default `serverExternalPackages` allow-list.
- Only the encoded hash is stored (`users.password_hash`, nullable — an
  account without credentials yet always fails login).
- `verifyPassword` returns `false` (never throws) for malformed hashes.
- No plaintext, reversible encryption, MD5/SHA-1/unsalted-SHA-256 or custom
  schemes are used anywhere.

### User-enumeration hardening

When the email is unknown or the account has no password, login still runs one
Argon2id verification against a fixed dummy hash
(`verifyPasswordTimingEqualizer`) so response timing does not reveal whether
an email exists. All credential failures return the same generic message
(`Invalid email or password.`). The only differentiated message —
“account not active” — is reachable solely after a correct password, so it
cannot be used for unauthenticated enumeration.
## Sessions & cookies

- **Token:** 32 random bytes, base64url (`generateSessionToken`).
- **Storage:** SHA-256 hex digest in `sessions.token_hash` (unique index).
  SHA-256 is appropriate here because the input is a 256-bit random token,
  not a low-entropy secret.
- **Cookie:** `hris_session` — `HttpOnly`, `SameSite=Lax`, `Path=/`,
  `Secure` in production, `expires` equal to the session expiry.
  Default TTL is 7 days, overridable with `AUTH_SESSION_TTL_SECONDS`.
- **Validation on every request:** session exists → not revoked → not
  expired → owning user still `active`. Expired/revoked sessions never
  authenticate.
- **Logout:** revokes the session row in PostgreSQL *then* clears the cookie
  (`logoutUser`). Revocation is best-effort; the cookie is cleared even if the
  DB write fails.
- **Future-facing:** `revokeAllUserSessions()` is available for password
  resets/security events. No session-admin UI is exposed yet.

## Rate limiting (design notes — Phase 16)

No external or distributed rate limiter is introduced in Phase 3 (per phase
scope). Requirements are documented here so the auth functions can be wrapped
later without signature changes:

1. **Login throttling** must apply per (email + IP) and per IP, keyed before
   the Argon2id verification runs (the hash is intentionally expensive, so
   throttling *must* short-circuit before it).
2. **Lockout policy** belongs to the account (persisted counter on `users`),
   not only to a cache: e.g. N failed attempts → `status = "locked"` until an
   admin unlock or a timed window. This complements, not replaces, transport
   rate limiting.
3. **Session endpoints** (login/logout) need tighter limits than read routes;
   the auth Server Actions are the natural choke points
   (`features/auth/actions.ts`).
4. **Generic errors must not change** when rate limiting triggers — return the
   same `Invalid email or password.` message to avoid revealing account state.
5. Implementation should sit behind the `authenticateUser` boundary (a small
   `lib/rate-limit` wrapper) so this phase's code stays untouched.
6. Behind a load balancer, honour `X-Forwarded-For` (already read for session
   metadata) and prefer a shared store (Redis/PgBouncer-safe) in production.

## Security review checklist (Phase 3 scope)

- SQL injection — all queries go through Drizzle parameterized statements.
- No plaintext passwords; password hashes never leave the server.
- Session tokens never reach React components or logs; DB stores hashes only.
- No localStorage/sessionStorage authentication state.
- Cookies are HttpOnly + SameSite=Lax + Secure(prod).
- No client-side database access (`db/` and `lib/auth` are `server-only`).
- Generic auth errors; no user enumeration via messages or timing.
- No open redirects: login redirects to the constant `/dashboard`.
- Expired and revoked sessions are rejected in `validateSession`.
- Server Action CSRF/origin protection is enforced by Next.js.

