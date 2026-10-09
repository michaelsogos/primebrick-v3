# AI ownership migration BE→AI + forced NATS req/res transport

> Empirical plan. Two workstreams: (A) remove every AI-owned concern from
> primebrick-be-v3 into primebrick-us-v3/ai — BREAKING, immediate; (B)
> COMMUNICATION MODEL STANDARDIZATION — decided 2026-10-09:
> NATS req/res is ABANDONED (deprecate `NatsClient.request`/`subscribeRequest`),
> unified receiver rejected. Legal transports:
>   a. BE→US  = HTTP req/res via BE proxy (`/ws/:code/*`), mandatory middleware
>   b. US→BE/US = NATS pub/sub fire-and-forget ONLY
>   c. US/BE→  = NATS event sourcing / choreographed event bus (pub/sub +
>                queue groups; subjects `entity.<entity>.<action>`)
> Benchmark evidence (temp/nats-bench, Node24+Bun): HTTP ~1.5-1.9× faster than
> NATS req/res (804 vs 540 ops/s seq; 1994 vs 1067 conc50). Auth code flow is
> IDENTICAL on both transports (gateway-resolved secret+headers) when done
> correctly — `ai`'s composite-route bypasses it (reads x-user-* headers with
> NO secret check = spoofable). NATS req/res gives NO durability/ordering;
> back-pressure only. Decision drivers: HTTP already deployed, MCP dispatch
> depends on predictable HTTP paths, no perf loss.
> Continuation of `guide-docs-runtime-pipeline.md` (tasks 5-8 fold into A).

Status: ⚪TODO — Plan date: 2026-10-09

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| A1 | Move `ai_models` + `ai_cerebellum` modules (entity, meta, service, dto, list-config, router, tests) to us-v3/ai | ⏳ not done | — | Tables live in `public` schema today — see §DB |
| A2 | Move `docs-search` (dal+service+router+tests) to AI | ⏳ not done | — | BE runs pgvector SQL on `ai.docs_kb` — architectural violation |
| A3 | Move AI DDL/seed patches out of `be-v3/db-meta` | ⏳ not done | — | ~40 `add_ai_*`/`add_guide_*` SQL files + ai_* table DDL |
| A4 | DB migration: `ai_models`/`ai_cerebellum` → `ai` schema | ⏳ not done | — | preserve data; see impediments |
| A5 | FE repoint: `entities/ai_model|ai_cerebellum`, `docs/search`, `docs/document` → AI endpoints | ⏳ not done | — | api.ts + smart-ai/smart-guide libs |
| A6 | Move AI user-guide/agent docs + E2E specs to us-v3/ai | ⏳ not done | — | verify what actually lives in be-v3 vs fe-v3 |
| B1 | REMOVE NATS req/res entirely — no tech debt: migrate `auth.apikey.byHash`, `service.registry.get`, `config.get` to governed correlation pub/sub, then DELETE `NatsClient.request`/`subscribeRequest` from SDK (hard removal, no compat shim) | ⏳ not done | — | 3 live subjects; deprecation markers already applied 2026-10-09 |
| B2 | SDK endpoint factories — CLOSED set, the only legal ways to expose anything: `makeEntityRouter`/`makeEntityService`, `makeRpcRouter`/`makeRpcService`, `makeNatsRoutes`/`makeNatsRequestRoute` (pub/sub + correlation-reply). ALL enforce mandatory middleware: auth verify + RBAC + zod + optional redis cache. `createMicroservice` accepts ONLY factory-produced routers (no raw `routeHandler`); startup audit crashes with explicit error on manual `createServer`/`listen`/unregistered path; lint/CI grep as second net | ⏳ partial | 2026-10-09 | DONE: `makeRpcRouter`+`composeRouteHandlers` (auth kinds user/api_key/public, mandatory permissions — construction throws otherwise, :param, body validators→400, `streaming:"sse"` governed kind, RFC7807), `makeNatsRoutes`+`makeNatsRequestRoute`+`callNats` (queue default=serviceCode, `queue:null` explicit broadcast, verifyNatsMessage+enforceNatsRbac mandatory, correlation replies via msg.respond). 24/24 unit tests green, tsc clean. REMAINING: `makeEntityRouter`/`makeEntityService` US-side, `makeRpcService`, `createMicroservice` enforcement + startup audit crash, lint rule |
| B3 | Remove MCP client from US AI entirely: `/ai/chat` does inference only; tool definitions/execution stay in BE domain, callers drive the loop via `POST /system/mcp/call` (same as smart-guide already does) | ⏳ not done | — | decided — kills the only US→BE HTTP call (`ai/orchestrator.ts:120`) |
| B4 | Event bus standard (choreography): subject conv `entity.<entity>.<action>`, envelope `{entity, action, uuid, actor, changes, ts}`; SDK `subscribe` gains `{queue}` — DEFAULTS to service code, overridable | ⏳ not done | — | BUG LATENT: zero queue groups today → scaled replicas would duplicate messages |
| B5 | SSE streaming stays HTTP as a GOVERNED option: `makeRpcRouter` supports `streaming: "sse"` route kind — not an escape hatch | ⏳ not done | — | `/ai/chat` SSE |
| B6 | Doc update: AGENTS.md + controller-boundary rules + user-guide — transport matrix + DAL/audit/translations rules | ⏳ partial | 2026-10-09 | DONE: transport matrix in be architecture.mdx; new `dal-usage.md` rule in both repos (getDal-only, getPool internal-only, audit≠events≠collaboration, per-module translations); us-v3 architecture.mdx updated |
| B8 | BUG: `proxyRequest`/`proxyRequestSse` do NOT forward `x-mfa-action-authorization` → US can't enforce MFA step-up at all | ✅ done | 2026-10-09 | `buildProxyRequestHeaders` closed allowlist + `x-request-id` gen + `x-forwarded-*`; response forwards etag too; 7/7 unit tests, tsc clean |
| B9 | MFA token consume for US: `mfa_action_authorizations` is `public` (BE-owned); US verifies JWT signature offline but single-use consume needs governed `auth.mfa.consume` correlation route on BE | ⏳ not done | — | design in Part B |
| B10 | DRIFT fix + seed backfill | ✅ done | 2026-10-09 | live: `fix_translations_table_drift.sql` moved 46+28 rows → 0 drift (5431 app.*/public, 6424 system.*/system). seeds: 448 keys (3063 rows) folded into patches 01–06 by language + new `00000000000012_seed_translations_en_us.sql`; fresh-env coverage = 100% of live keys |
| B11 | Service-identity layer (design below) | ⏳ partial | 2026-10-09 | DONE: `service-identity.ts` SDK (10/10 tests); registrar auto-derives pkg name/version + sends `client_key_hash` (env `PRIMEBRICK_CLIENT_KEY`, raw key never travels); `system.client_registry` (init + live); BE upserts `source='registry'` rows on `service.register` + publishes `system.client_registry.changed`; SDK `ClientRegistry` cache (snapshot via `system.clientRegistry.get` nats-req + CHANGED subscription, fail-closed); `createHttpServer` identity gate (401 UNIDENTIFIED_CLIENT / 403 UNKNOWN_CLIENT / 401 INVALID_CLIENT_KEY, RFC7807, /health stays public) wired into `createMicroservice` — default ON, opt-out `PRIMEBRICK_IDENTITY_ENFORCEMENT=off`; BE `client-registry-repo` + `ClientRegistryEntity` + `system.clientRegistry.get` responder; BE self-enrolls its own UA prefix at startup (`initBackendIdentity`); proxy outbound sends `User-Agent={be-identity}` + `x-primebrick-client-key` and moves client UA to `x-forwarded-user-agent`. **Client key comes from module config, NOT env** (env policy: only `DATABASE_URL` is env — see `.devin/rules/env-policy.md` in be/us + docs): US services read `client_key` via `ConfigLoader` (per-service key — leaked key compromises one caller only); BE reads `client_key` from `config_entries` via `backend-identity.ts` holder (cached for the proxy hot path). TODO: NATS-side identity on subscribers, admin CRUD for `manual` rows (Postman clients), key rotation story, E2E live verification |
| B7 | Verify BE exposes no HTTP endpoints called by microservices (besides MCP case in B3) | ✅ done | 2026-10-09 | Only violation: ai→BE `/mcp` HTTP. No other US→BE HTTP found |

### BE proxied API — full pipeline (verified 2026-10-09, `proxy-service.ts` + `proxy.router.ts`)

Route: `router.all("/ws/:serviceCode/*", rbacHandler([AUTHENTICATED_USER]), proxyRequest)`
(+ `proxyRequestSse` hardcoded for `/api/v1/ai/*`).

**Request path, step by step:**

1. **Express globals** (`index.ts`): `cors({origin:true})` → `extJsonBodyParser(1mb)` →
   `cookieParser` → `extJsonMiddleware` (bigint-aware JSON).
2. **`rbacHandler([AUTHENTICATED_USER])`** does THREE things internally:
   - gateway-secret check (GATEWAY mode only),
   - `authMiddleware`: verifies Bearer JWT via SDK `verifyAuth` (Casdoor),
     resolves internal user uuid + role mappings from DB → `req.user`
     (AuthUser: id, email, roles, permissions, isAdmin, isSystem,
     raw_access_token). 401/403 on failure — fail-closed if role mappings
     are not loaded.
   - RBAC check against the declared permission list.
3. **`proxyRequest`**:
   - `service_registry` DB lookup by serviceCode → filter `status='online'`
     → 404 (no service) / 503 (going_live only) / 502 (all offline).
   - in-memory round-robin across online instances.
   - URL rewrite: `/ws/<code>/v1/...` → `{base_url}/api/v1/...`
     (query string preserved via `req.url`).
   - `serializeAuthUserToHeaders(req.user)` → `x-user-*` headers +
     gateway secret header.
   - `fetch()` with **only** `Content-Type: application/json` + auth headers.
   - body re-serialized via `JSON.stringify(req.body)` — JSON only, no
     multipart/binary.
4. **Response path**: status passthrough, body passthrough (as-is),
   only `Content-Type` header forwarded back; non-2xx logged to BE console.
   SSE variant pipes the stream + aborts upstream on client disconnect.

**What the BE does NOT do on proxied calls**: no body validation (US zod does
it), no translations envelope, no MFA, no version checks — those are the
endpoint's own chain. The BE contributes: authN (JWT→AuthUser), coarse RBAC
(authenticated), service discovery, load balancing, identity propagation.

**Header audit — what exists vs what is forwarded:**

| Header | Origin | Forwarded today | Needed |
|---|---|---|---|
| `x-user-*`, gateway secret | BE-generated | ✅ | identity propagation |
| `x-mfa-action-authorization` | FE → BE | ❌ **dropped** | B8 fix — US step-up |
| `Authorization` | FE | only SSE/ai variant | US never re-verifies JWT; keep dropping except the AI→MCP case |
| `If-None-Match` / `ETag` | FE caching | ❌ both directions | needed if any US endpoint does ETag caching |
| `x-forwarded-for/proto/host`, `user-agent` | client | ❌ | audit logging on US side (who really called) |
| `x-request-id` / correlation | — | does not exist | should be introduced for log tracing |
| `Accept-Language` | — | not used anywhere | translations resolve via user profile, not header |

Decision for B8: proxy forwards an **explicit allowlist** (closed by
default): `x-mfa-action-authorization`, `if-none-match`, `if-match`,
`x-request-id`, `x-forwarded-for`, `user-agent`, `accept-language`,
`content-type`. Everything else stays dropped.

**MFA consume problem (B9)**: `X-MFA-Action-Authorization` JWT is verifiable
offline (signature), but single-use enforcement lives in
`public.mfa_action_authorizations` (BE schema — US must not touch).
Design: `makeNatsRequestRoute` on BE subject `auth.mfa.consume` → US calls
`callNats` before accepting the token; BE marks used atomically. The 403
+`mfa_step_up_required` response contract already passes through the proxy
(status+body passthrough) — only request forwarding + consume are missing.

### B11 — Service-identity layer (design, decided 2026-10-09)

Goal: internal services reject calls from unknown/unauthorized callers —
the boundary is enforced at the endpoint level, not the network level.

**Identity = 2 headers on every internal call:**

1. `User-Agent: {pkg_name}/{pkg_version} ({capabilities}) {runtime}/{ver}`
   — e.g. `primebrick-emailsender/1.4.0 (email-service) Bun/1.2`.
   Built once at boot from `package.json` (SDK already derives
   `[service#version]` the same way in `lifecycle/logger.ts detectService`),
   cached, sent by every HTTP/NATS client helper. `capabilities` comes from
   service metadata (`service-registry` code/manifest) — verifiable field.
2. `x-primebrick-client-key: <key>` — a per-caller secret from config/env,
   proving the UA isn't just claimed but authorized.

**Middleware order on every governed endpoint** (before auth):

```
checkUA(req):
  no UA            → 401 (unidentified caller)
  UA not in prefix allowlist → 403 (unknown client)
  then verify x-primebrick-client-key → 401 if bad
```

**Allowlist source of truth = DB, auto-fed:**

- `system.client_registry` (new table): `{ua_prefix, client_key_hash, source,
  is_enabled, created_by}` — `source='registry'` rows are written/maintained
  automatically when a service registers via `service.register` (BE already
  persists `service_version`; registrar must also send `pkg_name` so the UA
  prefix `{pkg_name}/{pkg_version}` is derivable).
- `source='manual'` rows are admin-managed (e.g. Postman UA + its own key).
  Registry rows are system-owned — admin can view but not edit them.
- US/BE load the allowlist into a local cache at boot + invalidate on
  change events (same pattern as config cache); verification is local —
  no per-request lookup.

**`x-request-id`**: generated at BE edge (or honored if the FE sends one),
forwarded through proxy and into NATS headers — the single correlation
thread for APM/SIEM E2E traces. User-Agent of the original browser is
therefore redundant for tracing; internal UA is our own format.

**Proxy allowlist** (closed by default — B8 scope expands): forward
`x-mfa-action-authorization`, `if-none-match`, `if-match`, `x-request-id`,
`x-forwarded-for`, `user-agent`, `accept-language`, `content-type`.
Everything else dropped.

### B12 — Log tags (done 2026-10-09)

Problem: some log lines embed `[subsystem]` inside the message, others don't —
inconsistent and unreadable.

Standard: the **message contains only the message**. Subsystem tags are an
optional `tags: string[]` key on `LogMeta` (`logger.info(msg, {tags:[...]})`),
rendered as `[tag1] [tag2]` before the message in **amber**
(`ESC[38;5;214m`) — visually distinct from level colors, the blue timestamp
and the magenta `[service#version]` tag. In `json` format they are a
structured `tags` array.

NO backward-compatibility shim: the console bridge does NOT extract tags —
the message is passed through verbatim. All legacy call sites were migrated
to `logger.*(msg, {tags:[...]})` explicitly: us-v3 (ai, emailsender,
webhook — 15 files, ~40 sites) + sdk nats-routes. Verified: zero remaining
tagged `console.*` calls, tsc clean on ai/emailsender/webhook/sdk, 316/316
SDK tests. New-code convention: `logger.*(msg, {tags:[...]})`.

**Full console.* elimination (2026-10-09, user directive: "console log sono
illegali")** — every runtime `console.log/info/warn/error/debug` converted
to `logger.*` with correct levels (lifecycle → info, per-request noise →
debug, recoverable → warn, fatal → error) and structured meta
(`{tags, error, ...}`):

- **us-v3**: ai (`src/index.ts`, `docs-loader.ts`, `scripts/database-patch-apply`,
  `docs-extract`, `docs-render`, `eval/run-eval`), emailsender (`src/` +
  `scripts/` snapshot/patch tools), webhook — **0 remaining**.
- **sdk**: `redis-client`, `http-server`, `graceful-shutdown`, `startup-logger`,
  `create-microservice`, `apply-patches`, `nats-client`, `service-registrar`,
  `sse-event-bus` — raw error args wrapped as `{error}` meta. The console
  bridge itself (`logger.ts` L371+) is the interception mechanism and stays.
- **be-v3**: 33 files (~130 sites) — `mcp/oauth-*` routers, `service-lifecycle-
  subscriber`, `stale-detection-job`, `index.ts` (startup/shutdown),
  `casdoor-api-client`, `webauthn.service`, `proxy-service` error logs,
  `export/*`, `openapi/*`, auth repos (`config`, `config_entries_dal`,
  `role-mapping-repo`, `sdk-auth-ports`, `user-profile-repo`). `initCache`/
  `initPresenceStore`/`startKeyspaceListener` now receive SDK `logger`
  instead of `console` (CacheLogger-compatible). repository-factory's
  CacheLogger renamed to `cacheLogger` (was shadowing).
- Deliberate non-log stdout kept: `docs-extract` JSON payload →
  `process.stdout.write`; test skip notice + commented code left as-is.
- Verified: tsc clean be-v3/sdk/ai/emailsender/webhook, SDK 316/316 tests,
  BE proxy tests 7/7. `grep console\.` → 0 in all runtime src/.

**Registry gap found**: `service_registrar` sends `name`/`service_version`
only when configured — AI is the only populated row
(`EMAILSENDER|NULL|NULL`, `settings|NULL|Settings`). The registrar must
auto-derive pkg name/version from `package.json` like `detectService()`
already does for the logger — then `system.client_registry` rows can be
generated without new env/config.

### B13 — Logging polish + lifecycle transitions (done 2026-10-09)

User-reviewed rules, all implemented:

- **`done` level** added to SDK logger (`LogLevel`, order 25 between
  info/warn, green render, OTel `INFO`, json field). `CacheLogger` port has
  optional `done?` — adapters without it fall back to `info`.
- **Fixed columns**: timestamp / level (padEnd 5) / `[service#version]`
  (padEnd 26) are space-delimited and aligned; `[tags]` and the message
  flow after the third column.
- Missing `client_key` in module config is `error` (blocks the identity
  gate — every proxied/internal call 403s), not `warn`.
- Positive events now `done`: NATS/Redis connected, HTTP listening,
  service registered, MCP server initialized, subscriptions bound.
- **Status codes → tags, never message text and never meta blobs**:
  `logger.error("… → non-OK response", { tags: ["proxy", "403"] })` renders
  `[proxy] [403]` inline. Applied to proxy (2), casdoor-api-client (28),
  aggregated-router, openapi-discovery, index.ts version check. MFA
  `*Setup*` response logs moved to `debug` with status as tag.
- **MCP startup**: auth line removed (architecture/docs, not a log);
  entities printed as bullet list: `- {pkg}/{version}` then indented
  `- EntityClass->table` per entity (`source_ref` + `impl` fields added
  to `entity-registry`, BE entities populated, US entities take
  `service_registry` pkg name/version).
- **Transition-only lifecycle logs**: `StaleDetectionJob` skips rows
  already `going_live`/`offline` (was re-marking `going_live` every 30s);
  `allStaleAlerted` flag → the all-stale NATS-outage error fires once per
  outage. `logStatusChange` in `service-lifecycle-subscriber`: →online
  `success`, →going_live/→offline `warn`, unchanged = silent.
- Tests: stale-detection-job suite rewritten to spy `logger` (logger
  writes stderr, not `console.error` — the old spies were dead);
  `mfa-service.test.ts` sdk mock gained `logger`; `backend-identity`
  fallback UA now built via `buildUserAgent` (includes `Node/x` runtime).
- Remaining failures: `mfa-integration`, `user-passkeys-dal`,
  `user-invitations-dal` — pre-existing/environmental (live-DB dependent),
  untouched by this work.

### B14 — Client-key rotation design (proposed 2026-10-09, awaiting approval)

User requirement: rotate per-service keys every ~30min, broadcast to all
instances atomically, and N scaled instances of the rotator must not
contradict each other.

**Design — authority is the DB, not any process:**

- `system.client_registry` gains `key_generation int`, `not_before timestamptz`,
  `previous_key_hash text`, `previous_valid_until timestamptz`. Verification
  accepts a key whose hash matches `client_key_hash`, OR `previous_key_hash`
  while `now() < previous_valid_until` (grace window).
- **Who rotates**: a single `KeyRotationJob` on the BE (it owns
  `client_registry` already). Scaled BE instances coordinate with
  `pg_try_advisory_lock(key)` per row — exactly one instance rotates;
  the others no-op. No leader election, no contradiction possible.
- **New key material**: the BE does NOT know the raw key (only the hash
  arrives at register). So rotation cannot be "BE generates, pushes secret
  down" — that would distribute raw keys on the bus. Instead: the BE
  publishes `system.client_key.rotate {ua_prefix, generation}` on NATS;
  each US instance generates its own new random key locally, hashes it,
  and the *designated writer* upserts `{hash, generation}` back via
  `system.clientRegistry.rotate` (nats-req, CAS `WHERE key_generation = $1-1`
  → idempotent, first writer wins). Every instance of that service then
  uses the *returned* hash's matching key — i.e. instances exchange via
  the same reply: whoever's key was accepted is authoritative; losers
  adopt it? **No — losers cannot adopt a key they don't know.** Resolution:
  the rotation request carries `{ua_prefix, generation, candidate_hash}`;
  the US replies its candidate hash; BE picks the first arrival (or lowest
  instance id) as winner, persists it, then broadcasts
  `system.client_key.rotated {ua_prefix, generation, winner_instance}`.
  Losing instances request the winning raw key? Raw keys on the bus is
  what we're avoiding.
- **Alternative (simpler, recommended)**: one key per *service* not per
  *instance*. The instance that wins a per-service JetStream/DB lease
  (`service_leader` row, renewed like a heartbeat) performs the rotation:
  generates key, updates its own config store, registers new hash via CAS,
  publishes rotated event. Other instances consume the rotated event →
  fetch the current hash and… still need the raw key.
- **Real constraint**: either raw key material crosses the bus (encrypted
  with a service bootstrap secret? we have no second channel), OR the key
  is derived deterministically: `key = HMAC(master_secret, ua_prefix +
  generation)`. Then rotation needs NO distribution at all: BE bumps
  `key_generation`, broadcasts the new generation, every instance locally
  derives the same key. Master secret lives in each service's module
  config (`key_derivation_secret` per service) — never transmitted.
  This is the recommended model: stateless, race-free, scale-safe,
  instant propagation, grace via `previous_key_hash` + generation-1.
- **Missed broadcast recovery**: US detects generation mismatch on
  `system.client_registry.changed` snapshot reload (already subscribed)
  or on a 401 INVALID_CLIENT_KEY → refetch snapshot, derive current key,
  retry once.
- **TTL**: `previous_valid_until = now + grace` (e.g. 5min), new gen every
  30min → overlap window absorbs clock skew and mid-flight requests.

Decision needed: deterministic derivation (recommended, no secrets on the
bus) vs distributed-secret model (needs a secure channel we don't have).

**Live provisioning (2026-10-09)**: `client_key` generated in-DB via
`gen_random_bytes` for `public` (BE), `ai`, `emailsender` config_entries —
values never in repo/chat/env. OpenAPI discovery + aggregated spec
aggregation now send `backendIdentityHeaders()` (the 403 on the spec fetch
was the gate correctly rejecting undici's default `node` UA — and it is
403, not 401, because an UA was present but unallowlisted). Rejections log
the RFC7807 `internal_code`. **Gap**: `webhook` uses `EnvConfigPort`
(env-sourced config, no config table) — violates env policy and cannot
hold a `client_key`; needs a config table or an explicit exemption.

### Translations drift — verified row-by-row (2026-10-09)



**No duplicates in the correct table** — every drifted key exists ONLY in the
wrong table. All 11 distinct keys are table-wrong (namespace prefix is
correct, so they must be **moved**, not renamed). Culprits: my own
`db-meta/fire-and-forget/*.sql` scripts inserted into the wrong table.

| Distinct key | Rows | In table | Should be | Source script |
|---|---|---|---|---|
| `app.common.inherit` | 6 | system | **public** | `add_common_inherit_translation.sql` |
| `app.smart.ai.cerebellum.model_default` | 7 | system | **public** | `update_ai_cerebellum_model_defaults.sql` |
| `app.smart.ai.cerebellum.not_recommended` | 6 | system | **public** | `add_ai_cerebellum_recommendation.sql` |
| `app.smart.ai.cerebellum.recommended` | 6 | system | **public** | `add_ai_cerebellum_recommendation.sql` |
| `app.smart.regex.ai.cache.censused_title` | 7 | system | **public** | `add_ai_model_translations.sql` (43 INSERT INTO system) |
| `app.smart.regex.ai.cache.orphaned_title` | 7 | system | **public** | `add_ai_model_translations.sql` |
| `app.smart.regex.ai.modelNotConfigured` | 7 | system | **public** | `add_ai_assistant_model_translations.sql` |
| `system.settings.ai.cerebellum_section.assistant` | 7 | public | **system** | `add_cerebellum_section_translations.sql` |
| `system.settings.ai.cerebellum_section.description` | 7 | public | **system** | same |
| `system.settings.ai.cerebellum_section.empty` | 7 | public | **system** | same |
| `system.settings.ai.cerebellum_section.title` | 7 | public | **system** | same |

Fix for B10: `INSERT INTO <right>.translations SELECT ... FROM <wrong>` per
language row + delete from wrong table, in one transaction (fire-and-forget
script). Guard for the future: CHECK constraint or trigger on both tables
enforcing the `app.%`/`system.%` prefix.

### Corrected facts (from user review — previous claims were wrong)

- **DAL**: BE and US both use `@primebrick/dal-pg` — `getPool()` in BE is just
  `initDal().getPool()`, an infra-internal accessor for building `Repository`
  + `withCache`. No second data layer exists; the rule (now documented):
  consumers use `getDal()` only.
- **Audit**: `AuditPort` (dal-pg) writes `{table}_audit` — identical in BE and
  US. The Redis/NATS `entity-changed` markers `BeAuditPortAdapter` also
  publishes are the *collaboration* feed, not audit — separate mechanism.
- **Translations**: every module owns `<schema>.translations`; BE owns
  `public.translations` (`app.*`) + `system.translations` (`system.*`) via its
  central gateway; module tables sync down to BE on first module load.
- **MFA**: `requireMfaStepUp` is endpoint-side enforcement — the US must do it
  itself (returns 403 + `mfa_step_up_required` → FE dialog → retry with the
  `x-mfa-action-authorization` token). Token = JWT + single-use DB record in
  `public.mfa_action_authorizations` — see B9 for the cross-schema consume
  problem.

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped -->

---

## Part A — AI ownership violations in BE (empirical evidence)

### A1. Entity modules fully in BE

`be-v3/src/modules/ai-models/` + `ai-cerebellum/` contain the full entity
stack — `ai_model_entity.ts`, `ai_cerebellum_entity.ts`, `*.meta.ts`,
`*_service.ts`, `dto.ts`, `list-config.ts` — wired into the BE entity
registry (`src/domain/entities/registry.ts:8-9`) and served by dedicated
routers (`controllers/http/ai-models.router.ts`, `ai-cerebellum.router.ts`)
using `makeEntityRouter` standard CRUD. Tests in
`controllers/http/__tests__/ai-*.router.test.ts`.

FE reaches them via generic entity paths:
`/api/v1/entities/ai_model/list|meta|:uuid` and
`/api/v1/entities/ai_cerebellum/list` (`fe-v3/src/lib/api.ts:383,398`).

### A2. docs-search: BE executes pgvector SQL on AI's table

- `be-v3/src/modules/system/docs-search-dal.ts` (271 lines): two-phase
  pgvector ranking + keyword/content-type boosts on `ai.docs_kb`.
- `docs-search.service.ts` (75 lines): calls `POST /api/v1/ai/embed` on the
  AI instance, then runs the DAL itself.
- `controllers/http/docs-search.router.ts`: `POST /api/v1/system/docs/search`
  + `GET /api/v1/system/docs/document` (fetch-by-path).
- Test: `controllers/http/__tests__/docs-search.router.test.ts`.

The BE owns zero docs knowledge yet queries the AI-owned `docs_kb` directly.

### A3. DDL/seed ownership

`be-v3/db-meta/fire-and-forget/` holds every AI schema change made to date:
`create_ai_cerebellum.sql`, `add_guide_cerebellum.sql`,
`ai_cerebellum_one_per_assistant.sql`, `add_ai_model_*` (~20 files),
model-seed rows, guide config patches. Any AI table/column change today is
applied by the BE migration runner.

### A4. DB layout (verified live)

```
schema public  → ai_models, ai_cerebellum        (BE-owned schema)
schema ai      → docs_kb, conversations, ...     (AI-owned schema)
```

Migration must move the two entity tables into `ai` schema with data
preserved (`ALTER TABLE ... SET SCHEMA ai` + FK/sequence/index rewrite),
or export/import. The AI service's DAL (`initDal` with `DB_SCHEMA=ai`)
already targets `ai.*`.

**Cross-schema FK risk**: check whether `ai_models`/`ai_cerebellum` are
referenced by public-schema FKs (audit tables, config_entries, translations
keys are TEXT — no FK). Verify `information_schema.referential_constraints`
before moving.

### A5. FE call sites to repoint

`fe-v3/src/lib/api.ts`: `entities/ai_cerebellum/list`, `entities/ai_model/list`,
`system/docs/search`, `system/docs/document`, `system/mcp/call`.
Plus `src/lib/ai/*` (cerebellum merge, model cache, test-scores) and both
assistant UIs. E2E specs persist `test_scores` directly to PG (temp scripts)
— unaffected by HTTP path changes.

### A6. Docs/tests location

AI-related docs in `be-v3/docs/user-guide/` and agent docs must move to
`us-v3/docs/user-guide/` (synced to docs site) — audit which files exist.
E2E AI specs live in `fe-v3/src/e2e/` (browser tests — stay in FE, they're
FE tests; only DB-direct harnesses may move).

## Part B — Communication model (DECIDED 2026-10-09)

### Legal transport matrix — everything else is illegal and must be prevented

| Direction | Transport | Pattern | Examples |
|---|---|---|---|
| FE → BE | HTTP | req/res + SSE | the ONLY public attack surface (API gateway) |
| BE → US | HTTP via `/ws/:code/*` proxy | req/res | entity CRUD proxy, MCP dispatch — no BE logic |
| BE → US | NATS pub/sub | fire-and-forget | `emailsender.send` |
| US → BE/US | NATS pub/sub | fire-and-forget ONLY | lifecycle, responses via correlation subjects |
| any → any | NATS event bus | choreography | `entity.<entity>.<action>` subjects |
| **NATS req/res** | — | **DEPRECATED — never allowed** | `request()`/`subscribeRequest()` banned |
| US → BE HTTP | — | **ILLEGAL** | found: `ai` MCP client → `BE_BASE_URL/mcp` |

- BE HTTP exposure: ONLY to FE. The DMZ must not reach BE HTTP (only known
  violation: ai MCP client — B3).
- US HTTP exposure: endpoints are the primary BE→US path but must only be
  reachable by the BE (DMZ), and registered (service_registry + openapi) so
  BE knows how to proxy them.
- Scaled replicas: identical services join the SAME NATS queue group → one
  copy round-robin; different services = different queue names → each gets
  its own copy. SDK `subscribe` needs a `queue` param check — verify
  `NatsClient.subscribe` supports queue groups; if not, add it.
- Event bus envelope (proposal): `{entity, action, uuid, actor, changes, ts}`
  published on `entity.<entity>.<action>` after BE CRUD persists — parallel
  to the HTTP response, never blocking it.

### Enforcement — prevent bypass at code level

1. SDK: `NatsClient.request`/`subscribeRequest` — deprecation markers applied,
   then HARD DELETE after the 3 subjects migrate. No compat shim, no debt.
2. SDK factory family (the ONLY legal ways to expose an endpoint — closed by
   design, extended only by adding a new factory):
   - `makeEntityRouter`/`makeEntityService` — entity CRUD, full mandatory chain
   - `makeRpcRouter`/`makeRpcService` — service actions; `streaming: "sse"`
     is a governed route kind, not an escape hatch
   - `makeNatsRoutes`/`makeNatsRequestRoute` — NATS pub/sub subscribers AND
     correlation-reply endpoints; same mandatory middleware (gateway-resolved
     auth via `verifyNatsMessage`, `enforceNatsRbac`, zod payload, optional
     redis cache). No free NATS endpoints, same as no free HTTP endpoints.
3. Correlation-reply pattern (the governed RPC-over-pub/sub standard, NOT
   broadcast): caller publishes on `x.y` with a private `_INBOX` reply
   subject; responder replies there. Same mechanism as the existing
   `email.response.<requestId>`. Difference vs banned req/res: built purely
   on publish/subscribe primitives, routed through `makeNatsRequestRoute`
   so auth/RBAC/cache are enforced — a controlled reusable pattern, not an
   anomaly.
4. The 3 live req/res subjects to convert (clear names, not legacy):
   - `auth.apikey.byHash` → `auth.apiKey.getByHash` (webhook 401-wall
     precheck; genuinely synchronous → correlation reply)
   - `config.get` → `config.getShared` / `config.shared.<code>` 1:1
     (BE-owned SHARED values only — redis_url, telemetry. Each service's
     own config stays autonomous via its own config tables)
   - `service.registry.get` → `service.registry.snapshot.<code>` 1:1
     published in response to `service.register` (lifecycle already exists)

## Impediments / open questions (must be visible)

1. **Cross-schema FKs**: verify `ai_models`/`ai_cerebellum` aren't referenced
   by public-schema FKs before `SET SCHEMA`. `system.translations` keys are
   TEXT — no FK, but AI-entity translations stay in `system.translations`
   (BE-owned) — acceptable: translations are UI resources, not AI data.
2. **Audit trail**: BE `audit` infra — do ai_* tables write into
   public audit_log? If yes, audit writes after move must go through the
   ai schema or a service call.
3. **MCP server location**: `be-v3/src/modules/mcp/` (server, oauth,
   generic-tools, dispatch) is the AI tool surface but is a *platform*
   gateway (entity CRUD across all services). Move to AI = AI depends on
   every module's OpenAPI anyway; keep in BE = BE keeps an AI-facing
   component. Recommend: MCP stays in BE (it's transport infra), but its
   dispatch switches to NATS req/res. Needs user sign-off.
4. **`routes-census.service.ts` stays in BE** — it aggregates
   service_registry + module meta (platform knowledge), not docs.
5. **openapi discovery**: MCP fetches `/api/v1/openapi.json` over HTTP.
   Under forced-NATS, discovery needs a NATS variant (`svc.<code>.openapi`
   request) — extra SDK work, or keep openapi.json as the sole public HTTP
   route.
6. **Existing FE direct calls**: any FE code calling `/api/v1/ai/*` keeps
   working only if the BE keeps the `/api/v1/ai/*` proxy — which is the
   thing being removed. FE must move to `/ws/ai/*`-equivalent NATS-backed
   proxy or dedicated BE gateway routes. **Design before deleting.**
7. **Bun + NATS req/res performance claim**: not verified. NATS req/res
   adds message serialization + RTT through the broker; at our volumes the
   driver is security/ingress uniformity, not latency. Flagged.
8. **Big plan, breaking**: stage it — A (ownership) can land before B
   (transport) since they're independent except the shared endpoints.

## Acceptance

- [ ] `grep -r "docs_kb\|ai_models\|ai_cerebellum" primebrick-be-v3/src` → 0 hits
- [ ] `ai_models`/`ai_cerebellum` in `ai` schema, data preserved
- [ ] FE `/system/settings/ai` page + guide assistant work unchanged
- [ ] docs search/fetch served by AI only
- [ ] B1 spike answered with working unified receiver OR documented reason
- [ ] No microservice endpoint reachable without platform auth coverage
