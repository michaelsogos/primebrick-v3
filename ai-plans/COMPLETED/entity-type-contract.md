# Entity Type Contract — deterministic annotation→PG mapping

> New workstream born inside `db-migration-engine.md` / `schema-sovereignty.md`:
> makes entity type resolution static (TS annotation, transpiler-independent),
> removes ALL name-based inference, adds guarded types (UUID, ISODate, ISOTime,
> Vector, Decimal) and a closed `PgColumnType` union. The lint matrix runs inside
> `primebrick-db check`/`compare` — whitelist violations are hard errors,
> `*_uuid`-name and redundant-`pgType` are advisory warnings.

## Status: � DONE — Plan date: 2026-10-15 15:10 UTC / 17:10 CEST+2 — closed 2026-10-15 (task 18 extracted to dedicated plan `entity-validation-autoderive.md`; task 21 index absorption landed)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Census 566 props / 26 annotation groups, live pg probes | ✅ done | 10-14 | NUMERIC silent-precision + DATE tz-shift + vector-as-string bugs found |
| 2 | `@primebrick/decimal` package (BigDecimal-shaped, PG-parity div) | ✅ done | 10-15 | cloned repo, gitflow, 84 tests + live parity — **uncommitted, awaits publish/commit go** |
| 3 | Guarded types + `PgColumnType` union in dal-pg | ✅ done | 10-15 | UUID/ISODate/ISOTime brands, Vector class (instanceof), literal union bans aliases |
| 4 | Static annotation extractor (lazy TS API, extends-chain) | ✅ done | 10-15 | `design:type` dependence gone; node===bun output verified |
| 5 | column-pg-io + type-parsers rework | ✅ done | 10-15 | NUMERIC→string+Decimal hydrate, DATE→ISODate string, vector hydrate, int8→bigint |
| 6 | Lint matrix in `primebrick-db check`/`compare` | ✅ done | 10-15 | whitelist hard errors; `*_uuid`-name + redundant-pgType warnings; explicit pgType on *_uuid = intent declaration |
| 7 | TEMP TABLE bulk ops: types via `AS SELECT … WHERE false` | ✅ done | 10-15 | killed the last runtime-type dependency; 324/324 tests |
| 8 | Entity migration BE: uuid→UUID, canonical literals, call-site guards | ✅ done | 10-15 | `trustedUUID` at validated-boundary points |
| 9 | Entity migration US: ai/emailsender/job-handler/webhook | ✅ done | 10-15 | int4 pins on counters, `Vector`+length on embedding, uuid loose-refs retyped after live-DB evidence (all already `uuid` columns) |
| 10 | Redundant `pgType` cleanup (~44 sites) | ✅ done | 10-15 | removed default-restatement; `@Column` never left empty |
| 11 | Decision pack A — numeric→float8 (10 cols) | ✅ done | 10-15 | user: decimal params → `number`→float8; patch generated, **review before sign** |
| 12 | Decision pack B — kv_cache_bytes_per_token | ✅ done | 10-15 | `number`+int8 → `bigint` prop (architectural rule: integers→bigint→int8) |
| 13 | Decision pack C — 8 `*_uuid` text columns | ✅ done | 10-15 | live-DB evidence: all already `uuid` typed → `UUID` props + snapshot regen |
| 14 | `provider_uuid` NOT NULL | ✅ done | 10-15 | DDL `uuid NOT NULL` + code always resolves provider before write → `!` non-nullable |
| 15 | ai_model int4 props (power_level, max_tokens, sort_order, download_size_mb) | ✅ done | 10-15 | DB already int4; domain-bounded < 32bit → int4 legit (int8 is default only absent a bound) |
| 16 | Unique-index name mismatches — entity vs live DB | ✅ done | 10-15 | equivalence suppression in `compareSnapshots` (same cols/uniqueness/using/predicate, any name); 3 duplicates suppressed, `sender_log_provider_message_id_uq` kept as real drift |
| 16b | `service_registry.schemas` false drift `_text` vs `text[]` | ✅ done | 10-15 | udt array canonicalization fixed in `schema-type-normalize.ts` |
| 16c | `mcp_oauth_clients` audit-col nullability | ✅ done | 10-15 | entity declared nullable vs DB NOT NULL+defaults → `nullable:false`; BE compare now clean |
| 16d | Stale draft cleanup | ✅ done | 10-15 | 11 superseded drafts deleted; unsigned MANIFESTs rebuilt to existing files only |
| 17 | type-matrix canonical entity + tests in dal-pg | ✅ done | 10-15 | `test/entities/type-matrix-entity.ts` + `test/type-matrix.test.ts` — 160 tests; found+fixed 2 real bugs (unmappable-check ordering, `boolean[]` family-key leak) |
| 18 | Validation auto-derivation (`meta.validation`, `zodFromEntity`) | 🚫 dropped | 10-15 | extracted to dedicated plan `entity-validation-autoderive.md` — out of this plan's scope |
| 19 | Docs: index + per-type pages + decorator reference + agent rule "new type → discuss first" | ✅ done | 10-15 | `column-types.mdx` + `_order.json`; entities/getting-started/architecture/connections/repository-pattern/index/api-reference/audit-trail/clone/optimistic-lock/partitioning modernized; `docs/ai/*` + `docs/skills/dal-usage.md` updated; `.devin/rules/entity-type-contract.md` + AGENTS.md contract line; typedoc.json output path fixed (was writing to user-guide/_extracted, stale since tier split) |
| 20 | Patch sign + apply (numeric→float8, varchar(n), vector(1024), missing uq index) | ✅ done | 10-15 | reviewed vs live data + consumers (varchar bounds ok, all embeddings 1024-dim, pmi uq = real webhook correlation invariant); signed w/ dev-micha, applied both; post-apply compare: **zero drift** ai+emailsender+BE. Bonus fix: vector typmod dropped by normalizer → `comparablePgType` now parses vector(N) dims |
| 21 | DB-only indexes absorbed into entities + `@Index` group-seed bugfix | ✅ done | 10-15 | `docs_kb.repo`/`content_hash` → `@Index()`, `embedding` → `@Index({using:'hnsw',opclass:'vector_cosine_ops'})` — auto-names match live (`docs_kb_*_idx`); compare: no drift. Bug found+fixed in `entity-decorators.ts`: fresh index group didn't seed `opclass`/`where` from first member → explicit-opclass index always threw |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Architectural rules locked by user decisions

- **Integers → `bigint` → `int8`** (default). `number`+`int4`/`int2` allowed ONLY
  when the domain bounds the value under 32bit (`power_level` 1-5,
  `max_tokens` ≤32768, …) — declared via `pgType:"int4"`.
- **Decimals/floats → `number` → `float8`**. `number`+`numeric` is a whitelist
  violation (NUMERIC now hydrates as string/Decimal — a `number` prop would lie).
- **`Decimal` only for financial/mandatory-precision math** — not for config
  params. `@primebrick/decimal` = the C# `decimal` equivalent; wire `"N.Nd"`.
- **`uuid`-only columns → `UUID` guarded type**, regardless of FK presence —
  the evidence source is the live DB column type + code admission, not FK.
- **`*_uuid` + `string` + no pgType → warning**; explicit `pgType:"text"` on a
  `*_uuid` column declares intentional loose-reference and silences the warning.
- **Explicit `pgType` restating the inferred default → redundant warning** —
  never spell the default. (`pgType:"text"` on `*_uuid` is the exception —
  it answers the uuid question.)
- `length` → DDL `varchar(n)` (option B — DB-enforced, no SQL literals).
- `vector` dimension via `length` on `Vector` props → `vector(N)`.
- Fallback `text` → `throw` on unmappable annotations.

## Unique-index findings (live DB, 2026-10-15)

| Entity intent | Live DB | Verdict |
|---|---|---|
| `docs_kb_repo_path_chunk_idx_uq` | `docs_kb_repo_path_chunk_idx_key` (unique CONSTRAINT) | name mismatch — same constraint |
| `config_entries_uuid_uq`, `config_entries_key_uq` | `ai_config_entries_uuid_uq`, `ai_config_entries_key_uq` (plain unique INDEX) | name mismatch |
| `job_schedules_schedule_subject_uq` | `job_schedules_subject_uq` (unique CONSTRAINT) | name mismatch |
| `sender_log_provider_message_id_uq` | — | **truly missing** — CREATE is legit |

Resolution (implemented 2026-10-15): the comparer now treats an entity index as
satisfied by ANY DB index with identical ordered columns, uniqueness, access
method and predicate — catalog names don't drive DDL. The three name-mismatch
creates are suppressed; index names stay divergent (`_key`, `ai_`-prefix),
which is accepted since the constraint is equivalent. If canonical naming is
ever wanted it's a separate metadata-only `ALTER INDEX`/`RENAME CONSTRAINT`
decision — not required for correctness.

## Patches — signed + applied 2026-10-15

- `ai/db-meta/patches/20261015144424_*` — 10× numeric→float8, 4× text→varchar(n),
  vector→vector(1024). Reviewed vs live data + consumers, signed w/ dev-micha, applied.
- `emailsender/db-meta/patches/20261015144425_noop.sql` — the single legit
  `sender_log_provider_message_id_uq` create. Signed + applied.
- Post-apply `compare`: **zero drift** ai + emailsender + BE.
