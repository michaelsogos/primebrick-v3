# DAL — repeatable pgvector support in Repository

> Context: `.devin/rules/dal-usage.md` mandates `getDal()`/`Repository` as the
> ONLY DB access; `getPool()` is infra-only. Today `ai.docs_kb` (and
> `ai.conversation*`) bypass the DAL with raw `pool.query` because pgvector
> types and the `<=>` operator are not supported by the metadata-driven DAL.
> This is the sanctioned reason those files violate the rule — and the reason
> the rule stays unenforceable: as long as one legitimate raw-SQL use case
> exists, `getPool()` must stay public and any consumer can abuse it.
> Closing the hole requires DAL-native vector support first, then removing
> the raw repositories.

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-10-12 (updated 2026-10-15 — 4c/5e/5f verified DONE empirically; 5n residual = mcp dispatch direct DAL; 6 residual = emailsender 2 response-path stringifies)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `pgType: "vector(N)"` support in entity meta + type adapter (number[] ↔ `[v1,v2,...]` literal) | ✅ done | 2026-10-12 | `column-pg-io.ts` `jsValueToPgParam` handles `pgType: "vector…"`; verified write round-trip on `ai.docs_kb` |
| 2 | `Repository.vectorSearch(entity, vectorField, queryVector, opts)` — parameterized top-k similarity query | ✅ done | 2026-10-12 | `buildSelectQuery` `vectorOrder` (simple path) + `buildVectorSearchQuery` (hybrid path — see design below); verified: self-hit sim=1.000, `::vector` resolves via `search_path, public` |
| 2b | Hybrid channels on `vectorSearch` — user-directed design: `lexical` (FTS CTE), `keywordBoost` (LATERAL ILIKE count), `scoreAdjust` (CASE map), `oversample` — generic opts, all OFF by default | ✅ done | 2026-10-12 | verified parity with legacy raw SQL on `rbac.mdx`: kw=2, score=1.13 identical formula |
| 2c | Vector operators in `Filter` — `<=> <-> <#> <+> <~> <%>` in `SqlOperator`, auto `::vector` literal+cast on bound param; `@@` for FTS; `Filter.expr(left,op,right)` parameterized `{sql, params}` operands (`?`→`$n`) | ✅ done | 2026-10-12 | `Filter.raw` stays literal-only (HAVING); `expr` is the safe function-call operand |
| 3 | Port `ai/docs-kb-repository.ts` to Repository (addMany/updateMany/hardDeleteMany diff, vectorSearch, deletes, getDocHashes) | ✅ done | 2026-10-12 | removes 10 `pool.query`; `@Unique` composite `repo+path+chunk_idx` added to `DocsKbEntity` for `matchBy`; verified insert→update→stale-delete→wipe cycle |
| 3b | `hardDeleteMany` in `Repository`+`Dal` — physical DELETE for bulk matchBy (TEMP TABLE strategy like `deleteMany` but `DELETE FROM … USING`) | ✅ done | 2026-10-12 | needed because `delete`/`deleteMany` are soft-only (`UPDATE deleted_at`); verified physical removal |
| 3c | Port `ai/docs-search-dal.ts` hybrid ranker to `vectorSearch` channels | ✅ done | 2026-10-12 | removes 3 `pool.query`; `expandDocGraph` DISTINCT ON → filtered vectorSearch + JS keep-best-per-path (bounded 512 rows); `getDocByPath` → `findAll`; score CASE needed `::float8` cast (params infer text) |
| 4 | Port `ai/conversation-repository.ts` + `feedback-repository.ts` to Repository — entities `AiConversationEntity`/`AiMessageEntity`/`AiFeedbackEntity` (IAuditableEntity, no trail), `user_uuid`→`created_by`, canonical `id` PK + `uuid` unique, migration `audit_columns_chat_tables.sql` applied | ✅ done | 2026-10-12 | removes 12 `pool.query`; verified full cycle create→insert→feedback→tx-delete; `delete`=soft-only → `hardDelete`; auditable `update` needs `version` (optimistic lock) |
| 4b | **Version contract + `last_seen_at` partitioning** (user correction): fetchRow-before-write removed (anti-pattern — defeats optimistic lock); `version` now caller-supplied via `?version=` query (SDK `requireVersion` convention) on PATCH/DELETE conversation routes; ~~`Repository.touch`~~ **REMOVED 2026-10-15** (version-contract bypass — see 5k); `ai_conversations` partitioned `RANGE(last_seen_at)` via `partition_ai_conversations.sql` (partman, monthly, retention '6 months' drop); child FKs DROPPED (unenforceable on partitioned parent) → app-level cascade in tx | ✅ done | 2026-10-12 | verified: stale version rejected (ERR01) on update+delete, atomic cascade conv+msgs+feedback. `touch` deleted 2026-10-15 per user order — watermark now versioned update (5k) |
| 4c | Retention maintenance runner — nats-sub cron job calling `partman.run_maintenance_proc()` via `dal.withClient()` + set-based child purge (`last_seen_at < cutoff` parent-membership keyed) before drop | ✅ done | 2026-10-15 | no scheduler exists in stack; must delete children BEFORE partition drop (DDL bypasses FK/row checks) |
| 7 | Partitioning/retention research (user request) — report + docs + proposal below | ✅ done | 2026-10-12 | docs: `dal-architecture.md` section + new `dev-guide/partitioning.mdx` |
| 5 | Remove `getPool()` from consumer surface (DAL hardening) + lint check banning `getPool`/`pg` imports outside `src/db/` | ⏳ not done | — | after 4 lands; updates affected unit tests — scope massively enlarged by 2026-10-14 census below: ~45 consumer call sites, BE dual-pool, US aggregates |
| 5a | Delete `dal.rawSql()` / `Repository.rawSql()` — dead escape hatch | ✅ done | 2026-10-14 | removed from both classes + 9 test call sites repointed to `getPool().query`; api-reference blocks removed; 291 tests green |
| 5b | DAL API additions (decided 2026-10-14/15): `dal.repository()` accessor, `dal.serverVersion()` (single probe — user: "ping sparisce, una query riuscita È il ping"), `dal.transaction(txRepo=>…, {timeoutMs})` (managed BEGIN/COMMIT/ROLLBACK, SET LOCAL scoped), `repo.truncate(entity)` + `dal.truncate` proxy | ✅ done | 2026-10-15 | `ping()` REMOVED (breaking, no compat); `WithClientOptions`→`TimeoutOverrideOptions`; `dal.transaction` is the ONLY tx API; `dal.withClient`+`getPool` → `private`. NO `repo.aggregate()` (user veto — DSL extensions instead). NO upsert/conflictWhere (user veto — find→add/update). `deletedRecords:"EXCLUDED"` redundant literals removed (EXCLUDED is the default — query-builder.ts:243). 296/296 tests green |
| 5c | `dal.withClient` → `private` (migrations engine + partition maintenance inside dal-pg); `new Repository(getPool())` consumer sites → `dal.repository()`/`dal.transaction` | ✅ done | 2026-10-15 | withClient private (dal.ts:648); ai ×3 tx ported; timeout tests ported to `transaction`; WithClientOptions→TimeoutOverrideOptions rename |
X (no search_path/statement_timeout/application_name/schema-domain). **34 files import it — the BE's dominant data path.** Delete file; repoint imports to `dal-gateway` (which must expose `dal`/`repo`, not `Pool`) | ⏳ partial | 2026-10-14 | **dual pool KILLED**: `db/pool.ts` is now a shim → `initDal().getPool()` (one governed pool: search_path, 30s statement_timeout, app_name). Also fixed latent hole: `dal-gateway` was dead code — BE never instantiated `Dal` → **schema-domain guard was inert for ALL BE entity ops**; now active. Needed `DalConfig.sharedTables` (`translations`) because BE is the i18n gateway managing `<module>.translations` — new D4 note below. ~36 `getPool()` import sites still to repoint (next increment). NOTE 2026-10-14: since `getPool()` now returns the governed Dal pool, `new Repository(getPool())` is **functionally equivalent** to `dal.repository()` (same pool, same entity-guard) — repoint is about single-access-point/privatization + keeping the Pool-injection test seam, not correctness |
| 5e | BE ~24 raw `pool.query` sites triaged: ~16 trivially entity-expressible (`SELECT id| ✅ done | 2026-10-15 | 2026-10-14 | **Migrated to entity/DAL**: user_profiles lookups → new `UserProfilesDal` helpers (`getIdByUuid`, `getUuidById`, `getByIdpCode`); `api_keys` → new `ApiKeyEntity`; `mcp_oauth_clients` → new `McpOauthClientEntity` + `OAuthClientRegistryDal` rewrite; telemetry config → `ConfigEntryEntity`; index.ts health/banner → `dal.ping()`/`serverVersion()`; `user_passkeys` JOIN → `getIdByUuid`+`findByUserProfileId`; webauthn COALESCE backfill → `UserPasskeysDal.backfillMetadata` (repo.update); invitation resend → `UserInvitationsDal.resetForResend`; `mfa_action_authorizations` expiry → `findAll(Filter.expr expires_at < now()-interval)+hardDeleteMany`; **dedup done**: lifecycle-subscriber + publisher-identity now call `ClientRegistryRepo` (upsert + findAllEnabled — actor param added). `jsonb_object_agg` dict → `Project.expr`. **Remaining raw → DONE 2026-10-16**: `dispatchBeAggregate` raw-SQL builder rewritten on DSL (`findByPage` + `groupBy` + `Project.expr` + `Sort.byAlias`, total via `COUNT(*) OVER()`); `client-registry-repo` conditional upsert → `enrollRegistryRow` (find(ua_prefix, INCLUDED)→`add`|`restore`+`update(version)`; ERR04/ERR05 retry once for concurrent enroll; `source='manual'` rows untouched). 296/296 tests green |
| 5f | US raw sites: `ai/telemetry-repository` ×3 + `job-handler/actions-route` histogram — aggregates on OWN schema, raw only because DSL lacks `repo.aggregate()`; `ai` tx ports → `dal.transaction`; `ai/docs-kb` TRUNCATE → `dal.truncate`; health adapters `SELECT 1` → `dal.ping`; test helpers keep their own `pg.Pool` (test infra, not service code) | ✅ done | 2026-10-15 | DONE: telemetry ×3 → new `AiTelemetryEntity` + `Project.expr`/`findByPage` (comment "public.ai_telemetry" was stale — table is `ai.`, own schema); ai tx ×3 → `dal.transaction` (withClient gone from consumers); docs-kb TRUNCATE → `dal.truncate` (domain-guarded); health adapters ×4 → `dal.ping` (ctor takes `Dal`); `pgServerBanner` → structural `SqlVersionProbe` (SDK can't import dal-pg); `new Repository(getPool())` → `dal.repository()` (ai+job-handler entity-repo). **UNBLOCKED+DONE 2026-10-16**: `actions-route` histogram → `getDal().findAll` DSL (`Project.expr("date_trunc(?::text, created_at)","bucket_start",[unit])` — `Project.expr` gained `params`, ParamWriter threaded through `renderProjection`; `Filter.expr` for `= ANY(?)` + `now()-make_interval`; `GroupBy.expr`; `Sort.byAlias`). US `getPool` left: sanctioned `pool:` engine feed only |
| 5g | DECISIONS CLOSED 2026-10-15 (user): **D1** `withClient`/`getPool` → `private` — done. **D2** NO `repo.aggregate()`/`adminSql` — fix via DSL extensions only: `groupBy` over `Filter.expr`-style expression nodes + `Sort` on expr/alias (covers auth_events GROUP BY, job `date_trunc` histogram; `jsonb_object_agg` already via `Project.expr`). **D3** NO upsert anywhere — `client-registry` conditional upsert → `find(ua_prefix LIKE 'pkg/%')`→`add`|`update(version)`; **pkg_name match, NOT ua_prefix+version** (version-trap: `primebrick-ai/0.1.0`→`0.2.0` must UPDATE the same row — one service = one active version, multiple versions = illegal). **D4** `sharedTables` ratified implicitly — BE translations gateway stays. **NEW D5**: thin `*Dal`/`*Repo` wrappers are anti-pattern (DAL is entity-agnostic) → remove wrappers, repoint call sites to `getDal().<op>(Entity,…)`; fat logic classes (ConfigEntriesDal/TranslationsDal/RoleMappingRepo) → become/merge into static-method service classes (not renames — class+method restructuring). **NEW D6**: ONE-STATEMENT transaction design pending — user requires analysis+evidence BEFORE code (see body §"transaction design"); rule: TS-coordinated transactions are to be avoided, prefer single-statement atomicity | ⏳ partial | 2026-10-16 | D1 done; **D2 code done** (GroupBy.expr + Sort.byAlias/byExpr + `Project.expr` params — `?`→`$n` via shared ParamWriter contract); **D3 code done** (`enrollRegistryRow` — see 5e); D5 pending topology confirmed: controllers import client-registry-repo/service-registry-repo/client-registry-dal DIRECTLY (nats-sub subscribers, oauth-dcr.router, mcp dispatch, entity-write) — controller-boundary violation to fix in same pass |
| 5h | `apikey` port unification — remove per-service vertical ports (`EmailSenderApiKeyPort`, `CachedApiKeyPort`-per-service); ONE `ApiKeyPort` impl (cached + `auth.apikey.byHash` NATS route) for all services that cannot read `public` | ✅ done | 2026-10-15 | DONE: new SDK `CachingApiKeyPort` (`auth/ports/caching-api-key-port.ts`) — ONE cache→resolver impl; `inner` injectable (`BeApiKeyPort` DB resolver in BE / `NatsApiKeyPort` governed route in US); `cache` = `CachePort \| () => CachePort \| null` (lazy getter — apiKeyPort factory runs before `setSdkCachePort`). Redis mode: shared `be:api_keys:hash:<sha>` key, 5min TTL, positive-only. No-cache mode: bounded in-memory (60s pos / 10s neg / max 1000 — preserves webhook DMZ semantics). `EmailSenderApiKeyPort` + `CachedApiKeyPort` (webhook `precheck-port.ts`) DELETED; emailsender/webhook wire `CachingApiKeyPort(NatsApiKeyPort, …)` in `index.ts`; BE `internal-request-routes` wires `CachingApiKeyPort(BeApiKeyPort, () => getCachePort())`. **2 real bugs found+fixed empirically**: (a) `expires_at` string→Date rehydration on Redis cache-hit (JSON round-trip → `verifyApiKey().getTime()` would TypeError); (b) `generateApiKey()` used `require()` in ESM dist → runtime ReferenceError. Stale docstrings fixed: `ApiKeyPort` "microservices read cross-schema" (sovereignty violation), `api-key-cache.ts`, `create-microservice` apiKeyPort doc; `authentication.mdx` resolution table; api-reference regenerated. Tests: SDK +13 (`caching-api-key-port.test.ts`: hit/miss/negative/TTL/1000-eviction/lazy getter/resolver-error/rehydration), webhook 4 repointed. LIVE E2E verified: temp api_keys row → `auth.apikey.byHash` req/reply via emailsender shield identity → record; 2nd call zero NATS round-trips; unknown hash negative-cached. Suite: SDK 364, BE 305, webhook 4, emailsender 25 — all green. Note: `nats-api-key-port.ts` "WITHOUT a database" docstring corrected — every US HAS a DB; the constraint is schema sovereignty over `public`. **Follow-up 2026-10-15 (Bun migration)**: `generateApiKey()` → stub `not implemented yet` (zero callers in workspace — reimplement via WebCrypto `crypto.getRandomValues` when admin mint-key endpoint lands); `hashApiKey()` → `Bun.CryptoHasher` fast-path + `node:crypto` fallback (sync both runtimes, verified live on `bun` AND `tsx` — identical digests); `randomBytes` import dropped. BE crypto census: `node:crypto` is on live paths (MFA TOTP `createHmac("sha1")`, invitation tokens/HMAC, AES `createCipheriv` secret encryption, `randomUUID`) — NOT removable today |
| 5i | Standards-check enforcement — ban in `src/**`: `from "pg"`, `new Pool`, `.query(`, `getPool()`, `withClient`, `upsert`, raw SQL literals (SELECT/INSERT/UPDATE/DELETE/TRUNCATE/BEGIN); exemptions via `// standards-exempt:` | ✅ done | 2026-10-16 | DONE with 6b: `primebrick-v3-sdk/tools/check-standards.ts` — zero-dep scanner, profiles `consumer` (BE/US) vs `lib` (dal-pg, ext-json only). Rules: ext-json, pg-import, pg-pool, raw-query, raw-sql, getPool, withClient, upsert, new-repository, pool-ping. Exemptions `// standards-exempt: <ids> — <reason>` (same/prev line, reason mandatory) + `// standards-exempt-file:` for tooling files. First run found 52 BE violations → classified: external wire (RFC7807/OAuth/JWT/Casdoor/Brevo/OpenAI/mistral.rs/webhook-inbound) = exempt; migration `getPool` seam = exempt; internal paths → `extJsonParse`/`extJsonStringify` (proxy, mcp dispatch, openapi aggregate, docs-pack, telemetry, export, state tokens). `exempt-no-reason` is itself a violation. Wired: `check:standards` + `prebuild`+`test` in SDK/BE/DAL/4 US services; dal-pg `--profile=lib` (CLI/manifest = `standards-exempt-file`). FE: scoped `no-restricted-syntax` on api-ext.ts/api-types.ts only (localStorage/UI JSON is legit — blanket ban rejected). ALL repos clean + tests green. **Compile-time ctor seal DONE 2026-10-16**: `Repository` ctor now requires `token: typeof REPO_INTERNAL` — a `unique symbol` NOT re-exported from the package index and unreachable via the exports map (`{ ".", "./errors" }` only). Consumers cannot name/produce the type → `new Repository(...)` is a TS error by construction (verified: `TS2554 Expected 2-3 arguments`), plus a runtime `ValidationError` guard defeats `as any` bypasses. Internal sites: `dal.ts` ×3, `deferred-transaction.ts` ×1; in-package tests import `REPO_INTERNAL` via relative path (`../src/repository/repository.js`) — trusted seam. 8 stale doc examples (`new Repository(pool)`) rewritten to `dal.*` proxies. 313/313 DAL tests green; all consumer typechecks clean |
| 5j | Docs sweep DONE 2026-10-15: `.devin/rules/dal-usage.md` (BE+US) hardened contract; dev-guide connections/repository/repository-pattern/architecture/index/api-reference/partitioning/getting-started; `.devin/skills/dal-usage/SKILL.md` + `docs/skills/dal-usage.md` + `docs/ai/dal-usage-guide.md` + `docs/ai/dal-architecture.md` (upsert/upsertMany/withClient/touch stale → REMOVED/DISABLED/private); AGENTS.md; `pnpm extract-docs` rerun | ✅ done | 2026-10-15 | NOTE: `docs/ai`+`docs/skills` hand-edited despite AGENTS.md "do not hand-edit" — no generator exists and stale content actively misleads agents; user ordered 3-persona doc update |
| 5k | `Repository.touch`/`Dal.touch` REMOVED (user order — it bypassed the version contract on an auditable entity). Call sites → `stampConversationActivity` (versioned find→update in same tx). **OPEN**: `last_seen_at` design decision — version-bump-on-heartbeat invalidates FE-held version (see body §"last_seen_at") | ✅ done | 2026-10-16 | **D5 = option A chosen by user**: `last_seen_at` stays on the auditable row, version bump on child-activity stamp is ACCEPTED. ai_conversations IS legitimately auditable (FE rename/delete → optimistic lock + audit real). Stamping now runs inside `beginTransaction()` CTE (5l) |
| 5l | Fluent deferred-execution tx design (user proposal): `beginTransaction()` → buffering repo; `add/update/…` append statements, don't execute; `commitTransaction()` compiles → ONE statement + executes. Analysis in body §"fluent tx" — PG protocol forbids parameterized multi-statement → compile target must be a data-modifying CTE chain; needs `Deferred<T>`/`ref()` handles for inter-op data flow; return values materialize at commit. **IMPLEMENTED 2026-10-16** | ✅ done | 2026-10-16 | `dal.beginTransaction({timeoutMs})` → `DeferredTransaction` buffers `add/update/delete/restore/hardDelete` + reads → `commit()` merges ops into ONE data-modifying CTE chain (`WITH s0 AS (…RETURNING), s1 AS (…)` + final `jsonb_build_object` SELECT) — atomicity = single-statement guarantee, NO BEGIN/ROLLBACK code; `Deferred<T>` placeholders (`.value` throws pre-commit); `deferred.ref("col")` → `(SELECT col FROM sN)` scalar subquery; param remap preserves `oldIndex→newIndex` identity (fixed 42P18 on shared/JSONB params); per-op result extraction + `pgValueToJsValue` rehydration; unsupported audit options rejected at buffer time; `discard()`/`commit()` lifecycle guarded. Callers: `insertMessage`/`insertFeedback` migrated (read parent version first → guarded `update` in same statement — concurrent writer gets ERR01, retry-able); `deleteConversation` stays on `transaction(fn)` (dynamic-cardinality cascade = conditional flow). 13/13 deferred tests + full 312/312 DAL suite green; consumer typechecks clean |
| 5m | `EntityServiceWorker<TEntity>` — **already exists** as `makeEntityService` (`dal-pg/src/entity/entity-service.ts`) + BE `http/entity-service.ts` (DUPLICATE — merge into dal-pg one) + `entity-router` auto-generated controllers (BE `http/entity-router.ts`, SDK `http/entity-router.ts`). Used by: organizations, role-mappings, user-profiles, customers (BE); ai-cerebellum, ai-models, jobs (US). Gap: thin `*Dal`/`*Repo` wrappers bypass the pipeline; `EntityService.create/update` take `tx?: PoolClient` → must become tx-scoped `Repository`; consumers `new Repository(tx)` inside `repoFor()` — violates no-client contract | ✅ done | 2026-10-16 | **merged**: BE `http/entity-service.ts` is now a thin binding over `dal-pg` `makeEntityService` (injects `dal:initDal()`, cache-wrapped `repo` via `createRepository`, `BeAuditPortAdapter`, `actor:requireActor`, `userEntity:UserProfileEntity`, `debugCode` dev toggles on `list`). Config: `repo:Repository`→`dal:Dal` (+optional `repo` override for decorators); `auditPort` optional (defaults `makeTableAuditPort(repo)`); `create/update` take `tx?:Repository`. `runEntityWrite`→`initDal().transaction(txRepo)`; `persistPendingTranslations`/`TranslationsDal.create`/`config_entries_dal`/`role-mapping-repo`/`user-profiles-dal`/5 services all `tx?:Repository` (zero `PoolClient` in consumer tx surface). US services feed `dal:getDal()`; `entityRepo()`/`entityAuditPort()` deleted. `runInTransaction` REMOVED from dal-pg (raw PoolClient leak). BE 296/296 tests green; all typechecks clean. **2026-10-16 evening — repository() privatized (inversion, user pushback)**: `dal.repository()` REMOVED entirely — the gateway now OWNS construction: `dal.entityService(cfg)` injects the private `this.repo` into `makeEntityService`; `dal.tableAuditPort()` injects it into `makeTableAuditPort`. `EntityServiceConfig.dal` field dropped — `repo` stays as optional injection seam (decorators like BE `withCache` pass it back through `dal.entityService`); free `makeEntityService` throws ValidationError when `repo` absent (internal/test path only). US services now `getDal().entityService({entity, actor: entityActor, list, hooks})` — zero repo/dal fields in config. BE wrapper: `initDal().entityService({...cfg, repo: cacheRepo, auditPort: BeAuditPortAdapter, ...})`. Cycle resolved: `entity-service.ts` + `audit-query.ts` now import concrete modules (`../repository/repository.js`, `../query/dsl.js`, `../audit/*`, `../meta/*`, `../query/list-filters.js`) — never the `../index.js` barrel. `findAuditPage` widened to `AuditQueryable` (`Pick<Repository,"findByPage">` dal-pg / `Pick<Repository,"find"|"findByPage">` BE helper) — `Dal` satisfies it structurally; `config-entries.service` now `findAuditPage(initDal(), …)` (was `initDal().repository()`). ZERO `.repository()` call sites remain in any consumer src/test | ONE generic service in dal-pg, thin services compose it + override via custom methods (composition works today — `private svc = makeEntityService(...)`); auto-generated router already exists → extend to all entity routes; controllers custom only when the service method signature is non-standard |
| 5n | Thin `*Dal`/`*Repo` wrapper removal + controller-boundary repair: controllers importing data-access DIRECTLY must go through services (internal-request-routes, publisher-identity, service-lifecycle-subscriber, stale-detection-job, oauth-dcr.router, mcp dispatch, entity-write, index.ts). Thin wrappers to delete: service-registry-repo, client-registry-repo, client-registry-dal, user-invitations-dal, user-passkeys-dal, user_mfa_factors_dal, mfa_action_authorizations_dal, user-profile-repo. Logic-bearing (config_entries_dal cache+reserved-keys, translations-dal cache+ETag, role-mapping-repo invalidation, user-profiles-dal join-shaping) → move logic into owning service (compose makeEntityService where CRUD-shaped) | ⏳ partial | 2026-10-16 | DONE: controllers import ZERO DAL/repo; **ZERO `new Repository(` + ZERO `getPool()` in consumer src** (only `run-be-migrations`/`db-migration.service` patch tooling); `customers_repo` deleted (dead); `service/client-registry-repo` → `ServiceRegistryService`/`ClientRegistryService` (initDal); `OAuthClientRegistryDal` → `OAuthClientService`; `translations-dal` → merged into `TranslationsService`; `repository-factory`/`db/pool.ts`/`lib/audit` deleted; ALL wrapper classes parameterless on `initDal()`; pool-plumbing removed from services+ports+wiring; **`DalConfig.repoDecorator`** = governed cache seam (BE `withCache` on lazy CachePort — initCache runs after initDal). LEFT: logic-bearing wrappers still exist as module DALs (config_entries_dal reserved-key/cache, user-profiles-dal join-shaping, role-mapping-repo invalidation) — legit per layering (imported only by services); possible future merge into owning services; `translations` list-cache/manual ETag uses CachePort directly. **2026-10-16 live-E2E findings (server boot + real actor + real DB)**: (a) `db/pool.ts` deletion had removed the only `import "dotenv/config"` → boot crash `assertDbEnv`; restored as line-1 of `index.ts` (same pattern as US services). (b) **Audit silently dead on custom DAL paths** — `WriteOptions.audit` is opt-in: `config_entries_audit` had no writes since 2026-09-10 (mvc refactor), `role_mappings_audit` never populated in dal-pg era; both wired to `BeAuditPortAdapter` (tx sites get `new BeAuditPortAdapter(txRepo)`, never the root repo). (c) Latent tx-escape bug fixed: `user-profiles-dal.updateProfile/updateProfileInternal` audited via root-repo adapter while writing on `tx` (phantom audit on rollback). (d) `mfa_*`/`user_invitations`/`user_passkeys` entities legitimately have no `_audit` table — no `audit:` needed. (e) Bulk ops (`updateMany`/`deleteMany`) emit NO per-row audit — library gap, not faked. **E2E**: committed `src/modules/auth/__tests__/boundary-integration.test.ts` (mints ephemeral Casdoor admin actor, real login, exercises every seam incl. audit-row assertion; 9 tests). Verified live: login→list→write→audit→MFA-gate ALL GREEN; config_entry audit INSERT visible in `config_entries_audit` + `/audit` endpoint; secrets masked; etag 304. 305/305 BE tests (incl. mfa-integration now reachable). Docs: `dal-usage.md` audit-on-write rule added; `architecture.mdx` audit opt-in note  | controller-boundary FIXED: internal-request-routes/publisher-identity/service-lifecycle-subscriber now go through services. auth/ wrapper files are LOGIC-BEARING repos (cache/DTO/projection), not thin. RESIDUAL: mcp/tools/dispatch.ts still imports initDal+UserProfilesDal directly |
| 6 | **Ext-JSON sweep**: audit every `JSON.stringify`/`res.end(JSON.stringify(...))` on response paths across BE/US/FE and replace with `extJsonStringify` — ai/composite-route (5×) + docs-search-route (1×) DONE 2026-10-12; restano BE, emailsender, webhook, altri US | ⏳ partial | 2026-10-12 | NOTA: le 6 fix nel servizio AI sono standardizzazione, NON bugfix — verificato: `ai_conversations` ha PK `uuid`, `ai_feedback` RETURNING omette `id` → nessun payload conteneva bigint, nessun crash latente  | emailsender config-route.ts:27 + providers-route.ts:29 still res.end(JSON.stringify) — last real response-path residue. BE mcp oauth routers + brevo.ts are request-body serialization, not responses |
| 6b | **Ext-JSON enforcement**: shared standards-check script (ban `JSON.stringify`/`JSON.parse`/`getPool()`/`from "pg"` in `src/**`, exemptions via `// standards-exempt: reason`), wired in `build`/`test` + CI | ✅ done | 2026-10-16 | merged into 5i row — same script/gate. SDK fixes: `db-env`, `dal-error-mapper` (bigint now propagates correctly → test updated `5n`), `service-identity`, `logger`, `nats-client` subject-sync, `build/serve-docs-pack` (manifest → ext-json; openapi.json stays plain — external spec), `config-validator`, `create-microservice` RFC7807 exempt. US: emailsender providers route → extJsonStringify; Brevo/embedding-provider/webhook-inbound/mistral.rs = external-wire exempts. DAL: CLI + manifest `standards-exempt-file` (signed canonical JSON must stay plain — signature stability), delta-calculator/column-pg-io/query-builder inline exempts (no @primebrick/sdk dep). 1 latent test bug fixed: ai `embedding-pipeline.test.ts` mocked stale `upsertDocChunk` (renamed to insert/updateDocChunks in 04de41b). job-handler added to workspace packages (was uninstalled) |

---

## Ext-JSON enforcement (task 6 detail)

The wire serialization standard is `extJsonStringify`/`extJsonParse`
(`@primebrick/sdk/json/ext-json`, FE `src/lib/api-ext.ts`): every integer is
`bigint` on both ends, no `number|bigint` ambiguity, and `JSON.stringify`
CANNOT substitute it (it throws on bigint). The rpc-router already
serializes handler returns via `extJsonStringify` — so handlers must NEVER
call `res.end(JSON.stringify(...))` manually and services must never
"defensively" `Number()`-normalize DAL values.

Known violations to fix:

- `ai/src/controllers/http/composite-route.ts` — `res.end(JSON.stringify(...))`
  at ~5 sites (error envelopes, conv/feedback, mapped proxy body)
- `ai/src/controllers/http/docs-search-route.ts` — 1 site
- `ai/src/services/conversation-repository.ts` — `JSON.stringify(content)`
  for a jsonb column (legit storage use — allowlist class)
- Hash-input `JSON.stringify` in `docs-drift.ts`/`embedding-pipeline.ts`
  (legit — deterministic content hash, allowlist class)

Enforcement design (task 6b — decision: FULL ban, not just wire paths):

- **Mechanism**: zero-dep script `tools/check-standards.ts` in
  `primebrick-v3-sdk` (run via `bun`/`tsx`, no eslint needed — BE/US/SDK/DAL
  have NO eslint today; only FE has `eslint.config.js`). Scans `src/**`
  for banned call sites:
  `JSON.stringify`, `JSON.parse`, `getPool()`, `from "pg"`, `pool.query(`.
- **Exemptions**: inline comment `// standards-exempt: <rule> <reason>` on
  the same/previous line — REQUIRED reason text so every bypass is
  review-visible in git diff. Expected legit classes today: deterministic
  hash inputs (`docs-drift`, `embedding-pipeline`), jsonb column payloads,
  external-API request bodies (non-Primebrick wire), dev scripts/stdout.
- **Wiring**: each repo gets `"check:standards": "bun <sdk>/tools/check-standards.ts"`
  and it runs in `prebuild` + `test` + CI → any `JSON.stringify` = build
  error, not a warning.
- **FE**: same rule added to `eslint.config.js` via `no-restricted-syntax`
  (`CallExpression[callee.object.name='JSON']`) — eslint already exists
  there and gives IDE-level errors inline.
- **Why script over eslint**: single source of truth across 5 repos, no new
  dev-deps in 4 repos, the same check covers `getPool`/`pg` (task 5) for free.
- If a legit `JSON.stringify` need emerges: the fix is either an
  `extJson-exempt` helper (e.g. `hashCanonical()`) or a documented exemption
  — never silent use.

## pgvector — dynamic-entity pattern compliance (added after review)

`vectorSearch` and the write path MUST follow the existing
`<TEntity extends object, TResult = TEntity>(entity: EntityClass, ...)`
signature convention of `findAll`/`add` — the entity carries schema,
tableName, soft-delete scoping and projections; nothing is hardcoded to
`docs_kb`. The vector field is passed as `FieldRef` (from `field(Entity,
"embedding")`), the query vector is always a `$n` parameter, and the
returned shape is `TResult & { similarity: number }` — same contract as
finders (caller projects what it needs, `tableName` override still works).
Any entity declaring `@Column({ pgType: "vector(N)" })` gets search+write
for free — no per-table code.

---

## Current state — what the raw repositories do and why

### `ai/src/services/docs-kb-repository.ts` (10 raw queries)

| Function | SQL feature the DAL lacks today |
|---|---|
| `upsertDocChunk` | `ON CONFLICT (repo,path,chunk_idx) DO UPDATE` + `vector` literal cast |
| `vectorSearch` | `embedding <=> $1::vector`, `1 - (embedding <=> $1)` similarity, `ORDER BY embedding <=> $1` |
| `getDocHashes` | plain select — portable now via `findAll` |
| `deleteStaleChunks` | `NOT (chunk_idx = ANY($3::int[]))` — `Filter.raw` or `Filter` with array operand? |
| `getAllDocPaths` | `SELECT DISTINCT` — `groupBy` works today |
| `deleteDoc` / `deleteRepoDocs` / `wipeIndex` | `Repository.delete` with filters — portable now |

### `ai/src/services/conversation-repository.ts` (8 raw queries)

Conversations/messages tables — needs analysis but likely portable via
`findAll`/`add`/`update` once vector columns aren't involved.

### Infra uses that legitimately stay raw

`HealthCheckAdapter` (`SELECT 1`), `pgServerBanner`, snapshot/migration
builders (`build-database-snapshot`), the `entity-repo.ts` `Repository`
constructor, seed scripts. These are `src/db/` / adapter-layer concerns and
are the only sanctioned `getPool()` callers.

## Proposed repeatable model in `@primebrick/dal-pg`

### 1. Vector column type

```ts
@Column({ pgType: "vector(1024)" })
embedding!: number[];   // was: string
```

- New `VectorColumn` handling in entity meta: `pgType: "vector(N)"` stores
  `number[]` in TS, serializes to `'[v1,v2,...]'` (or binary) on write and
  parses on read — registered alongside the INT8→bigint / NUMERIC→number
  adapters in `dal.ts`.
- `@Entity` consumers declare the dimension once; `vector(N)` validation
  stays a DDL concern (migration), not a runtime check.

### 2. Similarity query — one canonical method (IMPLEMENTED as hybrid builder)

The DAL is a **query builder + repository**, not an ORM — `vectorSearch` is
the single vertical method that constructs THE canonical vector-retrieval
query. Generic `opts` turn each extra channel on/off; all OFF degenerates
to the plain `ORDER BY <field> <op> $n::vector LIMIT topK` (the
`vectorOrder` path inside `buildSelectQuery`).

```ts
const hits = await repo.vectorSearch(DocsKbEntity, field(DocsKbEntity, "embedding"), queryVec, {
  topK: 8,
  filters: [Filter.fieldValue(field(DocsKbEntity, "repo"), "=", repo)],
  fields: standardProjections,
  distance: "<=>",                     // cosine; "<->" L2, "<#>" inner, "<+>" L1
  oversample: 4,                       // inner-channel budget = topK * oversample
  lexical: {                           // → adds `lex` CTE + UNION candidates
    field: field(E, "content"), query: "rbac permission",
    config: "simple", boost: 0.15, minScore: 0.1,
  },
  keywordBoost: {                      // → adds LATERAL unnest keyword hits
    terms: ["rbac"], fields: [title, path, content], boost: 0.05,
  },
  scoreAdjust: {                       // → CASE term in the final score
    expr: "metadata->>'content_type'",
    map: { tutorial: 0.08, conceptual: 0.03, api: -0.10 },
  },
});
```

- Emits parameterized SQL: query vector always a `$n::vector` param —
  never interpolated (HNSW/ivfflat friendly); `::vector` resolves via
  `search_path = <schema>, public` (pgvector lives in `public`).
- Honors `tableSchema`/`tableName`, soft-delete scoping, filters,
  field projections. Hybrid mode rejects `joins` (ValidationError).
- Final order: `score = similarity + Σ boosts DESC`; lexical-only hits get
  real similarity via `COALESCE(v.similarity, 1 - (d.emb <=> $vec))`.
- Returns `Array<TResult & { similarity|distance, lexical_score?,
  lexical_match?, keyword_hits?, score }>`.

Vector ops in filters (implemented): `Filter.fieldValue(field(E,"embedding"),
"<=>", vec)` → `embedding <=> $n::vector`; `Filter.expr({sql,params}, op,
{sql,params})` → parameterized function operands (`to_tsvector(?,d.content)
@@ websearch_to_tsquery(?,?)` → all `$n` bound).

### 3. Writes — DECISION (user-directed, 2026-10-12)

NO upsert anywhere (deliberately banned pattern in this codebase) and NO
soft-delete in the ingestion/indexing context — derived-index rows are
physically deleted. `docs_kb` stays a **non-auditable** entity, so
`delete`/`deleteMany` are already physical `DELETE`s; `hardDelete` exists
for deletable entities elsewhere if ever needed.

The upsert is replaced by an explicit diff → bulk pattern, which matches
how ingestion already works (hash-diff per chunk):

| Today (raw) | DAL port |
|---|---|
| `upsertDocChunk` (INSERT … ON CONFLICT DO UPDATE) | `getDocHashes` → `findAll` diff → **`addMany`** for new/changed chunks; `updateMany`/`update` by `{repo,path,chunk_idx}` match for changed-only re-embeds (decide at implementation: addMany+deleteMany of changed set vs updateMany — prefer updateMany to preserve `id`/`created_at`) |
| `deleteStaleChunks` (`NOT (chunk_idx = ANY($n))`) | `deleteMany` with match rows `{repo,path,chunk_idx}` per stale chunk (computed in JS from the hash map — no ANY filter needed) |
| `deleteDoc` / `deleteRepoDocs` / `wipeIndex` | `delete`/`deleteMany` with match `{repo,path}` / `{repo}` — physical by default on non-deletable entity |
| `getDocHashes` / `getAllDocPaths` | `findAll` (+ `groupBy` for DISTINCT pairs) |
| `vectorSearch` | `repo.vectorSearch` (task 2) |

`addMany`/`deleteMany`/`updateMany` are the bulk paths the user pointed at:
one round-trip per batch instead of per-chunk — strictly better than the
current per-chunk `pool.query` loop for ingestion.

### 4. Then the enforcement layer becomes enforceable

With zero legitimate consumer raw-SQL cases left:

- `getPool()` restricted: rename/move to an infra-only export
  (`@primebrick/dal-pg/infra` or `getInfraPool()`), consumed only by
  `src/db/`, health adapters, snapshot tooling.
- Repo lint check (script or CI step):
  `rg -l "getPool\(|from ['\"]pg['\"]|\.query\(" src/ --glob '!src/db/**' --glob '!**/adapters/health*'` → non-empty = fail.
- Update affected unit tests (health adapter mocks pool today; snapshot
  tests) — run full suite, no regressions.

## Acceptance

1. `docs-kb-repository.ts` deleted; every caller uses `Repository` methods.
2. `vectorSearch` result identical to raw SQL version (same top-k, same
   similarity) — verify empirically with a known query embedding.
3. `conversation-repository.ts` deleted likewise.
4. Zero `getPool()`/`pool.query`/`pg` imports outside the allowlist —
   enforced by the lint check.
5. New consumers needing vector columns write `@Column({pgType:"vector(N)"})`
   and call `vectorSearch` — no new raw repositories possible.

## Partitioning & retention — empirical report (task 7)

### What exists (live DB + code, all verified)

- `pg_partman` extension, auto-created by BE `init_database.sql`.
- Every `{table}_audit` trail: `PARTITION BY RANGE (changed_at)`, monthly,
  `partman.create_parent`, `premake=4`, PK `(id, changed_at)` — emitted by
  `database-patch-to-sql.ts` and patch files. `ai_models_audit` has 11
  live partitions.
- `audit-query.ts` reads via the partition PARENT — all partitions as one
  table; the intended "main table serves ~95% of reads" model.
- Entity trick: `@Key() id` single logical key while DDL PK is composite —
  `@AuditTrailEntity`/`AuditLogEntity` is the precedent.

### What does NOT exist

- `retention = NULL` on all `part_config` — never configured;
  `retention_keep_table=true` (detach, not drop).
- No scheduler: no `pg_cron`, no `run_maintenance_proc()` call anywhere.
- No row-count axis (partman is time/serial only — row-count archiving
  would be a custom mover job).
- No partitioning decorators — pure DDL concern.
- Partitioning only on `_audit` tables; zero domain tables partitioned.

### Decided & implemented: ai_conversations partitioned, children cascade (task 4b)

User direction: the conversation is the atomic unit — children never die
alone. Final design (implemented + verified):

| Table | Partition | Retention | Rationale |
|---|---|---|---|
| `ai_conversations` | `RANGE (last_seen_at)` monthly — the activity watermark | `6 months`, drop | partition = inactivity window, not creation |
| `ai_messages` | none | dies with parent | atomic unit — transactional cascade |
| `ai_feedback` | none | dies with parent | atomic unit — transactional cascade |

- `last_seen_at`: monotonic stamp by `Repository.touch` inside the
  child-write tx; `>=` every child's updated_at → expiring partition ==
  fully-expired subtree ("quasi-atomic" window purge).
- FKs dropped (PG: unique constraint on partitioned parent must contain
  the partition key → child FK impossible) — integrity is the
  repository's transactional cascade.
- Retention job must purge children set-based by parent membership
  (`last_seen_at < cutoff`) BEFORE `run_maintenance_proc` — partition
  drop is DDL, bypasses row-level checks, leaves orphans otherwise.
- Mutable partition key note: `touch` physically moves rows across
  partitions — that movement IS the retention semantic, accepted.

**Required plumbing (all missing today):**
1. `part_config.retention` + `retention_keep_table=false` per parent.
2. A maintenance runner: `partman.run_maintenance_proc()` on schedule —
   no pg_cron in stack → service-side cron/poll job (nats-sub cron per
   controller-boundary rule) calling it via `dal.withClient()`.
3. Row-count axis — NOT built; recommend deferring (time axis covers the
   actual need; a mover job is a separate feature if ever wanted).

### Docs updated

- `primebrick-dal-v3/docs/ai/dal-architecture.md` — new "Partitioning &
  retention (pg_partman)" section (state, gaps, activation path).
- `primebrick-dal-v3/docs/dev-guide/partitioning.mdx` — new page (model,
  rules, retention ops) + `_order.json` entry.

## ARCH-1: Partitioning as entity intent + jobs orchestration (proposal — awaiting approval)

### Pre-intervention state (verified empirically, 2026-10-12)

- **No partitioning decorator exists.** Full decorator inventory in
  `entity-decorators.ts`: `Entity, Column, IsNotColumn, Unique, Key,
  AuditableField, DeletableField, SynchronizableField, CloneField,
  AuditTrail, AuditTrailEntity`. User memory of partitioning decorators =
  never implemented.
- `EntityPersistenceMeta` carries NO partition field —
  `SchemaTableMeta` neither. A partitioned table diffs today as
  PK/constraint mismatch (entity says `PK(id)`, DB says `PK(id,last_seen_at)`).
- `partman.create_parent` in applied patches is **handwritten**
  (`0005_create_ai_entity_tables.sql` 3-arg form `'1 month'`). The BE
  generator emits it ONLY for `_audit` tables and with the stale v4
  signature `('fq','changed_at','native','monthly')` — different from
  applied files → audit partitions in shipped patches are hand-normalized.
- `buildSqlPatchFromMetaDiff` (BE-only, 200 lines, best-effort): new table
  → CREATE + unique indexes + audit table + create_parent. NO partition
  support for domain tables.
- **US has no compare/generate script** — `ai/scripts/` has only
  `database-patch-apply.ts` (reads `db-meta/patches`); US patch files are
  handwritten. `fire-and-forget/` is not read by `applyPatches` (manual
  apply mechanism — needs clarification of its official runner).
- Manual partition patch `partition_ai_conversations.sql` was applied to
  local DB during task 4 (FK drops + rename/recreate + create_parent +
  retention '6 months'). Schema result is the intended end state; the
  GENERATION path is what this proposal replaces.

### Design: `@PartitionField` — field-level decorator (DAL)

```ts
@Entity("ai_conversations", "ai")
export class AiConversationEntity implements IAuditableEntity {
  @Key() id!: bigint;
  @Unique("ai_conv_uq", 0) @Column({ nullable: false }) uuid!: string;

  @PartitionField({ interval: "1 month", retention: "6 months", keepTable: false })
  @Unique("ai_conv_uq", 1)          // REQUIRED: every unique incl. the key
  @Column({ nullable: false }) last_seen_at!: Date;
}
```

- Field-level (user choice 3): the field declares itself partition key;
  `EntityPersistenceMeta.partition = { column, interval, retention,
  keepTable, premake? }` — serializable, flows to `SchemaTableMeta`.
- **Non-eludible validation at meta build** (`syncImplicitEntityColumns`/
  `getEntityPersistenceMeta` throws `ValidationError`):
  - max ONE `@PartitionField` per entity (PG: one partition key per RANGE);
  - every `@Unique` group MUST include the partition column (PG rejects
    uniques without it) — missing → error naming the offending group;
  - PK is auto-widened (`PRIMARY KEY (id, <part_col>)`) — no declaration
    needed, cannot be skipped;
  - partition column must be `timestamptz`/`date` (RANGE-time axis first;
    numeric axis later if ever needed);
  - `@PartitionField` requires NOT NULL.
- `@PartitionedCascade([{child, refProp}, ...])` class-level on the parent
  (or `@PartitionChildOf` on children — see open question): declares the
  logical FK graph dropped by partitioning, so cascade delete AND the
  retention purge are **generated**, not per-entity code.

### Design: generator emits the whole partition lifecycle

`buildSqlPatchFromMetaDiff` extension (meta → SQL):

- **New table**: `CREATE TABLE ... PARTITION BY RANGE (col)` + composite
  PK + composite uniques + `PERFORM partman.create_parent(...)` +
  `UPDATE part_config SET retention…` — all automatic.
- **Existing plain table → partitioned**: emits the rename→legacy→
  recreate→copy→drop template + `WARN: child FKs must be dropped`
  comments (data-bearing, review-required — same banner style as renames).
- DB-side introspection gains `pg_partitioned_table` awareness so the
  diff stops reporting composite PKs as drift.
- Gap: compare tooling is BE-only — port `database-patch-compare` +
  snapshot builders to SDK or replicate per-service (US entities have a
  registry but no generator today; US patches are handwritten).

### Jobs orchestration — alternatives analyzed

| Option | Infra needed | Schedule models | Durability | Pub/sub executor fit | Verdict |
|---|---|---|---|---|---|
| **JetStream native schedules** (ADR-51) | zero — NATS 2.14.3 live | `@at`, `@every`, 6-field cron (server ≥2.14), TTL, timezone | durable in stream (survives restart) | native: `Nats-Schedule-Target` IS the fire event | **recommended** |
| pg-boss (in jobs svc) | zero — Postgres | cron/RRULE, deferral | PG tables | worker→publish NATS | runner-up: adds run state/retries/DLQ/dashboard; more machinery |
| BullMQ | Redis exists but as volatile cache → needs dedicated persistent Redis/AOF | repeatable/delayed | Redis-dependent | worker model bypassed (execution via NATS anyway) | rejected: infra cost for unused features |
| Temporal | separate cluster + SDK | full workflows | full history | massive overkill | rejected |
| node-cron | none | cron only | none | no HA/dedup/log | rejected |

### Proposed topology — pure NATS, all pub/sub

```
Stream JOBS (allow_msg_schedules):
  jobs.schedule.<svc>.<job>   durable schedule DECLARATION (Nats-Schedule hdr)
  jobs.due.<svc>.<job>        Nats-Schedule-Target — the fire event
  jobs.result.<svc>.<job>     executor outcome (fire-and-forget)
```

- **Scheduler = the stream.** Domain service declares its schedules at
  boot via SDK helper `ensureJobSchedule(subject, spec)` (idempotent:
  last message on subject = current schedule). Covers: every-x (`@every`
  /cron), once-at (`@at`), "in 30min" (computed `@at`), immediately
  (plain publish to `jobs.due.<svc>.<job>`).
- **Executor = domain service nats-sub** subscribing
  `jobs.due.<svc>.>` via durable pull consumer (`jetstreamSubscribe`
  exists) → at-least-once, ack policy gives redelivery; runs domain
  logic via `dal.withClient`; publishes `jobs.result.*`.
- **Orchestrator/governance = thin `jobs` service** (or BE module):
  ensures the JOBS stream, taps `jobs.due.>` + `jobs.result.>` →
  `job_runs` table (fired_at, result, duration, error) → admin
  observability. Zero domain knowledge — pure plumbing.
- For partition retention concretely: `jobs.schedule.ai.partition-maintenance`
  cron daily → ai executor: enumerate `part_config` parents → set-based
  children purge via `@PartitionedCascade` meta (`DELETE children WHERE
  ref IN (SELECT uuid FROM parent WHERE part_col < cutoff)`) →
  `run_maintenance_proc()` → publish result. Fully generic — same handler
  works for any future partitioned entity.

### Open technical flags

- `allow_msg_schedules` stream flag: not in nats.js 2.29.3 types but
  config passes through `JSON.stringify` (verified `jsm.js:80`) → cast +
  verify on server 2.14.3, or upgrade to scoped `@nats-io/jetstream`.
- Missed fire while subscriber down: durable consumer redelivers on
  reconnect; `Nats-Schedule-TTL` bounds staleness.
- Whether schedule declarations live in domain services (self-register)
  or a central jobs-registry config — recommend self-register.

### Open questions for user

1. `@PartitionedCascade` on parent vs `@PartitionChildOf` on child
   entity — which reads better?
2. Jobs governance service: new `jobs` microservice vs BE module?
3. Migrate `database-patch-compare` to SDK so all services get
   entity→patch generation (currently BE-only)?


> **Continues in `dal-pgvector-repository-part2.md`** (raw-SQL census, fluent-tx analysis, last_seen_at watermark conflict).
