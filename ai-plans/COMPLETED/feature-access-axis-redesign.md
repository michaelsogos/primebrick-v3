# Access Axis Redesign — leaf-derived keys, wildcard/exact coverage, default leaf

> Blocks `feature-emailsender-pages-module-ownership.md` (its nav decl
> lands on THIS contract) and repairs the `/system/ai` violation from the
> AI migration. User decisions confirmed 2026-10-24 — every rule below is
> frozen model, not proposal.

## Status: � DONE — Plan date: 2026-10-24 — all 19 tasks landed; unblocks `feature-emailsender-pages-module-ownership.md`

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| **Landed slice (kept — namespace declaration mechanics)** |
| 1 | core `ModuleNavDeclaration.access` required (unrepresentable) | ✅ done | 2026-10-24 | docstring retagged "namespace" |
| 2 | sdk `validateNavDeclaration` — access required, must equal `accessNamespace(code,partOf)` | ✅ done | 2026-10-24 | 23/23 validator tests green |
| 3 | sdk check-standards rule `nav-decl-access` | ✅ done | 2026-10-24 | proven both directions |
| 4 | us: JH `access.system.job`, CRM `access.crm` + decl tests | ✅ done | 2026-10-24 | JH re-registered online with new decl (verified in registry) |
| 5 | be: `navFromEndpoints` access cast + all 5 register rejections → `for the brick '<code>'` + `brick:<code>` tag | ✅ done | 2026-10-24 | tsc clean |
| 6 | be: test fixtures updated (nav-meta + discovery) | ✅ done | 2026-10-24 | 20/20 nav-meta+discovery |
| **Redesign — the confirmed model** |
| 7 | sdk `access.ts` — `accessGrantCovers` drops ancestor clause (exact \| wildcard-regex only); `isAccessGranted` drops `isAdmin`/`ADMIN_INHERITED_ACCESS`; new `accessLeafKey(ns, relPath)` + `accessSheetKey` + `isAccessGrantLegal()` | ✅ done | 2026-10-24 | `access.*`,`access`, bare ns all ILLEGAL; 13/13 access tests |
| 8 | core types — kill item `access` on `ModuleNavLink`/`PageRouteDeclaration`/`ModuleSheetDecl`; add `ModuleNavLink.default?: boolean` | ✅ done | 2026-10-24 | item keys derived, never declared |
| 9 | sdk validator — `strictlyUnderAny` rejects `route===prefix`/`href===prefix` recursive (children too — pre-existing bug fixed); exactly-one `default` leaf; item `access` field rejected | ✅ done | 2026-10-24 | `/system/ai`-style pages unrepresentable |
| 10 | be discovery — module-gate dropped; leaf-key filter (`accessLeafKey` via `owningRoutePrefix`); `accessible:false`+`nav_hidden` emitted for zero-leaf modules; `computeHome`/`home`/`isAdmin` gone | ✅ done | 2026-10-24 | `isAccessGranted` per derived key |
| 11 | be MODULE_NAV.settings — `/system/settings` census route + `templates` + `email-providers` removed; `profile` flagged `default` | ✅ done | 2026-10-24 | inventory: 10 leaves |
| 12 | be role_mappings write-path — `assertAccessGrantsLegal` on create+update vs `collectAccessLeafKeys()` (real derived inventory: routes+nav+sheets) | ✅ done | 2026-10-24 | 422 `ILLEGAL_ACCESS_GRANT` on typo/bare/root |
| 13 | be db patch — `20261024180000_access_axis_admin_seed.sql`: `administrators.permissions += ["access.system.*","access.crm.*"]` (idempotent @> guard) + UPDATE audit + `app.nav.show_all` ×7 langs | ✅ done | 2026-10-24 | signed `dev-micha-2`, applied, verified on DB (v2) |
| 14 | us ai — `/system/ai` content page died → leaf `/system/ai/console` (`default:true`); nav/routes restructured; FE `system/ai/console/+page.svelte` (docs-index mount pattern) + `system/ai/+page.ts` shim | ✅ done | 2026-10-24 | dispatcher keys updated; decl tests 7/7 |
| 15 | us jh/crm — `default` flagged (job-schedules / customers) | ✅ done | 2026-10-24 | decl tests 5/5 + 4/4 |
| 16 | fe — api-types: `home`/item `access` dropped, `default`/`accessible`/`nav_hidden` in; launcher GOTO → `defaultLeafHref`; `resolveSafePage`; ALL root shims decl-driven (`/system`, `/crm`, `/system/{settings,job,ai,crm}`); dead `settings/+page.svelte` + `templates/` deleted | ✅ done | 2026-10-24 | `home` eliminated everywhere |
| 17 | fe — URL guard in `(app)/+layout.svelte`: `isRouteAccessible` vs access-filtered census → RFC7807 `ACCESS_DENIED` notification naming the page + `goto(safePageFor)` | ✅ done | 2026-10-24 | unknown≠filtered — non-disclosing |
| 18 | fe — launcher footer `Switch` (`app.nav.show_all`): reveal renders hidden roots/modules (`accessible:false`) + pages (`nav_hidden`) disabled — rows preview-only, GOTO CTA `disabled`, activate no-ops | ✅ done | 2026-10-24 | `aria-disabled`, `data-hidden` |
| 19 | tests — discovery/nav-meta fixtures (20/20), sdk access (13/13) + validator (23/23), fe modules-shell (12/12) + NEW access-guard (11/11), e2e specs + `e2e_user` grant → `access.system.job.*` | ✅ done | 2026-10-24 | FE unit 474/474, BE modules 274/274, svelte-check 0 |

## The frozen model

- **Keys**: `access.<app>.<module>.<leaf>` — leaf = route path after prefix;
  `/create` + `/[param]` collapse into the leaf (one key per page subtree).
  Sheets: `access.<ns>.<sheetName>`. Nav items inherit the key of the
  route they point to.
- **Coverage**: grant === required, OR grant contains `*` → regex.
  No ancestor coverage. `access.system` bare grants NOTHING.
- **Admin**: `is_admin` bypasses RBAC only — access axis always explicit.
- **Visibility**: module shown iff ≥1 leaf accessible (derived, no gate key).
- **Default**: exactly one `default:true` leaf per module; GOTO(module)
  resolves it; filtered → first accessible leaf.
- **Illegal grants**: `access`, `access.*`, bare namespaces, nonexistent
  leaf keys — write-path rejection + `isAccessKey` fail-closed.
- **Seeds**: `administrators` += `access.system.*`,`access.crm.*` only.

## Leaf inventory (verified against decls + FE routes)

- settings (10): profile, credentials, organizations, users, roles,
  configurations, modules, clients, migrations, translations —
  `templates` DEAD (email_template lives in emailsender; FE page is a
  TODO mock), `email-providers` MIGRATING.
- job (4): job-schedules, runs, rules, sheet runDetail.
- ai (6): console (post-fix), docs-index, sheets modelTestReport/
  modelCache/cerebellum/modelImport.
- crm (2): customers, pipeline.
- emailsender (1 post-migration): providers.
