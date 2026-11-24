# Debt remediation — drift defaults, audit clock, expressibility gaps

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| docs/ai/workflow.md (fe) | plan file + tic/toc + ledger | this plan is the ledger of record |
| docs/ai/commit-verification.md | every change turn ends with commit; typecheck AND runtime verification | each step closes with tsc+test+commit |
| docs/ai/enforcement-over-verification.md | enforce at construction/lint, not skippable checks | decl defaults = construction-time contract |
| dal-pg migrations doctrine | never edit a shipped patch; generate via compare | emitted patch reviewed, never hand-written |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-01-16 ~10:30 | log audit all 7 services | done | warn/error census reported to user | remediation steps below |
| | sdk docs-pack fix | ✅ | commit 9891dd0, 623/623 tests, ai ingest live-verified | — |
| | dev-server.md log path ×3 | ✅ | commits 061b610/e128259/fffedf1, stale logs deleted | — |
| | entity defaultSql edits | WIP | git diff shows edits; some to revert per user decision | step 1 |
| 2026-11-24 ~11:57 | step 1: decl aligned to user decisions | PARTIAL | reverts applied (type×4, schedule_type, status), success→false; tsc clean ×4; tests ai 20/20, emailsender 34/34, webhook 4/4, job-handler 157+1FAIL (see anomaly) | commit pending user decisions |
| | compare post-fix (temp out) | ✅ | emitted patches = exactly user decisions: SET DEFAULT audit + sequences create + DROP DEFAULT (type, schedule_type, status, run_as) | step 2 will regen into real db-meta |
| | ANOMALY: job-handler test fails `no schema domain and no DATABASE_SCHEMA` | ✅ FIXED | DATABASE_SCHEMA mirrored in service-routes.test.ts + boilerplate.test.ts (dynamic import) — 158/158, 5/5 green | — |
| | ANOMALY: [redundant-pgType] — turned out NOT to be decl cruft | ✅ FIXED (engine) | warning used inferPgTypeFromEntityColumn's "text" FALLBACK as evidence; pgType is the REQUIRED runtime decl (lint entity-type-declared enforces it — verified live: removing broke check-standards + pipeline). Engine now pin-only semantics. dal `9b61244` | — |
| | ANOMALY: extractor boolean union bug | ✅ FIXED | `boolean`/`boolean\|undefined` = union(true,false[,undef]) → isUnmappable → optional booleans threw "Unmappable type". boolean-literal unions now resolve "boolean". dal `9b61244` | — |
| | step 3: decl aligned + db-meta regen ×5 | ✅ | us commit: defaultSql per decision table; db:check clean ×5; patches emitted unsigned | step 4: sign+apply+boot verify |
| | boilerplate dist stale test artifact | ✅ deleted | dist/__tests__ phantom test ran by vitest — gitignored build output | — |
| 2026-11-24 ~14:51 | Phase 0.5: US pin sweep | ✅ | 37+1 entity files, all `@Entity("x","<schema>")` → `@Entity("x")`; db:check clean ×6 (snapshot identical = drift-zero proof); tests ai 20, boilerplate 5, crm, emailsender 34, job-handler 158, webhook — all green; commit `597d4dd` | Phase 1 |
| | ANOMALY: boilerplate test boot failed `mkdtemp dist/docs-check-*` | ✅ fixed (local) | my earlier dist/ cleanup removed the dir — sdk emit.js:98 mkdtemp lacks parent-mkdir → latent crash on clean checkout → STEP-6 CATALOG (sdk fix, not patched) | — |
| | ANOMALY: emailsender/dist stale `service-registry` public pin | cataloged | dist-only ghost, no source — stale build artifact | step 6 cleanup |
| 2026-11-24 ~15:05 | Phase 1a: dal closed schema model + boot-guard | ✅ | `@PublicEntity` (domain self-enforces: no-`public` domain → boot throw), `@TranslationEntity` purpose-bound pin (hardcodes table + requires TranslationEntityBase subclass — pin capability cannot be repurposed), `runMigrations` firstBoot guard (absent/empty registry → throw unless `firstBoot:true`; CLI `--first-boot`), `sequenceAnalyze` domain-wide bound-column probe (was `primary`-only). tsc clean, 858/858 tests (3 new guard cases), standards clean. dal `74d62ef` | Phase 1b: schema-as-const (A) — design confirmed below |
| | leftover `approve-patches.mts` (untracked, Nov 24) | cataloged | stale auto-approve script from earlier session — NOT committed, user decides | step 6 cleanup |
| 2026-11-24 ~15:55 | Phase 1b: schema-as-const (A) — all repos | ✅ | Single source = `OWNED_SCHEMAS` const per service (`src/db/dal.ts` ×6 US, `src/db/owned-schemas.ts` BE — public stays primary until Phase-3 flip). `assertDbEnv()` → `{url}` only; DATABASE_SCHEMA in env = reserved boot violation (docker cannot inject schema identity). SDK: `MicroserviceOptions.schemas` required, `ServiceRoutesInput.schemas` required, `ServiceDbMigrationOptions` (schemas injected from options — not re-declarable); builtin decl/rpc/nav factories take ctx.schemas (no env read on builtin path). dal CLI: `--schema` REQUIRED for check/compare (env fallback removed — second source killed). `db:check`/`compare`/`apply` wrappers derive --schema from OWNED_SCHEMAS everywhere. .env + compose + test mirrors cleaned ×6. Verified: tsc clean ×6+BE, `db:check` clean ×6+BE (snapshot-identical = drift-zero), tests 858 dal / 626 sdk / 241 us green. Commits: sdk `29190d7`, dal `1c132f2`, us `0828b9a`, be `e8467fb` | Phase 2: partial unique (`@Unique aliveOnly/where`) |
| | ANOMALY (resolved): BE sequences tables missing | ✅ fixed | `public.sequences`/`sequence_counters` declared via builtin-merge (Nov-21 `8197b04`) but never materialized — snapshot Nov-16 stale; sequence-revive executor had no table (latent runtime failure). compare → patch `20261124144443_create_public_sequences_*` (+ audit partition + B-group default ALTERs — correct direction DB→decls) → signed dev-micha-3, approved via `approvePendingReview`, applied. Live DB 1:1 restored; db:check clean. 14 DB-only index WARNs left untouched (phases 2/5 own them) | — |
| | ANOMALY (resolved): BE suite 430→433 | ✅ fixed `c765d64` | rbac = stale test (`update.bulk` in STANDARD_OPS core `84065e5`, route never added → vocabulary filler emits enabled:false). marker-persister = starvation-timeout cascade: abandoned test body's late subscribe() leaked into next test's window post-clearAllMocks → timeout bump 15s + `stopMarkerPersister()` (disarm retry, unsubscribe NATS, reset started — wired into gracefulShutdown + afterEach isolation). 433/433 green under full load | — |
|| 2026-11-24 ~17:30 | Phase 1.9 docs pass (arch contract — all repos) | ✅ written | dal: `entities.mdx` closed schema model, `migrations.mdx` firstBoot+`--schema` required, NEW `schema-domain.mdx` (+_order.json), `connections.mdx` OWNED_SCHEMAS, TSDoc fixes ×5 src files. sdk: `getting-started.mdx` (OWNED_SCHEMAS example + dbPatches sans schema), `microservice-anatomy.mdx` schemas required, `migrations.mdx` ServiceDbMigrationOptions, `env-policy.md` URL-only+reserved, `db-env.ts` stale msg. us: `env-policy.md`, `dal-usage.md` OWNED_SCHEMAS, README, dev-guide adding-a-service/architecture/overview, boilerplate index. be: `env-policy.md`, `dal-usage.md` owned-schemas leaf, `db-patches.md` --schema+firstBoot, `environment-configuration.mdx`, i18n-namespace-segregation, README. extract-docs regenerated dal+sdk; db-env test 12/12 | Phase 2 impl (D1=B, D2=A+B) |
|| 2026-11-24 ~18:10 | Phase 2: partial/composite unique — machinery + wave applied live | ✅ | `@UniqueIndex` class-level + `@Unique` accumulate + aliveOnly default-on-Deletable + enforcement throws + constraint-aware drops + multi-group matchBy union. Wave live ×6: 18 index redefs partial-ized, 2 legacy orphans dropped, docs_kb renamed, webhook uuid_uq dropped, 3 partials declared (service_registry ×2, one_default, country_elf, system_key). 2 dal bugs fixed (normWhere raw-eq on same-name, noop verdict ignoring mismatches). Verified: tsc all, dal 870/870 (12 new), us 241, be 433, `db:check` clean ×6 + live queries. Docs: entities.mdx unique contract rewritten, migrations.mdx diff semantics, dal-usage.md ×2 consumer rules. Pending commits | Phase 3: @PublicEntity sweep |
|| 2026-11-24 ~18:15 | Phase 3+4+5: system-primary flip — machinery, decls, moves, drops | ✅ | **3a dal**: `IndexOptions` +`sort`/`nulls`/`with` (per-member, PG-default fill), class-level `@Index` spec form (mixin cols), snapshot captures `indoption`+`reloptions`, emit canonical `col [opclass] [ASC|DESC] [NULLS FIRST|LAST] WITH(...)`, compare ordering via indoption (expr-sig skips), `with` diff only-when-declared; patch-naming 3rd bug fixed (index/default/fk-only diffs → real slugs, was "noop"). dal 877/877. **Census**: 8 DESC indexes live — all "filter+ts DESC" latest-N; `crm.sequences` only semantically-required `DESC NULLS LAST`; no `deleted_at DESC`. **3b decls**: job_runs, auth_events ×3, ai_telemetry ×2, ingest_log, crm.sequences (zero-DDL where live); docs_kb `+with`; `translations_language_idx` via base; US wave ×6 applied + canonical renames (`<schema>_translations_*`→unprefixed, `translations_uuid_key`→`_uq`); keys.json bootstrap dev-micha-3 on ai/webhook/emailsender/boilerplate. **3b BE**: `@PublicEntity` ×12 + auth_events, client_shield pin-drop, `@TranslationEntity` ×3, mcp→`Auditable`+`client_id_issued_at` now(), B-group defaultSql (is_admin/is_preferred/is_system/is_active false, permissions '[]', is_enabled explicit-only), `OWNED_SCHEMAS`→`["system","public","custom"]`, hardcode `SCHEMA`/`schema:"public"`→`OWNED_SCHEMAS[0]` ×3. **4 move-patch**: `20261124183000` applied PRE-flip under public registry (idempotent: CREATE IF NOT EXISTS sys registry + DELETE failed orphans + INSERT SELECT ON CONFLICT + v1_archive index-renames→SET SCHEMA + 6 tables + 23 partitions SET SCHEMA + partman ×2); `20261124183500` post-flip drops public registry. Orphan `init_database/failed` row (agent's Nov-20 non-atomic error) deleted pre-merge. v1_archive pkey name-collision found+fixed live. compare residuo: mcp cols+defaults, B-group ALTERs, `sequences_binding_key_default_from_idx` su system. **5 drops**: `system./webhook.config_entries_deleted_at_idx`, `service_registry_deleted_at_idx`, `user_mfa_factors_user_profile_uuid_idx`, `dal_test_simple/types` (+owned seqs). translations canonical renames system/custom/public. Verified: compare `no drift`, db:check clean, tsc+standards clean, be 433/433. matchBy:"code"×5→uuid (Q6, pre-broken). Docs: entities.mdx index contract, migrations.mdx ordering diff, dal-testing.md test-DB convention (Q8: lifecycle-owned tables or scratch DB) | Phase 6 audit-clock |

|| 2026-11-24 ~19:15 | Phase 6: DB-clock doctrine — dal machinery + BE/US sweep + wave ×7 | ✅ | **dal**: all audit-stamp params → `clock_timestamp()` literals (insert/update/delete/restore/bulk-insert/bulk-update/audit-sql ×4/clone); `DAL_NOW` sentinel (`Symbol.for`) + `DalNow` type + `acceptsDalNow` guard + `DAL_NOW_SQL` — intercepted on add/update/bulk-insert/bulk-update/clone paths, rejected on non-timestamp cols; `AuditParams.changedAt: Date | DalNow`; AuditableField `defaultSql now()→clock_timestamp()`; sequenceRevive `expire_at<=`/`revived_at`/`deleted_at` conditional on `spec.now` (test override keeps param, absent → literal); fresh-seq stamps literal; 9 dead `const now` removed; clone placeholder renumbering for sentinel skip. 4 doctrine tests. dal 881/881. **BE**: `event_at` defaultSql+service omit; `otp_verified_at`/`completed_at`/`used_at`/`last_used_at`/`suspended_at`/`last_synced_at`/`key_rotated_at`/`last_health_check_at` → DAL_NOW; write-type widening (`ServiceRegistryEntryWrite`, extras `Date | DalNow`); oauth-dcr drops `client_id_issued_at` + `register` reads back via `returning`; audit-port `changed_at` marker reads back DB stamp (was `.getTime()` on sentinel). **US**: ai `last_seen_at`+`docs_kb`+`ai_telemetry` defaultSql, `last_seen_at`/`updated_at` service drops/sentinel; emailsender `sent_at`/`status_changed_at` defaults + webhook DAL_NOW. **Wave ×7**: SET DEFAULT clock_timestamp() — be 32, ai 21+1, emailsender, crm, webhook, boilerplate, job-handler — all applied + `snapshot-check: clean`. Tests fixed ×4 (mocks assert sentinel). be 433/433 |

## Status: 🟠 WIP — Plan date: 2026-01-16 UTC

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | docs-pack bigint coercion (`parseDocsPackPayload`) + regression test | ✅ done | 2026-01-16 | sdk `9891dd0`; ai KB ingest verified live |
| 2 | dev-server.md log path fix (fe/be/us) + delete stale logs | ✅ done | 2026-01-16 | `061b610`/`e128259`/`fffedf1` |
| 3 | Align entity defaultSql decls to user decisions (see table below) | ✅ done | 2026-11-24 | us commit — defaultSql per decision table; db-meta regen ×5; compare zero-warning |
| 3b | redundant-pgType: REVERSED on evidence — pgType is required runtime decl (lint gate); warning engine fixed to pin-only + extractor boolean-union fix | ✅ done | 2026-11-24 | dal `9b61244` — service pgType all restored |
| 4 | Emit db patch via `primebrick-db compare` → review → sign → apply → drift-clean boot | ✅ done | 2026-11-24 | waves ×6+7 applied live (Phase 3/4/5/6 patches), `snapshot-check: clean` everywhere |
| 5 | Audit-clock: DB-clock doctrine — `clock_timestamp()` literals + `DAL_NOW` sentinel + sequenceRevive conditional (spec.now) | ✅ done | 2026-11-24 | Q1=clock_timestamp (coherence→session/operation id); Q2/Q3=defaulted→DB-clock else JS date (no mix per field); Q4=read-side OUT; Q5=emitted_at app-clock |
| 6 | Expressibility gaps catalog (partial unique idx, undeclared unique constraints) → propose decl extensions | ✅ done | 2026-11-24 | folded into Phase 3a: `sort`/`nulls`/`with` + class-level `@Index` spec form |
| 7 | `client_registry` audit col `created_at` warn (withColumnConstraints order/band) | ⏸ deferred | | posticipato alla form-review quando il BE passa a sistema — vedi piano bugfix-module-label-timing |
| 8 | Docs: dev-guide entry on audit-clock doctrine + decl defaultSql semantics | ✅ done | 2026-11-24 | `column-types.mdx` "Clock doctrine" + entities/repository/optimistic-lock now()→clock_timestamp() |
| 9 | BE drift remediation (decision table below — user-approved direction per column) | ✅ done | 2026-11-24 | applied across Phase 3b/4/6 waves: B-group defaultSql, mcp cols+defaults, api_keys NOT NULL, event_at/client_id_issued_at defaults, matchBy→uuid, OWNED_SCHEMAS flip |
| 10 | DCR RFC 7591 doc: what it is, what it solves, why we implement it (dev-guide) + website value-prop mention | ✅ done | 2026-11-24 | `docs/dev-guide/oauth-dcr.mdx` + _order.json; value-prop già nel piano ASTRO `website-landing-value-props.md:55` |

## TOC — phase map (user-approved 2026-11-24, model = closed schema perimeter)

**Approved decisions**: `DATABASE_SCHEMA=system,public,custom` (BE); `config_entries`→`system` (move);
patch registry→`system` (record migration — "non è public per niente"); closed decorator model
(`@Entity` primary-only + `@PublicEntity` closed marker + dal-internal translation factory, NO
free-form schema pins in module code); E = Opzione 3 (`aliveOnly` first-class + `where`
escape-hatch + lint anti-lazy); mcp_oauth_clients → `Auditable` (C2); `client_id_issued_at`
→ PG `now()` + `returning` echo fix.
**Schema immutability (user: "non può succedere, GRAVISSIMA")**: A+B —
A) schema = code constant per service (env cannot mutate identity; docker-env cannot inject);
B) runMigrations boot-guard — registry `<schema>.primebrick_database_patches` must exist with
records, else explicit first-boot opt-in required (kills the silent-bifurcation disaster path).
Layers compose: const=immutability, guard=empty-schema fork prevention, service_registry
ownership claim (already live) = cross-service collision prevention.
**US pin census**: 37 entities pin `,"<schema>"` == primary (ai 9, boilerplate 1, crm 18,
emailsender 4, job-handler 4, webhook 1) — redundant pins, sweep = mechanical drop, resolution
identical (verified vs .env primary).

**Mental model**: `system` = BE-internal platform plumbing (patches registry, config, sequences,
client_shield, system.translations). `public` = cross-service shared surface — the
`PLATFORM_SHARED_TABLES` list (user_profiles, service_registry, translations-app) IS the public
contract, plus business/listed entities. `custom` = translation-engine only.

### Phase 0.5 — US pin sweep (mechanical, zero-drift proof)
- Drop `, "<schema>"` arg on all 37 US entities (pin==primary → identical resolution)
- Verify per service: tsc + `pnpm db:check` green (snapshot unchanged = drift-zero proof)
- commit (us repo) — one commit, all services

### Phase 1 — dal: closed schema model + immutability
- `@PublicEntity` decorator: sets `tableSchema="public"` via internal path; domain-check
  self-enforces (US modules: public∉domain → boot SchemaDomainViolationError = free enforcement)
- Internal pin API for translation machinery (`makeTranslationEntityClass(schema)`-style,
  exported internal-flagged; used ONLY by dal internals + BE translation_entities.ts whitelisted)
- **A — schema-as-const**: services declare `OWNED_SCHEMAS` const in code (replacing
  env `DATABASE_SCHEMA` for domain config); dal/cli consume the const — design the exact
  host (service manifest vs gateway const) at impl
- **B — boot-guard**: `runMigrations` asserts `<schema>.primebrick_database_patches` exists
  with ≥1 row, else requires explicit `firstBoot` opt-in (prevents silent bifurcation)
- `sequenceAnalyze` fix (repository.ts:1102): resolve bound-table schema via
  `resolveEntitySchema` of the target entity, NOT `domain.primary`
- tsc + dal suite + commit
- NOTE: `@Entity(name,schema)` param removal is DEFERRED to phase 7 (staged: consumers migrate first)

### Phase 2 — dal: partial unique (`@Unique` options) — TIC evidence 2026-11-24 ~16:10
**Plumbing already built:** `SchemaIndexMeta.where/isUnique/nullsNotDistinct`; live-side
`parseIndexPredicate` (build-database-snapshot.ts:223); entity-side `uniqueGroups()`
(build-entity-snapshot.ts:22); emitter `CREATE UNIQUE INDEX … WHERE` (emit-sql-patch.ts:67);
diff equivalence `normWhere`+`sameIndexKeys` (schema-snapshot.ts:175-230 — whitespace/parens/
case-insensitive; **emit order MUST be `(<where>) AND (deleted_at IS NULL)`** to norm-match
live `((is_behind_scaler = true) AND (deleted_at IS NULL))` — AND is not commutative as a
normalized string).

**Live targets (verified pg_indexes):**
- `service_registry_code_uq_scaler`: `UNIQUE(code) WHERE (is_behind_scaler=true) AND (deleted_at IS NULL)`
- `service_registry_code_base_url_uq`: `UNIQUE(code,base_url) WHERE (is_behind_scaler=false) AND (deleted_at IS NULL)`
- `config_entries_key_uq` ×7 schemas (public+6 US): FULL `UNIQUE(key)` on Deletable — tombstone
  blocks key re-creation forever = latent systemic bug → `aliveOnly` fix rides builtin decl

**APPROVED DESIGN (2026-11-24, user):**
- **D1 = B** — `aliveOnly` DEFAULT-ON on Deletable entities; explicit `aliveOnly:false`
  opt-out requires the named class-level path (a named index is an explicit choice —
  silent full-uniques on Deletable are the bug class being killed, see config_entries_key_uq)
- **D2 = A+B synthesis** — TWO decorators, role-separated:
  - `@UniqueIndex({ name, where?, aliveOnly?, nullsNotDistinct? })` — CLASS-level, index
    options live ONLY here (written once, no member-merge ambiguity)
  - `@Unique(name?, order?)` — per-column, carries membership+position ONLY; accumulates
    specs so a column joins N indexes (`code` ∈ scaler-solo + base_url-composite); opts
    REMOVED from its signature (impossible by construction, not a lint rule)
  - bare `@Unique()` stays = auto-named single-col sugar (~50 simple sites unchanged)
- **Enforcement by construction (boot throws)**: `@Unique("name")` w/o class-level
  `@UniqueIndex({name})` → throw; `@UniqueIndex` with zero member-columns → throw
- `nullsNotDistinct` migrates class-level (ai_cerebellum site) — mechanical sweep
- emit order `(<where>) AND (deleted_at IS NULL)` (normWhere string-match vs live)

**Work:**
- `uniqueGroups()` (build-entity-snapshot.ts:22) rewrite: join name→opts from class decl ✅
- ~45 Deletable unique sites get aliveOnly by default → index re-creation wave ✅ DONE
  (config_entries_key_uq ×7 fixed with them — tombstone bug closed)
- lint rules: (a) where-columns declared on entity ✅ WHERE_KEYWORDS+declared-cols throw;
  (b) Deletable+`where` lacking `deleted_at IS NULL` → covered (aliveOnly appends it);
  (c) `where` containing `deleted_at` → throw (use aliveOnly) ✅
- regression tests + commit

**Phase 2 EXECUTION LOG (2026-11-24 ~17:00):**
- dal machinery: `@UniqueIndex`+`@Unique` accumulate in entity-decorators.ts (enforcement
  throws: memberless decl, membership w/o decl, where-with-deleted_at, where-unknown-cols,
  aliveOnly:true on non-Deletable); `uniqueGroups` name→opts join; `uniqueConflictGroups`
  multi-group union + `resolveSelectorProps` union (fail-closed); `isConstraint` flag on
  index introspection → constraint-aware `DROP CONSTRAINT` emission; dead CONSTRAINT
  block removed from createTableSql (unique always via indexDdl).
- **Bugs fixed mid-flight** (found by the wave itself):
  1. schema-snapshot.ts same-name mismatch used RAW `(ei.where!==di.where)` while
     equivIndex used `normWhere` → service_registry partials flagged "redefined" forever;
  2. CLI `noop` verdict ignored `indexMismatches`/`foreignKeyMismatches` → wave patch
     emitted but never written ("no drift" lie).
- Consumer decls: ai_cerebellum (`nnd`+`aliveOnly:false` — documented twin-intent),
  ai_models (`aliveOnly:false` same rationale), docs_kb, user_preferences,
  client_shield (`_uidx` name-matched live), service_registry ×2 partials (the
  motivating case), legal_forms (`country_elf_uidx` + `@Index` country partial),
  job_triggers (`system_key_uq`), ai_cerebellum `one_default_per_assistant_uq`.
- Wave applied live (compare→sign→approve→apply): BE 4 redefs, crm 11+config_entries,
  ai/job/webhook/emailsender config_entries(+name/provider); `db:check` clean ×6.
- Legacy-name cleanup (user-approved): DROP `ai_config_entries_key_uq`,
  `crm_config_entries_key_uq` (constraint-backed → DROP CONSTRAINT — discovered
  mid-apply: review segment rolls back atomically, concurrent segment commits),
  `webhook.config_entries_uuid_uq` (PK-redundant); RENAME docs_kb `…_idx_key`→`…_uq`.
- Tooling gap closed: `database-patch-compare.ts` + `db:meta:compare` script existed
  only in boilerplate → propagated to all 5 live services.
- Keyring bootstrap: `dev-micha-3` pubkey added to ai/webhook/emailsender keys.json
  (same workspace dev key already trusted in be/crm/job-handler).
- Cataloged (not blocking): `*_deleted_at_idx` perf indexes DB-only (undeclarable —
  `@Index` is property-level, `deleted_at` lives in the mixin); DB-only-index WARNs
  invisible on otherwise-clean tables (reporting gap); `matchBy:"code"` ×5 sites on
  service_registry — pre-existing break (code never was @Unique; union now resolves
  code+base_url, still throws for missing base_url → same broken state, consistent);
  `crm_translations_uuid_uq` constraint (uuid unique — redundant-but-declared legacy);
  ai stray `20261124162143_noop.sql` patch (superseded CREATE, applied — harmless).

### Phase 1.9 — documentation pass (user-mandated: arch, choices, defaults, overrides — DEV + AGENT, all repos)
**dal** (docs/dev-guide/): `entities.mdx` closed schema model (@Entity=primary, @PublicEntity, @TranslationEntity purpose-bound, pin removal path); `migrations.mdx` firstBoot guard + `--first-boot` + registry contract; `connections.mdx`/new `schema-domain.mdx` OWNED_SCHEMAS + CLI `--schema` required.
**sdk** (docs/dev-guide/): `microservice-anatomy.mdx` schemas required + ownership claim; `migrations.mdx` ServiceDbMigrationOptions (injected, non re-declarable); `entity-router.mdx` ServiceRoutesInput.schemas; env contract (assertDbEnv=DATABASE_URL only, reserved-var violation list).
**us** (docs/ai/): `env-policy.md` DATABASE_URL-only + OWNED_SCHEMAS pattern; `dal-usage.md` const convention + wrappers.
**be** (docs/ai/): `env-policy.md`/`db-patches.md` owned-schemas.ts + reserved-var; `dal-usage.md` OWNED_SCHEMAS + lifecycle-subscriber ownership gate.
Rules: repo doc changes need user approval of the map (docs-are-contract rule) — propose text, write after approval.

### Phase 3 — BE: decl migration (no DB changes yet)
- `.env`: `DATABASE_SCHEMA=system,public,custom`
- `@PublicEntity` on 12 entities: auth_events, mfa_action_authorizations, organizations,
  role_mappings, user_invitations, user_mfa_factors, user_passkeys, user_preferences,
  user_profiles, api_keys, service_registry, mcp_oauth_clients
  (config_entries stays UNPINNED → resolves `system` by primary — the move)
- `client_shield_registry`: drop `"system"` pin → plain `@Entity`
- translations: AppTranslationEntity→`@PublicEntity`; SystemTranslationEntity→`@Entity`;
  CustomTranslationEntity→dal-internal factory (custom); dynamic per-service classes→same factory
- mcp_oauth_clients → `Auditable` mixin (C2) + `client_id_issued_at` `defaultSql:"now()"`
  + service `returning` echo fix (repository.ts:1852 wired)
- B-group decl edits per decision table (is_admin/is_preferred/is_system/is_active false;
  permissions '[]'; is_enabled NOT NULL no-default)
- index decls: 7 DECLARE (`@Index`×6 + `@Unique` ua_prefix) + 2 partial uniques (needs phase 2)
- tsc + check-standards + compare preview → commit

### Phase 4 — BE: patches (emitted + hand) → sign → apply → verify
- compare → emitted patch: SET/DROP DEFAULTs, CREATE idx/uq, `system.sequences/_counters/_audit`
  + partman, ADD `created_by/updated_by` mcp_oauth_clients (backfill 'system' ×1 row)
- HAND patches (signed, same governance — compare cannot emit schema moves):
  `ALTER TABLE public.config_entries SET SCHEMA system` (+ `config_entries_audit` parent+partitions
  + partman.part_config rewire — VERIFY SET SCHEMA partition behavior at impl);
  registry records: INSERT INTO system.primebrick_database_patches SELECT ... FROM public (skip
  conflicts, 32 rows) + `run-module-migrations.ts:36` schema→"system" + drop or archive public registry (DECIDE)
- review → sign → approve → apply → re-compare clean → BE restart + boot verify

### Phase 5 — index DROPs (hand patch — compare only WARNs on db-only)
- `config_entries_deleted_at_idx` (public AND webhook schema — cross-service artifact),
  `service_registry_deleted_at_idx`, `mfa_action_authorizations_user_profile_uuid_idx`

### Phase 6 — audit-clock sweep (dal, was step 5)
- repository.ts ~10 sites → `now()` literal; sequenceRevive `revived_at` + `expire_at <= now()`;
  BE additions: auth-events.service.ts:112, mfa.service.ts:436 used_at; oauth-dcr handled via
  defaultSql+returning (phase 3)
- full dal suite + us/be tests + commit

### Phase 7 — lint + removal + docs
- lint: schema-pin/internal-API ban outside whitelist; `primary ≠ system` guard proposal;
  remove `@Entity(name,schema)` param from public signature (consumers already migrated)
- docs: schema closed model, audit-clock doctrine, defaultSql contract, DCR RFC 7591
  (be dev-guide; propose text first)
- step-6 catalog: `dal_test_simple/types` orphan tables, boilerplate dist residue,
  webhook config_entries_deleted_at cross-service artifact

### Phase 8 — e2e sweep
- dev-stack restart all services; boot drift-clean be+us; regression paths; temp cleanup; ledger close

## BE drift — decision table (user decisions + TIC evidence)

**A. Audit SET DEFAULT 'system'** on created_by/updated_by ×12 tables — automatic, no decision.

**B. Per-column (user-approved):**
| Column | Decision | Decl edit | Write-path evidence |
|---|---|---|---|
| config_entries.type | NOT NULL, NO default (DROP) | none needed (decl already no-default) | body API always passes |
| auth_events.event_at | NOT NULL, NO default (DROP) | none needed | writer `new Date()` explicit (:112) — +Class-A clock census |
| user_invitations.status | NOT NULL, NO default (DROP) | none needed | service writes "PENDING" always (:97,:172) |
| role_mappings.is_admin | NOT NULL DEFAULT false | `nullable:false` + `defaultSql:"false"` | zod default(false) router :79 |
| user_mfa_factors.is_enabled | NOT NULL, NO default — MUST be explicit | `nullable:false` only | service passes data.is_enabled (:295) |
| user_mfa_factors.is_preferred | NOT NULL DEFAULT false | `nullable:false` + `defaultSql:"false"` | service passes explicit |
| api_keys.permissions | NOT NULL DEFAULT '[]' — NULL=corrupted key, design error | `nullable:false` + `defaultSql:"'[]'::jsonb"` | read fallback `|| []` becomes belt |
| api_keys.is_system | NOT NULL DEFAULT false | `nullable:false` + `defaultSql:"false"` | read fallback `\|\| false` |
| api_keys.is_active | NOT NULL DEFAULT false — fail-closed (was db `true`) | `nullable:false` + `defaultSql:"false"` | read `!== false` keeps semantic |
| mcp_oauth_clients 5 OAuth fields | DROP (writer explicit, JS fallbacks exist :40-44) | none needed | register() passes all |
| mcp_oauth_clients.client_id_issued_at | DEFAULT now() — server-minted, no Casdoor | `defaultSql:"now()"` + service `returning:` echo fix | RETURNING wired: repository.ts:1852 `buildReturningClause(entity, options.returning)` |

NULL census live: 0 NULLs on all SET NOT NULL targets → safe.

**C. mcp_oauth_clients → C2 `Auditable` approved**: version/created_at/updated_at inerte oggi (CLIENT_FIELDS :30 esclude, nessun update path, hardDelete only). Auditable = 5 campi esatti (created_at/by, updated_at/by, version); @AuditTrail e Deletable sono decoratori SEPARATI, non trascinati. DB ha 3 colonne ma manca created_by/updated_by → patch emetterà ADD COLUMN NOT NULL DEFAULT 'system' (backfill 1 riga) + SET DEFAULT ×3. version diventa optimistic-lock dal — utile quando nascerà update path.

**D. sequences su BE → D1 ma schema `system` (non public):**
- `api` mystery SOLVED: `api` = service CODE del BE in service_registry (self-enrollment commit 92c41d1, index.ts:500 "system:api"), NON uno schema PG. DATABASE_SCHEMA=public,system,custom (.env:20) — BE è l'unico modulo multi-schema. `system` = internals piattaforma (client_shield_registry, system.translations, system.primebrick_database_patches); `public` = business; `custom` = riservato.
- Meccanismo schema: `@Entity(name, schema)` pin esiste (client_shield_registry_entity.ts:4 `"system"`). Builtin sequences NON pinnate → `ownedNamespace()` (sequence-decl.ts:51-62) → domain.primary ?? DATABASE_SCHEMA[0] → BE primary=public → emitted public.
- Per `system` su BE serve regola nuova in ownedNamespace (es. prefer domain member named `system` when present, else primary) — DECISIONE DESIGN PENDING: cambio dal o pin alternativo. US schemas (ai/emailsender/job/webhook) non hanno `system` → restano su primary.

**E. Indici DB-only (TIC empirica — idx_scan live + query paths):**
| # | Index | scans | Query path | Verdict |
|---|---|---|---|---|
| 1 | auth_events(user_profile_uuid,event_at DESC) | 0 | filterableKeys user_profile_uuid + sort event_at DESC (auth-events.service.ts:78-85) | DECLARE |
| 2 | auth_events(event_type,event_at DESC) | 0 | filterableKeys event_type | DECLARE |
| 3 | auth_events(attempted_username,event_at DESC) | 0 | searchable+filterable attempted_username | DECLARE |
| 4 | config_entries_deleted_at_idx | 0 | WHERE deleted_at IS NULL per COSTRUZIONE (query-builder.ts:293-298, mode EXCLUDED default) | **DROP** — selectivity ~0 (righe vive dominano, planner non lo usa mai). Pattern giusto = partial `WHERE deleted_at IS NULL` su colonne selettive. Esiste anche su webhook.config_entries — artifact cross-service |
| 5 | mfa_action_authorizations_expires_at_idx | 0 | purge sweep `expires_at < now()-1h` (mfa.service.ts:446-457) | DECLARE |
| 6 | mfa_auth.user_profile_uuid_idx | 0 | NESSUN query path (lookup by jti :419, purge by expires_at; tabella internal-only, no list surface) | DROP |
| 7 | user_invitations_status_idx | 0 | filterable+searchable status (:73-74); invitations NON purgate (FSM persistente, re-invite reset :163-172) | DECLARE — status-index è pattern piattaforma (patches.status ×7 schemi, job_runs/job_schedules.status) |
| 8 | user_invitations.user_profile_uuid_idx | 0 | filterableKeys (:74) + findByUserProfile (:138) | DECLARE |
| 9 | user_mfa_factors.user_profile_uuid_idx | 0 | filterableKeys (:271) + findByUserProfile (:312,:328) | DECLARE |
| 10 | user_passkeys.user_profile_uuid_idx | 0 | filterableKeys (webauthn.service.ts:224) | DECLARE |
| 11 | service_registry_deleted_at_idx | 0 | come #4 | DROP — stessa logica |
| 12 | service_registry_code_uq_scaler | 0 | UNIQUE partial `WHERE is_behind_scaler=true AND deleted_at IS NULL` | **GAP reale** — @Unique non supporta `where` (UniqueOptions:558-576 no predicate) → DB-only o estensione dal. Business invariant: code unico tra scaler-fronted |
| 13 | service_registry_code_base_url_uq | 0 | UNIQUE partial `(code,base_url) WHERE is_behind_scaler=false AND deleted_at IS NULL` | **GAP reale** — idem |
| 14 | client_shield_registry_ua_prefix_uidx | **6** | unique plain su ua_prefix — UNICO indice con uso reale | DECLARE via @Unique() |

**FK census**: 0 FK constraints in TUTTO il DB (public+system). @ForeignKey decorator esiste (entity-decorators.ts:~870) ma mai usato → gli indici user_profile_uuid servono le list-filter, non enforcement referenziale. La "FKEY" non la usiamo mai — le relazioni sono logical, enforced a livello servizio.

**Clock census NEW entries (BE)**: auth_events.service.ts:112 `event_at: new Date()`; oauth-dcr.router.ts:133 `client_id_issued_at: new Date()`; mfa.service.ts:436 `used_at: new Date()` (consume stamp — domain field, valutare se audit-class).

## Step 3 — decision table (user-approved)

| Column | Decision | defaultSql |
|---|---|---|
| config_entries.type ×4 | NOT NULL, NO default | revert edit |
| config_entries.reserved ×4 | DEFAULT false | `defaultSql:"false"` ✅ keep |
| ai.docs_kb.metadata | DEFAULT '{}' | `defaultSql:"'{}'::jsonb"` ✅ keep |
| ai.docs_kb.created_at/updated_at | DEFAULT now() — **obbligatorio**, inserts don't pass them | `defaultSql:"now()"` ✅ keep |
| ai.ai_telemetry.created_at | DEFAULT now() — obbligatorio | `defaultSql:"now()"` ✅ keep |
| ai.ai_telemetry.success | DEFAULT **false** (fail-closed) | change "true"→"false" |
| ai.ai_telemetry counters ×6 | DEFAULT 0 | `defaultSql:"0"` ✅ keep |
| job.job_schedules.schedule_type | NOT NULL, NO default | revert edit |
| job.job_schedules.status | NOT NULL, NO default (no enum value = consistent initial state) | revert edit |
| job.job_triggers.run_as | NOT NULL, NO default ('user' stale, outside vocab) | untouched — DB DROP DEFAULT in emitted patch |
| audit created_by/updated_by ×all | DEFAULT 'system' — auto-derived via @AuditableField | no edit needed — emitted patch SET DEFAULT |

## Audit-clock census (step 5 scope — dal repository.ts)

JS `new Date()` → `*_at` columns: insert :1797, update :2869, soft-delete :3140/:3299/:4156,
restore :4521, addMany :3800/:3847, clone :3600, audit rows :3513/:4467.
sequenceRevive: `revived_at` bound param + `expire_at <= $1` predicate on app clock (:981-1007).
Already correct: docs_kb/telemetry created_at via DB default (no audit markers → no JS stamp).

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
