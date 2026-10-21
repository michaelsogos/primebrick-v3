# Module Ownership Hardening — namespace enforcement, naming integrity, fail-hard

> Follow-up of `table-pages-merge.md` (tasks 20/20b/20c). User-reviewed design:
> translations are schema-namespaced, service_code is immutable/derived,
> no soft-fail — misconfigured modules fail loudly. C/D items (contract
> ambiguities + console cleanup) presented separately after this lands.

Status: 🟢DONE — Plan date: 2026-10-20 (updated EOD)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | **Boa 1 — namespace enforcement (BE/DAL/SDK)**: `keyNamespaceOf(entity)` + generalized `assertKeyModuleBoundary` (`public`→`app`, else schema name — `custom` becomes the normal rule); fail-hard on missing `<code>.translations` (remove 42P01 empty-dict); `emailsender` out of `MODULE_ENTITIES` → discovery; `service.register` validates `endpoints.nav` shape + label_key namespaces at enrollment; check-standards rules: `i18n-sql-ns` (patch seeds) + `i18n-meta-ns` (`*.meta.ts` `*_key` literals vs allowed ns, per-repo allowlist); unit test `MODULE_ENTITIES ⊆ {app,system,settings,custom}` | ✅ done | — | G1-G6 |
| 2 | **Boa 2 — entity i18n ownership**: `EntityMeta.entities_ns?: string` (core contract; default `system` for BE entities); job meta `entities_ns:"job"` + F/V → `job.entities.*`; patch `0006` renames `system.entities.job_*` → `job.entities.job_*` in `job.translations` (0005 shipped — never edit); host dialogs + `JobsPage` selection labels compose `<entities_ns>.entities.<tk>.*`; `EntityListTable` prop + ELT→dialogs thread | ✅ done | — | A1+A2 |
| 3 | **Boa 3 — service_code integrity**: `createMicroservice` resolves code = `options.serviceCode ?? derive(pkg_name sans 'primebrick-')`; boot validation `serviceName`/`service_code` config === resolved code → mismatch = refuse boot; `service_registry.code` non-editable (meta `readonly`? verify meta support); `service_registry` gains `Deletable` (soft-delete = admin removal; `status` stays telemetry; `is_reserved` blocks); `/modules` excludes `!is_enabled`/deleted rows | ✅ done | — | A3a+A3b |
| 4 | **Boa 4 — FE dedup + ownership semantics**: `CORE_DICT_MODULES` single const (use-module-translations + layout + translations admin share it; layout drops duplicate loads); translations admin: no silent static fallback → explicit error; `resolveModuleFromRoute` no-match → `null` (reserved is a module, not a sink); switcher `?? modules[0]` → neutral state; `inside` check → `resolveModuleFromRoute(path)===m.id`; module home = `nav[0].href` (await selectModule); `/system/+page.ts` longest-prefix + nav[0].href + error-not-silent-fallback; `isLinkActive` ownership-aware; DynamicIcon → visible missing-icon state | ✅ done | — | B1-B6 |
| 5 | **Boa 5 — CRM playground service**: `crm-handler` in us-v3 (playground — comments mark non-product; no CI/docs); owns `/system/customers`+`/crm` nav via endpoints.nav; `MODULE_NAV.crm` removed; entities still BE-served phase-1 | ✅ done | — | A5 |
| 6 | **Boa 6 — E2E hardening**: switcher bidirectional (job→settings!) + switcher↔route-module consistency; i18n raw-key scan on page; per-UiLang dict non-empty; icon render assertions; `page.on('response'/'console')` hygiene (no unexpected 4xx/5xx, no warnings); then live verify + plan/doc updates | ✅ done | — | — |
| 7 | **Boa 7 — C/D leftovers (post-review)**: C4(b) failed-dict surface → pushNotification HIGH/MEDIUM (non-blocking, done); D2 single home source → switcher uses `nav[0].href` after selectModule (done); D3(a) settings prefixes → `['/system/settings','/system/migrations']` no catch-all + `/system` shim falls back to reserved module (done); D1 icon single-source → pending user decision (explain delivered) | ✅ done | — | C4/D2/D3a |
| 8 | **D4+D5 — docs sync (MUST DO, deferred)**: `docs/dev-guide/module-navigation.mdx` still claims "MODULE_NAV single source of truth" — rewrite for endpoints.nav self-declaration; `docs/ai/i18n.md` still claims "ALL translations owned by the BE" — rewrite for service-owned `<code>.translations` discovery + namespace enforcement | ⏳ | — | deferred per user |
| 9 | **D1 — icon single-source**: `service_registry.icon` is THE module/service icon (user-decided). `endpoints.nav.icon` removed from `ModuleNavDeclaration` (core), `navFromEndpoints`, `validateNavDeclaration`, `MODULE_NAV.settings`, job+crm decls, FE `ModuleNav`; `/modules` now `s.icon` only. Three scopes clarified: service icon (identity) / nav[].icon (per-link) / nav.icon (gone) | ✅ done | — | — |

---

## Conventions locked (user-approved)

- **Namespace**: `public`→`app.*` (only ns with FE static EN fallback), `system`→`system.*`, `custom`→`custom.*`, `<service>`→`<service>.*`. A module writes ONLY its own namespace in its own schema.
- **Meta key references**: `*_key` values may reference `{own-ns, app, system}` — core labels reusable; foreign non-core ns forbidden (future: declared module deps).
- **service_code**: immutable — derived from `package.json` name (`primebrick-X` → `X`) or explicit `options.serviceCode` (code-level declaration). Never admin-editable at runtime; DB field non-editable; mismatch vs config = boot failure.
- **Registration = hard upsert** (verified): `service_registry` row overwritten verbatim; MCP entityRegistry wipe+re-register per code; `unregisterModule` on offline/unregister.
- **Fail-hard**: registered service without `<code>.translations` → explicit error (no empty dict); malformed `endpoints.nav` → registration rejected; unknown icon → visible error state.


## EOD notes

- Boa 1-4 committed across core/BE/SDK/FE. Boa 5: `primebrick-us-v3/crm` scaffolded (pkg `primebrick-crm`, schema `crm`, port 3007), registered live; `MODULE_NAV.crm` removed; `system.entities.crm.*` drift soft-deleted (patch 20261020170000), keys re-seeded as `crm.*` in crm.translations; FE pipeline page + breadcrumb moved to `crm.pipeline.*`.
- Boa 6: `src/e2e/module-ownership.spec.ts` — 4/4 green live (job+crm running). Suite-driven fixes: `system.entities.page_title.*` lacked en-US rows → parity backfill patch `20261020173000_translations_en_us_parity` (57+57 keys en-GB→en-US); `/system` redirect +page.ts now `ssr=false` (SSR fetch has no session cookie); switcher trigger got `data-testid` for unambiguous selection.
