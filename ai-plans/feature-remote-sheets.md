# Remote Sheets — domain-owned sheet content mounted at runtime (engine shared, content remote)

> Sibling of `feature-ai-pages-module-ownership.md` + `feature-ui-component-migration.md`.
> User direction 2026-10-23: the sheet ENGINE is shared (same imports in
> both realms via `@primebrick/ui` bridges); the sheet CONTENT is
> service-domain — declared by the owning service, mounted at runtime like
> remote pages, resolvable by anyone who knows the key.
> Hard constraint: zero behavioral drift for existing host-registered
> panels (`shell.*` / `entity.*` / `config.*` stay host for now).

## Status: � PARTIALLY DONE — Plan date: 2026-10-23

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 0 | Contracts — `ModuleSheetDecl`, `sheets?:` on ModuleNavDeclaration, `ModuleHostBase` extraction, `ModuleSheetHost`, `MountSheetFn` | ✅ done | 2026-10-23 | core `page-route.ts`; `ModulePageHostComponents`→`ModuleHostComponents` + `ModulePageNotifyInput`→`ModuleNotifyInput` renamed (shared base); `ModuleSheetSide`/`ModuleSheetDefaults` |
| 1 | Discovery plumbing — `sheets[]` pass-through (resolveModuleNavMeta BE → module-discovery → FE decl map) | ✅ done | 2026-10-23 | SDK `validateNavDeclaration` validates sheets (`<code>.<name>` keyspace enforced, component_url `/ws/` required, default_options shape); BE `navFromEndpoints` + `DiscoveredModule.sheets` access-filtered |
| 2 | FE resolver — `openSheet` resolves: host registry → remote decls → unknown notification; `remoteSheetDecls` map from discovered modules | ✅ done | 2026-10-23 | validation MOVED into the engine (`isSheetPanelKnown`); `resolveRemoteSheetDecl` in modules-shell; `default_options` merge under caller options; typed overloads keep host props safety; `sheet-manager.test.ts` 6 tests |
| 3 | `RemoteSheetMount.svelte` — loadRemoteModule + SRI + deps handshake + `mountSheet` named export + sheet-ctx build (api ws-bound from component_url) | ✅ done | 2026-10-23 | props-change → remount (replace semantics); error panel + retry; mfaStepUp dialog included |
| 4 | `mountSheet` remote contract — `bindRemoteCtx(ctx)` inside mount, props opaque Record, sheet chrome control via ctx | ✅ done | 2026-10-23 | `MountSheetFn` in core; `RemoteModule.mountSheet` typed; job chunk exports it |
| 5 | First remote sheet end-to-end — one real panel declared + mounted + opened from host AND from inside a remote page | ✅ done | 2026-10-23 | `job.runDetail` declared (nav-decl test ✓) + `RunDetailSheet.svelte` + chunk built (mountSheet export ✓, deps manifest ✓). **LIVE PROOF PASSED** (remote-sheet.spec.ts, 2 tests): decl via /modules -> sheet opens -> jobs-page.js loads -> mountSheet mounts -> props delivered -> ctx.api fetches run (partition-maintenance/uuid rendered) -> ctx.sheet.close() teardown -> unknown key rejected. Remote-page open transitively proven via bridge unit tests. Caveat: vite dev forks .svelte.ts modules per URL spelling + ?t= HMR stamps — spec imports the app exact fetched module URL via performance entries |
| 6 | `sheet/` bits-ui primitive → `@primebrick/ui` (E4 addition — the engine's chrome dep was missing from tranche 4) | ✅ done | 2026-10-23 | `components/sheet/` in ui; `$t`→`getT()`; vendor imports→relative; `export * as Sheet`; 8 FE consumers rewired; svelte-check 0/0; vendor:build ok |
| 7 | Progressive `shell.ai*` panels migration → `ai/fe/` (kills the C3 dual-ownership dilemma in ai-pages plan) | ⏳ not done | — | after live proof |

---

## Design (decided 2026-10-23)

### The layering

| Layer | Home | Content |
|---|---|---|
| Contract | `@primebrick/core` → re-exported by ui | `ModuleSheetDecl`, `ModuleSheetHost`, `MountSheetFn`, `ModuleHostBase` |
| Engine | FE `$lib/shell/sheets` (host chrome — sheets always render host-side) | `sheetState`, `openSheet`/`closeSheet`/`replaceSheet`/`setSheetExpanded`, `SheetHost` dispatch |
| Command | `@primebrick/ui` bridges | `getOpenSheet()` — **same import both realms**: host binds local engine, remote binds `ctx.components.openSheet` |
| Content | service `fe/` → ESM chunk via `module-assets` | `mountSheet(el, ctx)` — domain-owned |

### Realm mechanics

- Host realm: `bindSheet(openSheet)` → `getOpenSheet()` calls the real engine.
- Remote realm: `bindRemoteCtx(ctx)` binds `ctx.components.openSheet` → same
  `getOpenSheet()` call reaches the same host engine. The remote never sees
  `sheetState` — it sees the command (identical pattern to `mfaStepUp`).
- A remote chunk inside a sheet uses the vendored ui via the existing
  import map — verified pattern from remote pages.

### ctx — the perfect shape (user asked for the best solution)

```
ModuleHostBase      = { host_version, api, i18n, notify, components, mount_host }
ModulePageHost      = base + { nav, meta? }              (unchanged surface)
ModuleSheetHost     = base + { sheet: { key, props, close, replace,
                                        setExpanded, side, modal } }
```

- `ctx.api` on a sheet is bound to **the service declaring the sheet** —
  derived from `decl.component_url` (`parseWsServiceCode`), not from key
  parsing: the decl is the truth.
- No `nav`/`meta` — a sheet is not a route. Domain context arrives via
  `sheet.props` (opaque at the boundary; functions cross).
- `keepMountedState` stays caller-side (openSheet option), not in ctx.

### Declaration flow

```
service fe/  →  vite lib build  →  hashed chunk in fe/dist
service register → nav.sheets: [{key, component_url, integrity, access}]
BE service_registry.endpoints.nav → module-discovery → FE remoteSheetDecls
openSheet('<svc>.<name>', props) → resolver → RemoteSheetMount → mountSheet
```

- `sheets[]` uses the same lifecycle/registration/discovery channel as
  `routes[]` — service isolation preserved, zero aggregation.
- Validation: registered host panels ∪ discovered remote decls; unknown
  key → existing "Unknown sheet panel" notification.

## Deferred / out of scope

- `entity.*`/`config.*` host panels stay host-registered (platform content,
  not service domain) — approved for now, revisit later.
- Per-sheet prop typing: opaque Record at the boundary (domain knows its
  own shape; the engine never type-checks content props).
- Multiple simultaneous sheets: the engine is single-slot today
  (openSheet replaces panelId) — unchanged.

## Acceptance

1. Every existing panel opens identically (host registry path untouched).
2. A remote-declared sheet mounts, receives props, controls its chrome
   (`close`/`replace`/`setExpanded`), calls its owning service via ctx.api,
   and can be opened from host code AND from inside a remote page through
   the same `getOpenSheet()` import.
3. `svelte-check` 0/0, vendor build carries the new contract surface,
   unknown-key rejection still notifies.
