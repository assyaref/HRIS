# UI design system (shell v9 — soft pastel)

How the HRIS screens are styled, where each piece lives, and how to add a
page without breaking the look. Pair with `docs/architecture.md`.

## Layers

| Layer | Where | What it does |
| --- | --- | --- |
| Tokens | `app/globals.css` `:root` / `.dark` | Colours, radii, shadows, z-index. Change a colour here, never inline. |
| Primitives | `components/ui/*` | `Button`, `Badge`, `Card`, `Table`, `Input`, `Dialog`, `EmptyState`, `Skeleton`. Each emits a marker class (`btn btn-<variant>`, `badge badge-<variant>`, `hris-card`, `hris-table-wrap`). |
| Shell | `components/layout/*` | `AppShell` → sidebar (`sidebar.tsx`, `nav-links.tsx`), top bar (`admin-top-bar.tsx` for management, `hero-band.tsx` for the employee frame), drawer, command palette, home widgets (`hero-widgets.tsx`). |
| Soft pastel layer | `app/globals.css`, section **v9** | Refines the primitives through the marker classes, scoped to `:is(.hris-admin, .emp-frame)`; dialogs (portalled to `<body>`) via `body:has(...)`. |
| Dashboard blocks | `components/dashboard/*` | `StatCard`, `QuickAccessCard`, `SectionHeading`, `SegmentRing` + `RingLegend`, `StackedBarChart`, `MonthlyRecapCard`. Pure server-renderable. |

`AppShell` puts `.hris-admin` on management accounts and `.emp-frame` on
self-service accounts (phone-width column; breakpoints switch off inside it).
Both share the v9 look; anything only one of them should get uses that one
class.

## Rules of thumb

- **Use the primitives.** `buttonVariants({ variant, size })` for links that
  look like buttons; `Badge` for status; `Table*` for tables; `EmptyState`
  for empty lists (it has default artwork). The v9 layer then styles them
  for free, including dark mode.
- **No hard-coded colours in pages.** Use tokens (`bg-card`, `text-primary`,
  `border-[var(--card-border)]`) or the chip / tile helpers
  (`hris-chip-<tone>` pastel wells, `hris-tile-<tone>` gradient tiles).
- **Destructive ghost actions** must carry a `destructive` class
  (`text-destructive`), so the v9 layer keeps them red.
- **Page header**: one `<h1>` per page (plain ink in v9), an optional
  description, actions on the right. The breadcrumb comes from the
  navigation, so a new page is labelled correctly as soon as it is added
  to `components/layout/navigation.ts`.
- **Charts**: reuse `SegmentRing` / `StackedBarChart`; they take plain data
  and need no client JS.
- **Timestamps from raw SQL** (`db.execute`) arrive as text: pass them
  through `toInstant()` (`lib/utils/instant.ts`) before formatting.

## Adding a page

1. Create `app/(dashboard)/<route>/page.tsx`; guard it server-side
   (`requirePermission` / `forbidden()`), never in the client.
2. Add the nav entry (with `permission` / `superadminOnly`) in
   `components/layout/navigation.ts`.
3. Build it from the primitives above.
4. Add the route to `ROUTES` in `scripts/smoke-routes.mjs`.

## Checks before a deploy

```bash
npx tsc --noEmit -p .
npm run lint
npm test                    # includes tests/meta/test-structure.test.ts
npm run build
SMOKE_USER=… SMOKE_PASSWORD=… npm run smoke:routes -- --id employeeId=<uuid> …
```

`smoke:routes` signs in, opens every page and fails on HTTP 5xx, the Next
error screen or browser console errors (403 counts as a pass). Run it once
per role you care about (Super Administrator, HR, Employee).
