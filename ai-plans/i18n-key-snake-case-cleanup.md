# i18n Key snake_case Cleanup + Lint Enforcement — Plan

## Objective

Normalize every translation key to a strict `^[a-z0-9_]+(\.[a-z0-9_]+)+$`
grammar across all translation schemas, fix the 14 cross-schema rows by
domain (rename-in-place vs physical move), then prevent regression at
FOUR layers — DB CHECK, migration-engine validator, service+router
guards, lint — plus docs in every involved repo, so malformed/non-snake/
wrong-ns keys can never re-enter on ANY path (HTTP, seed SQL, raw psql).

## Why this exists — the honest threat model

**This enforcement exists for AI agents, not for humans.** Humans read a
convention once and follow it — slower, but correct. Agents do not absorb
conventions by culture: given the same problem twice they produce two
"reasonable" implementations, treat an unguarded gap as license for a
workaround, and optimize for *plausible* over *canonical*. That is how
one codebase grew ten ways to do the same thing — conventions that live
only in docs are invisible at generation time.

So every guard here targets the agent failure modes specifically:
inventing a parallel key shape instead of reusing the grammar, writing
seed SQL that bypasses the service boundary, assuming a namespace
instead of looking up the owner table. 1,328 non-snake keys + 14
cross-schema rows + 56 dangling `config.*` referrers are the fossil
record of unenforced conventions.

Concretely: keys are THE CONTRACT between code and vocabulary —
`$t(key)` resolves every page, dict row, meta label, nav item and error
message. Malformed/mis-scoped keys = raw technical strings to users,
unresolvable dict labels, module ownership that is documentation rather
than fact. The stack makes the next violation **impossible by
construction** on every write path — and lets downstream features
(segment-color semantics, coverage badges, dict pages) assume
`[a-z0-9_]+` segments instead of defending against drift.

## TIC census (empirical — live `en-GB` rows, `deleted_at IS NULL`)

### Grammar by schema

| Schema | Shape | Keys | Non-snake |
|---|---|---|---|
| `public` | `app.<area>.…` (no `entities` marker) | 1022 | 373 |
| `system` | `system.entities.<entity\|sub>.*` + `system.settings.*` | 788 | 461 |
| `crm` | `crm.entities.<entity>.<facet>.<leaf>` | 688 | 449 |
| `job` | `job.entities.*` + `job.jobs|config|events|module.*` | 127 | 4 |
| `emailsender` | `emailsender.entities.*` + `emailsender.callable|providers|templates|nav|module.*` | 68 | 27 |
| `ai` | `ai.entities.*` + `ai.console|docs|config|nav|module.*` | 172 | 14 |
| `webhook` | `webhook.entities.*` | 0 | 0 |
| `custom` | (empty — contract `custom.entities.<entity>.rows.<code>`) | 0 | 0 |

**~1,328 non-snake keys.** Dominant patterns:

- `versionHistory` as facet/subject — 803 rows (crm seg4: 446, system seg3: 357)
- camelCase area/subject/leaf segments — `aiChat`, `commandPalette`,
  `userMenu`, `createProvider`, `probesHint`, `driftDetected`, `contentSize`…
- UPPERCASE enum leaves — `ai.entities.ai_model.compatibility.COMPATIBLE`
- 2-seg shorthand — `ai.nav`, `ai.module.name`-style

### Non-entity subjects under `<ns>.entities.` (exhaustive — all 8 schemas)

| Subject | Schema | Rows | Nature |
|---|---|---|---|
| `list` | system | 749 | table-ui vocabulary |
| `versionHistory` | system | 357 | audit/version ui vocabulary |
| `page_title` | system | 3 (`create`/`edit`/`list`) | virtual page titles |

**All other schemas have pure entity seg3.** `public`/`custom`/`webhook`
have zero `entities` keys.

### Cross-schema storage violations (14 rows)

- `system.entities.list.keys.move{Up,Down}` ×7 in `public.translations`
- `app.widgets.numeric_input.{in,de}crement` ×7 in `system.translations`

`assertKeyNamespace` WOULD reject both — they entered via **seed SQL**,
proving the service guard covers only the HTTP write path.

### Malformed keys

Zero today — no `..`, leading/trailing dots (verified all schemas). The
risk is future regression, not current debt.

## Existing guards and the real gap

| Layer | Today | Gap |
|---|---|---|
| Router zod `TranslationCreateSchema.key` | `min(1).max(255)` only | no grammar/namespace check |
| `assertKeyNamespace` (service) | ns-prefix vs table schema | prefix-only; no segment grammar; not reachable from seed SQL |
| Migration engine | `assertSeedAuditTrail` regex-scans patch raw pre-apply (`engine.ts:120`) | **no key-grammar validator — the seam exists, unused for keys** |
| `check-standards` lint | `i18n-key-ns` (source `*_key` literals) + `i18n-sql-ns` (patch seed tuples) both exist — **ns-prefix only** | neither validates segment grammar — extend both |
| DB constraint | none | last line of defense — covers ALL write paths |
| Docs | `translation-key-convention` doc+rule exist in **be-v3 & fe-v3 only**; sdk has `docs/dev-guide/translations.mdx` (service doc, no grammar) | us-v3/dal-v3/v3-core have NO key-convention doc |

**Write-path map (empirical):** runtime writes go through BE
`TranslationsService` (`assertKeyNamespace`) — the centralized gateway;
US modules do NOT import the SDK `TranslationsService` (it's the
DB-agnostic read/CRUD helper). Seed writes are per-service:
`be-v3/db-meta/patches` + `us-v3/<svc>/db-meta/patches` — each service
runs `check-standards` with its own `repoRoot` and `i18n_namespaces`
(e.g. crm: `["app","system","crm"]`), and every service boot runs
`runMigrations` → one validator in `engine.ts` covers them all.

## Prevention stack (by construction, every write path)

```
literal key in source  ──▶ i18n-key-ns + t() callsite rule           (dev/CI)
meta *_key             ──▶ i18n-key-ns (extended with grammar)
HTTP create/update     ──▶ zod grammar + assertKeyNamespace+grammar   (400/422)
seed .sql patch        ──▶ i18n-sql-ns (dev) + assertTranslationKeyGrammar
                           in runMigrations (hard fail at apply/boot)
raw SQL / psql         ──▶ CHECK constraint on <schema>.translations.key
                           (rejects at the engine — nothing bypasses)
```

## Locked decisions

1. **Enum leaves → lowercase** (`compatibility.COMPATIBLE` → `compatible`)
   — one convention, no exceptions.
2. **`versionHistory` → `version_history`** in BOTH positions (system
   seg3 subject + crm seg4 facet); `list`/`page_title` stay — subject
   position = violet, uniform rule, no entity allowlist.
3. **Facet amber = positional** (seg[3] after `entities`) — no allowlist.

## Namespace violations — VERIFIED + RESOLVED (empirical)

The two violation sets have **different correct fixes** — namespace must
follow the key's semantic domain, and storage follows the namespace:

- `system.entities.list.keys.move{Up,Down}` ×7 in `public.translations` —
  used by `DictRow` move buttons + `TableFooter` hints as GENERIC move
  vocabulary, not list-internals → **rename in place to
  `app.common.move_up` / `app.common.move_down`** (rows stay in `public`,
  3 call-site rewrites). User decision: app-common domain beats
  system.entities.*.
- `app.widgets.numeric_input.{in,de}crement` ×7 in `system.translations` —
  genuinely `app.*` widget vocabulary → **physical move to
  `public.translations`** keeping the key (delete+insert preserving
  uuid/version/audit — `UPDATE` can't cross schemas).

**`config.*` dangling namespace — 56 referrers, resolved to convention
B (`system.settings.config.<group>.<param>.*`) — user-approved.**

Census: `config.*` referrers appear in `config_entries` of **6 schemas**
(public 1, crm 10, ai 20, job 10, emailsender 7, webhook 8) — 24 distinct
params, all rendering raw today. The decisive evidence for B: **the DB
already contains dangling B-shaped referrers** — public's own
`config_entries` rows point at `system.settings.config.infra.nats_url.*`
and `system.settings.config.auth.gateway_secret_header.*` whose keys
were never seeded. The convention was already chosen; the seeds are the
gap. B is also the dominant live pattern: **~37 B referrers + 157
existing keys vs 2 A referrers + 16 keys** (usage ratio ≈ 18:1).

The governing axiom (user-articulated): **the key's namespace = the
domain that owns the vocabulary, not the schema that owns the row**.
`config_entries` labels are settings-domain vocabulary → `system`,
uniformly — `nats_url` is the same platform concept in 5 services, not
"crm vocabulary" (that reading would duplicate one label ×5 and
mis-attribute ownership — exactly what the institutionalized color
semantics' `seg[0]=owner` is designed against).

Final map (empirical, per-param):

| Block | Group | Action |
|---|---|---|
| `auth_mode` ×3, `auth_roles_path` ×3 | `auth` (keys EXIST — 5/3 facets) | referrer rewrite only, 0 new rows |
| `nats_url`, `http_port`, `service_base_url`, `be_base_url`, `service_code` ×22 | `infra` (group already referenced by public — 0 keys seeded) | rewrite + create 5 params ×2 facets ×7 langs = **70 rows** |
| `service_client_shield_key` (+webhook's `client_key`) ×3 | `auth` | rewrite + create 3 params = **42 rows**; also fill public `service_client_shield_key.label_key/description_key` (currently NULL) |
| `service_client_shield_secret` ×5 | `auth` | rewrite + create |
| `service_client_shield_secret_header` (+`gateway_secret_header` ×3) ×5 | `auth` — `gateway_secret_header` is the canonical segment (public's B-referrer already points there; row name differs — same pattern as public) | rewrite + create |
| `llm_*` ×3, `embedding_*` ×5, `rate_limit_*` ×3, `redact_pii` (ai-only ×12) | `ai` (new group) | rewrite + create **168 rows** |
| `ai.config.ai_assistant_model.*` ×8 keys (label/desc + `qwen2.5_1.5b`/`qwen3_1.7b`/`qwen3_4b` ×2) | `ai` | **move** ai.translations → system.translations as `system.settings.config.ai.ai_assistant_model.*` + rewrite 1 referrer |
| `job.config.reconcile_interval_ms.*` ×2 keys | `job` (new group) | move → `system.settings.config.job.*` + rewrite 1 referrer |

The two pre-existing A-shape keys (`ai.config.*`, `job.config.*`)
converge to B — no concurrent conventions survive. Totals: **~280 new
rows**, 10 distinct key moves (×7 langs = 70 rows), **~62 referrer
rewrites** (56 `config.*` + 2 A-pattern + 2 A-referrers + 2 NULL fill;
public's 2 dangling B-shape referrers stay as-is — their targets are
the created keys). Verified: every
`system.settings.config.{ai,job,infra,auth.…}` target space is
empty — zero collisions.

**Also camelCase group segments in scope**: `system.settings.config.
typeConfig|protocolSelect|phonePrefixSelect|currencySelect` → snake.

## Referrer census — DONE empirically (TIC)

**DB stores holding i18n keys:**

| Store | Content |
|---|---|
| `<schema>.translations.key` | the keys themselves (8 tables) |
| `crm.<9 dict tables>.label_key` | `crm.entities.<entity>.rows.<code>` |
| `ai.ai_models.label_key/description_key` | entity keys |
| `public.service_registry.label_key` | `system.settings.title`, `*.module.name` |
| `public.role_mappings.label_key` | `system.roles.*` (incl. camelCase `testRole`) |
| `<schema>.config_entries.label_key/description_key` ×6 | per-schema config keys |
| `<schema>.config_entries.type_config` JSONB | `values.*.label_key` + `validation.rules.*.error_label_key` — keys embedded in JSON |

**Not key stores** (verified): `ai_cerebellum.assistant_key` (slug),
`service_registry.icon`, `config_entries.group_key` (slugs),
`user_preferences.key` (pref slugs), `customer_contacts.label`,
`ai_conversations.title`, `docs_kb.title`, `user_*.label` (free text),
`api_keys.*`, `client_shield_registry.key_*` (crypto).

**Code referrers:**

| Source | Literals | Non-snake |
|---|---|---|
| FE `t('ns.*')` callsites | 1,206 | **758** |
| US `t('ns.*')` callsites | 176 | 28 |
| `*.meta.ts` `*_key` literals (26 files: BE 5 + US 21) | 158 | 2 |
| `nav-declaration.ts` per US service + `service_registry.label_key` | nav keys | — |
| Page `title_key` → `system.entities.page_title.*` templates | meta/openapi | — |

**New anomalies found in census:**

- `config.*` **dangling namespace** — 56 `config_entries` referrers in
  6 schemas point at `config.<param>.*` keys that exist in NO
  translations table → renders raw today. RESOLVED → convention B
  (full map in the namespace section above).
- `type_config` JSONB embeds camelCase keys
  (`app.common.validation.invalidEmail`, `tooLong`) — the JSON scan is
  part of the migration, not just flat columns.

## Work streams

### W1 — Referrer index: DONE (census above; the 758+28 source literals
and `type_config` JSONB cells are the actual rewrite surface)

### W2 — Key + referrer migration — patch family, ONE tx each

**Verified empirically**: zero rename+referrer pairs cross schema
boundaries — the only foreign-schema embedded referrer
(`app.common.validation.required` inside `ai.config_entries.type_config`)
is already snake_case and is not renamed. So the topology respects BOTH
ownership AND atomicity:

- **be-v3 patch** (registry `public`, single `tx` segment — engine
  `engine.ts:334-351`): owns every cross-schema op, precedent exists
  (be patches already write `system.*` under the public registry):
  1. `app.*`/`system.*` renames (public+system rows)
  2. 14-row moves (both schemas are be-owned)
  3. ~280 new `system.translations` rows (`infra`×5, `auth`×3, `ai`×12)
  4. 10-key moves — `INSERT INTO system.translations … FROM ai/job.translations`
     + `DELETE` + rewrite their `config_entries` referrers
  5. ALL ~62 `config.*` referrer rewrites across 6 schemas (new keys are
     created in THIS tx → impossible to dangle)
  6. public `type_config` JSONB + `role_mappings`/`service_registry` +
     `ai_models.*_key` referrer rewrites
  7. NULL `service_client_shield_key` label fill
  8. **CHECK constraints on public+system LAST** — PG validates against
     already-renamed rows; violation = whole-tx rollback
- **per-service patches** (crm, ai, job, emailsender, webhook — one tx
  each, order-independent): own-schema key renames + own-schema referrer
  rewrites (dict `label_key` → renamed keys = mandatory intra-schema
  co-move) + own CHECK constraint last.

Service `config.*` refs stay dangling until be's patch lands — same as
today, never a regression; patches apply in any order.

Source rewrites ship in the same changeset (758 FE + 28 US `t()` literals,
2 meta keys, `DictRow`/`TableFooter` callers) — code and DB must not
drift across the cut.

### W3 — DB CHECK constraint (the last line — nothing bypasses it)

```sql
ALTER TABLE <schema>.translations ADD CONSTRAINT translations_key_shape
CHECK (key ~ '^<ns>(\.[a-z0-9_]+)+$');
```

Per-table literal `<ns>` (`app` on public, `crm` on crm…) — kills empty
segments, camelCase, wrong namespace on EVERY write path including raw
psql. Ships in the same patch family as W2.

### W4 — Patcher + service + router guards

- **Migration engine** (`dal-v3/src/migrations/engine.ts`): new
  `assertTranslationKeyGrammar(patch)` — same seam as
  `assertSeedAuditTrail` (line 120): scan patch raw for
  `INSERT INTO <schema>.translations` and `UPDATE … SET key=` literals,
  validate `^<ns>(\.[a-z0-9_]+)+$` + ns==schema — hard fail, patch never
  applies, boot error is loud. **No opt-out pragma** — unlike
  `pb:no-audit-trail` (legit for lookup seeds), there is no legal
  malformed key: the escape hatch would be a bug factory.
- **Service**: `assertKeyNamespace` → also reject empty/non-snake
  segments (`/^[a-z0-9_]+$/` per segment) — one place, both errors.
- **Router**: `TranslationCreateSchema.key`/update — same grammar
  refinement → 400 instead of service 422.

### W5 — Lint (`check-standards` — extend existing rules, gated per-repo)

Both rules exist and check **ns-prefix only** — extend with grammar:

- `i18n-key-ns` (`check-standards.ts:894`): its literal regex already
  captures `*_key:`/`tooltip` values with a dot — extend to require every
  segment `[a-z0-9_]+` (flags `moveUp`, `versionHistory`, `typeConfig`…)
  AND keep the `i18n_namespaces` allowlist on seg1.
- `i18n-sql-ns` (`check-standards.ts:901`): `SQL_TUPLE_KEY` captures only
  seg1 — extend to capture the full key literal and apply the same
  segment grammar (flags seed patches writing non-snake keys).
- New `t(`/`$t(` callsite scan: literal args to the translate fn —
  758 FE + 28 US callsites are the rewrite surface today; the rule keeps
  it at zero.
- The W4 engine validator hard-fails at apply — lint stays the cheap
  early signal (dev-time) for source + patches before they ship.

### W6 — Docs (all involved repos)

Canonical doc `docs/ai/translation-key-convention.md` + `.devin/rules/`
pointer exist ONLY in be-v3 & fe-v3. Extend to:

- **be-v3/fe-v3**: update the canonical doc — grammar regex, per-module
  ns table, CHECK constraint, engine validator, lint rule, `config.*`/`app.*`
  domain rules ("ns follows domain, storage follows ns").
- **us-v3**: shared doc at **monorepo root** — verified: all 23
  cross-service rules live in `us-v3/.devin/rules/` + `docs/ai/`;
  per-service `.devin/` holds only `check-standards.json`. Add
  `.devin/rules/translation-key-convention.md` + `docs/ai/` canonical —
  each service owns `<code>.*`, seeds live in `<svc>/db-meta/patches`,
  `i18n_namespaces` stays per-service config.
- **dal-v3**: `docs/dev-guide/migrations.mdx` — document
  `assertTranslationKeyGrammar` next to `assertSeedAuditTrail`.
- **v3-sdk**: `docs/dev-guide/translations.mdx` — add the grammar/ns
  contract section (doc exists, covers the service only); plus
  `check-standards` rule-registry doc for the grammar extensions.
- **v3-core**: `translation-keys.ts` — `KEY_GRAMMAR_RE` constant
  exported so BE guard + lint + engine validator share ONE regex
  (no drift). The file's header doc already owns the WRITE vs
  REFERENCE boundary contract — grammar joins it there.

Per AGENTS.md: docs are proposed text — write only after approval.

## Color-semantics consequence (design assumption per user)

Palette is designed on the cleaned grammar: every segment is
`[a-z0-9_]+` — case/style checks are unnecessary in `keySegmentClass()`.
`page_title`/`list`/`version_history` under `entities` stay violet
(subject position — uniform rule, no entity allowlist).

---

## TURN LOG — state after commit 07df540/458501b/07688ac (all verified, none committed yet)

### Execution state — DONE this turn

| Layer | State |
|---|---|
| W4a core `translation-keys.ts` | grammar helpers + tests — **uncommitted** |
| W4b dal `assertTranslationKeyGrammar` | engine + tests — **uncommitted** |
| W4c be router/service guards | `assertKeyNamespace`+grammar, zod `TranslationKeySchema` (reused `app.common.validation.dotted_key`) — **uncommitted** |
| W5 sdk lint | `i18n-key-grammar` on `*_key`/`t()`/SQL tuples + `panel-footer-start` — **uncommitted** |
| 6 SQL patches | generated, engine-validated, **dry-run OK** (be + crm/ai/job/emailsender/webhook): 1,389 renames, ~280 config rows, repatriations, CHECK last — **uncommitted** |
| `FILTER_OPERATOR_KEY` | core map (DSL-aligned `eq/neq/gt/gte/lt/lte`) + 4 callsites + test — **uncommitted** |
| Source rewrites | **1,013 literals / 145 files** (fe+be+ui+us src+fe/src) — **uncommitted** |
| `app.common.select_time` | dangling literal `selectTime` → seeded 7 langs in be patch + literal fixed |
| TranslationEditorPanel | anatomy per TOC: coverage (ratio+missing chips) as LINE 2, no gray frame, readonly EN preview, footer CTAs right — **uncommitted** |
| `GRADIENT_ICON_PATHS/STOPS` | new `paths.ts` vocab; killed duplicated star/amber/ext-link/faro inline geometry; special-icons.mdx entry — **uncommitted** |
| AI suggestion preview | flag + inline text + inline gradient-check accept, no AiIcon/label/X — **uncommitted** |

### Verified green
- lint: fe clean (735→0), all 5 us clean, be = only 9 pre-existing `schema-honest-format`
- typecheck: be/ui/crm/ai/job/emailsender/svelte-check fe+us-fe = 0 errors
- core tests 126/126, dal 27/27

### Service-state diagnosis (the "CRM down" report — REAL findings)
- All stack UP: FE 5173→200, BE 3001→401(auth), US `/health` → ok:true db+nats on 3003/3005/3006/**3007(crm)**
- Blanket 403 on US API paths = **client-shield GATEWAY mode by design** (`service_client_shield_secret_header` required; `/health` is the only public route) — NOT a crash
- No crash/loops: 4 US bun processes stable since 07/11 21:05
- **AI :3004 `ok:false` — `llm` check fails** ("Unable to connect"): the local LLM endpoint (ollama) is down — external dep, not the service
- All listeners on `[::1]` IPv6-loopback → `server.listen(port)` no-host in `sdk/http/http-server.ts:221`; netstat IPv4 rows miss them (my earlier "nothing listening" was a lazy truncated read)

### Decisions pending — RESOLVED 2026-11-11
1. ~~**Apply 6 patches to dev DB**~~ — DONE (TURN LOG below: applied 1/0 failed per service)
2. ~~**openapi.ts 9× `format:`**~~ — DONE: fixes landed, `check-standards: clean`. Permanence (P2 baseline + P3 CI) tracked in `lint-red-openapi-format.md`
3. **Bind address** — DECIDED 2026-11-11: always IPv4, no options. Dev = `127.0.0.1`, prod = `0.0.0.0`. Implementation in drift-closure batch
4. ~~**E2E**~~ — DONE (TURN LOG below: dict-page 3/3 + smoke/auth 8/8)

---

## TURN LOG — stack repair + apply + E2E (this turn)

### Done
- **6 patches applied** to dev DB — `pnpm db:migrate` per service, all `applied:1, failed:0` (be 1+111skip, ai 1+13, crm 1+19, emailsender 1+15, job 1+37, webhook 1+6)
- **Census: 0 violations** on 20,678 translation rows across 8 schemas (canonical core grammar — status codes `409`, `1.7b`, `power_level.1` are LEGAL segments)
- **7 stale Redis dict cache keys deleted** → rebuilt from patched DB; `crm.entities.*.fields.snake` keys serve correctly (verified `select_time` in dict payload)
- **Registry repaired**: all 5 US `migration_failed → online` after clean respawn. Root cause: processes booted 11:43 while MANIFEST was unsigned → `migrationState.degraded` latched true in-memory, heartbeats kept reporting `checks.db_migration.ok=false` → `deriveStatus` precedence → rows stuck. CLI `db:migrate` apply does NOT refresh in-process state; re-register requires respawn (no admin transition route for stale status — noted as doc gap)
- **openapi.ts 9× `format:` fixed** — canonical honesty matrix (`_by$`→uuid, `_uri(s)$`→uri): `redirect_uris[]`×2, `redirect_uri`, `created_by`/`updated_by`/`deleted_by`×2. `check-standards: clean` — be lint fully green for the first time since Nov 6
- **E2E green**: `entity-dict-page` 3/3 (dict archetype, editable row + Modified status, sheet anatomy badge/chips/EN gate/AI review) + `smoke`+`auth-login-boot` 8/8 (login form, redirect, logout, session-expired). Earlier red run = mid-restart churn, now stable

### Process notes (the "casino" post-mortem)
- `bun --hot` reload on `dist/` rewrite = graph-incoherent crash (Nov 8 incident) — documented safe path: respawn via Start-Process, never `touch` to force reload
- `netstat` on Windows under-reports Bun IPv6→IPv4 dual-stack listeners — trust `/health` probes, not netstat
- service.register/heartbeat flow verified empirically: shield-enrolled UA `primebrick-*/x.y.z`, `client_shield_registry` rows `self-enroll`, gen:0 static keys

### Pending (refreshed 2026-11-10b)
- W6 docs batch (propose text first) · dict-page batch (TableFooter/i18n keys/TranslationKeyCell/save gate/aria/read-only code/bulkRevert)
- ~~translate-all preview anatomy~~ — superseded by the V3 sheet anatomy; see `translation-editor-sheet-redesign.md` TURN LOG (per-row suggestion previews, float icons)
- openapi lint permanence: P2 baseline file + P3 CI (see `lint-red-openapi-format.md` — the 9 format fixes themselves are LANDED, `check-standards: clean` verified 2026-11-10)
- RFC 7807 error-extras pipeline now end-to-end (sdk `toValidationError` → `extra.issues` → FE `ApiListError` → `ErrorsPanel`/`RfcErrorDialog`) — if future i18n validation errors carry `extra` they will surface automatically; see `metadata-driven-page-system.md` tasks 31/40
- ~~**MANIFEST signatures for `20261205000000_i18n_key_snake_cleanup` uncommitted in 4/5 services**~~ — RESOLVED 2026-11-11: `7bae552` committed the signed manifests for ai, crm, emailsender, webhook
- **Registry `migration_failed → online` requires respawn** — no admin transition route for stale status (doc gap, carried into metadata-driven-page-system residual (h)).
