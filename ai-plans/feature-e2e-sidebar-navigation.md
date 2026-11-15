# Feature: E2E sidebar navigation sweep

## Objective

A committed Playwright spec that clicks **every** sidebar navigation link, one by
one, and proves each destination actually mounts — instead of navigating via
`page.goto()`. Reuses the proven session/bootstrap machinery of
`ai-json-schema-quality.spec.ts` (CDP attach to the persistent Edge profile,
`/api/v1/auth/me` gate, real login, `it-IT` locale pin).

## Empirical findings (already verified)

- `AppSidebar.svelte` renders items from `shellNav.moduleNav.nav`:
  - leaf items → `<a href>` inside `Sidebar.MenuButton`
  - parent items → `Sidebar.MenuButton` (no href) that toggles a
    `Sidebar.MenuSub` containing child `<a href>` items
- No `data-testid` on nav links — `href` is the stable, unique locator
  (consistent with the testid convention: href is a DOM contract, not a CSS/i18n
  selector).
- Module nav loads async after `onMount` → the sidebar links appearing is
  already our hydration gate (reused).
- The module switcher (`SidebarModuleSwitcher`) can change the active module and
  therefore the nav item set → the spec captures the item list once for the
  current module, per module if the switcher exposes multiple modules
  (investigate empirically during implementation; default: current module only).

## Spec: `src/e2e/navigation.spec.ts`

### Bootstrap (shared pattern, duplicated like the json spec)

1. Attach CDP `:9333` (fall back to launching dedicated persistent Edge profile
   if nothing listens — same helper logic as the json spec).
2. `GET /api/v1/auth/me` → if 401: `deleteMfaFactorsByUsername("admin")` +
   `setAuthMethodEnforcerDismissed("admin", true)` in `beforeAll`, then real
   login form flow (`login-username-input` etc.) with the documented
   `admin`/`admin` test credentials, re-verify `auth/me`.
3. Pin `sessionStorage["pb.lang"]="it-IT"` before first navigation.
4. Land on `/`, wait for the sidebar link `a[href^="/system/"]` (hydration gate)
   — bounded 30s via 6×5s `waitFor`.

### Navigation sweep

5. Collect nav targets **from the live DOM**:
   - read all `Sidebar.Menu a[href]` (leaf items)
   - for each parent group (`aria-expanded` button without href): click to
     expand, collect child `a[href]`, then continue
   - produce ordered list `[{ href, label }]` — labels for logging only
6. For each target, **one at a time**:
   - click the actual `<a>` element via its `href` locator
   - `page.waitForURL("**" + href)` bounded (30s, poll evidence)
   - assert page mounted: `main` (or `#app` content root) is non-empty and no
     Svelte error boundary / `app.common.error` state — exact assertion picked
     empirically during implementation (inspect what each page renders)
   - return to the sidebar context and continue to next item
   - log `[nav] href → OK (Ns)`
7. Failure policy: stop at first failure and report which href failed and what
   the DOM actually showed (screenshot via Playwright default on failure).

### Boundaries

- All ordinary waits: 30s max, 5s evidence intervals.
- No sleeps, no text/i18n selectors, no CSS-class selectors.
- No production-code changes (test-only).
- Browser left open at the end (session reuse convention).

## Acceptance criteria

- `pnpm exec playwright test src/e2e/navigation.spec.ts` passes on the
  persistent Edge profile in ≤ ~2 min.
- Every nav link of the active module is clicked and its destination verified.
- A broken link/route fails fast with the failing href in the error.

## Open items for implementation (resolved empirically while writing)

1. Exact "page mounted" signal per destination (generic `main` non-empty vs.
   per-page testid — decide after one DOM pass over the routes).
2. Whether to iterate module switcher too (only if trivially enumerable).
3. Group-collapse bookkeeping: expanding a parent may collapse others — re-query
   the DOM list per click rather than trusting a stale snapshot.
