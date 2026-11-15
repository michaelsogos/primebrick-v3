# ai-ownership-migration-and-nats-transport — PARTE 2

> Continuation of `ai-ownership-migration-and-nats-transport.md` — body tail. The task table + status live in part 1; this file is reference material only (design notes, evidence, acceptance).

---

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
