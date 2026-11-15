# Plan: In-house async logger + OpenTelemetry compatibility (BE + microservices)

## Objective

Two goals, one infrastructure:

1. **Structured stdout/stderr logs**: every log line carries a full ISO 8601
   UTC timestamp **and `trace_id`/`span_id`** when a trace context is active —
   written through a **non-blocking, buffered async writer** (not
   `console.log`, which is synchronous and lock-prone under load).
2. **OpenTelemetry compatibility**: the product emits standard OTLP telemetry
   (traces, and optionally logs) driven by standard `OTEL_*` env vars. We do
   NOT ship a collector/dashboard — the customer's APM/SIEM provides the
   collector endpoint. Dev and prod behave identically; telemetry is enabled
   purely via env config, zero code differences.

Example stdout line:

```
2026-09-23T12:32:07.412Z info  trace=4bf92f3577b34da6a3ce929d0e0e4736 span=00f067aa0ba902b7 [startup] NATS 2.14.3 connected
```

## Research summary (decisions behind the design)

- **console.log is synchronous/locking** — under traffic it stalls the event
  loop. Confirmed motivation for an async writer (user requirement).
- **pino on Bun is not a win**: Node-stream transports measurably slower on
  Bun (oven-sh/bun#6355), `pino.transport()` worker targets break under
  `Bun.build` without `bun-plugin-pino`. A small in-house writer avoids the
  whole class of problems and gives us trace_id stamping for free.
- **`Bun.otel` / `Bun.telemetry` native OTel is NOT released** — still open
  PRs (#39965, #28968, #23798, as of Sept 2026). Cannot be relied upon.
  `@opentelemetry/api` + `context-async-hooks` DO work on Bun (Bun supports
  `node:async_hooks` AsyncLocalStorage).
- **Node**: `@opentelemetry/sdk-node` 0.222 + auto-instrumentations is the
  standard programmatic setup (no `--import` flag needed — important since
  Bun can't do preload flags anyway; programmatic init = same code path both
  runtimes).
- **NATS propagation**: nats.js supports message headers (`headers()`,
  `MsgHdrs`). W3C `traceparent`/`tracestate` can be injected/extracted via
  `propagation.inject/extract` with a small `TextMapCarrier` adapter — this is
  the community-standard pattern (same approach as nats.go + otel contrib).
- **Log correlation**: stamping `trace_id`/`span_id`/`trace_flags` into log
  lines is exactly what `@opentelemetry/instrumentation-pino` does for pino;
  we replicate it in our logger via `trace.getSpanContext(context.active())`.
- **OTLP is THE vendor-neutral standard**: APM/SIEM vendors (Datadog,
  Grafana, Elastic, Splunk…) all ingest OTLP. We expose, they collect —
  no product changes needed to gain insights. Endpoint/headers come from
  `config_entries` (DB), not env files — only `DATABASE_URL` stays env.

## Design

### Part 1 — Async logger (`@primebrick/sdk`)

New file: `primebrick-v3-sdk/src/lifecycle/logger.ts`

**Core**: a buffered writer — `logger.info/warn/error/debug(msg, meta?)`
formats a line and pushes it to an in-memory buffer; a scheduled flush
(microtask + short interval, e.g. `setTimeout(0)`/`setImmediate` batching,
whichever benchmarks best) joins buffered lines and issues **one**
`process.stdout.write` (Node) or `Bun.write(Bun.stdout, chunk)` (Bun)
per batch. Errors go to the stderr writer. Characteristics:

- **Non-blocking**: callers never await I/O. Backpressure respected via
  `writableNeedDrain`/drain events (Node); Bun writes are already async.
- **Runtime detection**: `typeof Bun !== "undefined"` selects the writer.
- **Line format** (single line, human + grep friendly):
  `<iso-ts> <level> [trace=<id> span=<id>] <message> <meta-json>`
- **Optional NDJSON**: `LOG_FORMAT=json` emits
  `{"time":..., "level":..., "msg":..., "trace_id":..., "span_id":...,
    "service":..., ...meta}` — for SIEM pipelines that parse JSON.
  Default `pretty`. Env-var only, same code everywhere.
- **Trace stamping**: on each call, read
  `trace.getSpanContext(context.active())` — if valid, include
  `trace_id`, `span_id`, `trace_flags`. No OTel running → fields omitted,
  zero overhead.
- **console bridge** (`installConsoleBridge()`): rebinds
  `console.log/info/warn/error/debug` to the async logger so ALL existing
  call sites across BE/SDK/US instantly get timestamp + trace_id + async
  writes. Idempotent; `LOG_BRIDGE=false` opts out.
  ⚠️ Must NOT be installed under vitest (vitest intercepts console for
  test output) → skip when `process.env.VITEST` is set.
- **Graceful flush**: synchronous best-effort flush registered with the
  existing SDK `graceful-shutdown` so buffered lines aren't lost on exit.

API surface:

```ts
export const logger: {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
};
export function installConsoleBridge(): void;
export function flushLogsSync(): void;  // for shutdown hook
```

### Part 2 — OpenTelemetry init (`@primebrick/sdk`)

New file: `primebrick-v3-sdk/src/telemetry/otel.ts`

`initTelemetry(config, serviceName, serviceVersion)` +
`restartTelemetry(config)` — programmatic OTel pipeline build with
hot-swap support (see "Live reload" below), where **`config` comes from
the DB `config_entries` table via the existing `ConfigLoader`** (no env
files except `DATABASE_URL`):

- `resourceFromAttributes` with `service.name`, `service.version`.
- Trace exporter: `OTLPTraceExporter` (HTTP/proto) configured with the
  endpoint/headers/sampler values read from config rows.
- `BatchSpanProcessor` (prod-grade, non-blocking export).
- Logs: `LoggerProvider` + `BatchLogRecordProcessor` + OTLP logs exporter —
  our async logger also forwards each record as an OTel LogRecord
  (SIEM gets structured, trace-correlated logs).
- `telemetry_enabled=false` (config row) → `initTelemetry` no-op.
- Instrumentations (Node only — see Part 3):
  `getNodeAutoInstrumentations` with `instrumentation-http` **disabled**
  (we do our own server span, avoiding double-spans), keeping
  `undici` (outbound fetch), `pg`, `ioredis`, `express` route spans.
- Registered into `graceful-shutdown` → `sdk.shutdown()` on exit.

New SDK deps (ALL pinned to fixed versions per repo rule):
`@opentelemetry/api`, `@opentelemetry/sdk-node`,
`@opentelemetry/auto-instrumentations-node`,
`@opentelemetry/exporter-trace-otlp-http`,
`@opentelemetry/exporter-logs-otlp-http`,
`@opentelemetry/sdk-logs`, `@opentelemetry/resources`,
`@opentelemetry/semantic-conventions`, `@opentelemetry/context-async-hooks`.

### Part 3 — Instrumentation per runtime

**Node (BE, `tsx watch` / `node dist`)**

- `initTelemetry()` called first in `primebrick-be-v3/src/index.ts`
  (side-effect-first import pattern, before other app imports).
- Server span: manual middleware in the shared SDK HTTP server (see below)
  OR rely on `instrumentation-http`+`express`. **Recommendation**: manual
  server span in shared code — identical span shape on Node and Bun,
  one implementation to maintain. Auto-instrumentations cover the *outbound*
  legs (undici fetch → `traceparent` injected automatically) and pg/redis.
- `traceparent` inbound: extracted by our server-span wrapper.

**Bun (microservices, `bun --hot`)**

- Same `initTelemetry()` — `sdk-node` works programmatically on Bun
  (Datadog documents this pattern); auto-instrumentations may be partially
  inert → we don't depend on them for correctness.
- HTTP server span: the SDK's `createHttpServer` gets a wrapper that, per
  request: `propagation.extract` from request headers →
  `tracer.startActiveSpan` with `http.server` semantic attrs (method,
  route pattern, status) → handler runs inside `context.with(span ctx)`.
  This is deterministic on both runtimes and needs no monkey-patching.
- Outbound `fetch`: SDK helper `fetchTraced(url, init)` (or a global fetch
  wrapper installed by initTelemetry on Bun) that `propagation.inject`s
  `traceparent` into request headers.
- Future: when `Bun.otel` ships natively, we can layer it under the same
  API — zero consumer changes.

**NATS (both runtimes)** — verified against `src/nats/nats-client.ts`:

- `NatsClient.publish(subject, data, hdrs?)` **already supports headers**
  (Record → `MsgHdrs` via `nats.headers()`). We add automatic
  `propagation.inject` of `traceparent`/`tracestate` inside it (merged
  with caller-supplied headers).
- `NatsClient.request(...)` currently passes **no headers** — must be
  extended to include the injected headers in `nc.request` options
  (nats.js `RequestOptions` supports `headers`; verify at impl, fallback:
  manual publish/subscribe on inbox).
- `subscribe` / `subscribeRequest` handlers: extract context from
  `msg.headers` and run the handler inside `context.with(parentCtx, …)`
  so every `logger.*` call in the handler stamps the parent's trace_id.

```ts
// publish/request path (inside NatsClient)
const hdrs = headers();
propagation.inject(context.active(), natsCarrier(hdrs));

// subscribe/handler path
const parentCtx = propagation.extract(context.active(), natsCarrier(msg.headers));
context.with(parentCtx, () => handler(data, msg));
```

`natsCarrier` = 15-line `TextMapCarrier` adapter over `MsgHdrs`
(get/set/keys — `MsgHdrsImpl` is a `Map<string, string[]>` wrapper,
verified in `core/src/headers.ts`). Result: BE publishes
`emailsender.send` → emailsender handler's logs + spans share the same
`trace_id` → end-to-end correlation across HTTP→NATS→service.

### Part 4 — Wiring

| Place | Change |
|---|---|
| `primebrick-v3-sdk/src/lifecycle/logger.ts` | new async logger + console bridge |
| `primebrick-v3-sdk/src/telemetry/otel.ts` | new `initTelemetry` + `natsCarrier` + fetch helper |
| `primebrick-v3-sdk/src/http/http-server.ts` | server-span wrapper (extract → span → context.with) |
| `primebrick-v3-sdk/src/nats/nats-client.ts` | inject on publish/request, extract on handlers |
| `primebrick-v3-sdk/src/lifecycle/graceful-shutdown.ts` | flush logs + `sdk.shutdown()` |
| `primebrick-v3-sdk/src/index.ts` | export logger + telemetry APIs |
| `primebrick-v3-sdk/src/microservice/create-microservice.ts` | `installConsoleBridge()` early; `initTelemetry(config, …)` right after ConfigLoader — all US get everything free |
| `primebrick-be-v3/src/index.ts` | bridge at top; `initTelemetry(config, …)` after pool/config load |
| `primebrick-be-v3` + `us-v3` `db-meta` | new config rows seeding (`telemetry_enabled`, `otel_*`, `log_*`) per Config Table standard |
| `primebrick-v3-sdk/package.json` | pinned OTel deps |
| Documentation | see dedicated section below |

## Documentation deliverables

### User-facing docs (`docs/user-guide/` — synced to docs.primebrick.dev)

| Repo | File | Change |
|---|---|---|
| `primebrick-v3-sdk` | `docs/user-guide/telemetry-logging.mdx` | **new page**: async logger API (`logger.info(msg, meta)`), console bridge, `LOG_FORMAT`/config rows, OTel architecture (proxy providers, hot-swap restart), NATS trace propagation, `fetchTraced`, config keys table, sample stdout output, SIEM/APM integration notes (bring-your-own collector) |
| `primebrick-v3-sdk` | `docs/user-guide/_order.json` | add `telemetry-logging` entry |
| `primebrick-v3-sdk` | `docs/user-guide/getting-started.mdx` | update bootstrap example: `installConsoleBridge` + `initTelemetry` usage |
| `primebrick-v3-sdk` | `docs/user-guide/http-server.mdx` | document the automatic server span (extract → span → context.with) and log correlation |
| `primebrick-v3-sdk` | `docs/user-guide/_extracted/api.json` | regenerate via `pnpm extract-docs` (logger + telemetry exports) |
| `primebrick-us-v3` | `docs/user-guide/*.mdx` | note that microservices get logging + telemetry automatically via `createMicroservice`; document config rows that control it |
| `primebrick-be-v3` | `docs/` | short section on observability config rows + where stdout trace_id appears |

### Agent-facing docs (repo-internal, not synced)

| Repo | File | Change |
|---|---|---|
| `primebrick-v3-sdk` | `AGENTS.md` | new "Logging & Telemetry" section: ALWAYS use `logger.*` (never `console.*` in new code), structured meta convention, trace-aware logging, config-in-DB rule reminder |
| `primebrick-be-v3` | `AGENTS.md` | same logging rule + "only `DATABASE_URL` is env; everything else `config_entries`" |
| `primebrick-us-v3` | `AGENTS.md` | same logging rule for microservice authors |
| all three | `.devin/rules/` | new `logging-telemetry.md` rule file codifying: no `console.*` in new code, no env config besides `DATABASE_URL`, use `logger.*` with snake_case meta fields, never log secrets/PII |
| `primebrick-workspace` | `ai-plans/console-timestamp-logging-plan.md` | this plan (already) |

### Mermaid diagrams (in `telemetry-logging.mdx`)

1. Trace flow: FE → BE HTTP span → NATS publish (traceparent) → US handler span → DB spans, with log lines stamped `trace_id` at each hop.
2. Config hot-swap sequence: config_entries write → subscribeSharedConfig → restartTelemetry → shutdown old processors (flush) → new provider → proxy delegate swap.

## Configuration source: BE-owned `config_entries` + shared-config channel

**Hard requirement**: no `.env`-style configuration for anything except
`DATABASE_URL` (single point of entry — everything else lives in the DB).

**Verified architecture** (from `src/config/shared-config.ts` and
`src/nats/nats-client.ts`):

- Storage: telemetry/logging settings are rows in the **BE's**
  `config_entries` table — **DECIDED: single point of configuration**.
  BE owns the rows, the FE admin UI edits them, and every microservice
  consumes them via `SharedConfig.telemetry`. NO per-service override
  in microservices' own config tables — explicitly out of scope.
- Distribution: the BE's `config.get` NATS responder
  (`subscribeSharedConfig`) returns a `SharedConfig` — today only
  `redis_url`. We extend the interface with a `telemetry` block;
  microservices fetch it at bootstrap via `fetchSharedConfig` (already
  called during `createMicroservice` for `redis_url`) and keep it
  refreshed via a new `config.changed` broadcast (see Live reload).

| `config_entries.key` | Type | Effect |
|---|---|---|
| `telemetry_enabled` | `boolean` | master switch — `false` → no OTel SDK start, zero overhead |
| `otel_exporter_otlp_endpoint` | `url` | collector base URL (e.g. `http://collector:4318`) |
| `otel_exporter_otlp_headers` | `json`/`secret` | auth headers map for the collector (API key etc.) |
| `otel_traces_sampler` | `badge` | `always_on` / `always_off` / `traceidratio` |
| `otel_traces_sampler_arg` | `number` | ratio when sampler = `traceidratio` |
| `log_format` | `badge` | `pretty` (default) / `json` (NDJSON for SIEM) |
| `log_bridge_console` | `boolean` | `false` → don't intercept `console.*` |
| `log_level` | `badge` | `debug` / `info` / `warn` / `error` |

Bootstrap ordering (chicken-and-egg: telemetry config lives in the DB):

- **Microservices** (`createMicroservice`): order becomes
  ENV validation (`DATABASE_URL` only) → `installConsoleBridge()` (early —
  timestamps work from the first log line) → DAL init → NATS connect →
  `fetchSharedConfig` (already in the bootstrap for `redis_url`) →
  `initTelemetry(sharedConfig.telemetry, …)` + subscribe `config.changed`
  → rest unchanged.
- **BE** (`src/index.ts`): install bridge at top (defaults: pretty, UTC);
  `initTelemetry` runs after `getPool()`/config load; config writes trigger
  local `restartTelemetry` + `config.changed` broadcast.
- **Live reload — full internal restart, NO process restart** — verified
  against the real code: `subscribeSharedConfig` is NOT a push channel,
  it's a NATS request/reply (`config.get`, `shared-config.ts`) where the
  BE serves a `SharedConfig` object (today: just `redis_url`) that
  microservices fetch once via `fetchSharedConfig`. There is no existing
  config-change broadcast. So we add one:

  1. **Extend `SharedConfig`** with a `telemetry` block
     (`{ enabled, otlp_endpoint, otlp_headers, sampler, sampler_arg,
     log_format, log_level }`) sourced from the BE's config store —
     telemetry config is **BE-owned and shared** (single point), not
     duplicated in each microservice's own `config_entries` schema.
  2. **New broadcast subject `config.changed`**: the BE publishes
     (fire-and-forget, `NatsClient.publish`) on every write to the
     relevant config rows — hook into the existing write path that
     already "invalidates and reloads the in-memory auth configuration
     cache" (config-entries router writes, per AGENTS.md).
  3. **Microservices**: after `fetchSharedConfig` at bootstrap they
     `NatsClient.subscribe("config.changed", …)` → re-fetch shared
     config → `restartTelemetry(newConfig)` + logger setting updates.
  4. **BE**: applies the change directly in its own write hook (it's the
     publisher — no self-message needed, though subscribing is also fine
     for a single code path).

  Implementation detail (the one real gotcha): `@opentelemetry/api` allows
  `setGlobalTracerProvider` / `setGlobalContextManager` /
  `setGlobalPropagator` **only once** — a second call is rejected. So:

  1. At first `initTelemetry`, we register the globals **once** through
     delegating proxies we own:
     - `ProxyTracerProvider` (exists in `@opentelemetry/api` as
       `ProxyTracerProvider`, or trivially implemented: a TracerProvider
       whose `getTracer` forwards to a swappable delegate),
     - `context-async-hooks` ContextManager + W3CTraceContext propagator —
       these have no per-config state, registered once and kept.
  2. On `restartTelemetry(cfg)`: `await oldProcessors.shutdown()` (flushes
     pending batches to the OLD endpoint) → build new `TracerProvider` /
     `LoggerProvider` / exporters with the NEW config → swap the delegate
     inside our proxy. New spans immediately use the new pipeline;
     instrumentations never re-register.
  3. `telemetry_enabled` toggling works the same way: disable → shutdown
     processors + swap delegate to `NoopTracerProvider`; enable → build +
     swap. Zero downtime, zero process restarts.
  4. Logger-side settings (`log_level`, `log_format`, `log_bridge_console`)
     are trivially hot-swappable — just module state in `logger.ts`.

  Edge cases to handle: debounce rapid successive `config.changed`
  broadcasts (single restart per batch), in-flight spans keep the old
  context until they end (correct — trace stays coherent), failed new
  exporter → keep old pipeline alive and `logger.error` the failure
  (fail-safe, never crash the service on a bad config value), and a
  `config.changed` arriving while a restart is in progress → serialize
  restarts through a simple promise queue.

Dev/prod parity: identical code path everywhere; behavior differs only by
DB config values. No collector shipped — the customer's APM/SIEM provides
the OTLP endpoint (vendor-neutral standard).

## Phased debt removal (follow-ups, not this iteration)

- Incrementally replace `console.*` call sites with `logger.*` + structured
  `meta` fields (better SIEM queries). Bridge keeps them working meanwhile.
- When `Bun.otel` releases: evaluate native spans under the same SDK API.
- Optional later: pino under the hood on Node if we ever need its transports
  — the logger API shields consumers.

## Verified facts (empirical check of this codebase)

- `createHttpServer` (`sdk/src/http/http-server.ts`) uses `node:http`
  `createServer` — our server-span wrapper goes in that single place,
  covering every microservice.
- `NatsClient.publish` already accepts `hdrs?: Record<string,string>`;
  `NatsClient.request` does NOT pass headers today → must be extended.
- `subscribeSharedConfig`/`fetchSharedConfig` = NATS `config.get`
  request/reply, one-shot at bootstrap — NOT a push channel. `config.changed`
  broadcast is net-new.
- Redis client is `redis@6.1.0` (node-redis), NOT ioredis.
- SDK has zero OTel deps today; `exports` map has only `.` and `./json` —
  a `./telemetry` subpath export must be added if we want the side-effect
  first-import pattern.
- BE startup logs before config load exist → bridge installs first with
  defaults (pretty, UTC), telemetry starts after config.

## Open verification items (check at implementation time)

1. `nc.request()` header support in nats.js 2.29 (`RequestOptions.headers`)
   — fallback: manual inbox request.
2. `@opentelemetry/instrumentation-redis` coverage of `redis@6` —
   officially targets v4 (`instrumentation-redis-4`); v5/v6 support is
   unclear → likely manual spans or skip (document decision).
3. `ProxyTracerProvider` exact export surface in `@opentelemetry/api`
   (exists as `trace.ProxyTracerProvider`; if not public, implement a
   20-line delegate wrapper).
4. Bun: `AsyncLocalStorage` correctness under `bun --hot` reload
   (documented as supported; verify empirically on emailsender).
5. `@opentelemetry/sdk-node` under Bun: `getNodeAutoInstrumentations`
   may partially fail — we gate it behind `typeof Bun === "undefined"`.
6. vitest + console bridge interplay (skip when `process.env.VITEST`).

## Acceptance criteria

1. `pnpm run dev` (BE) and `bun --hot` (emailsender): every log line shows
   `iso-utc level [trace=… span=…] msg`; lines are async-written.
2. HTTP request to BE → NATS request to emailsender: same `trace_id` in
   both services' stdout lines and in exported spans.
3. `telemetry_enabled=false` in `config_entries`: zero OTel overhead,
   logging still works.
4. With `otel_exporter_otlp_endpoint` set in `config_entries` pointing to
   any OTLP collector, traces arrive with correct `service.name` and
   parent-child links (HTTP span → NATS consumer span).
5. `log_format=json` produces valid NDJSON with `trace_id`/`span_id`.
   All settings come from `config_entries` — no env file is read except
   `DATABASE_URL`.
6. `pnpm run build` + `pnpm test` pass in SDK and BE (bridge skips vitest).
7. Graceful shutdown flushes pending log buffer and OTel batches.
8. All new deps pinned to fixed versions.
9. Docs: `telemetry-logging.mdx` page exists in SDK user-guide and is in
   `_order.json`; `pnpm extract-docs` regenerates `api.json` with the new
   exports; `AGENTS.md` (SDK, BE, US) + `.devin/rules/logging-telemetry.md`
   codify the "logger.* only, no console.*, config-in-DB" rules.
10. Updating any `otel_*`/`log_*` row in `config_entries` applies the new
   config to all running services **without restarting any process**:
   new spans/logs use the new pipeline within seconds of the write; a bad
   value leaves the previous pipeline running + an error log.
