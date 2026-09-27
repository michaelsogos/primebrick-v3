# Plan — Webhook ingress + MVC transport-agnostic architecture

> **Status: IMPLEMENTED** (SDK NatsClient JetStream + NatsApiKeyPort +
> shared apikey cache consts + cache wiring; BE `controllers/nats-req/`
> auth.apikey.byHash + service.registry.get; `primebrick-webhook` service;
> emailsender nats-sub subscriber + ordering guard + Redis-cached
> ApiKeyPort; controllers/ layout applied to emailsender + ai;
> controller-boundary rules added to BE + US).

## Context — verified empirical state

### Runtime + dependencies (verified 2nd pass)

- **US run on Bun** (`bun --hot src/index.ts` dev, `bun dist/index.js` start);
  `engines.node: 24` is declared but Bun executes. **Rule for new code: zero
  `node:*` imports where a web-standard API exists.** Current `node:*`
  inventory is small: `node:crypto createHash` ×3 (emailsender
  `database-patch-naming`, ai `docs-kb-repository`/`embedding-pipeline` —
  replaceable with `crypto.subtle.digest('SHA-256', …)`), `node:http` types
  (type-only, zero runtime cost — keep, the SDK HTTP server is `node:http`
  and works on Bun; rewriting it is out of scope), `node:fs/path` (ai
  `docs-loader` — file I/O, legitimately runtime-specific).
  ⚠️ Brevo `X-Mailin-signature` is **MD5** — not in WebCrypto. Options:
  skip signature v1 (auth = our API key already) or keep `node:crypto` as a
  documented exception. **Decision: skip signature in v1.**
- **JetStream already enabled**: `docker-compose.postgres.yml` runs
  `nats:2.14.3` with `-js` and a persistent `/data` volume. No infra change.
- **SDK `NatsClient` today exposes only `JetStreamClient`** (publish API)
  — no manager, no durable consumer support. It must be EXTENDED (DRY),
  not replaced (details in §SDK changes).
- The microservice HTTP layer is SDK `createMicroservice` →
  `routeHandler(req: IncomingMessage, res: ServerResponse, url) => boolean`.
  The new `webhook` US reuses this exact contract — no new framework.

### The only webhook in the system

`emailsender` US hosts `POST /webhook?provider=brevo` **directly on its own
HTTP port** (`SERVICE_BASE_URL`, default `localhost:3003`) — a public S2S
endpoint living on a private microservice. Violates the target topology:
**BE is the only public API gateway**.

Handler today (`webhook-route.ts`, 110 lines): API-key verify → RBAC
`EMAILSENDER_LOG_CREATE_SINGLE` → JSON parse → `webhookService.handleWebhook`
→ `dal.update` on `sender_log` matched by `provider_message_id` (non-unique
column — being fixed separately with `@Unique` + index patch).

Secondary domain issue (transport-independent): Brevo events arrive
out-of-order; `status` is overwritten blindly. A `status_changed_at` /
precedence guard is needed regardless of transport.

### MVC analysis — how coupled are controllers today?

- **BE** (`modules/<mod>/routers/*.ts` ~4.3k lines): handlers mix auth,
  zod validation, **business logic**, and response shaping. Example:
  `config-entries.router.ts` `bulkUpdate` loops `findByUuid` per item,
  enforces the reserved-row rule, validates values, THEN calls
  `dal.bulkUpdate` — the per-item domain rules live in the HTTP layer.
  Services exist (`modules/auth/services/`) but the boundary is porous.
- **US emailsender**: `server/*-route.ts` handlers do auth + body parse +
  envelope unwrap + direct `dal.*` calls (6 in providers-route).
  `services/` exists but thin.
- **US nats handlers**: `nats/handlers.ts` subscribe → call service
  directly — no controller seam at all.
- **No shared "controller" concept**: the same operation can't be invoked
  over HTTP and NATS without duplicating the auth/validate/dispatch layer.

## Target architecture

### RULES (accepted)

1. **No public envs — ever.** BE is the only public API surface.
   Exception below: a dedicated `us-webhook` ingress service (Rule 4).
2. **US are private**: reachable only via NATS (primary) or HTTP (only
   when called BY other US/BE on the private network).
3. **Webhooks are proxied/routed like any other external API**: public
   ingress → NATS → target US. Webhooks are events → **pub/sub** (not
   req/res) — provider needs a fast 200, processing is async.
4. **`us-webhook` microservice**: the ONLY other public surface — a dumb
   router/proxy: provider auth → validate → publish NATS → 200. Zero BL,
   zero DB. Rationale: isolates S2S callback bursts (Brevo: ~5 events per
   email → 300 calls per 60-mail minute) from user traffic on BE.

### MVC standard — `controllers/` folder (BE + every US)

```
src/
  controllers/            # transport adapters ONLY — no BL
    http/                 # Express route handlers (BE) / http handlers (US)
    nats-req/             # NATS request-reply endpoints (migrating HTTP→NATS)
    nats-sub/             # NATS pub/sub subscribers (events, webhooks)
  services/               # transport-agnostic BL — callable identically
                          # from http/, nats-req/, nats-sub/
  ...
```

**Controller contract (enforced, all three kinds)**:

- MAY: authenticate (session JWT / API key / NATS headers), zod-validate
  the payload, call ONE service method, shape the *transport* response
  (HTTP status + RFC7807 body / NATS reply envelope / ack), root try/catch,
  streaming/file download where transport requires it.
- MUST NOT: import repository/DAL directly, contain domain rules
  (reserved checks, existence checks, value coercion policy), loop over
  entities applying per-item logic, build response payloads field-by-field
  (services return the response shape already formed — snake_case).
- Errors: controllers never invent error codes — `mapDalError` /
  `ApiError` from the service layer; the controller only serializes.

**Service contract**: pure functions/methods `(validatedInput, ctx) →
result | throw`; zero `req`/`res`/NATS imports; ctx carries actor,
permissions, correlation id — assembled by the controller.

**Enforcement**: `.devin/rules/controller-boundary.md` in BE and US +
audit pass per module (each module listed with its violations & target
refactor). ESLint `no-restricted-imports` on `controllers/` → forbid
`@primebrick/dal`/repository imports (verify rule expressibility).

## Webhook migration design — smart routing, registration-driven

**The `webhook` service is a generic pass-thru router, NOT a per-provider
endpoint collection.** Adding a new US with webhook needs must NEVER require
a `webhook` release — routing is derived from `service_registry`.

### Route shape (verified against registry model)

```
POST /webhook/{service_code}/{intent...}
     ─────────────────────────────────
     e.g. /webhook/emailsender/brevo
          /webhook/payments/stripe/charge.succeeded
```

- `{service_code}` = `service_registry.code` — validated against a
  **registry cache** inside `webhook` (below). Unknown → 404,
  `is_enabled=false`/stale → 502.
- `{intent...}` = free-form rest-path passed through verbatim — the target
  US owns its meaning. `webhook` never parses provider-specific shape.
- Auth: `webhook` is an **AUTHENTICATED_API first wall, then pass-thru** —
  it verifies the API key is valid (`verifyApiKey`, missing/invalid/
  inactive/expired → **401**) but does NOT enforce RBAC and does NOT know
  which permissions the target intent needs. The Authorization headers
  are forwarded verbatim into the NATS message headers; the target US
  re-verifies them itself (emailsender: `verifyApiKey(new
  NatsHeaderProvider(msg), apiKeyPort)` — `HeaderProvider` already covers
  NATS messages, zero new auth code) + its existing RBAC middleware
  (`EMAILSENDER_LOG_CREATE_SINGLE`, reused — no seed migration).
- **Precheck without a DB** (verified): `verifyApiKey` needs
  `ApiKeyPort.findByHash` → `public.api_keys`. `webhook` has no DB → SDK
  gains `NatsApiKeyPort implements ApiKeyPort` resolving via
  `NatsClient.request("auth.apikey.byHash", {hash})`; BE hosts a new
  `auth.apikey.byHash` `nats-req` endpoint backed by the existing auth
  port. Hashing on `webhook` uses `crypto.subtle.digest("SHA-256")`
  (web standard — zero `node:*`); `hashApiKey` (node:crypto) stays BE-side.
- **Precheck cache (verified, per-webhook zero-hop)**: `webhook` wraps
  `NatsApiKeyPort` in an in-memory `Map<hash, {record, ts}>` with TTL
  (60s) + bounded size (LRU-ish, ~1000 entries). First hit per key → 1
  NATS req; subsequent hits within TTL → zero traffic (preserves the
  traffic-isolation purpose of the service). Revoked keys stay accepted
  at most TTL — safe: this is only the *precheck*, real auth+RBAC
  re-verifies downstream. BE/NATS unreachable → fail-closed 503.
- **Cache hierarchy (empirically verified)**:
  - BE `BeApiKeyPort` already caches Redis `be:api_keys:hash:<sha256>`
    (TTL 5min) → DB miss only on cold keys — the `auth.apikey.byHash`
    req is therefore cheap (Redis hit, sub-ms).
  - **Gap found**: `EmailSenderApiKeyPort` does a raw `pool.query` on
    EVERY call — no cache. Fix in scope: SDK moves the apikey cache
    key+TTL into shared constants (`API_KEY_CACHE_KEY(hash)`,
    `API_KEY_CACHE_TTL_MS`), `EmailSenderApiKeyPort` adopts the same
    `getCachePort()`+shared-key pattern → same Redis instance (discovered
    via `initCacheFromSharedConfig`/`redis_url`), same entries — one
    warm-up serves both readers, one invalidation covers both.
  - **Gap found**: `createMicroservice` never calls
    `initCacheFromSharedConfig` → microservices have NO Redis today.
    In scope: wire it into boot (best-effort, null port → graceful DB
    fallback, existing best-effort semantics preserved).
  - **Verified**: no BE code writes `api_keys` (keys seeded via SQL
    `db-meta/fire-and-forget/create_api_keys_table.sql`) → no
    invalidation path exists or is needed; TTL is the staleness bound.

### Registry cache (no DB, no new BE dependency)

Verified: registration is one-directional pub (`service.register` /
`service.heartbeat` / `service.unregister` → BE persists); no req/reply
exists for reads today. `webhook` therefore:

1. **Subscribes** to `service.register`, `service.unregister`,
   `service.stale` → keeps `{code → {enabled, status, endpoints}}` in
   memory (self-healing, always fresh — no TTL needed).
2. **Cold-start gap**: at boot the cache is empty until the next
   heartbeat/register (~30 s). Misses fall back to a new
   **`service.registry.get` req/reply on BE** — a single NATS controller
   returning the registry row (first `nats-req` precedent; tiny, generic,
   reused later by other US). If BE doesn't answer → 502.

### Message envelope (forwarded, not reshaped)

```json
{
  "service_code": "emailsender",
  "intent": "brevo",                    // the {intent...} path remainder
  "received_at": "...",                  // ISO, for ordering guard
  "body": { ...provider payload... }
}
```

NATS headers carry the original auth material (GATEWAY-RESOLVED
`serializeAuthUserToHeaders`-compatible or raw `authorization` —
emailsender decides; it already owns `verifyNatsMessage` + RBAC).

### Flow

```
Brevo ──HTTPS──▶ webhook  POST /webhook/emailsender/brevo
                     │  optional token precheck
                     │  registry cache: emailsender known+enabled?
                     ▼
               jetstreamPublish("webhook.emailsender.received", envelope)
               headers: forwarded auth
                     │  PubAck → 200 | fail → 502 (Brevo retries)
                     ▼
               emailsender (durable consumer, stream WEBHOOK)
               → verifyNatsMessage + RBAC EMAILSENDER_LOG_CREATE_SINGLE
               → intent router: "brevo" → webhookService.handleWebhook
               → status ordering guard added here
```

- **JetStream** (durable) over core pub/sub: webhook events must survive
  consumer downtime — at-least-once + replay. Consumer idempotency:
  `(provider_message_id, event)` — dedupe since Brevo retries identical
  events.
- **Ownership**: `webhook` `ensureStream("WEBHOOK", ["webhook.>"])` at
  boot (idempotent); each consuming US ensures its own durable consumer
  (`webhook.<own_code>.received`) at boot — no central admin, each US owns
  its consumer.
- ACK semantics: `webhook` returns 200 after successful **JetStream
  publish ack** (`PubAck`); publish failure → 502 so the provider retries
  (at-least-once end-to-end).
- `sender_log` ordering: keep `status_changed_at` monotonic — update only
  if the incoming event maps to a *newer/later* status OR event timestamp
  > stored timestamp; else no-op. (Brevo payload timestamps to verify.)
- emailsender `webhookRouteHandler` + `endpoints.webhook` + public
  `SERVICE_BASE_URL` exposure → **removed**; the service keeps only the
  NATS subscriber. Its HTTP port stays private (health/openapi).
- Auth: `webhook` is pass-thru — optional token precheck only, NO RBAC.
  The consuming US runs `verifyNatsMessage` (GATEWAY-RESOLVED, gateway
  secret + serialized AuthUser — already implemented in
  `verify-nats.ts`) + its existing RBAC middleware. For Brevo (S2S, no
  user) the API-key path applies: emailsender verifies the API key +
  `EMAILSENDER_LOG_CREATE_SINGLE` exactly as today — the auth headers are
  simply transported inside the NATS message instead of an HTTP request.
- **Service contract**: `webhook` knows NOTHING about providers. A US
  that wants webhooks registers normally (`service.register`) and creates
  a durable consumer on `webhook.<its_code>.received`. Intent dispatch is
  the US's business (`intent` string → handler map).

### SDK changes (NatsClient extension — DRY, no second client)

Add to `src/nats/nats-client.ts` (peer dep `nats@2.29` already present):

```typescript
// Manager for idempotent stream/consumer admin (lazy, same connection)
static async ensureStream(name: string, subjects: string[]): Promise<void>
// JetStream publish with PubAck (awaited) — returns seq for logging
static async jetstreamPublish(subject: string, data: unknown,
  hdrs?: Record<string, string>): Promise<bigint>
// Durable ordered consumer on a stream+filter → handler gets (data, ack, nak)
static async jetstreamSubscribe<T>(opts: {
  stream: string; durable: string; filterSubject: string;
  handler: (data: T, msg: { headers?: MsgHdrs; ack(): void; nak(delay?: number): void }) => Promise<void>;
}): Promise<JetStreamConsumer>
```

Plus `src/auth/ports/nats-api-key-port.ts` — `NatsApiKeyPort implements
ApiKeyPort`, `findByHash` → `NatsClient.request("auth.apikey.byHash",
{hash})` (any service can verify API keys without a DB).

Implementation notes: `nc.jetstreamManager()` for `streams.add` /
`consumers.add` (idempotent — catch "already exists"/use update), and the
`nats` v2 consumer API (`consumer.consume({ callback })` or pull
`fetch()` loop — pick `consume` with explicit `msg.ack()` on success /
`msg.nak(5000)` on handler throw, mirroring `subscribe()`'s tracing
wrapper: `nats.consume ${subject}` span + error status).

## Steps

1. **SDK**: extend `NatsClient` (`ensureStream`, `jetstreamPublish`,
   `jetstreamSubscribe` durable) + unit tests. Zero `node:*` added.
2. `.devin/rules/controller-boundary.md` (BE + US) — the contract above,
   with forbidden-API list and examples.
3. **BE**: two `nats-req` endpoints (first `nats-req` controllers —
   `controllers/nats-req/`): `service.registry.get` → registry row by
   `code` (fallback for `webhook` cache misses); `auth.apikey.byHash` →
   ApiKeyRecord via the existing auth port (backs `NatsApiKeyPort`).
4. `webhook` US scaffold in `primebrick-us-v3` (`webhook/` sibling of
   `emailsender/`, package `primebrick-webhook`, same createMicroservice
   shape): `controllers/http/router.ts` is the ONLY route —
   `POST /webhook/{code}/{intent...}`; lifecycle-event subscribers
   (`service.register/unregister/stale`) feeding the registry cache;
   `ensureStream` + `jetstreamPublish`. **No DB, no DAL, no `node:*`.**
5. emailsender: `controllers/nats-sub/webhook-subscriber.ts` — durable
   consumer `webhook.emailsender.received` (`ack/nak`) →
   `verifyNatsMessage` + RBAC + intent dispatch (`brevo` →
   `webhookService.handleWebhook`); delete `server/webhook-route.ts` +
   `endpoints.webhook` + `setWebhookAuthDependencies`; status ordering
   guard in `webhook-service`. (`@Unique` + DDL index on
   `provider_message_id` — DONE in commit `7a66320`.)
5. Reorganize emailsender/ai: `server/*-route.ts` → `controllers/http/`;
   `nats/handlers.ts` → `controllers/nats-sub/` (emailsender.send is a
   fire-and-forget publish from BE → stays nats-sub; if it ever needs a
   reply → nats-req); services unchanged. BE modules progressively
   (per-module, not big-bang).
6. Tests: us-webhook auth/publish/ack + SDK jetstream wrappers; subscriber
   idempotency (same `(provider_message_id, event)` twice → single effect);
   ordering guard; full emailsender suite.
7. Docs + AGENTS/rules updates both repos.

## Open questions — RESOLVED

1. **New microservice `webhook`** in `primebrick-us-v3` — folder
   `webhook/` (sibling of `emailsender/`), package `primebrick-webhook`
   (NOT `us-webhook`). Public ingress in parallel to BE, a generic
   registration-driven router — no per-provider code.
2. **JetStream durable** — at-least-once + replay. **SPOF note**: a
   single-node NATS JetStream is still durable on disk (events persist,
   delivered after restart) but is an availability SPOF while down —
   us-webhook would return 502 → Brevo retries, so at-least-once holds
   even then. True HA needs a NATS cluster (JetStream R3 stream replicas);
   deployment concern, flagged in docker-templates — not required for v1.
3. **Provider auth — RESOLVED**: keep `EMAILSENDER_LOG_CREATE_SINGLE`
   (no seed migration). `webhook` does AUTHENTICATED_API validity
   precheck (401 wall) via `NatsApiKeyPort` → BE `auth.apikey.byHash`;
   real auth + RBAC stay in the target US (`verifyApiKey` on
   `NatsHeaderProvider` + existing RBAC). Brevo `X-Mailin-signature`
   hardening DEFERRED — it is MD5, WebCrypto has no MD5; adding
   `node:crypto` only for that is unjustified for v1.
4. **Migration order**: `webhook` service first (this plan), then
   `emailsender` as MVC reference impl, then BE module-by-module.

### URL + naming

- Public route: `POST /webhook/{service_code}/{intent...}` on `webhook`
  — e.g. `/webhook/emailsender/brevo`.
- NATS subject: `webhook.<service_code>.received` (JetStream stream
  `WEBHOOK`, durable consumer per subscriber US). Intent travels inside
  the message envelope, not the subject — so a US can add new intents
  without any routing change.
- `emailsender.send` stays **fire-and-forget by design** — documented in
  the service's `endpoints` registration (e.g.
  `endpoints.nats_send = "nats://emailsender.send (fire-and-forget)"`) so
  the registry advertises the contract.
