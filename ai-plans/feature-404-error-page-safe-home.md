# Feature: Minimalist error page (404/500) with "Return to home" safe-path resolution

## Problem

After the `/system/settings/security` → `/system/settings/configurations` rename,
any stale URL renders SvelteKit's raw default error page ("404 Not Found" plain
text). There is no `+error.svelte` anywhere in the FE — verified by `find`.

Goal: a branded minimalist error page with a **"Return to home"** CTA that walks
the URL parent-by-parent until it finds a valid landing page, using module/nav
metadata — no hardcoded route table.

## Evidence (empirical)

- No `src/routes/+error.svelte`, no `+error.svelte` anywhere → SvelteKit default
  error page is what the user sees today.
- `shellNav` store (`src/lib/shell/modules-shell.svelte.ts`) exposes:
  - `modules: ModuleInfo[]` — each has `route_prefixes?: string[]`
    (e.g. settings → `["/system/settings"]`, crm → `["/customers","/crm"]`)
  - `moduleNav.nav: ModuleNavLink[]` — ordered nav links for the selected
    module (first link of settings = `/system/settings/profile`)
  - `loadModules()` populates `modules`; `fetchModuleMeta(code)` returns nav.
- `resolveModuleFromRoute(pathname)` already implements prefix matching against
  `route_prefixes` — reusable pattern.
- Root `/` route exists (`(app)/+page.svelte`) but is an empty placeholder —
  the "pure home" the user says doesn't exist yet. It is still a safe fallback.
- BE `/api/v1/modules` + `/api/v1/modules/:code/meta` — verified endpoints.

## Design

### 1. Error page — `src/routes/(app)/+error.svelte` + `src/routes/+error.svelte`

SvelteKit renders the **nearest** `+error.svelte` for a failed/missing route.
Create BOTH:

- `src/routes/+error.svelte` — root fallback (login-adjacent routes, total
  failures). Standalone minimalist page, no app shell dependency.
- `src/routes/(app)/+error.svelte` — used when the URL falls inside the app
  group territory. Same visual component, rendered inside the app shell
  (sidebar/topbar stay visible).

DRY: one shared component `src/lib/components/error-page/ErrorPage.svelte`
with props `status`, `message`; both `+error.svelte` files are thin wrappers.

Visual: centered, `status` in large muted type, short i18n title/description,
one primary button "Return to home" + secondary "Go back" (`history.back()`).
data-testids: `error-page`, `error-page-status`, `error-page-home-cta`,
`error-page-back-cta`.

### 2. Safe-home resolver — `src/lib/navigation/safe-home.ts`

Pure function + async resolution:

```ts
resolveSafeHome(pathname: string): Promise<string>
```

Algorithm (empirical, metadata-driven):

1. Build ancestor chain: `/system/settings/security` →
   `/system/settings`, `/system`, `/`.
2. Ensure `shellNav.modules` loaded (call `loadModules()` if empty; on failure
   skip to step 5).
3. For each ancestor, in order:
   a. If it equals a `route_prefixes` entry of a module → resolve the module's
      default page = **first nav link** (`fetchModuleMeta(code)` →
      `nav[0].href`). `/system/settings` → `/system/settings/profile`.
   b. If it equals an existing nav `href` inside any module meta already
      fetched → use the ancestor itself.
4. If ancestors exhaust → `/`.
5. On any fetch failure or empty modules → `/`.

This naturally handles the reported case:
`/system/settings/security` → parent `/system/settings` is a `route_prefixes`
match of the `settings` module → lands on `nav[0].href` = `/system/settings/profile`.

Also handles: `/customers/123-deleted` → `/customers` (nav href) ;
`/totally/bogus` → `/`.

### 3. i18n

New keys (FE fallback `en-GB-fallback.json` — `app.*` keys are FE-owned):

- `app.error.title.404` — "Page not found"
- `app.error.title.generic` — "Something went wrong"
- `app.error.description.404` — "The page you are looking for does not exist or was moved."
- `app.error.returnHome` — "Return to home"
- `app.error.goBack` — "Go back"

(BE seed translations optional — `app.*` keys live in FE fallback per
`.devin/rules/i18n-translation-sources.md`.)

## Files

| File | Change |
|---|---|
| `src/lib/components/error-page/ErrorPage.svelte` | new shared component |
| `src/routes/+error.svelte` | new root error boundary |
| `src/routes/(app)/+error.svelte` | new app-shell error boundary |
| `src/lib/navigation/safe-home.ts` | new resolver |
| `src/lib/i18n/messages/en-GB-fallback.json` | +5 `app.error.*` keys |

## Acceptance criteria

- `/system/settings/security` → error page inside app shell, "Return to home"
  navigates to `/system/settings/profile`.
- `/nonexistent/deep/path` → error page, CTA navigates to `/`.
- 500 errors show same chrome with generic title.
- `svelte-check` 0 errors; svelte-autofixer MCP pass on the new component.
- No hardcoded route list in the resolver — only `route_prefixes` + nav meta.

## Out of scope

- A real dashboard/home page for `/` (user said it doesn't exist yet).
- Old-route redirects (hard cut per previous plan).

## Implementation log (2026-09-17)

Implemented and verified:

- `src/lib/navigation/safe-home.ts` — `resolveSafeHome(pathname)` walks ancestors,
  resolves module via `route_prefixes`, returns `nav[0].href` (or the ancestor
  itself if it is a nav page). Never throws, degrades to `/`. Fixed: `shellNav.loading`
  starts `true`, so the resolver must call `loadShellNav()` whenever `modules` is
  empty (not only when `!loading`).
- `src/lib/components/error-page/ErrorPage.svelte` — minimalist page (big status
  code, title, description, optional raw message), "Go back" + "Return to home"
  CTAs. Calls `loadPublicTranslations(get(uiLang))` on mount — required because
  the root `+error.svelte` renders outside the `(app)` shell where translations
  are loaded. svelte-autofixer: clean.
- `src/routes/+error.svelte` + `src/routes/(app)/+error.svelte` — thin wrappers
  feeding `page.status` / `page.error.message`.
- i18n keys `app.error.*` are BE-owned: seeded via
  `db-meta/fire-and-forget/add_error_page_translations.sql` (6 keys × 6 languages,
  snake_case per convention) + en-GB fallback JSON for the unreachable-BE path.
- Unit tests `src/lib/__tests__/safe-home.test.ts` — 5/5 pass.

Verified live on dev server (:5173, authenticated Playwright session):
- `/system/settings/security` → styled 404 page (Italian: "Pagina non trovata"),
  CTA navigated to `/system/settings/profile`.
- `/nonexistent/deep/route` → 404 page, CTA navigated to `/`.

`pnpm check`: 0 errors (4 pre-existing warnings). Full vitest suite: 6 failures
in 3 files confirmed pre-existing on HEAD via `git stash` — unrelated.

### Style iteration (post-verification)

- Layout aligned 1:1 with SvelteKit's built-in `default-error.html` fallback:
  system-ui font stack (literal, not app Inter), status `3rem/200` with
  `-0.05rem` optical offset, 1px divider + `1em/400` title, `max-width 32rem`.
- All sub-content in monospace `text-xs`: `{internal_code} - {message}` bold,
  `detail` normal. RFC7807 extras (`detail`, `internal_code`) passed from
  `page.error` via `Partial<RFC7807Error>` cast in the wrappers.
- CTAs are plain text+icon links (`gap-20`): "Go back" foreground, "Return to
  home" with `text-primary-gradient` + `text-primary` icon + `decoration-primary`
  underline. Home CTA is a real `<a href>`; renders as disabled span until the
  resolver finishes.
- Title chain: `app.error.title.{status}` (BE-seeded, 16 codes × 6 langs via
  `add_error_status_title_translations.sql`) → RFC 9110 reason phrase
  (`src/lib/errors/http-status.ts`) → `app.error.title.generic`.
- One single dynamic layout covers all 4xx/5xx — no per-status pages.
