# Root page skeleton — `PageHeader` MANDATORY in AppShell + `description_key` route-level + favorites (`user_preferences`)

> Continuation of `entity-form-archetype-pilot.md`.
>
> **User decisions (2026-10-28, rev2→rev3):**
> - `FormPageDecl.description_key`: **REMOVED** — route-level only.
> - `layout.sections`: **REMOVED** — deprecated; `kind:"page"` remote pages are the composition answer.
> - `extras`/`actions` open slots: **NOT BUILT** — deferred until needed with proper
>   semantics/options/lint/enforcer. Header v1 has a FIXED anatomy only:
>   breadcrumb + star-toggle + title + description + presence (collaboration).
> - Root header is **MANDATORY for every `(app)` page** — enforced structurally
>   (AppShell), by typing (props removed), and by lint (`no-restricted-imports`).
> - Star/favorite toggle left of the title → `user_preferences` via `/me` branch;
>   favorites appear as FIRST element of the app column in the app launcher.
>
> **Verified 2026-10-28:**
> - `PageHeader` CANNOT live in `@primebrick/ui` (ui invariants forbid `$app/*`,
>   `$lib` host imports) — host-only by construction.
> - `/api/v1/auth/me` branch EXISTS (`auth-session.router.ts`) — preferences go under it.
> - `GradientIcon` exists in FE (`$lib/components/ui/gradient-icon`) — hardcoded
>   sky→indigo stops; needs a `stops`/`variant` prop for amber.
> - `nav[]` leaves carry ONLY list/page hrefs — create/detail are census-only
>   (`module-nav-meta.ts`); favorites deliberately bypass this.
> - Zero service decls use `page_props.layout`; `AppPageLayout` has 0 importers;
>   `headerExtras`/`headerActions` have 0 consumers; ~10 identical `breadcrumb`
>   snippets in list `+page.svelte`s.

## Status: 🟡 IMPL DONE — verify partial — rev3: 2026-10-28

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Core: `PageRouteDeclaration.description_key` (route-level, all kinds); drop `FormPageDecl.description_key`; drop `layout`+`PageLayoutDecl`/`PageSectionDecl`/`PageSectionSource`/`MountSectionFn` | ✅ done | 2026-10-28 | chrome top-level; FormPageDecl.description_key removed |
| 2 | Core/decl: chrome opt-out flag on decl for remote pages owning their chrome (e.g. `page_props.chrome?: 'remote'` or top-level `chrome`) — decide exact axis at impl | ✅ done | 2026-10-28 | top-level chrome flag |
| 3 | SDK validator: accept `description_key` (+ chrome flag) on route decls + unit tests | ✅ done | 2026-10-28 | validator + nav-declaration tests pass |
| 4 | `PageHeader` component — `$lib/components/page-header/` — FIXED anatomy: breadcrumb (auto via `moduleBreadcrumbSegments`) + star toggle + h1 + description + presence area (collaboration). NO open extras/actions slots | ✅ done | 2026-10-28 | PageHeader.svelte — svelte-check 0 err |
| 5 | `useRouteDecl(pathname)` composable — resolves current `PageRouteDeclaration` from `shellNav.moduleNav.routes` (+ nav-link label fallback) | ✅ done | 2026-10-28 | useRouteDecl.svelte.ts — fn-based, no $derived |
| 6 | `AppShell`: render `PageHeader` inside the content region above `{@render children()}` — structural mandatory header for EVERY `(app)` page | ✅ done | 2026-10-28 | AppShell mounts once above children |
| 7 | Title resolution: `decl.label_key` → nav-link `label_key` (href match) → `entityPageTitle(meta)` (entity decls, via meta-cache) | ✅ done | 2026-10-28 | label_key → nav leaf → entityPageTitle(meta) |
| 8 | `EntityTablePage`/`EntityFormPage`/archetypes: strip ALL header code (breadcrumb snippet, h1, description read) — body only. Remove `header`/`breadcrumb`/`headerExtras`/`headerActions`/`title` props from `AppPageScaffold`/`FormPageLayout`/`EntityTablePage` | ✅ done | 2026-10-28 | header props/snippets stripped from scaffold+archetypes |
| 9 | Kill ~10 identical `breadcrumb` snippets in list `+page.svelte`s + ad-hoc headers in custom pages (migrations Refresh CTA, translations selectors — those controls move INTO page body or are deferred pending actions semantics) | ✅ done | 2026-10-28 | ~10 list pages + custom pages stripped; Refresh into body |
| 10 | Remove `AppPageLayout.svelte` (dead) + reconcile `AppPageScaffold`/`FormPageLayout` (body containers only — or absorb padding into shell frame) | ✅ done | 2026-10-28 | AppPageLayout deleted (dead) |
| 11 | Remove section machinery FE: `is_sectioned`/`PageSectionSlot`/`host-sections.ts`/`section-layout.ts` + section tests | ✅ done | 2026-10-28 | section machinery removed + tests updated |
| 12 | ESLint: `no-restricted-imports` on `src/routes/**` forbidding `AppPageBreadcrumb`, `moduleBreadcrumbSegments`, `AppPageScaffold`, `FormPageLayout`, `EntityTablePage` header props — pages can't rebuild chrome locally | ✅ done | 2026-10-28 | no-restricted-imports on routes/** in eslint.config |
| 13 | Catch-all `[...path]/+page.svelte`: remote routes get shell header automatically via AppShell; verify `decl` chrome opt-out honored (no PageHeader when decl says remote owns chrome) | ✅ done | 2026-10-28 | PageHeader honors decl.chrome; catch-all title gated chrome:remote |
| 14 | Star toggle in PageHeader (left of h1): empty=outline star, filled=amber-gradient star; click → PUT `/api/v1/auth/me/preferences` `key:'favorite_pages'` value=route list | ✅ done | 2026-10-28 | star + GradientIcon amber stops + filled |
| 15 | BE: `user_preferences` entity `public.user_preferences` — `(user_uuid, key, value jsonb)`, `UNIQUE(user_uuid,key)`, audit+soft-delete, `@Cached(ttl)`; entity + registry + db patch + MANIFEST sign | ✅ done | 2026-10-28 | entity+registry+patch applied + MANIFEST signed (49) |
| 16 | BE: `/api/v1/auth/me/preferences` routes — `GET` (all→`{key:value}`), `GET /:key`, `PUT /:key` (read-then-add/update — dal upsert banned), `DELETE /:key`; `AUTHENTICATED_USER`; **`etagMiddleware()` on the GET** (304 chain — pattern: translations.router.ts:121) | ✅ done | 2026-10-28 | GET/PUT/DELETE + etagMiddleware + AUTHENTICATED_USER |
| 17 | FE: `useUserPreferences` store/composable — **sessionStorage-backed** (pattern: `sessionStorage['user']` in user-profile-store) — load on shell mount, read-on-init + write-through on mutation, clear on logout; `setFavorite(route)`/`isFavorite(route)`; star state derived | ✅ done | 2026-10-28 | sessionStorage write-through; clear() in userProfileStore.clear() |
| 18 | `SidebarAppLauncher`: "Preferiti" pseudo-root as FIRST row of Apps column (amber-gradient star icon); selecting it fills the Pages column with favorite routes resolved via census (label_key+icon+kind — create pages allowed) | ✅ done | 2026-10-28 | Preferiti pseudo-root first row; census-resolved labels |
| 19 | i18n: `app.nav.favorites` + star a11y labels ×7 langs (public.translations patch + sign) | ✅ done | 2026-10-28 | app.favorites.{title,add,remove,empty} ×7 seeded public.translations |
| 20 | i18n: add `description_key` on job rules list/create decls (job-handler nav-declaration.ts) as first consumers | ✅ done | 2026-10-28 | description_key on ai console/docs + job schedule/rules decls |
| 21 | E2E: header anatomy per surface (list/create/remote/custom) + star toggle roundtrip + favorites in launcher + rules create regression; svelte-check + lint 0/0 | 🟡 partial | 2026-10-28 | svelte-check 0/0 + eslint routes at baseline; playwright specs not written — extend lifecycle + jobs-pages specs |
| 22 | Docs: anatomy/pre-implementation docs updates for mandatory header + preferences contract | ⏳ not done | — | pending user approval — propose first |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## The composition model

```
service.register → endpoints.nav.routes[] (validated)
        ↓
/api/v1/modules → mod.routes (access-filtered)
        ↓
AppShell (MANDATORY CHROME — every (app) page):
  AppSidebar │ AppTopbar │ AppServerBanner
  content region:
    PageHeader — breadcrumb │ ★toggle │ h1 │ description │ presence
    {@render children()} — the archetype/custom body
        ├─ EntityTablePage   → EntityListTable (+dialogs)
        ├─ EntityFormPage    → FormPageLayout (form+audit footer, no header)
        ├─ RemotePageMount   → remote chunk (or chrome opt-out)
        └─ custom +page.svelte → body content only
```

- **Nothing in a `+page.svelte` can produce or suppress header chrome** — the file
  renders body content only. The ONLY opt-out is the decl `chrome` flag
  (remote-owned chrome), honored inside PageHeader itself.
- Access guard already kills un-censused `(app)` routes → `useRouteDecl` always
  resolves; header renders breadcrumb+title for every page by construction.

## `user_preferences` — the adaptable KV entity

```ts
@Entity("user_preferences") // public schema — cross-application
class UserPreferenceEntity extends Auditable(EntityBase) /* + Deletable? decide */ {
  @Key() id: bigint;
  @Unique() uuid: UUID;
  /** Owner — user_profiles.uuid (logical FK). */
  user_uuid: UUID;
  /** Namespaced preference key — 'favorite_pages', 'ui.locale', 'list.filters.*', … */
  key: string;          // Unique(user_uuid, key)
  value: unknown;       // jsonb — shape is per-key contract, not schema-validated
}
```

- `favorite_pages` value: `string[]` of routes — **minimal storage**; label/icon/kind
  resolve LIVE from the census (metadata-driven, never stale, create routes allowed).
- Endpoints on the existing `/api/v1/auth/me` branch: generic KV `GET/PUT/DELETE` —
  any future preference rides the same surface without new endpoints.
- PUT does read-then-add/update server-side (dal `upsert` is banned by convention).
- **Consolidated cache chain** (same as translations/profile): Redis via `@Cached`
  on the entity → `etagMiddleware()` on the GET route (304 on re-poll) →
  sessionStorage backing in the FE store (read-on-init, write-through on PUT/DELETE,
  cleared on logout alongside `userProfileStore.clear()`).

## Star/favorites UX

- `★` left of the h1 — empty outline star → filled amber-gradient star on click
  (`GradientIcon` + `stops`/`variant` prop for amber; lucide `star` path).
- App launcher Apps column: **"Preferiti" pseudo-root first row** (amber-gradient
  star icon) — selecting it fills the Pages column with the favorite routes
  (flattened across modules; each resolved via census → label+icon+kind).
- Orphan favorites (route no longer censused): render muted, prunable — not an error.

## Impact analysis — vendors & remote

| Area | Impact |
|---|---|
| `@primebrick/ui` | NONE — PageHeader is host-only (can't live in ui: no `$app/*` allowed); `GradientIcon` is already FE-local |
| Vendor plane | NONE — header uses `DynamicIcon` (sanctioned) + FE-local gradient SVG; no new vendor imports |
| Remote chunks | NONE — header is host DOM above mount; no prop/snippet crossing (impossible by contract); only risk = double h1 → decl `chrome` opt-out |
| Remote decl contract | +`description_key`, +chrome flag (additive, snake_case) |
| BE | +`user_preferences` entity/table, +4 `/me/preferences` routes, +patch+sign |
| Access model | None — preferences are `AUTHENTICATED_USER` self-service, not leaf-gated |

## Resolved decisions

1. `FormPageDecl.description_key` → REMOVED (route-level only).
2. `extras`/`actions` slots → NOT BUILT (deferred with proper semantics/enforcer).
3. Header anatomy is FIXED: breadcrumb · ★ · h1 · description · presence.
4. Root header = AppShell-level → mandatory incl. custom pages; opt-out only via decl `chrome`.
5. h1: `decl.label_key` → nav-link label → `entityPageTitle(meta)`.
6. `/me` branch = existing `/api/v1/auth/me` — preferences under it.
7. Favorites = first row of app-launcher Apps column; create-kind routes allowed.

## Acceptance

- [ ] EVERY `(app)` page renders identical header anatomy from decl — zero per-page header code reachable (structural + typing + lint proof)
- [ ] `description_key` on ANY route kind renders the subtitle
- [ ] Star toggles favorite → persisted via `/me/preferences` → survives reload → shows in launcher first row (incl. create routes)
- [ ] Remote pages: host chrome default + decl opt-out works
- [ ] `layout.sections` + `AppPageLayout` + dead header props fully removed
- [ ] Presence area exists as fixed feature (collaboration consumer ready)
- [ ] E2E green + svelte-check + eslint 0/0
