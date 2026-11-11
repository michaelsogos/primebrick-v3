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
