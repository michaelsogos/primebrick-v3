# Entity PK unification — `id` int8 → `uuid` (uuidv7), `@Ref` decorator, `uid:` teardown

> Sub-plan of `elt-ref-cell-sheet-plan.md` — closes the `value_field:"id"`
> anomaly at the root: surrogate `id` never crosses the wire by *removal*,
> not by projection tricks. Decision **H3 approved by user**.

## Status: ⚪ TODO — Plan date: 2026-01-13

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | EntityBase: uuid declared on base — no entity exists without it | ⏳ not done | — | `@Key` uuid v7 |
| 2 | uuidv7: PG `DEFAULT uuidv7()` + app-injection guard (reject non-v7) | ⏳ not done | — | |
| 3 | DB migrations: `id`→drop, `uuid`→PK, `*_id` FK cols→`*_uuid` backfill | ⏳ not done | — | per-service db-meta patch |
| 4 | `meta.uid` teardown — all 54 decls are `"uuid"`, dead config | ⏳ not done | — | consumers→literal `"uuid"` |
| 5 | `@Ref` entity-class decorator → auto-projects `type:"ref"` + DDL FK | ⏳ not done | — | rewires list-config refs |
| 6 | `ref.value_field`/`"id"` contract deletion + broken id-picker fix | ⏳ not done | — | |
| 7 | Edge entities: docs_kb (no uuid, composite UK), docs_ingest_log, TranslationEntityBase | ⏳ not done | — | add uuid column |
| 8 | Lint/typecheck/tests/E2E after rewiring | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Part A — Decisions locked

### A1. `id` int8 PK is eliminated everywhere (H3)

The surrogate `id` column stops existing. `uuid` becomes **the** primary
key, generated **uuidv7** (PG18 native — `pgvector:0.8.5-pg18-bookworm`
already in `primebrick-be-v3/infra/docker-compose.postgres.yml`).

Consequences that make this cheap instead of risky:
- `id` **never crossed the wire** anyway (`projectAllExceptPk`) — no API
  consumer, FE code, or external integration ever sees it. This is
  mostly *removing* code, not refactoring contracts.
- `meta.uid` was **always `"uuid"`** — 54/54 real declarations (only
  test fixtures differ). The field is dead config.
- `value_field:"id"` ref support — the broken machinery — is deleted,
  not fixed.

### A2. uuid lives on the entity BASE — no entity without it

`uuid` is declared once on `EntityBase` (or a mandatory keyed base) so
an entity class **cannot exist without it** — construction-time
guarantee, not convention:

- `EntityBase` gains the column declaration; `@Key` marks `uuid` as PK.
- `DictEntityBase` drops its own `id`/`uuid` declarations (inherits base
  `uuid` as PK, keeps `code` UNIQUE business key).
- Entities currently lacking uuid (`docs_kb`, `docs_ingest_log`) get the
  column added by migration — they become conforming automatically.
- Edge check done: **no composite PKs exist** (all `@Key` are single
  `id`). `docs_kb` has a composite UNIQUE (repo,path,chunk_idx) — stays
  UNIQUE, uuid still becomes PK.

### A3. Generation: PG default `uuidv7()`, app-injection allowed with v7 guard

- Column DDL: `uuid uuid NOT NULL DEFAULT uuidv7() PRIMARY KEY`.
- App-side injection **allowed** (imports, tests, idempotent upserts)
  but guarded: the DAL write path rejects any caller-supplied uuid whose
  version nibble ≠ 7 (`uuid[14] === '7'`). No silent v4 into a PK.
- Optional DB belt: `CHECK (uuid_extract_version(uuid) = 7) NOT VALID`
  — NOT VALID so existing v4 rows don't block the constraint add; it
  validates only new writes.
- **Business uuid fields stay v4** (casdoor ids, external ids) — the
  v7 rule applies ONLY to the PK column.

### A4. Existing v4 uuids are NOT regenerated

Verified (PG docs + multiple benchmarks): `uuid` is one type — v4 rows
stay valid forever, FK references keep working, zero data rewrite of
uuid values. Only the *default generator* changes. The index becomes
mixed (old v4 scattered + new v7 right-appended) — valid; optional
`REINDEX CONCURRENTLY` recovers ~40% space later.

### A5. `meta.uid` removed

`uid` was the indirection "which column is the row key" — meaningful
only when `id` vs `uuid` was a choice. Now the key is always `uuid`:

- Delete `uid` from `EntityMeta` (core) + all `uid: "uuid"` decls.
- Consumers rewire to the literal `"uuid"` (or a core const
  `ENTITY_UID`): FE `action-endpoints`, `entity-links`, `CardGrid`/
  `CardList`/`EntityListTableContent`/`PreviewPanelWrapper` uid props,
  `use-entity-ref-options` (`valueField ?? meta.uid` → `?? "uuid"`),
  `use-pivot-row`, `build-entity-form-schema` managed check,
  `FormPageLayout` auditField, DAL `column-constraints` isUid branch.
- `MetaColumn.ref` contract: `value_field` deleted (always uuid);
  `filter_field` default becomes `"uuid"`; `route:"detail"` always
  viable.

### A6. `@Ref` decorator on the entity class — single source of truth

The ref declaration moves from `list-config.ts` onto the entity class —
"facade eredita, meta ereditano, navs ereditano":

```ts
@Ref({ entity: "local_address", route: "list" })
@Column({ pgType: "uuid", nullable: false })
local_address_uuid!: UUID;
```

- `@Ref` declares: target entity (+ optional `route`, `presentation`,
  `filter_field` overrides). It drives **three projections**:
  1. DDL — physical `FOREIGN KEY (local_address_uuid) REFERENCES
     local_addresses(uuid)` in migrations
  2. served meta — `type:"ref"` with the `ref{…}` payload, auto-emitted
  3. route/navigation semantics — census consumers see it
- `list-config.ts` stops carrying `ref:` blocks for decorated columns
  (constraint checker rejects decorator⇔config drift if both exist).
- `withColumnConstraints` validates `@Ref` targets resolve (entity
  exists, is served).
- The 9 `*_id` FK columns rename to `*_uuid` and get `@Ref` at once.

### A7. `/ref/` resolve endpoint — DELETED from scope

With every ref value being a target `uuid`, the sheet fetch is the
canonical `GET /api/v1/entities/{entity}/{uuid}` — already exists, no
new route. The CTA is `target/list?filters[0][field]=uuid&op==&value=…`
— `uuid` is `@Unique` ⇒ always in `allowedFilterFields`. Uniform, no
special-casing. (The vertical-endpoint idea was needed ONLY because
`id` values couldn't be queried — that reason is gone.)

---

## Part B — Performance: what's real vs hype (verified, PG18)

Sources: matteovincenti.com, myDBA.dev, importstatic.com, zeroexp.dev,
andyatkinson.com — all PG 18/18.6, reproducible harnesses.

| Claim | Verdict |
|---|---|
| v7 ≈ bigint on inserts | **Mostly true**: 10M rows bigint ~30s vs v7 ~32s (+8%); single-row TPS statistically equal (37–42k both) |
| v7 same index size as bigint | **False**: v7 index ~301MB vs bigint 214MB at 10M rows — +41%, pure key width (16B vs 8B). Arithmetic, not pathology |
| v7 23× faster | **True only vs v4** on huge tables — never vs bigint |
| v4 is bad | **True**: ~2× insert cost, 70% leaf density (vs 90%), 3–4× WAL — random-split pathology |
| "Same as int8, zero cost" | **Hype**: bigint stays strictly smaller/faster in absolute terms — you pay +8B per row per FK column and ~40% index width for portability/non-enumerability |
| Mixed v4+v7 index after migration | Works fine; old v4 scattered but valid; `REINDEX CONCURRENTLY` compacts later |

Honest bottom line for our scale: insert/write overhead vs bigint is in
measurement noise; index width +41% is the real (bounded) cost; join
comparisons are negligible. The PK being unguessable + portable + the
single-identity story is what the +8 bytes buys.

Gotchas that are real:
- uuidv7 **leaks creation timestamp** (first 48 bits = ms) — fine for
  PKs, never for tokens.
- v7 ordering is per-millisecond + random tiebreak — NOT a sequence:
  no gapless ordering, not a pagination cursor replacement.
- App-generated v7 under clock skew across services → mildly scattered
  inserts — still fine.

## Part B2 — Empirical benchmark on OUR PG 18.4 (measured, 2026-01-13)

Setup: `bench` schema, 100k parent + 500k child rows per variant,
real FK indexes, warm cache, best-of-2 `EXPLAIN ANALYZE` on
`primebrick-postgres-18` (docker, PG 18.4).

**Sizes**

| | bigint | uuidv7 | Δ |
|---|---|---|---|
| Parent heap (100k) | 13 MB | 14 MB | +8% |
| PK index (100k) | 2208 kB | 3104 kB | +41% |
| Child heap (500k) | 56 MB | 60 MB | +7% |
| FK index (500k) | 5720 kB | 6616 kB | +16% |

**Latencies (ms, warm)**

| Test | bigint | uuidv7 | Δ |
|---|---|---|---|
| Point seek by PK | 0.028 | 0.015 | parity |
| N-1 nested loop (1k children→parent) | 0.42–0.94 | 0.56–1.17 | ~+25% |
| N-1 full hash join (500k rows) | 26.0–45.3 | 34.2–43.9 | ~+15–30% |
| 1-N single (1 parent→5 children) | 0.03–0.09 | 0.02–0.08 | parity |
| 1-N subset (1k parents→5k children, fair temp-table) | 0.96–0.98 | 1.14 | ~+18% |
| FK-column index scan | 0.013–0.021 | 0.030–0.035 | +60% (µs noise) |
| Insert 10k children w/ FK check | ~60 | ~88 | ~+45% |
| Index-only bulk scan (per row) | 0.030 µs | 0.030 µs | parity |

**FK declared vs not (measured)**

- `LEFT JOIN` elimination happens **with and without** the FK — only the
  right-side UNIQUE/PK matters. The FK does NOT speed up SELECTs.
- `INNER JOIN` estimates get slightly more accurate with FK
  (est. 1074→1045 vs actual 1000).
- FK cost is write-side: a probe per INSERT/UPDATE/DELETE — ~+45% on
  uuid vs bigint inserts (probe on a wider index).

## Part B3 — Alternatives evaluated (why uuidv7 anyway)

**Index types beyond btree** — PK/UNIQUE constraints require btree; the
type is non-negotiable for the PK:

| Index | Verdict |
|---|---|
| Hash | ❌ Empirically BIGGER than btree on `uuid` (16MB vs 15MB at 500k — PG13+ dedup killed the 4-byte advantage); only `=`; cannot back UNIQUE/PK; no index-only scans (lossy — always heap fetch); slower inserts |
| BRIN | ⚠️ Not for PK/point-seek — but v7 is time-ordered → a secondary BRIN on uuid would give near-free "recent rows" range filtering. Possible trick, not a replacement |
| GIN/GiST/bloom | ❌ Wrong domains (jsonb/array/geo/multi-col) |

**Key-type alternatives**

| Option | Verdict |
|---|---|
| Snowflake bigint (64-bit time-ordered) | Keeps ALL bigint perf — but non-standard, enumerable-ish, leaks timestamp+machine bits, needs app-side node-id/clock-skew management. Loses universal uuid semantics |
| Two-key model "fixed" (id bigint internal + uuid UNIQUE wire; DAL projects `<key>_uuid` instead of raw `*_id`) | Joins stay bigint-fast BUT every FK column pays a translation join on EVERY query + dual identity maintained forever — was H1, rejected |
| Sqids/Hashids (bigint + encoded external) | No real uuid column (violates "uuid on base"); encode/decode layer everywhere |
| ULID/KSUID/nanoid | Text keys — strictly worse than native uuid |
| **uuidv7** | +15–30% joins / +40% PK index width (measured) — the bounded price of ONE identity |

**Tricks kept**: `DEFAULT uuidv7()` PG-native; app-injection guard
(version nibble = 7); v7 time-ordered ⇒ `ORDER BY uuid` approximates
insert order without a `created_at` index (not a strict pagination
cursor — ms tiebreak is random).

---

## Part C — Migration mechanics (per service db-meta patch)

For each service owning affected tables (crm has all 9 FK cols):

```sql
-- 1. FK columns: id → uuid (physical rewrite via join on target uuid)
ALTER TABLE customer_accounts ADD COLUMN local_address_uuid uuid;
UPDATE customer_accounts ca SET local_address_uuid = la.uuid
  FROM local_addresses la WHERE ca.local_address_id = la.id;
ALTER TABLE customer_accounts ALTER COLUMN local_address_uuid SET NOT NULL;
ALTER TABLE customer_accounts DROP COLUMN local_address_id;
ALTER TABLE customer_accounts ADD CONSTRAINT customer_accounts_local_address_fk
  FOREIGN KEY (local_address_uuid) REFERENCES local_addresses(uuid);

-- 2. Per table: uuid → PK, drop id
ALTER TABLE customer_accounts DROP CONSTRAINT customer_accounts_pkey;
ALTER TABLE customer_accounts ADD PRIMARY KEY (uuid);
ALTER TABLE customer_accounts ALTER COLUMN uuid SET DEFAULT uuidv7();
ALTER TABLE customer_accounts DROP COLUMN id;
```

Ordering: FK-column conversion BEFORE dropping target `id` (the join
needs it). One patch per service keeps it reviewable; manifest re-sign +
`primebrick-db sign` per repo rules.

## Part D — Inventory (empirical)

- `id!: bigint` PK entities: **29** in us-v3 (+ be-v3 audit pending —
  config_entry, translation bases)
- FK `*_id!: bigint` columns: **9** (crm: customer_id×3, local_address_id,
  contact_id, parent/child_customer_id, +1)
- Entities lacking `uuid`: `docs_kb` (composite UK), `docs_ingest_log`,
  `TranslationEntityBase` subclasses — all get uuid via base + migration
- `DictEntityBase` already declares uuid (id PK + uuid UK + code UK) →
  rebases cleanly
- `meta.uid` declarations: 54, all `"uuid"`
- `value_field:"id"` declarations: customer_accounts (local_address_id,
  contact_id, customer_id) — all broken today (400 on filter, raw id in
  pickers) — deleted by this plan, not fixed

## Part E — Baseline squish + live conversion (execution order, approved)

Patch history is consolidated per service **before** the uuid swap, so the
swap lands on a clean base. Live data is NEVER dropped — relations are
preserved by join-backfill (`*_id` → `*_uuid` via target uuid).

**E1. Baseline squish (per service, current shape with `id`)**
- Consolidate all accumulated patches into first-time scripts preserving
  the existing category ordering: `0001` = schema/tables/indexes/FK,
  `0002` = seeds/config, `0003` = translations/dictionary data, etc.
- DDL source: entity-driven `compare` vs empty snapshot + fold-in of
  handwritten DDL the entities can't express (extensions, partitions,
  DB-only objects). Data source: scratch-apply of the old patch chain →
  `pg_dump --data-only` (patch-seeded rows only, no user data).
- Prova del 9: apply baseline on a scratch DB → `pg_dump -s` must equal
  the live catalog; `drift-check` must be clean.
- Live DB: baseline replay is no-op by construction (generated CREATEs
  are `IF NOT EXISTS`); registry rows are inserted marking the new
  baseline patch names `applied` — nothing is re-executed on live, no
  seed row is resurrected.
- MANIFEST re-signed (`primebrick-db sign`) — sha256 per new file.

**E2. UUID conversion (per service, atomic)**
- Baseline files edited to FINAL uuid shape (fresh installs get uuid PK
  directly, no `id`).
- ONE conversion patch appended per service (Part C mechanics):
  `ADD *_uuid` → join-backfill → drop `*_id` → `uuid` UNIQUE→PK →
  `ALTER DEFAULT uuidv7()` → drop `id`. Idempotent guards → no-op on
  fresh installs.
- Ordering inside the patch: FK-column conversion BEFORE dropping target
  `id` columns (joins need them).

**E3. Drift status measured 2026-01-13 (fresh `primebrick-db check`)**
- crm / job-handler / emailsender / be: entity↔snapshot clean,
  entity↔live clean.
- **ai: DRIFT (pre-existing since ~Oct, index-level only)** — `ai.docs_kb`:
  (a) unique index `docs_kb_repo_path_chunk_idx_key` in DB but not in
  entity, (b) `docs_kb_embedding_idx` opclass `vector_cosine_ops`
  unexpressible by the entity index decorator. Resolve in the ai phase:
  declare missing index + extend decorator for opclass (or accept as
  DB-managed). **Deferred — tracked here, not blocking crm pilot.**

**E4. Service order:** crm (pilot) → be (user_profile, needed by the
ref-sheet POC) → job-handler → ai (incl. E3 fix) → emailsender.

**E5. Step-1 crm baseline — DONE 2026-01-13 (commits: dal `779ddae`,
us-v3 `47ff06`)**

Baseline = 3 files (0001 schema / 0002 seeds / 0003 translations),
entity-generated DDL + handwritten supplement. Live registry shas
updated (applied state preserved, no replay); `apply` → all skipped,
zero security events; `db:check` clean; 20/20 crm tests, 586/586 dal
tests.

Discoveries that shaped the work (record for later phases):

- **DAL generator emitted partman-4 calls** — `(t, c, 'native','monthly')`
  on plain parents; partman 5.4.3 wants `(t, c, '1 month', 'range')` on
  `PARTITION BY RANGE` parents with `PK(id, changed_at)`. FIXED in
  `emit-sql-patch.ts` — replay-verified.
- **FKs are NOT entity-declared** — 8 live FKs (`*_id`→`id`) exist only
  as DB objects; entities carry `*_id` as plain bigint columns. Baseline
  keeps them in the supplement; phase 2's `@Ref` makes them declared.
- **Drift-check blind spots** — column DEFAULTs and column ORDER are not
  compared (live has handwritten `created_by DEFAULT 'system'`,
  `type DEFAULT 'string'`, `reserved DEFAULT false` that entities don't
  declare — baseline = entity intent, live keeps harmless extras).
- **Partial/expression indexes + CHECKs not declarable** — 14 live
  indexes (`WHERE deleted_at IS NULL`, `is_default AND …`, `lower()`,
  `COALESCE`) + `customer_links_no_self_chk` + `translations_key_shape`
  live only in the supplement. Candidates for a declarable index
  extension (separate decision — same class as ai docs_kb opclass gap).
- **`translations` intentionally not in registry** (BE gateway CRUD) —
  stays handwritten in every module baseline.
- **seed-audit-trail lint** — dict seeds must emit `*_audit` INSERTs;
  folded into 0002 (canonical `NOT EXISTS` idempotent form).
- **Live mark-applied** — baseline file names reuse 0001-0003; registry
  `content_sha256` updated in place (applied-state semantics), old
  patch rows retained as history.

**E6. Step-1 be baseline — DONE 2026-01-13**

be surface: schemas `public,system,custom`, one registry in `public`,
127 patches → **9 baseline files**:
`00000000000000_init_database` (extensions + 23 entity tables incl.
audit parents + handwritten translations×3 supplement) /
`00000000000001-00000000000007_seed_translations_{locale}` (en_gb,
it_it, fr_fr, es_es, de_de, pt_pt, en_us — public `app.*` + system
`system.*` per file) / `00000000000008_seed_config` (27
`public.config_entries` + canonical audit trail + setvals).

- Fresh-DB apply: all 9 clean (public.translations 7214,
  system.translations 6892, config 27+27 audit, 8 partman configs).
- Scratch-vs-live catalog: residual diffs all expected — baseline-only
  = entity-intent audit tables live lacks (`mfa_action_authorizations`,
  `user_invitations`, `user_mfa_factors`, `user_passkeys` audits +
  partitioned `user_profiles_audit`); live-only = dead/junk objects
  (`auth_configurations(+audit)`, `dal_test_*`, engine-owned,
  stale part_config entries) — intentionally excluded, flagged for
  cleanup decision in the uuid phase.
- **Zero live FKs in be** — all references are uuid columns without
  physical FK constraints (nothing for the supplement; `@Ref` still
  declares them for meta/UX in phase 2).
- **Zero CHECK diffs except translation key-shape** (folded into the
  handwritten translation DDL).
- Seed boundary: `config_entries` = pure seed; org/user/role/auth_*/
  service_registry/client_shield_registry = runtime — excluded.
- Live registry: 7 sha UPDATEs (same-name files) + 2 INSERTs
  (`..._en_us`, `..._seed_config` — new names, old rows kept as
  history); `apply` → 9 skipped, 0 security events; `db:check` clean;
  check-standards clean. marker-persister.test.ts 2/6 = pre-existing
  NATS-timing flake under parallel load (passes isolated, unrelated
  to db-meta).

**E7. Step-1 job-handler baseline — DONE 2026-01-13 (commit us-v3 `5995b70`)**

38 patches → 3 (`0001_job_schema` / `0002_seed_config` /
`0003_job_translations`), registry in `job` schema.

- **Audit-trail semantic alignment (user-approved)**: `@AuditTrail()`
  declared on `JobTriggerEntity` only — the single real audit (148
  live rows: INSERT/UPDATE/SOFT_DELETE/RESTORE where soft-delete =
  disable, restore = re-enable). `job_schedules_audit` +
  `job_runs_audit` are **excluded from the baseline**: schedules is a
  derived NATS mirror ("not auditable state" — hardDelete, stated in
  schedule-service.ts), runs is an execution log (the row IS the
  history). Both tables are empty by construction — engine writes
  never inject an audit port; routes were read-only. Route decls now
  `auditable:false` for schedule/run (endpoint `/:uuid/audit` and its
  always-empty UI history panel honestly disappear). Live tables kept
  (empty) — flagged for uuid-phase drop.
- **Ideological bug recorded**: `isAuditableEntity` = `@AuditTrail`
  OR any `isAuditable` column → the `Auditable` mixin alone
  advertises trail capability. Patch 0010 had created tables for all
  three to silence the resulting read-path error — repairing the
  symptom instead of the contract.
- Supplement: `job.translations` (serial-style id — NOT identity;
  pg_dump `--data-only` of it needs no OVERRIDING) + 5 DB-only
  indexes (`job_runs_{created,schedule,status}`, `job_schedules_
  {service,status}`).
- Generator gap #2: does not emit `CREATE EXTENSION pg_partman` (nor
  the `CREATE SCHEMA partman` prerequisite) — handwritten, same as
  crm. Candidate fix: emit when audit/partitioned tables are generated.
- Verified: fresh-DB apply = live catalog (modulo the two excluded
  audit tables + legacy partition names + unique-constraint-vs-index
  equivalents); apply → 3 skipped, 0 security events; db:check,
  standards, 206/206 tests clean.

**E8. Step-1 ai baseline — DONE 2026-01-13 (commits: dal `06f160b`,
us-v3 `814f32f`, be `d95bac6`)**

14 patches → 3 (`0001_ai_schema` / `0002_seed_config` /
`0003_ai_translations`), registry in `ai` schema.

- **E3 "drift" demystified**: the recorded diff was cosmetic — live
  `docs_kb_repo_path_chunk_idx_key` ≡ entity `_uq` (same columns,
  constraint-style name) and `vector_cosine_ops` was already declared
  via `@Index({opclass})`. The diff-JSON entries are differ blind
  spots (no name-aliasing, no opclass normalization), NOT DDL drift.
- **Generator bug #3 FIXED (dal `06f160b`)**: composite `@Unique`
  groups silently dropped — group reconstruction read column-level
  `uniqueIndexName` (absent in snapshot) while `t.indexes` already
  holds the full group. Now emitted from `t.indexes`. Also caught
  be's `user_preferences_user_key_uidx` retroactively — be baseline
  amended + re-signed (commit `d95bac6`).
- **`nullsNotDistinct` added to `UniqueOptions`** (`@Unique(name,
  order, {nullsNotDistinct:true})` → `CREATE UNIQUE INDEX … NULLS
  NOT DISTINCT`): required by `ai_cerebellum.dtype` (nullable member —
  (key, model, NULL) must conflict). Declared on the order-0 member.
- **Generator gap #4**: `vector` extension not emitted when `vector(n)`
  columns exist — handwritten (with `pg_partman` + its `partman`
  schema prerequisite, same as crm/jh).
- Seed hygiene: `partition_maintenance_schedule` (created_by='test',
  E2E runtime row with built-in `@daily` default) excluded;
  `ai_models_test_scores_backup_20260921` flagged for uuid-phase drop.
- Supplement: `ai.translations`, `ai_feedback_rating_check`,
  partial-unique `one_default_per_assistant_uq` (unique+WHERE not
  expressible — `@Index` has `where` but no `unique` flag), 9
  DB-only lookup indexes.
- Differ blind spots noted: unique-constraint-vs-index name
  equivalence (`_key` vs `_uq`), opclass normalization in column
  lists, `NULLS NOT DISTINCT` comparison (declaration emitted but not
  diff-compared yet).
- Verified: fresh-DB apply = live catalog (modulo exclusions);
  apply → 3 skipped, 0 security events; db:check/standards clean;
  27/27 ai + 586/586 dal tests green.

**E9. Step-1 emailsender baseline — DONE 2026-01-13 (commit us-v3 `5110ba9`)**

16 patches → 4 (`0001_emailsender_schema` / `0002_seed_config` /
`0003_seed_email_templates` / `0004_emailsender_translations`),
registry in `emailsender` schema.

- **Audit map clean by requirement**: all 4 entities carry
  `Auditable` columns but no `*_audit` trail — explicitly documented
  in `templates.service.ts` (auditPort suppressed). No drift.
- **`@Unique()` promoted on `provider`** (user decision) —
  `providers_provider_uq` now entity-emitted.
- **Canonical names replace legacy rename artifacts** (user
  decision): live `email_config_*` → `providers_*`,
  `config_pkey` → `config_entries_pkey`,
  `email_templates_communication_log_*` → `sender_log_*`,
  `translations_uuid_key` → `translations_uuid_uq`. Live keeps
  legacy names — equivalent variant, normalized implicitly when the
  uuid phase rebuilds constraints.
- **`config_entries_deleted_at_idx` excluded** (user decision):
  plain btree on an 8-row table — `0001`-era boilerplate, never
  justified. Flagged for uuid-phase drop with `dal_test_*`,
  `auth_configurations`, `job_schedules_audit`, `job_runs_audit`,
  `ai_models_test_scores_backup_20260921`.
- **6 system email templates = seeds** (user decision):
  `invitation_welcome`, `otp_verification`, `password_changed`,
  `passkey_activated`, `passkey_removed`, `admin_unauthorized_alert`
  (all en-US, created_by='system'). Never historically seeded, but
  be auth invokes them by `template_code` and `email-service.ts`
  throws when absent — required for a working fresh install.
- **Runtime data excluded**: `brevo` provider (E2E artifact —
  api_key='fake', 127.0.0.1 endpoint), `e2e_probe`/`customer_high_value`
  templates, all `sender_log` rows, `verify-provider` (deleted).
- **Extraction lesson**: `grep "^INSERT"` on pg_dump output truncates
  multi-line INSERT statements (literal newlines inside string
  values) — corrupted the first templates extract ("trailing junk
  after numeric literal"). Use noise-line filtering
  (`grep -vE "^--|^SET|^\\|^$"`) instead.
- Live-only DEFAULT residue (blind spot, same class as crm):
  `config_entries.type='string'`, `config_entries.reserved=false`
  not entity-declared — baseline = entity intent, live keeps them.
- Verified: fresh-DB apply = live catalog (8 config + 518
  translations + 6 templates); apply → 4 skipped, 0 security
  events; db:check + standards clean. Pre-existing failure:
  `payload-schema-honesty` test (`to` array↔scalar compat — from
  the `schemas→text[]` session, commit `356a0da`-era, unrelated to
  db-meta).

---

## Phase 2 — UUIDv7 conversion (agreed rules, 2026-01-13)

Per-module atomic cycle, one commit per phase turn. Order: emailsender
(pilot) → job-handler → ai → crm → be.

**Phase 1 — uuid columns (per module)**
- `ColumnDefault` enum = closed vocabulary of accepted SQL default
  expressions (`UUID_V4_DEFAULT_GENERATED`→`gen_random_uuid()`,
  `UUID_V7_DEFAULT_GENERATED`→`uuidv7()`); `@Column({default: …})`
  maps enum → `defaultSql` → patch emits `DEFAULT <expr>`. Unknown
  defaults = declaration-time type error, never a bad patch.
- Convention flipped: auto-rule `uuid + key/unique` now yields
  `uuidv7()` (canonical for new columns); `default:` enum only for
  explicit/non-standard declarations.
- Entities without `uuid` get it declared (`@Unique() @Column`) →
  patch emits `ADD COLUMN uuid DEFAULT uuidv7() NOT NULL` — volatile
  default backfills per-row, in place (PG11+).
- Existing v4 uuid values are NEVER regenerated in phase 1 — only
  the column default swaps (default comparison is a differ blind
  spot → the `ALTER COLUMN … SET DEFAULT uuidv7()` statements are
  handwritten in the migration patch).
- Audit tables keep their own bigint `id` (partman PK
  `(id, changed_at)`, internal only — not entities). Their
  `entity_uuid` is already dual-written alongside `entity_id`.

**Phase 2 — reference discovery (per module)**
Triple scan, not `@Ref` only: `@Ref` decorators + bigint `*_id`
columns + live FK constraints (crm holds 8 physical FKs). Output:
reference catalog. `audit.entity_id` skipped (already twin of
`entity_uuid`).

**Phase 3 — reference backfill (per module)**
- Only bigint `*_id` refs need `*_uuid` backfill via
  `JOIN target ON ref_id = target.id`.
- Naming law: uuid lives only in `*_uuid` columns — a `*_id` column
  holding uuid values is forbidden drift.
- Existing `*_uuid` refs = zero work (uuid values never change).
- Gates: `ref_id NOT NULL AND ref_uuid IS NULL` orphan count must be
  0; join-count parity vs `*_id` population.

**Phase 4 — entity declaration + patches (per module)**
`@Key() uuid` replaces `@Key() id`; `id` field dropped; generated
patch re-verified entity↔live↔baseline (all three drifts clean).
Typecheck drives the code migration: every `.id`/`findById`
call-site that breaks gets converted.
**findById must die** — only `findByUUID(value: string)` remains;
input validated as well-formed uuid + **version 7** (enforcer at the
boundary, not docs).

**Phase 5 — drops (per module)**
Order: drop FK constraints on `*_id` → drop `*_id` columns → PK swap
`id`→`uuid` → drop `id` + owned identity sequence → audit tables
drop `entity_id` (twin `entity_uuid` already complete).

**Phase 6 — v4→v7 PKEY rewrite (per module)**
Consequence of the v7-only enforcer: existing v4 PKs are rewritten.
One transaction per service: build `old_uuid→new_uuid` map → rewrite
all `*_uuid` refs via map join → rewrite PK values → enforcer live.
`uuid`-typed columns discoverable via information_schema (exhaustive
scan mandatory); **jsonb-embedded uuids (audit `delta`, log
payloads) are historical snapshots — NOT rewritten** (join keys are
columns, not embedded values). Gates: `count(old)=count(new)`, zero
dangling `*_uuid` post-rewrite.

**Every phase**: fresh-baseline apply = live catalog; row-count
parity; orphan scans empty; db:check + check:standards + tests green
→ commit.

**Phase-1 status — DONE all modules 2026-01-13**

| Module | Commit | Notes |
|---|---|---|
| dal | `d8fc80a` | `ColumnDefault` enum + auto-rule uuid→`uuidv7()` |
| emailsender | `025fcaf` | `sender_log.uuid` added; 4 col defaults swapped |
| job-handler | `cf795de` | defaults only (all entities had uuid) |
| ai | `8d308b6` | `docs_kb.uuid` + `docs_ingest_log.uuid` added (5742+28930 backfilled) |
| crm | `318616f` | 18 col defaults swapped |
| be | `c750198` | `auth_events.uuid` + `mfa_action_authorizations.uuid` (4933+1) + 15 defaults |

- All applied on live via patch engine, `applied` recorded, 0 security events per module.
- Excluded (not entities / flagged junk): `dal_test_*`,
  `primebrick_database_patches*`, `auth_configurations`,
  `ai_models_test_scores_backup_20260921`.
- Partitioned `ai_conversations`: parent ALTER covers partitions.
- Phase-2 watch-list (bigint `*_id` refs seen): crm 8 physical FKs,
  `mfa_action_authorizations.user_profile_id`,
  `sender_log.entity_id` (twin `entity_uuid` already populated),
  `audit.entity_id` everywhere (twin populated).

**Phase-2 discovery — COMPLETED (evidence, 2026-01-13)**

- **`@Ref`/`@ForeignKey` usage = ZERO** — no entity declares them;
  `*_uuid` refs are plain `@Column`. Discovery = column/FK scan only.
- **`*_id` bigint refs — the full work list (12)**:
  - crm (8): `customer_accounts.{contact_id,customer_id,
    local_address_id}`, `customer_consents.customer_id`,
    `customer_contacts.customer_id`, `customer_links.
    {child_customer_id,parent_customer_id}`, `local_addresses.customer_id`
  - be (4): `mfa_action_authorizations.user_profile_id`,
    `user_invitations.user_profile_id`, `user_mfa_factors.
    user_profile_id`, `user_passkeys.user_profile_id`
- **`*_uuid` refs already in place (21)** — phase-3 zero-work:
  ai 5, crm 9, emailsender 3, job 1, be 2.
- **audit tables**: EVERY `*_audit` has `entity_id` + `entity_uuid`
  both populated 100% (verified on all services) → phase 5 = bare
  `DROP COLUMN entity_id`, zero backfill.
- **`sender_log.entity_id/entity_uuid` both NULL on all 13 rows** —
  polymorphic ref unused so far (otp/verify emails aren't about a
  business entity row). Legit, not drift.
- **`*_id` non-bigint = business keys, not refs**: `model_id` (varchar),
  `client_id` (varchar), `credential_id` (text) — legit names.
- **uuid hygiene verified**: every entity-table `uuid` is NOT NULL +
  has a unique index; only exception is flagged junk
  `ai_models_test_scores_backup_20260921` (nullable, no unique).
- **`meta.uid` machinery exists** — public uid vs surrogate PK split
  already in the contract layer.
- **Gap fixed (dal `5b7c301`)**: `@Key` on a uuid column would emit
  `GENERATED ALWAYS AS IDENTITY` on uuid — invalid DDL. Identity now
  int-family only; uuid keys get `DEFAULT uuidv7()` via `defaultSql`.

**Phase-4+5 status — per module (fused per-module turn)**

The differ never emits DROPs nor PK changes (by design: destructive =
WARN-only; `isPrimaryKey` captured but not compared) — the pk-swap patch
is always handwritten per module.

| Module | Commit | Notes |
|---|---|---|
| emailsender | us-v3 `3c5a920` | DONE — pilot, patch `0006_uuid_pk_swap` |
| job-handler | us-v3 `ab6ac01` | DONE — patch `0005_uuid_pk_swap` + audit `entity_id` drops |
| ai | us-v3 `7f67d58` | DONE — patch `0005_uuid_pk_swap`, 9 tables, partitioned conversations |
| crm | us-v3 `b7c3a54` + dal `671bcbc` | DONE — patch `0006_uuid_pk_swap`, 17 tables + 8 `*_id` ref drops + FK rebuild |
| be | be-v3 `b3d14b1` + dal `db87244` | DONE — patch `00000000000011_uuid_pk_swap`, 14 tables + 4 `user_profile_id` drops + audit `entity_id` drops |
| dal | `3cc5f08` | audit writer: `entity_id` optional (uuid-PK safe) |
| sdk | `6e09d5e` | `MarkerAuditParams.entityId` → `bigint \| null` |
| be | `853ace0` | audit port/helper mirror alignment |

- **DAL audit-writer fix landed** (`3cc5f08`): `AuditParams.entityId` →
  `bigint | null`; extraction reads the `id` column only while present
  (`auditEntityId` helper); the 4 bulk trail INSERTs emit `entity_id`
  conditionally on `hasSurrogateId(meta)`; `AuditLogEntity.entity_id`
  nullable; `findAuditPage`/`AuditRow` no longer project surrogate ids
  (wire-clean); `makeTableAuditPort` + be `EntityAuditPort` omit the key
  when null — both audit-table shapes coexist during the window.
  SDK mirror `MarkerAuditParams.entityId` widened (`6e09d5e`) — bivariant
  method-param assignability broke when `AuditParams.entityId` widened.
- **jh lessons**: `*_uuid_uq` are CONSTRAINT-backed in jh (UNIQUE
  constraint) → `DROP CONSTRAINT`, not `DROP INDEX` (emailsender's were
  bare indexes — check `pg_constraint.contype='u'` per module).
  `job_rules_audit_p*` partitions belong to `job_triggers_audit`
  (legacy partition naming); `job_schedules_audit`/`job_runs_audit` are
  real (empty) partman parents — `entity_id` dropped on all 3 parents.
  jh suite flake: `service-routes` test times out at 5s under parallel
  load (dynamic import), passes isolated — pre-existing environmental.

- **crm lessons**: `*_uuid_fkey` constraints DEPEND on the bare
  `*_uuid_uq` indexes (`pg_depend`) — `DROP INDEX` on a referenced
  unique index fails (CASCADE would kill the FKs); mandatory order:
  drop `*_uuid_fkey` → PK swap + index drop → recreate FKs with the
  original CASCADE/RESTRICT semantics. The differ emitted a real
  entity↔live patch for `customer_uuid NOT NULL` drift — folded into
  `0006` Phase D (generated file deleted, still unapplied). Wire
  surface: children DTOs (`customer_account`/`contact`/`link`/
  `local_address`) accepted `*_id: bigint` — flipped to `*_uuid:
  z.string().uuid()`; list-config keys + `ref.value_field`/`filter_
  field` + `depends_on` pivots renamed; 8 `fields.*_id` translation
  keys renamed inside the patch (24 rows, 3 langs). `DictEntityBase`
  (DAL `671bcbc`) declares `@Key() uuid` — `customer_types` derives
  its PK from the base (only DictEntityBase consumer in the workspace).
  Typecheck does NOT catch zod-DTO drift (schemas don't type against
  entities) — grep `*_id` is the detector for wire surfaces.
- **ai lessons**: mixed uuid_uq flavors in one module — `ai_messages`/
  `ai_conversations` constraint-backed (DROP CONSTRAINT), the rest bare
  indexes (DROP INDEX); partitioned `ai_conversations` PK swap = parent
  `ADD PRIMARY KEY (uuid, last_seen_at)` propagates to all partitions +
  default; `@Unique` groups on uuid dropped from entities since the PK
  covers uniqueness (partition-field member too — PK subsumes it);
  `ai_messages`/`ai_feedback` are logical `@PartitionChildOf` children
  (regular tables, plain PK (uuid)); audit `entity_id` dropped on
  `ai_models_audit`/`ai_cerebellum_audit` parents → propagates to
  partitions; audit-row `id` stays (GENERATED ALWAYS AS IDENTITY, own
  internal seqs — not `*_id_seq%` leftovers: those were legit identity
  backing seqs + `translations_id_seq`); `DocsSearchResult.id: bigint` →
  `uuid: string` (chunk public identity on the search wire); `ai_models`
  `model_id`/`ai_cerebellum` `model_id` stay string business keys
  (HF repo ids — NOT surrogate refs); `ai_config_entries_deleted_at_idx`
  flagged junk dropped.
- **be lessons**: `config_entries` table was renamed from
  `auth_configurations` — live PK kept the old name
  `auth_configurations_pkey` (DROP by name, ADD renames canonical);
  `auth_configurations_audit_*` partitions/index objects are orphans of
  the same rename but attach to `config_entries_audit`. Two more
  declaration-level bases hid `id`: `ConfigEntityBase` (dal `db87244`)
  like `DictEntityBase` before — grep entity FILES misses base-class
  PKs; detector = generated drift patch trying to RE-ADD `id`.
  **DAL RETURNING visibility bug (dal `db87244`)**: `buildReturningClause`
  stripped the PK from write results (bigint id not JSON-safe) — with
  uuid as PK the public uid disappeared from POST/PUT responses on EVERY
  migrated module; caught by BE boundary test. Fixed: strip only while
  `hasSurrogateId(meta)`. **Audit-write silent skip**: `repo.add` calls
  `auditPort.writeAudit().catch(logger)` (fire-and-forget); the
  RETURNING clause emitted ALL `AuditLogEntity` columns incl.
  `entity_id` → PG error on migrated audit tables → swallowed → 201
  with no audit row. Fixed both ports: `returning: [id]` projection.
  Service refactor: `getIdByUuid`/`getUuidById` bridges deleted
  (`assertExistsByUuid`), `updateProfileById` → `updateProfileByUuid`,
  `getMe` counts pass `userUuid` directly (sessionState for flag only);
  `config-entries` update match by uuid (`Record<string,unknown>` hid
  it from typecheck — grep `.id` detector); `AuthEventRow.id` → `uuid`
  on the wire. uuid_uq all bare indexes except
  `client_shield_registry_uuid_uq` (constraint). No physical FKs at all
  in be — ordering free. 4 `*_user_profile_uuid_idx` mirrors replace the
  dropped `*_user_profile_id_idx` access paths.
- **emailsender lessons**: legacy PK names (`email_config_pkey` …) live
  on live — `ADD PRIMARY KEY (uuid)` auto-names canonical `<table>_pkey`;
  DROP COLUMN `id` removes pkey+identity+sequence atomically; two
  redundant uuid_uq on providers dropped; `SendEmailSchema.entityId` and
  `SendEmailResponse.logId` removed from the wire (entityUuid/logUuid
  already existed); `config_entries_deleted_at_idx` junk dropped here;
  `translations` keeps `id` PK (non-entity store — decision: leave).
- **DAL audit-writer gap — FIXED** (`3cc5f08`, see table above).

**Phase-2+3 status — per module**

| Module | Commit | Refs migrated | Orphans |
|---|---|---|---|
| crm | `f7ffd82` | 8/8 (`*_uuid` twins + FK mirror, partial idx) | 0 |
| be | `b780ed4` | 4/4 (cols only — be has no physical FKs) | 9 deleted* |
| emailsender | — | 0 needed (refs already `*_uuid`) | — |
| job-handler | — | 0 needed | — |
| ai | — | 0 needed | — |

\* **be live-data anomaly (user-approved deletion)**: 9 of 18
`user_passkeys` rows carried `user_profile_id` pointing at hard-deleted
`user_profiles` rows (ids 56–897, users created+used Sep–Oct 2026,
since hard-deleted — be's no-FK design allowed the dangling). Dead
credentials of nonexistent users — deleted inside patch
`00000000000010` before backfill, then orphan assert passed. Other 3
be tables were clean. Post-apply: 9 passkeys (1 live user), 0 orphans,
0 uuid↔id mismatches; `db:check` clean; standards clean; typecheck
clean; 2 flaky NATS-timing failures in `marker-persister.test.ts`
(pre-existing, unrelated).
