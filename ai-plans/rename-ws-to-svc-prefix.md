# Rename `/ws/` proxy prefix → `/svc/`

## Status: 🟢 DONE — Plan date: 2026-10-26 21:30 UTC / 23:30 CEST

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | be-v3: `proxy.router.ts` mount `/ws/:serviceCode/*` → `/svc/:serviceCode/*`; `system.router.ts` migration_failed exemption prefix; MCP dispatch `/ws/<module>` pattern | ✅ done | 2026-10-26 | also `proxy-service.ts` strip regexes, `aggregated-router.ts` path prefix |
| 2 | fe-v3: `api.ts` `entityApiBase` + all `/ws/<code>` literals; `remote-loader.ts` `parseWsServiceCode` regex `^\/ws\/([^/]+)\/`; any hardcoded `/ws/` in lib/routes | ✅ done | 2026-10-26 | fn renamed `parseSvcServiceCode`; `vite.config.ts` dev proxy key `/ws`→`/svc` |
| 3 | sdk: `nav-declaration.ts` validator (`component_url` must start `/svc/`); `service-identity.ts` + `create-microservice.ts` doc comments; tests | ✅ done | 2026-10-26 | compile-time enforcement of the new prefix |
| 4 | core: `filter-presets.ts` `serviceApiBase` doc + test expectations; `page-route.ts`/`entity-meta.ts` doc comments | ✅ done | 2026-10-26 | |
| 5 | us-v3: every `*/src/nav-declaration.ts` `component_url` literal `/ws/<svc>/…` → `/svc/<svc>/…` (ai, crm, emailsender, job-handler) | ✅ done | 2026-10-26 | self-heals service_registry on re-registration at boot — verified |
| 6 | fe-v3 e2e: all specs using `/ws/` (`entity-crud-lifecycle`, `jobs-pages`, `remote-sheet*`, `docs-browser`, `system-migrations`, ai-*, module-ownership) | ✅ done | 2026-10-26 | |
| 7 | Docs sweep: `/ws/` mentions in docs/ + .devin/rules across all repos | ✅ done | 2026-10-26 | sdk/core/dal `extract-docs` regenerated after dist rebuild |
| 8 | Verify: boot all services → service_registry nav refreshed → module-ownership + lifecycle e2e green | ✅ done | 2026-10-26 | registry: 0 `/ws` rows; e2e evidence below |

---

## Decision

`/ws/` ("web service") is a wrong name for what it is — a service-scoped proxy
prefix. Chosen: **`/svc/`** (denotes exactly "proxied to service X").

Rejected:
- `/app/` — "app" is already the `part_of` virtual namespace; double meaning.
- `/ws/` — misleading (not a web service, not a worker).

## Touchpoints (~78 files, 7 repos)

| Repo | What changes |
|------|--------------|
| be-v3 | `proxy.router.ts` mount path; `system.router.ts` exemption comment+logic for `migration_failed` instances; MCP dispatch proxy pattern |
| fe-v3 | `api.ts` (`/ws/${service}` builders ×4), `remote-loader.ts` (`parseWsServiceCode`), e2e specs |
| sdk | `nav-declaration.ts` `component_url` validator — the enforcement seam; doc comments in `service-identity.ts`, `create-microservice.ts` |
| core | `serviceApiBase` doc + `filter-presets.test.ts` expectations; doc comments in `entity-meta.ts`, `page-route.ts` |
| us-v3 | `component_url` literals in every service `nav-declaration.ts` |
| dal/ui | docs only |
| docs | every `/ws/` mention in `docs/` + `.devin/rules/` |

## DB note — no migration needed (verify)

`service_registry.endpoints.nav` stores `component_url` strings — but services
re-register their nav declarations on every boot, overwriting the stored
payload. Renaming declarations + restarting services refreshes the census.
**Verify empirically** after restart that no `/ws/` survives in
`service_registry` (query `endpoints.nav` JSON for `"/ws/"`).

## Risk

Hard breaking change by design — old browser sessions / cached chunks with
`/ws/` URLs 404 until reload. Dev-only surface; acceptable per "breaking
changes are welcome". The SDK validator (task 3) makes a stale `component_url`
a boot-time declaration error, not a runtime surprise.

## Evidence (2026-10-26)

- `curl :5173/svc/crm/api/v1/module-assets/crm-pages.js` → 401 (auth wall —
  proxy mounted); `curl :3001/ws/…` → 404 (old prefix gone).
- `service_registry`: ai/crm/emailsender/job re-registered — `endpoints`
  contains zero `/ws/`, all `/svc/`.
- e2e: module-ownership 8/8, entity-crud-lifecycle 6/6, remote-sheet 2/2,
  jobs-pages 15/15. The 2 stale `/job handler/i` assertions were fixed by
  resolving the expected label live (`expectedJobModuleLabel` — label_key
  → module's own en-GB dict, same convention as
  `module-ownership.spec.ts:expectedModuleLabel`), so the tests now track
  the declared label instead of a hardcoded literal.
- unit: fe 493/493, core 33/33, be module-discovery 17/17, us nav-decl
  7+6. sdk 425/426 (1 pre-existing `EMAILSENDER_TEMPLATE_READ_ALL` naming
  failure, identical on develop).
- tsc/svelte-check: be, sdk, core, all 5 us, fe — 0 errors.
- Fixed en route: ai/emailsender/job-handler `entities-route.ts` had a stale
  `meta … as unknown as Record<string, unknown>` cast broken by the tightened
  SDK `EntityRouteDecl.meta: EntityMeta` — dropped the cast (crm pattern).
