# Dynamic route realization — `(app)` catch-all → census decl resolution

> Continuation of `metadata-driven-page-system.md` task 21 — **phase A only**
> (remote-declared routes + module/part_of root resolution). Phase B
> (`kind`-dispatch to generic archetypes: EntityListPage/EntityFormPage)
> stays gated behind tasks 4/8/9 of the root plan and is out of scope.
> User direction 2026-10-24: **taglio netto — no legacy mechanism, one
> single source of truth, breaking changes welcome, fix the rewiring.**

## Status: 🟢 DONE — Plan date: 2026-10-24 · Implemented 2026-10-24

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Export `routePatternMatches` from `access-guard.ts` (module-private today) | ✅ done | 2026-10-24 | reused by resolver — no duplicate matcher |
| 2 | `resolvePageForPath(pathname, modules)` pure resolver util — redirect / remote+params / contract-error / not-found / denied | ✅ done | 2026-10-24 | `navigation/page-resolver.ts`; added `denied` + `error` branches (5-way union); **exact decl beats same-length template** so `/providers/create` never becomes a uuid |
| 3 | `(app)/[...path]/+page.ts` — `ssr=false`, bare-prefix/part_of-root redirect in universal `load` | ✅ done | 2026-10-24 | `denied`→`error(403)`, `not-found`→`error(404)`; census fetch failure → retryable network panel (not 500) |
| 4 | `(app)/[...path]/+page.svelte` — resolve → `RemotePageMount` / `RemotePageErrorPanel` | ✅ done | 2026-10-24 | `{#key pathname}` remount; `components.params` getter feeds template params; retry re-resolves with fresh census |
| 5 | Delete 6 remote-mount shims + 7 root shims + dead `module-root.ts` | ✅ done | 2026-10-24 | `redirectToModuleDefault` unused → whole file removed |
| 6 | Unit tests `resolvePageForPath` (all branches) + svelte-check + live verify all affected routes | ✅ done | 2026-10-24 | 13/13 resolver tests; 494/494 suite; svelte-check 0/0; live matrix below |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## What already exists (verified — do NOT rebuild)

| Piece | Where | Role |
|---|---|---|
| URL access guard | `navigation/access-guard.ts` + `(app)/+layout.svelte` | Gates EVERY navigation: longest `route_prefixes` owner → `routePatternMatches` on `routes` decls or nav-leaf hrefs; denied/unknown indistinguishable. **The catch-all never sees denied paths** — no RBAC to reproduce |
| `[param]` template matcher | `routePatternMatches` in access-guard.ts | `/x/[uuid]` ↔ segment-wise URL match; proven on emailsender detail |
| Default-leaf resolution | `defaultLeafHref` in `modules-shell.svelte` | `default:true` leaf post access-filter → first accessible fallback |
| Module-prefix resolver | `redirectToModuleDefault` | owner via `route_prefixes` → `defaultLeafHref` → 307 |
| Census | `routesCensusFromModules` | flattens `routes` decls + nav hrefs, already access-filtered |
| Remote mount + params | `RemotePageMount`, `ctx.components.params` | sha256-verified blob import; decl `[uuid]` → remote params (proven on emailsender detail) |
| Error/loading surfaces | `RemotePageErrorPanel`, skeleton | identical UX preserved |

## Current duplicated machinery (the drift this kills)

- **6 remote-mount shims** — `+page.svelte` ~80-97 LOC each, identical
  census-resolve → mount → error-panel sequence, differing only in the
  hardcoded route string:
  - `(app)/system/ai/console/+page.svelte`
  - `(app)/system/ai/docs-index/+page.svelte`
  - `(app)/system/emailsender/providers/create/+page.svelte`
  - `(app)/system/emailsender/providers/[uuid]/+page.svelte`
  - `(app)/system/job/job-schedules/create/+page.svelte`
  - `(app)/system/job/rules/create/+page.svelte`
- **7 root `+page.ts` shims** — each hardcodes its own prefix (duplicated
  truth; `route_prefixes`/`part_of` are already in the decl):
  - `(app)/system/+page.ts` — part_of root, prefers `is_reserved`
  - `(app)/crm/+page.ts` — part_of root, first enabled
  - `(app)/system/settings|ai|crm|emailsender|job/+page.ts` — `redirectToModuleDefault` module prefixes

## Design — `resolvePageForPath(pathname, modules)`

Pure function (no Svelte, no fetch — modules passed in) returning a
discriminated union — this makes the resolver unit-testable and the
component dumb:

```ts
type ResolvedPage =
  | { kind: 'redirect'; href: string }               // bare module prefix or part_of root → default leaf
  | { kind: 'remote'; decl: CensusRoute; params: Record<string, string> }
  | { kind: 'contract-error'; detail: string }        // decl found but not remotely mountable
  | { kind: 'not-found' };                            // guard already allowed → host surface or drift
```

Resolution order (ONE rule set — converges the 3 existing variants):

1. **part_of root** — `pathname` is a single segment and some module has
   `part_of === segment` → redirect to `defaultLeafHref` of the
   `is_default` module, else first enabled+accessible.
   (`/system` → settings ✓, `/crm` → crm ✓ — `is_default` verified in
   `service_registry`: settings is default+reserved, crm is default —
   identical landing to today's reserved-first/enabled-first variants.)
2. **Module bare prefix** — `(m.route_prefixes ?? []).includes(pathname)`
   → `redirectToModuleDefault` semantics (default leaf, 403 when zero
   accessible).
3. **Declared route** — `routePatternMatches(r.route, pathname)` over
   census `routes`:
   - `component_url` present → `remote` + params extracted by matching
     `[name]` segments positionally;
   - `component_url` absent → `contract-error` (host-rendered decl kinds
     `list`/`detail`/`create` have no archetype yet — a real decl gap,
     surfaced loudly; NOT a fallback render).
4. **Nav leaf without a `routes` decl** — the guard allows it (leaf href
   match) but there is nothing to mount → `contract-error` ("nav leaf
   without route declaration") — declaration drift surfaced loudly;
   task 23 will later enforce it at CI.
5. **Nothing matches** → `not-found` → RemotePageErrorPanel 404-style
   (guard whitelisted it → host surface or non-owned path).

Access control stays entirely with the layout guard — this resolver
decides *what to render*, never *whether you may*.

## `+page.ts` (catch-all)

```ts
export const ssr = false;
export async function load({ url }) {
  const r = resolvePageForPath(url.pathname, await fetchModules());
  if (r.kind === 'redirect') redirect(307, r.href);
  return { resolved: r };
}
```

Redirect in universal `load` (SSR+CSR) — the existing root-shim pattern.

## `+page.svelte` (catch-all)

Thin switch on `data.resolved`:

- `remote` → `<RemotePageMount decl params>` — identical mount contract
- `contract-error` / `not-found` → `<RemotePageErrorPanel>` — identical
  panels to today's shims (kind + detail)
- While `load` runs: same skeleton/`aria-busy` surface as current shims

Breadcrumb: `moduleBreadcrumbSegments(pathname)` — unchanged; title from
`decl.label_key` via `$t`.

## Delete list (hard cut — after live verify in same session)

- 6 remote shims (above) + 7 root `+page.ts` (above)
- Stays untouched: `docs/[...path]` (nested catch-all wins by
  specificity), all host-rendered pages (EntityTablePage lists, forms,
  credentials, bespoke), `/`, `login`, `welcome`, `mcp`

## Precedence safety (SvelteKit semantics)

Static routes always beat `[...path]`; a more-specific catch-all
(`docs/[...path]`) beats the root-level one for its subtree. New static
pages can shadow the catch-all anytime — zero lock-in.

## Acceptance

1. `pnpm vitest` unit tests cover all 5 resolution branches +
   param extraction + part_of-root `is_default` preference.
2. `svelte-check` 0/0.
3. Live (authenticated session): `/system/ai/console`, `/system/ai/docs-index`,
   `/system/emailsender/providers/create`, `/system/emailsender/providers/<real-uuid>`,
   `/system/job/job-schedules/create`, `/system/job/rules/create` all mount;
   `/system/ai`, `/system`, `/crm`, `/system/settings`, `/system/emailsender`,
   `/system/job`, `/system/crm` all land on their default leaf;
   a denied/unknown path under an owned prefix is indistinguishable-404 as today.
4. After delete: `grep RemotePageMount src/routes` → zero hits outside
   the catch-all; `grep route_prefixes src/routes` → zero hardcoded prefixes.

## Explicit non-goals

- Phase B archetype dispatch (`kind:"list"|"detail"|"create"` host-rendered
  pages through PAGE_REGISTRY/useEntityPage) — root-plan tasks 4/8/9.
- Census↔meta drift lint (task 23) — contract-error panel surfaces it
  meanwhile.
- Presence/collab, ETag meta cache — other plan tasks.

## Live verification matrix (2026-10-24 — all observed in browser)

| Path | Result |
|---|---|
| `/system/ai` | → 307 `/system/ai/console`, remote console mounted |
| `/system/ai/console`, `/system/ai/docs-index` | remote chunks mounted, 0 console errors |
| `/system`, `/system/settings` | → `/system/settings/profile` |
| `/crm` | → `/crm/customers` |
| `/system/crm` | → `/system/crm/pipeline` |
| `/system/emailsender` | → `/system/emailsender/providers` |
| `/system/job` | → `/system/job/job-schedules` |
| `/system/emailsender/providers/create` | remote create form (exact decl beat `[uuid]` template) |
| `/system/emailsender/providers/<uuid>` | remote edit form, `params.uuid` live |
| `/system/job/job-schedules/create`, `/system/job/rules/create` | remote forms mounted |
| `/system/settings/secret` (denied) | layout guard → safe page `/system/settings/profile` — catch-all never sees it |
| `/nonexistent/place` | SvelteKit 404 "The page does not exist" |
| `/docs` | → `/docs/ai/index` — nested catch-all wins by specificity |

## Anomaly found during verification (pre-existing, NOT this work)

`be-v3/docs/user-guide/generated/[...path].mdx` — a literal-bracket
generated stub (committed in `abbb109`, docs repair) lands in the docs
index; `docs/[...path]/+page.svelte` `resolve(hrefFor(...))` feeds it to
SvelteKit `resolve()` which parses `[...path]` as a param → console
TypeError. Pre-dates this task; fix = delete the junk stub OR sanitize
bracket segments in `hrefFor`. Deferred to user decision.
