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
cross-schema rows + one dangling `config.*` namespace are the fossil
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
| `emailsender` | `es.entities.*` + `es.callable|providers|templates|nav|module.*` | 68 | 27 |
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

**`config.*` dangling namespace — resolved to convention:**
`config.service_client_shield_secret.{label,description}` (1 row,
`group_key=security_parameters`, `reserved=true`) — `config` is not a
valid namespace; the same `security_parameters` group already uses
`system.settings.config.auth.*` (cf. `gateway_secret_header`) →
rename both columns to `system.settings.config.auth.service_client_shield_secret.{label,description}`
AND create the 2×7 `system.translations` rows (today they render raw).

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

- `config.*` **dangling namespace** — `config_entries.label_key` holds
  `config.service_client_shield_secret.label`-style keys that exist in NO
  translations table → renders raw key today. W2 must either map them to
  a real namespace or create the rows.
- `type_config` JSONB embeds camelCase keys
  (`app.common.validation.invalidEmail`, `tooLong`) — the JSON scan is
  part of the migration, not just flat columns.

## Work streams

### W1 — Referrer index: DONE (census above; the 758+28 source literals
and `type_config` JSONB cells are the actual rewrite surface)

### W2 — Key + referrer migration — ONE atomic tx patch

**Ordering is mechanical, not a choice**: `type_config` JSONB cells and
`config_entries` rows in `public` reference keys living in other schemas
→ any per-schema split leaves a window where referrers dangle. So ONE
single-segment `tx` patch (engine `engine.ts:334-351`: BEGIN → all
statements → COMMIT, strongest form):

1. All key renames — `UPDATE <schema>.translations SET key='<new>' WHERE
   key='<old>'` preserving uuid/version/audit (1,328 keys).
2. Cross-schema moves — delete+insert preserving identity (14 rows).
3. All referrer rewrites — `config_entries` flat columns + `type_config`
   JSONB (`jsonb_set` on `label_key`/`error_label_key`/`values.*.label_key`),
   `role_mappings.label_key`, `service_registry.label_key`,
   `ai_models.*_key`, dict `label_key` columns.
4. `config.service_client_shield_secret.*` → `system.settings.config.auth.
   service_client_shield_secret.*` + create the 14 translation rows.
5. `move{Up,Down}` → `app.common.move_{up,down}`.
6. **CHECK constraints LAST** — `ALTER … ADD CONSTRAINT` at the end of
   the same tx: PG validates against already-renamed rows; any surviving
   violation rolls the WHOLE patch back (fail atomic, never partial).

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
