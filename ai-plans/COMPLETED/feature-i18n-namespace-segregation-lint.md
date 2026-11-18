# i18n namespace segregation lint — US modules may cite only `app.*` + own schema

## Status: 🟢 DONE — Plan date: 2025-12-07 / verified closed 2026-12-09

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | TIC: doc deep-dive + tool inventory + violation census | ✅ done | this session | evidence below |
| 2 | Narrow `i18n_namespaces` per US service — remove `system` (`.devin/check-standards.json`) | ✅ done | verified 2026-12-09 | all 6 services `["app","{schema}"]`; boilerplate in CI matrix |
| 3 | Extend `i18n-key-ns` patterns: template-literal prefixes + non-i18n `*_key` denylist | ✅ done | this session | `NON_I18N_KEY_FIELDS={system_key}` + `T_CALL_TEMPLATE`/`I18N_KEY_TEMPLATE` — sdk commit |
| 4 | New rule `i18n-sql-key-ref`: key-ref columns in db-meta patches vs allowlist | ✅ done | this session | + `i18n_key_ref_exempt` config; verified on ai: 42 refs flagged |
| 5 | Fix ai/fe `system.entities.ai_*` literals → `ai.entities.ai_*` (broken anyway) | ✅ done | this session | 34 repoints ×4 files incl. `fieldNs` const (~15 lint-invisible `${fieldNs}` call sites) — all 35 cited keys verified live |
| 6 | `system.entities.list.*` shared-chrome refs — strict rule confirmed; exempt w/ phase-2 pointer or migrate first | ✅ done | this session | exempt comments NOT honored by scanner → seeded `app.entities.list.no_records`+`app.common.restore_failed` (be-v3 patch) + repoint to app.* — zero debt. fe-v3 `useRowActions` had the SAME dead refs → repointed |
| 7 | Fixture specs in `tools/__tests__/check-standards.test.ts` + per-service gate run | ✅ done | this session | 11 new E2E specs (32 total green); ai real-repo probe: 28+42 hits |
| 8 | Exempt shipped patches (`i18n_key_ref_exempt`) — declared debt | ✅ done | this session | 6 configs: ai/crm/es `0002`, jh `0002`+`20261207110000`, boilerplate `20261116900000`, webhook `0002`+`0003`+`0004` |
| 9 | Doc updates (proposed text, approved before write) | ✅ done | later sessions | be/fe i18n docs + `.devin/rules/i18n-namespace-segregation.md` shipped |
| 10 | (Phase 2, separate plan) migrate 67 live `config_entries` label refs → `{schema}.settings.config.*` + shared-chrome keys → `app.*` | ✅ done | verified 2026-12-09 | 0 foreign refs in all 6 schemas; cleanup patch `20261208210000` already soft-deleted 1099 orphan rows — live `system.settings.config.*` keys = 54, exactly the public-cited legit set (earlier "157 orphans" report was a census bug: `deleted_at` unfiltered) |
| 11 | (Phase 2) `findTranslations` RPC — the ONE documented cross-domain exception | ✅ done | this session | be-v3 — details in E.bis "as built" |

---

## A. The rule (user-mandated, non-eludibile)

> **UN MODULO NON CONOSCE NE PER CONVENZIONE NE PER ALTRO UN ALTRO MODULO.**
> In every US module's BE (`src/`) and FE (`fe/src/`): an i18n-key reference is legal
> only when its first segment is `app` or the module's **own schema namespace**.
> `system.*`, `custom.*`, and every other module's namespace are violations.

The doc already states this contract — the user's rule is the documented one, code drifted:

- `primebrick-v3-core/src/entity-meta.ts:825-833` — `entities_ns` docblock: *"the module's
  own namespace (`job` → `job.entities.<tk>.*`). Absent → `system` (**BE/core-owned entities**
  keep `system.entities.*`)"* — `system.*` is for BE-owned surfaces, not module vocab.
- US meta docblocks already self-declare it: `emailsender/src/modules/providers/provider.meta.ts:11-16`
  *"`entities_ns` declares the ownership … (never `system.entities.*`)"* — same wording in
  `boilerplate`, all `crm` metas, `job-handler`.
- DB write boundary already enforced: `translations_key_shape` CHECK on every
  `{schema}.translations` (`^<schema>(\.[a-z0-9_]+)+$`), shipped by
  `20261205000000_i18n_key_snake_cleanup` — verified live on public/system/custom/ai/crm/
  emailsender/job/webhook. **The write side is segregated; the lint closes the read/reference side.**

`/system/settings/modules` is an acknowledged stale PoC — the lint must not derive truth from it.

## B. Infrastructure: the lint already exists — this task activates + extends it

`primebrick-v3-sdk/tools/check-standards.ts` — the single canonical scanner
(`docs/ai/check-standards-gate.md`). CI runs it per service (`primebrick-us-v3/.github/workflows/
check-standards.yml`, matrix `ai, crm, emailsender, job-handler, webhook` — **boilerplate missing**).
Local: `bun ../../primebrick-v3-sdk/tools/check-standards.ts src` per service dir.

| Existing rule | Covers | State today |
|---|---|---|
| `i18n-key-ns` | `*_key:`/`tooltip` literals + `t()`/`$t()` call literals in `src/` **and auto-scanned `fe/src/`** vs `i18n_namespaces` in `.devin/check-standards.json` | **ACTIVE but toothless** — every US service already declares `["app","system","{own}"]` (job-handler, ai, crm, emailsender, webhook, boilerplate all verified); `system` in the allowlist is exactly the hole. fe-v3 declares all namespaces (host shell — resolves every dict, legit). be-v3: `["app","system","custom"]` (correct — BE owns those schemas) |
| `i18n-sql-ns` | `INSERT INTO {schema}.translations` tuples must start `{own-ns}.` (`public`→`app`) | always-on, all US clean |
| `i18n-key-grammar` | `[a-z0-9_]+(.[a-z0-9_]+)+` segment shape | always-on |
| `i18n-language-literal` | `language` literals ∈ `SUPPORTED_LANGUAGES` in translation SQL | always-on |
| `i18n_sql_exempt` / `i18n_lang_exempt` | filename lists grandfathering shipped pre-boundary patches | JH already exempts 3 patches |
| Baseline | `.devin/check-standards-baseline.json` suppresses declared debt | `--write-baseline` REMOVED — new debt can't be minted; fixes or exempt lists only |
| Specs | `tools/__tests__/check-standards.test.ts` — fixture-repo E2E spawning the real tool | canonical spec home |

**Gaps found (empirically):**
- `i18n-key-ns` is ACTIVE on every US service but toothless: the declared
  `["app","system","{own}"]` allowlist admits `system.*` — enforcement = dropping
  `system` from each US config, not writing a new gate (verified 2025-12-08:
  ai with `["app","ai"]` → 28 `i18n-key-ns` + 42 `i18n-sql-key-ref` hits).
- **Template-literal evasion**: `t(\`system.entities.ai_model.sort_${s}\`)` — patterns require a
  closing quote right after the captured literal, so `${`-interpolated keys escape
  (`ai/fe/src/ModelImportSheet.svelte:372` live example).
- **Non-i18n `*_key` false positive**: `\w*_key` catches `system_key: "ai.partition_maintenance"`
  (`job-handler/src/__tests__/{system-triggers,trigger-shape}.test.ts` ×3) — `system_key` is a
  callable/subject identifier field, not an i18n carrier.
- **No rule covers key REFERENCES in SQL patches**: `i18n-sql-ns` only checks `INSERT INTO
  *.translations` tuples. `config_entries.label_key`/`description_key` VALUES (and nested
  `"*_key": "…"` inside `type_config` JSON strings, e.g. `error_label_key`) escape entirely.

## C. Violation census (measured today)

### C.1 Code literals — fires once `i18n_namespaces: ["app","{schema}"]` is set

| File | Refs | Class |
|---|---|---|
| `ai/fe/src/ModelImportSheet.svelte` | ~22 | `system.entities.ai_model.*` (15+), `system.entities.ai_cerebellum.*` (5), `system.entities.list.*` (2), incl. 1 template-literal `${s}` |
| `ai/fe/src/CerebellumSheet.svelte` | 3 | `system.entities.ai_cerebellum.title`, `system.entities.ai_model.fields.dtype` ×2 |
| `ai/fe/src/ModelTestReportSheet.svelte` | 1+ | `system.entities.ai_model.test_report.*` |
| `ai/fe/src/AiSettingsPage.svelte` | 1 | `system.entities.list.no_records` |
| `ai/src/domain/entities/ai_model_entity.ts:64` | — | docblock only, no `*_key:`/`t(` prefix → not flagged |
| `job-handler/src/__tests__/*` ×3 | 3 | **FALSE POSITIVE** — `system_key: "ai.partition_maintenance"` (callable subject, not i18n) |
| boilerplate / crm / emailsender / webhook / job-handler `src`+`fe/src` | 0 | clean (only comments + non-key strings like `system.translations`, `system.dict.get`) |

Two sub-classes inside ai/fe:
- `system.entities.ai_*` (~25 refs): the keys **do not exist** in `system.translations`
  (`system.entities.ai_%` = 0 rows live) — they live as `ai.entities.ai_*` in `ai.translations`
  (1030 rows). Wrong prefix → renders raw keys → **live bug AND violation**; fix is prefix-only.
- `system.entities.list.*` (3-4 refs: `no_records`, `restore`, `delete`): shared platform chrome
  that **does** resolve today (798 `system.entities.list.*` keys exist) → violation under the
  strict rule → needs Q1 answer.

### C.2 SQL patch refs — needs the new rule

| File | `system.*` refs | Notes |
|---|---|---|
| `ai/db-meta/patches/0002_seed_config.sql` | 42 | `config_entries` label/description keys, 21 entries |
| `crm/db-meta/patches/0002_seed_config.sql` | 20 | 10 entries |
| `emailsender/db-meta/patches/0002_seed_config.sql` | 14 | 7 entries |
| `job-handler/db-meta/patches/0002_seed_config.sql` | 22 | 11 entries |
| `job-handler/db-meta/patches/20261207110000_gateway_public_secret_config.sql` | 4 | 2 entries (shipped this session) |
| `boilerplate/db-meta/patches/20261116900000_seed_boilerplate_config.sql` | 16 | 8 entries |
| `webhook/db-meta/patches/0002_seed_webhook_config.sql`, `0003`, `0004` | ~14 | older **`config.*`** convention — `ns=config` equally outside `{app,webhook}` → flagged |

All shipped+signed in MANIFESTs → immutable → declared via exempt list; **live rows** need a
follow-up migration (phase 2): 67 `config_entries` rows cite `system.settings.config.*`
(job 13, ai 21, crm 10, emailsender 7, webhook 8, boilerplate 8).

### C.3 Schemas (empirical: `DATABASE_SCHEMA` / `.env`)

`ai→ai`, `boilerplate→boilerplate`, `crm→crm`, `emailsender→emailsender`,
**`job-handler→job`** (dir/service name ≠ schema!), `webhook→webhook`.
fe bundles present: ai (12 files), crm (3), emailsender (5), job-handler (2); none in
boilerplate/webhook. All US metas declare `entities_ns: "<own>"` — no default-`system` drift.

## D. Design (TOC = transcription)

### D.1 Per-service `.devin/check-standards.json` — narrow + exempt (STEP 5, pending):

```json
"i18n_namespaces": ["app", "<schema>"]          // ai→ai … job-handler→job — REMOVE "system"
"i18n_key_ref_exempt": ["0002_seed_config.sql", …]  // shipped files from C.2 (signed/immutable)
```

### D.2 `check-standards.ts` extensions — ✅ SHIPPED (sdk `tools/check-standards.ts`)

1. **Non-i18n `*_key` denylist** — `NON_I18N_KEY_FIELDS = { system_key }`. The census of
   every `*_key:` field with a dotted value across US+FE+BE proved `system_key` is the
   ONLY non-i18n carrier (callable subjects: `ai.partition_maintenance`); every other
   dotted `*_key` is a real i18n ref. Wider denylists would exempt fields nobody uses.
   `I18N_KEY_LITERAL`/`I18N_KEY_TEMPLATE` now capture the field name and skip the set;
   same skip inside `i18n-sql-key-ref` (columns AND JSON keys).
2. **Template literals** — dedicated `T_CALL_TEMPLATE` / `I18N_KEY_TEMPLATE` patterns
   capture the whole backtick body; the provable surface is the STATIC prefix before the
   first `${`: a `.` inside it completes the namespace segment. Templates opening with
   `${` (dynamic ns) or breaking inside segment 1 are skipped — unprovable, never FP.
   Grammar runs on completed segments only (`system.entities.ai_model.sort_${s}` →
   `system.entities.ai_model` checks grammar; ns `system` flags).
3. **New rule `i18n-sql-key-ref`** (always-on like `i18n-sql-ns`, +`i18n_key_ref_exempt`
   filename grandfathering) — in `db-meta/patches/*.sql`, inside each `INSERT INTO`/
   `UPDATE` statement on a non-`translations` table:
   - **column refs** — `*_key`/`tooltip`-family cells at their INSERT column-list index
     (positional, via the existing `splitSqlTuple` machinery);
   - **SET refs** — `SET x_key = 'ns.x'` including ON CONFLICT clauses, tracked with a
     SET→WHERE clause span so the corrective `SET x='job.a' WHERE x='system.b'` repoint
     pattern never flags its own predicate;
   - **JSON refs** — `"*_key": "ns.x"` inside `type_config`/meta string literals.
   Allowlist = declared `i18n_namespaces`, else `{app, sqlKeyNamespace(target)}` fallback —
   BE's `public.*` rows citing `system.*` stay legal via BE's declared set.
4. **Hint text** — updated to "a module's literals may cite only its declared namespaces"
   (the hardcoded "own + CORE (app/system)" wording contradicted the strict contract).

### D.3 ai/fe literal fixes (same changeset — they are broken today)

`t('system.entities.ai_model.X')` → `t('ai.entities.ai_model.X')` (×~25): keys already exist
in `ai.translations` — pure prefix fix, rendering improves immediately.
`system.entities.ai_cerebellum.*` → `ai.entities.ai_cerebellum.*` (5 refs).

### D.4 Shared-chrome refs — strict rule confirmed (Q1)

`system.entities.list.no_records|restore|delete` (ai/fe ×3-4): resolve today via the
always-loaded system dict — but they're `system.*` in module code → violations.
The shared ELT chrome migrates to `app.*` in phase 2 (`app.entities.list.*` reseed +
FE composition change — platform task). For the lint changeset: the ai/fe refs get
`standards-exempt` line comments ONLY as declared debt with the phase-2 pointer, OR the
chrome migration lands first — sequencing decided at TOC kickoff.

### D.5 Live `config_entries` migration (phase 2, per-service one-tx patch)

```sql
-- 1) copy texts, renamed into own namespace (x7 languages)
INSERT INTO {schema}.translations (key, language, value, created_at, created_by,
                                   updated_at, updated_by, version)
SELECT '{schema}.' || substring(t.key from 8), t.language, t.value, now(),
       'migration-i18n-segregation', now(), 'migration-i18n-segregation', 1
FROM system.translations t
JOIN {schema}.config_entries c
  ON t.key IN (c.label_key, c.description_key)
WHERE c.label_key LIKE 'system.%' OR c.description_key LIKE 'system.%';
-- 2) repoint the rows
UPDATE {schema}.config_entries
SET label_key = '{schema}.' || substring(label_key from 8),
    description_key = '{schema}.' || substring(description_key from 8),
    updated_by = 'migration-i18n-segregation'
WHERE label_key LIKE 'system.%' OR description_key LIKE 'system.%';
```

- Cross-schema SELECT inside a migration is sanctioned (one-time move; migrations cross
  boundaries by nature — precedent: `uuid_v7_rewrite`).
- Then a **be-v3 cleanup patch** `DELETE`s the migrated keys from `system.translations`
  (module vocab leaves the system domain) — only keys no longer referenced by
  `public.config_entries` (BE's own rows keep `system.settings.config.*` legitimately).
- `job`'s two just-shipped patches (`20261207110000` config rows + be-v3 i18n seeds for
  `gateway_public_secret*`) get superseded by the same mechanics — JH re-seeds
  `job.settings.config.auth.*` + repoints; be-v3 deletes its just-added system rows.
- Redis dict invalidation after patches: dict freshness is `max(updated_at)`-based and
  DELETE doesn't bump it → manual invalidate, as documented for direct-SQL seeds.

## E. Decisions (user — 2025-12-07)

1. **Allowlist strict `{app, {schema}}`** — CONFIRMED. `system.*` is out for US modules,
   including shared platform vocab (`system.entities.list.*`, `system.entities.page_title.*`,
   `system.common.fields.*`). Shared chrome that modules legitimately reuse must live under
   `app.*` — the public domain exists exactly for cross-surface vocabulary — or under the
   module's own ns. The shell (fe-v3) keeps `system.*` for its own pages (it IS the platform).
2. **Config labels: option (b) — `{schema}.settings.config.*` in `{schema}.translations`** —
   CONFIRMED, segregation is inalienable. Resolution design below (E.bis).
3. **67 live rows** — deeper analysis delivered (E.ter); migration mechanics in D.5.
4. **`boilerplate` into CI matrix** — CONFIRMED.
5. **`custom.*` excluded** — clarification (E.quater).
6. **Two rules vs one** — justification (E.quinquies); `i18n-sql-key-ref` self-derives.

## E.bis — The three segregation boundaries (write / serve / reference)

**Write — closed at every layer already:**
- `translations_key_shape` CHECK on every `{schema}.translations` (`key ~ ^{schema}.*`) — live
- `assertKeyNamespace` in BE `translations.service.ts:83` → `TRANSLATION_NAMESPACE_VIOLATION`
- `i18n-sql-ns` lint → patch INSERTs must use the target schema's own ns
A module physically cannot write keys outside its namespace.

**Serve — built but architecturally impure (user-flagged, corrected):**
- `GET /api/v1/system/translations/:module/:language` + `/api/v1/entities/translation/list`
  — `discoverServiceEntities()` synthesizes `Entity("translations", code)` from
  `service_registry` and the BE runs `getDal().entityService(...)` **directly on every
  module's `{code}.translations` table** (`translations.service.ts:176-195`). Designed as
  "governed CRUD gateway" — but under strict segregation the BE querying module-owned
  tables IS the same coupling class: the platform knows and reads each module's internals.
  **No service exposes an own dict endpoint today** (JH has none; all US checked).
- The segregation-pure path already exists as infrastructure: FE reaches US endpoints via
  the governed **`/svc/{service}/api/v1/...` proxy** (`entityApiBase`, fe `api.ts:39-63`).
  Correct target shape: each US mounts a dict route/entity over its OWN schema → FE loads
  `/svc/{code}/...` → BE routes, never reads module tables. Precedent: `system.dict.get`
  governed NATS route (`crm-translations.service`) for platform-side vocab resolution.
- **No cross-module dict loader exists**: `/list?module={code}` honors the canonical
  `EntityListQuery` (filters/search/sort/paging) but `module` is a single
  `ModuleCodeSchema` → `resolveEntity` → ONE schema. `module=all`/batch does not exist.
- Flat dict merge — keys are full dot-paths; `{job}.` and `{ai}.` cannot collide by
  construction (first segment names the owner).

**Reference — the gap the lint closes** (`i18n-key-ns` activation + `i18n-sql-key-ref`).

### The documented exception — `findTranslations` RPC (user design, replaces the N×dict proposal)

**UNICA ECCEZIONE ALLA REGOLA, voluta e centralizzata**: translations APIs are the ONLY
cross-domain read surface — declared, filter-gated, single-purpose. My earlier
"N×`loadModuleTranslations` per page" proposal was wrong (hydrates ~1000-1400 keys/module
to render ~N labels — heavy, slow, useless payload). The RPC:

- Input: `{matches: string[], language?}` — NOT a filter expression; the caller passes
  match strings and the service builds ONE wired filter (user decision). Every matcher is
  a key-prefix — service mounts `Filter.fieldValue(key,'LIKE','<m>%')` per matcher,
  `Filter.group(…, 'OR')` inside the schema group (`dsl.ts:133-144`: OR inner, AND outer).
- Gate: each matcher MUST carry a leading `{mod}.` resolvable via `resolveEntity`
  (registered module or `app`/`system`/`custom`) — otherwise 400. Minimum `{mod}.*`;
  bare `{mod}` normalizes to `{mod}.%`. Never download-everything.
- Mechanics (DAL-only, `raw-query` forbids UNION): ONE `dal.findAll` per involved schema —
  `Project.field(key|value|language|uuid)` + `Project.expr(''<schema>'','module')`
  discriminator; **bounded concurrency — chunked `Promise.all`, 4 schema groups at a
  time** (user decision: module count is UNBOUNDED — `service_registry` is dynamic — and
  the pool `max:10` must never be saturated by one RPC). Implementation: slice the
  schema-group array into chunks of 4, `await Promise.all(chunk)` sequentially — ~5
  lines, no external helper, deterministic merge order, ≤40% pool usage, latency scales
  linearly (`ceil(n/4) × ~10ms`). The other abuse bound is INPUT SIZE: validate
  `matches.length ≤ 64` at the boundary. Concatenated →
  `EntityListResult {rows, page, page_size, total}` (the "same as other GETs" envelope).
- Transports on ONE service method (thin adapters): HTTP
  `GET /api/v1/entities/translation/find?matches[]=…` (`makeProtectedRouter` family —
  FE pages) + NATS `system.translations.find` (`makeNatsRequestRoute`,
  `internal-request-routes.ts` — the `system.dict.get` precedent; serves US services,
  successor for foreign-ns resolver calls).
- Consumers: `/modules` list, `/modules/{code}` config tab, export resolvers;
  `getI18nDict` can re-implement over it (`matches=['{mod}.'] + language`).
- Lint interplay: unchanged — a US citing `system.*`/foreign ns stays a violation
  (optionally extended to findTranslations match literals: module callers may only ask
  `{app, own}`).
- Doc: "le trans sono le uniche che violano il principio di segregazione ma è voluto e non
  è consentito altro" — recorded in i18n docs + check-standards-gate.

### As built (2025-12-07, be-v3 `develop`)

- `TranslationsService.findTranslations(matches, language?)` +
  `parseTranslationMatchers` — `src/modules/system/translations.service.ts`.
- Matcher grammar (`MATCHER_GRAMMAR`, `TRANSLATIONS_FIND_MATCHER_GRAMMAR`):
  `'{ns}' | '{ns}.*' | '{ns}.seg[.seg…]' | '{ns}.seg[.seg…].*'` — exact `ns.seg`
  → `key = '…'`, trailing `.*`/bare `ns` → `key LIKE 'ns…%'`. Interior `*`/`%`
  rejected. `matches` required, ≤64 (`FIND_TRANSLATIONS_MAX_MATCHES`,
  `TRANSLATIONS_FIND_MATCHES_LIMIT`), deduped, grouped per ns preserving
  first-seen order. ns resolves via `resolveEntity` → unknown → `NotFoundError`.
- Per-schema query: `getDal().findAll(entity, [uuid|key|language|value +
  Project.expr('?','module',[ns])], {filters:[Filter.group(terms,'OR'),
  language?], sorting:[key ASC]})` — chunked `Promise.all` ×4
  (`FIND_TRANSLATIONS_FANOUT`). Returns `EntityListResult<TranslationMatchRow>`
  `{rows, page:1, page_size:rows.length, total:BigInt}` — bigint survives both
  wires (extJson).
- HTTP: `GET /api/v1/system/translations/find?matches[]=|matches=csv&language=`
  (`translations.router.ts`, `AUTHENTICATED_USER`, zod `FindQuerySchema`,
  registered BEFORE `/:module/:language`).
- NATS: `system.translations.find` (`internal-request-routes.ts`,
  `makeNatsRequestRoute` + `verify`, permissions `[]`).
- Tests: `translations-find.test.ts` (grammar, 17 cases) +
  `translations-find.router.test.ts` (transport boundary, 7 cases) — 128 tests
  green repo-wide; runtime probe on live DB: `job.*`→188 rows, mixed
  `app/job/ai` matchers in ONE call→101 rows, `job.module.*` all-langs→7,
  unknown-ns→404, `'%'`→400 grammar, empty→400 required, 65→400 limit.

### Step-3 as built (2025-12-07, us-v3 + fe-v3 + be-v3)

- ai/fe repoint: 4 files, 34 replacements — `ModelImportSheet` ×24,
  `CerebellumSheet` ×4 (incl. `fieldNs` const covering ~15 `${fieldNs}`
  sites — lint-invisible dynamic prefix, fixed anyway), `ModelTestReportSheet`
  ×6. All 35 cited `ai.entities.*` keys verified present in `ai.translations`.
- **Scanner truth**: `i18n-key-ns` never consults `isExempted` — inline
  `standards-exempt:` comments CANNOT declare debt for code literals
  (D.4 option A was a dead end). Shared-chrome therefore fixed by seeding
  the target keys, not exempting the refs.
- **Dead keys discovered**: `system.entities.list.deleteFailed|restoreFailed`
  never existed (camelCase + unseeded) — fe-v3's own `useRowActions.svelte.ts`
  cited them too (platform delete/restore toasts broken). Repointed to
  `app.common.delete_failed` (existed ×7) + NEW `app.common.restore_failed`
  (authored ×7). `app.entities.list.no_records` seeded ×7 copying
  `system.entities.list.no_records` — opens the `app.entities.list.*` family
  phase-2 completes. be-v3 patch `20261207210000_i18n_segregation_app_chrome.sql`
  applied live (verified ×7 both keys).
- **More dead keys found (not fixed — separate family)**: fe-v3
  `useRowActions`/`useBulkActions` `scope: tFn('app.common.errors.scope.deleteApi'
  |'restoreApi')` — keys missing AND camelCase; `tFn(` isn't scanned by
  `T_CALL_LITERAL`. Flag for a dedicated fix.
- Per-service `i18n_key_ref_exempt` landed ×6 — scanner green for all 6
  services under BOTH current and narrowed allowlist (dry-run `[app,{own}]`:
  0 violations everywhere) → step 5 flip is verified-ready.
- D.5 live `config_entries` migration (67 rows) deliberately deferred: it
  repoints `label_key`→`{schema}.*` and MUST land with the FE consumer
  resolution (step 4) or labels regress on the modules PoC (system.* resolves
  via the core dict today; {schema}.* needs findTranslations/module dict).

## E.bis2 — How (b) actually resolves: the full consumer map

**"Module config labels live in the module's own dict" — who renders them, where?**

Physical ownership is already enforced free: `translations_key_shape` CHECK on
`{schema}.translations` accepts only `^{schema}.*` keys — a JH patch seeding
`job.settings.config.auth.gateway_public_secret.label` passes by construction; a `system.*`
key is rejected by the constraint itself.

| Surface | Mechanism | Change needed |
|---|---|---|
| Module's own pages/remote bundle (`fe/src` on `/system/{mod}/*` or `/{mod}/*` routes) | `useModuleTranslations()` in `(app)/+layout.svelte` resolves the module from `route_prefixes` and merges `{schema}` dict automatically | none — works today (this is how `ai.entities.ai_model.*` resolves once the prefix is fixed) |
| Shell's stale PoC `/system/settings/modules/{code}` | `loadModuleTranslations(moduleId, lang)` — **already exported** (`use-module-translations.svelte.ts:123`), dedup+ETag+localStorage. The page knows `code` → `loadModuleTranslations(code)` merges `job.translations` → `$t('job.settings.config.*')` resolves | one call added to the PoC page (stale anyway — the hook is a one-liner) |
| Module's own services resolving labels (exports, reports) | reads `{schema}.translations` via own DAL — same schema, zero cross-calls. Own labels need NO governed route at all (`system.dict.get` remains for platform vocab if kept) | none |
| BE's own `public.config_entries` (settings rows: `idp_*`, `oidc_*`) | cite `system.settings.config.*` — BE-owned rows citing the system domain → LEGAL, unchanged | none |

The model becomes uniform: **`app.*` = shared public vocab (the one cross-domain namespace),
`system.*` = the system domain's own surfaces (BE/shell only), `{schema}.*` = the module's own
everything** — entities, nav, actions, settings config, callable vocab, events.

## E.ter — The 67 rows, deeper

**Provenance reconstructed**: `0002_seed_config.sql` in ai/crm/es/job are *full-table dumps*
(`OVERRIDING SYSTEM VALUE`, `updated_by='migration-i18n-key-snake-cleanup'`) — a one-off
script rewrote `config.*`→`system.settings.config.*` and the dumps baked it in. Webhook's
shipped files still carry the older `config.*` literals while live rows show `system.*`
(same migration touched live data without file dump). Boilerplate seeded `system.*` directly
(`updated_by='system'`). JH additionally has rows with `updated_by='migration-gateway-config'`.
**No be-v3 patch writes module tables** — the rewrite was a script, not a governed patch.

**Decomposition by ownership**:
- `infra` group (`nats_url`, `http_port`, `service_base_url`, `service_code`, `be_base_url`) —
  same key name in every service, but the ROW is module-owned → label follows the row:
  `{schema}.settings.config.infra.{key}.*`. Duplication ×6 services is the segregation price —
  and the point: each module can diverge.
- `auth` group (`auth_mode`, `service_client_shield_*`, `gateway_public_secret*`,
  `auth_roles_path`, `service_client_shield_key`) — SDK contract keys, rows module-owned →
  `{schema}.settings.config.auth.*`.
- module-specific (`reconcile_interval_ms`, cerebellum/docs keys, boilerplate keys) →
  `{schema}.settings.config.{group}.*`.

## E.quater — What "custom.* excluded" means (Q5 clarification)

`custom` is the 4th dict domain: `custom.translations` holds **customer-owned** override
keys written via the translations admin UI; the `custom` dict loads at bootstrap
(`CORE_DICT_MODULES = ['app','custom','system']`) so customer keys apply app-wide.
A US module citing `custom.foo` depends on customer-managed content — not a contract the
module can rely on. `i18n_namespaces = ["app","{schema}"]` therefore flags `custom.*` in US
code. The question was only to confirm the exclusion is intended (it follows from the rule).

## E.quinquies — Why two SQL rules (Q6)

`i18n-sql-ns` guards **writes**: `INSERT INTO {schema}.translations` — expected ns derived
from the **target schema in the statement** (no config; always-on).
`i18n-sql-key-ref` guards **references**: `label_key`-family VALUES — expected set
`{app, <stmt-schema>}`. Different objects, same boundary family:

- **Exempt granularity**: `0002_seed_config.sql` has zero translation writes (clean on
  `i18n-sql-ns`) but dirty refs — merging would let a file-level exempt silence BOTH checks.
  Separate ids keep debt declarations precise.
- **Activation**: `i18n-sql-key-ref` self-derives `{app, <target-table-schema>}` from the
  statement — always-on like `i18n-sql-ns`, no `i18n_namespaces` config needed for SQL.
- **Reporting**: distinct hints — "wrote a foreign key" vs "cited a foreign namespace".
Cost: one rule id + one exempt field.

## F. Doc updates (proposed — write only on approval)

- `primebrick-fe-v3/docs/ai/i18n.md` (~L65-69): the "*own + shared CORE (app.*, system.*)*"
  line → strict US contract: `app.*` + own schema; `system.*` reserved to BE-owned surfaces.
- `primebrick-v3-sdk/docs/ai/check-standards-gate.md`: document `i18n_namespaces`,
  `i18n-sql-key-ref`, `i18n_sql_ref_exempt`, non-i18n field denylist, template-literal scope.
- `primebrick-v3-core/src/entity-meta.ts` `title_key` docblock: says interpolation uses
  `system.entities.<tk>.*` — stale; actual composition is `{entities_ns}.entities.<tk>.*`.

## G. Acceptance criteria

- `bun ../../primebrick-v3-sdk/tools/check-standards.ts src` exits 0 in every US service dir
  (violations only as declared exempt debt until phase-2 migrations land).
- CI `check-standards.yml` green across the matrix (+boilerplate — confirmed).
- Fixture specs cover: template-literal `system.*`, `system_key` FP, INSERT column-position
  refs, UPDATE SET refs, nested-JSON `*_key` refs, exempt-file behavior, `app.*` + own-ns pass.
- ai/fe renders translated labels where raw keys showed before (spot-check models sheet).
- No FE repo / be-v3 changes beyond the two doc items (the shell legitimately uses `system.*`).

## Step 4 — as built (2026-12-08)

**FE consumers** (`primebrick-fe-v3`):
- `api-types.ts`: `TranslationMatchRow` — wire mirror of the BE row
  (`uuid|key|language|value|module` discriminator).
- `api.ts`: `fetchTranslationsFind(matches, language?)` →
  `GET /api/v1/system/translations/find?matches[]=` (repeat-param; `language`
  optional — omitted fetches every language's rows in one request).
- `use-module-translations.svelte.ts`: `loadTranslationsByKeys(matches)` —
  dedup `Set`+sort, signature-keyed in-memory dedup (`keys:{sorted,joined}`)
  on `LOADED_TTL_MS`, chunked at `FIND_MATCHES_CAP=64` (the BE wire bound —
  module counts are unbounded by design), rows grouped by `language` and
  merged per-language via `mergeModuleDict` → the en-GB floor layers in
  for free. Failure contract identical to `ensureModuleTranslations`:
  never silent, never blocking — MEDIUM notification + raw-key fallback.
- `/modules` list: `loadServices()` awaits `loadTranslationsByKeys` on the
  services' `label_key` set — `ai.module.name`, `job.module.name`, … are
  already module-owned (verified live: registry rows + `system.api.title`/
  `system.settings.title` pseudo-services resolve via the same call).
  `resolveModuleLabel` keeps its sync fallback path — the dict is simply
  enriched before/while it renders.
- `/modules/[code]` config tab: `loadConfig()` fetches `fetchModuleConfig`
  then awaits `loadTranslationsByKeys` on the entries' `label_key` +
  `description_key` set before `configLoaded=true` — labels render resolved
  on first paint of the tab (system.* today, `{schema}.*` post-migration —
  same code path resolves both).
- Tests: `src/lib/__tests__/load-translations-by-keys.test.ts` — 7 specs
  (merge-by-language, lang-wins-over-floor, signature dedup, 64-cap chunk,
  failure-swallow + dedup, empty no-op). vitest: green. svelte-check: 0/0.

**D.5 live-data migration** — executed atomically with the consumer in place
(the plan's sequencing, not the original TIC sketch — repointing before the
FE could resolve module keys would have broken the config tab):
- `primebrick-us-v3`: `20261208000000_i18n_segregation_config_keys.sql` ×6
  services (`ai`, `boilerplate`, `crm`, `emailsender`, `job` [job-handler],
  `webhook`) — INSERT…SELECT copies every cited `system.*` key into
  `{schema}.translations` as `{schema}.settings.config.*` (substring from 8,
  all languages preserved, `deleted_at IS NULL` guards, `ON CONFLICT DO
  NOTHING`), then UPDATE repoints `label_key`/`description_key` via CASE
  (per-column guard — a mixed row can't corrupt its non-system half),
  `version+1`, `migration-i18n-segregation` actor. Each service's
  MANIFEST re-signed (`dev-micha-2`), each applied live: 1 applied each.
- Live census pre-migration: 67 rows / all `system.settings.config.*` /
  zero missing translations. Post-migration verify: **0 `system.*` refs
  remain** in any module schema; module copies live (e.g.
  `job.settings.config.infra.nats_url.*` ×7 langs).
- `primebrick-be-v3`: `20261208210000_i18n_segregation_config_cleanup.sql`
  — soft-delete (`deleted_at`, `version+1`) of `system.settings.config.*`
  keys nothing still references. Reference set computed DYNAMICALLY across
  every schema owning a `config_entries` table (information_schema loop +
  `EXECUTE format`) — deploy-order safe: a module whose repoint lands
  later keeps its keys until it does; `public.config_entries` keys
  (auth/infra, 54 distinct) survive. Applied live: **1099 rows soft-deleted**,
  54 keys ×7 langs = 378 rows remain, zero live-but-unreferenced keys.
- Redis dicts invalidated post-migration (`translations:i18n:{schema}:*`
  — 20 cached dicts flushed; the 6h TTL is only the safety net for direct
  SQL edits per translations-cache.ts).

**Verification chain**: route boundary (7 router tests, step 2) + service
mechanics (live DB probe, step 2) + consumer unit tests (7, this step) +
live data probes + all 3 query encodings route to the protected handler
(401, live server). `system.entities.list.*` chrome stays system-owned —
platform-internal vocabulary the ELT cites legitimately (E.1: only keys
modules cite move to `app.*`).

**Remaining**: step 5 — flip `i18n_namespaces` → `["app","{schema}"]` ×6,
`boilerplate` in the CI matrix; discovered debt: `scope.deleteApi`/
`restoreApi` dead camelCase keys in `useEntityList.svelte.ts` (tFn() not
scanned by i18n-key-ns — same family as the useRowActions fix).

## Step 5 — as built (2026-12-08): enforcement ON

- `i18n_namespaces` flipped to `["app","{schema}"]` in all 6 US configs
  (`system` removed): ai, boilerplate, crm, emailsender, job, webhook.
  `pnpm check:standards` — **clean ×6 under the final contract** (the gate
  covers src + fe/src + db-meta; D.5 patches pass: own-ns SET literal +
  WHERE-span + `system.%` non-literal shapes all legal).
- `.github/workflows/check-standards.yml`: `boilerplate` added to the CI
  matrix — all 6 services now gate in CI.
- `i18n_key_ref_exempt` / `i18n_sql_exempt` entries stay as declared debt
  for the immutable shipped seeds (documented in each config).

## Discovered-debt fix — dead scope keys (same family, shipped now)

`useRowActions`/`useBulkActions` cited four camelCase scope keys that
existed nowhere (`scope.deleteApi`, `scope.restoreApi`,
`scope.bulkRestoreApi`, `scope.customActionApi` — `tFn(` is outside
`i18n-key-ns` coverage, so the lint never saw them):
- `primebrick-be-v3` `20261208220000_i18n_segregation_scope_api.sql`:
  seeds `app.common.errors.scope.{delete,restore,bulk_restore,custom_action}_api`
  ×7, authored to the sibling `{action}_api` register.
- `primebrick-fe-v3`: 6 cites repointed to the snake_case keys.
- Verified live: 4 keys ×7 langs in public.translations; svelte-check 0/0.

**i18n segregation is now enforced**: any `system.*`/`custom.*`/foreign-ns
citation in US code (literal, template prefix, or SQL `*_key` ref) fails
`pnpm check:standards` locally and CI on push/PR.

## Scanner coverage closure — camelCase `*Key` fields + `tFn` (2026-12-08, post-feature)

Census drove the target: `tFn(` = 0 US call sites (shell-only convention —
insurance at zero cost), but the real gap was the camelCase i18n-bearing
field family — `labelKey` (5 cites: every `createMicroservice` registration
payload), `messageKey` (7 in ai/fe), `errorScopeKey`. All legal today, all
invisible to the gate — the registration file is exactly where a module
declares itself to the platform.

- `primebrick-v3-sdk` `tools/check-standards.ts`: field regexes now match
  `\w*_key|\w*Key` (whole camelCase family); call regexes match
  `(?:\$?t|tFn)`. `NON_I18N_KEY_FIELDS` extended: `systemKey` (symmetry
  with `system_key`) + preemptive credential denylist (`apiKey`,
  `privateKey`, `publicKey`, `sshKey`) — guaranteed-FP fields, not
  speculation. Single-segment guard unchanged (`apiKey: "x"` never
  flags). Blanket `fn('dotted')` scanning rejected by census — NATS
  subjects and generic getters guarantee FP storms; explicit-name
  allowlist is the only sound policy.
- Regression specs: camelCase `*Key` foreign-ns fail / own-ns pass,
  `tFn` literal + template-prefix, `apiKey`-style non-i18n fields,
  existing `t()`/`$t()`/snake_case behavior intact — 37/37 green.
- `job-handler/fe` `RunDetailSheet.svelte`: `scope: 'job.runDetail'` raw
  identifier → `scope: t('job.entities.job_run.singular')` (bug found in
  the census — rendered the literal in the error panel). fe:build
  verified: translated key in the emitted chunk, raw literal gone.
- Gate re-run ×6 under `["app","{schema}"]` — clean; all existing
  camelCase cites pass under the extended regexes (own-ns/`app.*`).

**Not covered, by design**: display-text fields (`scope:`, `message:`)
aren't key carriers — the scanner can't distinguish ownership bug from
legit text; and arbitrary `fn('dotted')` calls (FP storm, census-proven).

## F — doc updates, as built (2026-12-08)

- **NEW canonical doc** `primebrick-be-v3/docs/ai/i18n-namespace-segregation.md`
  — the full contract: principle (availability ≠ permission), namespace
  registry (`app`/`system`/`{schema}`/`custom` × owner × citer), the 4
  enforcement layers, `findTranslations` matcher grammar, scanner
  coverage table (scanned + deliberately-not-scanned), config/exemption
  model, FE loading model, ops notes, migration history. Registered in
  `docs/ai/README.md`; pointer rule `.devin/rules/i18n-namespace-segregation.md`.
- **us-v3** — tailored module-author copy at `docs/ai/i18n-namespace-segregation.md`
  (the repo previously had NO i18n doc): cite-matrix, enforcement surface,
  key-seeding procedure, gated cross-read, common traps (`system_key`,
  `scope:` text-vs-key, `labelKey` registration payloads). README + pointer rule.
- **fe-v3** `docs/ai/i18n.md` — "shared CORE namespaces (app.*, system.*)"
  claim rewritten: modules cite `app.*` + own only; `system.*` is
  shell-owned; cross-ns reads go through `findTranslations` /
  `loadTranslationsByKeys`. README index line updated.
- **sdk** `docs/ai/check-standards-gate.md` — new "i18n namespace rules"
  section: the 4 rule ids, scanned surfaces (literal+template, snake+camel
  field families, `t`/`$t`/`tFn`), not-scanned policy (FP rationale),
  `i18n_namespaces` contract, exempt fields, no line-exemption note.
- **core** `entity-meta.ts` `title_key` docblock — stale
  `system.entities.<tk>.*` → `{entities_ns}.entities.<tk>.*` (default
  `system`); matches `entityPageTitle` implementation.
- **sdk** `check-standards.ts` docblock — stale `{own-code, app, system}`
  allowlist description → `["app","{own-code}"]`.

Verification: core `tsc --noEmit` clean; sdk suite 37/37; stale-claim grep
clean. Doc convention followed: per-repo tailored copies, own-repo
`.devin/rules` pointers (no cross-repo pointer precedent exists).
