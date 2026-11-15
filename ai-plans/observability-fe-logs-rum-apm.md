# FE Observability — OTel log capture, own APM dashboard, RUM session replay

> Goal: capture FE logs as OTel records consumable by APM/SIEM, build a
> lightweight in-product APM dashboard without new mandatory
> infrastructure (OpenSearch optional via docker profile), and add
> GDPR-configurable session replay (rrweb) linked to logs/errors so a bug
> can be replayed empirically in the FE.

## Existing foundations (verified — reuse, don't rebuild)

- **SDK `telemetry/otel.ts`**: `initTelemetry`/`restartTelemetry` (hot-swap
  via `ProxyTracerProvider`), OTLP HTTP exporters for traces AND logs,
  `setOtelLogSink` bridge (`logger.*` → OTel LogRecords with
  `context.active()` trace correlation), `fetchTraced`, NATS/HTTP W3C
  propagation.
- **BE `src/observability/`**: `telemetry.ts` reads `config_entries`
  (`telemetry_enabled`, `otel_exporter_otlp_endpoint`,
  `otel_exporter_otlp_headers`, `otel_traces_sampler[_arg]`, `log_format`,
  `log_level`), hot-restarts pipeline, broadcasts `config.changed` on NATS.
- **Config plane**: `config.changed` broadcast → microservices re-apply
  without restarts. FE can get its telemetry config via an existing
  config/bootstrap endpoint (add to the same payload).
- **FE**: NO logger standard (raw `console.*` + ad-hoc `[scope]` prefixes).
  SSE client already logs `[SSE] ...` via `console.info`.
- **Storage already present**: Postgres (primary), Redis (ephemeral).
  OpenSearch NOT present — optional add-on.

## Architecture

```
Browser ──logger──► batch/beacon ──► POST /api/v1/telemetry/logs (auth)
                                        │  (BE enriches: user, session,
                                        │   trace ids, service attrs)
                                        ▼
                              BE LoggerProvider (OTel logs)
                                        ▼
                              OTLP ──► otel-collector (optional, docker profile)
                                          ├──► OpenSearch (optional profile)
                                          └──► (BE keeps its own copy in
                                                Postgres telemetry_logs —
                                                zero-infra default path)
```

Key decision: **browser never talks to the collector directly**. The BE
ingest endpoint is auth'd, adds server-side context, and writes to both the
OTel pipeline (→ collector → SIEM/OpenSearch) and a local Postgres table.
OpenSearch becomes a pure read-performance add-on; the product works with
zero extra services.

## Part 1 — FE logger + ingest

### `src/lib/observability/` (new)

- `logger.ts` — `createLogger(scope)`:
  `{ debug, info, warn, error }(msg, meta?)`, emits `{ ts, level, scope,
  msg, meta, session_id, trace_id, span_id, url, route }`.
  - Console bridge: install once (AppShell mount) → mirror `console.*`
    into the logger (same approach as BE `logging-init.ts`).
  - Level filtering + sampling from telemetry config; `console.debug`-
    level off unless enabled.
- `session.ts` — `session_id` (crypto.randomUUID, per tab, sessionStorage)
  + rotating client `trace_id`/`span_id` (W3C format, no OTel-web dep —
  16/8-byte hex). New trace root per route change; child span per
  apiFetch/SSE connect.
- `transport.ts` — batch queue (flush every 5s / 20 records / on error,
  `navigator.sendBeacon` on `visibilitychange=hidden`/`pagehide`), ring
  buffer cap, offline drop.
- `api.ts` hook — inject `traceparent: 00-<trace_id>-<span_id>-01` into
  `apiFetch` + `createSseConnection` headers → end-to-end trace FE→BE→NATS.

### BE ingest

- `POST /api/v1/telemetry/logs` (auth'd, rate-limited, size-capped):
  validates `{ records[] }`, attaches `user_uuid`, `idp_org`, `service:
  "primebrick-fe"`, forwards each record into `logger` (which feeds the
  OTel sink → OTLP) AND bulk-inserts into `telemetry_logs`.
- New `config_entries` keys:
  `telemetry_fe_enabled` (gate FE emission entirely),
  `telemetry_fe_sample_rate` (0..1),
  `telemetry_fe_console_bridge` (mirror console.*),
  `telemetry_log_retention_days`.
- Table `telemetry_logs(id bigserial, ts timestamptz, level, scope, msg,
  meta jsonb, session_id uuid, trace_id, span_id, user_uuid, route, ua)`
  — partitioned/indexed on `ts`; retention job deletes old rows (reuse
  the stale-detection job pattern or a simple daily interval).

## Part 2 — APM dashboard (in-product, optional OpenSearch)

- New FE section `/system/observability` (settings module):
  - **Logs view**: filter by level/scope/session/trace/route/time-range;
    data from `GET /api/v1/telemetry/logs` (queries Postgres by default;
    when OpenSearch enabled, same endpoint queries OpenSearch — the FE
    doesn't care).
  - **Trace view**: click a `trace_id` → waterfall of FE spans +
    correlated BE spans (BE spans come from the OTLP pipeline; for the
    zero-infra path BE also persists a `telemetry_spans` table — optional
    flag, or v2).
  - **Session view**: group by `session_id` → chronological log replay
    list; entry point to the RUM replay (Part 3).
- Infra (optional): `infra/docker-compose.observability.yml` —
  `otel-collector` (OTLP/HTTP :4318 receiver, opensearch + debug
  exporters) + `opensearch` + `opensearch-dashboards` — all behind a
  `profiles: [observability]` flag so `docker compose up` stays light.
- `otel_exporter_otlp_endpoint` already exists → point it at the
  collector when the profile runs.

## Part 3 — RUM session replay (rrweb, GDPR-tunable)

- **Recorder**: `rrweb` (MIT, DOM-snapshot replay — the same engine behind
  Sentry/PostHog replays; NOT a real video → small, seekable, diff-based).
  Lazy `import('rrweb')` only when `rum_replay_enabled` — zero bundle cost
  otherwise.
- **Masking (GDPR)**, driven by `rum_mask_level`:
  - `none` — record as-is;
  - `inputs` — `maskAllInputs: true` (default);
  - `all` — `maskAllInputs` + `maskTextSelector: '*'`;
  - plus opt-out class `pb-private` (we can sprinkle on sensitive
    components: password fields, tokens, PII columns) and per-selector
    config `rum_mask_selectors` (JSON list).
  - Consent gate: `rum_require_consent` → recorder starts only after the
    user's privacy consent flag (existing consent flow if present;
    otherwise per-user opt-in stored in user_profile).
- **Transport**: rrweb event chunks → `POST /api/v1/telemetry/replay`
  (chunked append, session_id + seq; gzip body). Flush on hide/close via
  beacon. Cap: `rum_max_session_minutes`, stop conditions (logout, idle).
- **Storage**: `session_replays(id, session_id, user_uuid, started_at,
  ended_at, route_list, error_count, meta jsonb)` +
  `session_replay_chunks(session_id, seq, events jsonb)` in Postgres.
  Retention `rum_retention_days` — same deletion job as telemetry_logs.
- **Player**: `rrweb-player` embedded in the Observability dashboard
  session view. **Correlation**: every log record carries `session_id` +
  `ts`; the player seeks to `log.ts - replay.started_at` — click a log
  line → replay jumps to that moment; click a `pushNotification` error
  (console bridge records it with session_id) → "Watch replay" affordance.
- **Error linking**: errors surface `session_id` + `trace_id` in their
  meta → Bugs/ErrorsPanel entries can deep-link into the session view.

## Phasing

| Phase | Scope | Value |
|-------|-------|-------|
| 0 | `telemetry_logs` table + `POST /api/v1/telemetry/logs` + FE `createLogger` + session/trace ids + `traceparent` on apiFetch | FE logs queryable + end-to-end correlation NOW, zero infra |
| 1 | Console bridge + `/system/observability` logs view (Postgres) + retention job | In-product log search |
| 2 | `docker-compose.observability.yml` (collector + OpenSearch, profile-gated) + BE dual-write/switch for the query endpoint | Real SIEM/APM backend when wanted |
| 3 | rrweb recorder + `telemetry/replay` ingest + `session_replays` + player + log↔replay seek + masking/consent | Full RUM replay linked to bugs |
| 4 | Trace waterfall view (needs `telemetry_spans` or OTel query backend) | Full distributed tracing UI |

## Open decisions & doubts (resolve these first when we pick this up)

1. **FE logger API**: `createLogger(scope)` mirroring BE `logger`, or a
   single `logger` instance with `scope` meta field? Also: reuse the same
   LogLevel vocabulary (`debug|info|warn|error`).
2. **Replay storage**: Postgres JSONB chunks (proposed v1) vs files on
   disk vs S3 later. Doubt: chunk size & `sendBeacon` 64KB limit — may
   need periodic flush instead of beacon-only.
3. **Consent model**: existing privacy-consent flag? If none, add
   `user_profiles.telemetry_consent`? And does consent gate logs too or
   only replay?
4. **Trace waterfall**: persist BE spans into `telemetry_spans` (zero-infra)
   or only query OpenSearch when present? OTel Postgres exporter is
   community-grade — hand-rolled span insert may be simpler.
5. **Trace rotation granularity**: new trace root per route change vs per
   user action vs long-lived session trace. Affects waterfall readability.
6. **Sampling semantics**: `telemetry_fe_sample_rate` applies to sessions
   (all-or-nothing per session — better for replay correlation) or per
   record? Per-session proposed.
7. **Console bridge noise**: mirroring `console.*` captures third-party
   noise (Svelte warnings, lib logs) — allowlist scopes or capture all?
8. **`traceparent` on SSE**: `createSseConnection` headers — confirm the
   BE `createHttpServer` span accepts the parent context (it should via
   `extractTraceContext`, verify).
9. **Ingest auth**: the endpoint is auth'd — but logs before login (boot
   errors, login failures) would be dropped. Allow unauthenticated ingest
   with stricter rate-limit + no user context?
10. **PII in log meta**: masking rules for log attributes (never log
    tokens/passwords — BE rule 3 exists; need FE equivalent + a
    meta sanitizer?).
11. **Dashboard placement**: new settings tab under `/system/settings` or
    top-level `/system/observability` module? Permission gate needed.
12. **Replay vs dev**: should replay auto-disable in dev (`import.meta.env.DEV`)
    regardless of config?

## Verification

- `pnpm run check` + `test:unit` FE; BE unit tests for ingest validation.
- Manual: enable `telemetry_fe_enabled` → navigate → rows appear in
  `telemetry_logs` within ~5s; open dashboard session view.
- Replay: record a short session, open player, click an error log →
  player seeks to the error moment.
- GDPR: with `mask_level=all` no text content reaches the server.
