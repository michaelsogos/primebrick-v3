# Plan — Live job-chain E2E (`job-chain-live.spec.ts`)

**Status**: pending — TIC matrix designed, never executed into a spec.
**Repo**: `primebrick-fe-v3` (`src/e2e/`, `src/e2e/helpers/`) + fake-brevo.
**Original ask**: drive real jobs end-to-end — arm, fire, states, datetimes,
sync — hunting anomalies and architectural gaps that make jobs unstable. Not
UI-render assertions: empirical proof that the engine does what the docs say.

---

## Why this spec exists

Current job specs cover *surfaces* (form archetype, list presets, deletion
filters, CTA icons). None proves a declared trigger actually arms a schedule,
fires, produces `job_run` rows with coherent states and datetimes, updates the
sparkline, and stops cleanly. The drift anomalies (`stale`/`missing`),
`AUTH_ACTOR_UNRESOLVABLE`, silent `originator` refuse, and `skipped` runs are
all documented behaviors **never asserted**. This spec locks them.

**Serial spec**, `test.describe.configure({ mode: "serial" })`, one worker —
it owns the job domain while it runs (~4-5 min).

## Phase 0 — Harness (once, not a test)

| Piece | Implementation |
|---|---|
| NATS client | `@nats-io/transport-node` + `@nats-io/jetstream` `3.4.0` (pinned — same versions job-handler uses). `nats_url` read from `job.config_entries` via `helpers/db.ts` — no hardcoded URL |
| `helpers/nats.ts` | connect/drain, ext-json encode/decode (`json-bigint` — already in the tree via `@primebrick/core`), `jetstreamPublish(subject, payload, headers)` |
| `helpers/shield-identity.ts` | insert `primebrick-e2e` row into `system.client_shield_registry` in setup (schema verified at impl time), mint headers, drop in teardown |
| `helpers/job-chain.ts` | `declareTrigger(payload)` (POST `/entities/job_trigger`), `waitForSchedule(subject)`, `waitForRuns(scheduleUuid, n, timeout)`, `readScheduleState(uuid)` — all bounded `expect.poll` |
| Tap subscriber | subscribe `emailsender.send` + `emailsender.response.*`, record `{received_at, headers, payload}` per message |
| Seed | `e2e_probe` template in `emailsender.email_templates` — vars: `customer_name`(string), `big_id`(bigint), `score`(float), `event_at`(ISO), `customer_uuid`(uuid), `actor_mail`(email) |
| fake-brevo | add `received_at` to captured requests (missing today) |
| DB asserts | via `helpers/db.ts`: `job.job_triggers`, `job.job_schedule`, `job.job_runs`, `emailsender.sender_log` |

Dedicated lane discipline: all subjects/template codes prefixed
`e2e-chain`/`jobs.due.user.e2e.*` — never collides with other specs' fixtures.

## Phase 1 — Arm & fire nominal (~40s)

| Case | Setup | Assert |
|---|---|---|
| A1 interval | schedule-only `@every 10s` trigger, `run_as: author` | `armed_at` set, `status=armed`, `next_fire_mirror_at ≈ armed+10s`; ≥3 fires in 35s: `job_runs` `succeeded`, `fire_seq` strictly increasing, `fired_at` advancing |
| A2 one-shot | `@at now+3s` | fires once → run `succeeded`; **declaration self-purges** (contract: fires-at-once then tombstone); list drift resolves |
| A3 datetime coherence | per run | `created_at ≤ dispatched_at ≤ finished_at`; `duration_ms == finished-dispatched` (±); all timestamps UTC-sane |
| A4 sync | schedules list open during fires | `run_stats` sparkline bucket increments without manual reload; `next run` repaints |

## Phase 2 — Lifecycle (~40s)

| Case | Assert |
|---|---|
| `pause-schedule` | declaration **purged**, mirror `paused`; a `JobForwardEnvelope` force-published on `jobs.due.user.job.forward.<uuid>` while paused → run `skipped` w/ `error_detail:"suppressed: schedule status is paused"` (**deterministic skipped** — the only deterministic path) |
| `resume`/`enable` | re-arm → `armed_at` **overwritten**; post-resume histogram `expected` counts from NEW `armed_at`, not the first |
| `disable-schedule` on trigger | `job_triggers.deleted_at` set + `dropScheduleMirror`; tap sees zero messages for 15s (**anti-leak**) |
| `stop` on a run/schedule | `stopped` is temporary per doc — next matching event **re-arms** (gate doesn't block `stopped`) |

## Phase 3 — Failure & governance (~40s)

| Case | Assert |
|---|---|
| B1 `run_as:"system"` → `emailsender.send` | every fire: callable denies (permissioned, no user ctx) → run `failed` — governance holds |
| B2 `payload_map` → invalid payload (`to:[{const:"not-an-email"}]`) | `SendEmailSchema` parse fails → run `failed` with `error_code` |
| B3 `originator` + event **without** auth headers | **silent refuse**: no arm, no run (fail-closed) — assert the silence |
| B4 trigger authored by dedicated actor → **delete actor** mid-test | next fire: auth checkpoint resolves null → run `failed`, `error_code=AUTH_ACTOR_UNRESOLVABLE` |
| B5 `trigger.amount gt 100000` filter on `crm.customer_high_value` | publish below → no arm; above → arm |

## Phase 4 — Payload map & ext-json (~30s)

| Case | Assert (tap-decoded) |
|---|---|
| C1 full map | `$.customer.email`→`to[]` (auto-wrap), const→templateCode/languageIso, `inject:uuid`→`requestId` **fresh per fire** (two fires → different requestIds) |
| C2 `inject:session_actor`→`initiatedBy` | user lane: actor uuid present; system lane: field **omitted** (never invented) |
| C3 missing path → const fallback | fallback value arrives |
| C4 ext-json types | `big_id: 9007199254740993n` stays `bigint`, `score:99.5` float, uuid/ISO/nested intact through publish→decode→map→store→forward→republish |
| C5 sender_log | `interpolated_sent_message` contains rendered customer vars |

## Phase 5 — Drift & mirror truth (~30s)

| Case | Assert |
|---|---|
| D1 SQL `UPDATE job_schedule SET status='disarmed'` on armed | list → `drift=stale` AND the declaration **keeps firing** (tap confirms) — the documented danger proven live |
| D2 canonical `disable-schedule` | decl purged → drift resolves, coherence restored |
| D3 JS-side decl purge (`Nats-Schedule-Next:purge` replay) | mirror `armed` + decl absent → `drift=missing` |
| D4 `POST /actions/schedule-drift` | response enumerates drifting rows before heal |

## Phase 6 — Latency & histogram (transversal)

- `expected[k] = armed_at + k·10s` closed-form → compare per-fire:
  `tap_received_at` (wire), `job_run.created_at` (dispatch),
  `sender_log.sent_at` (exec), `brevo received_at` — report desync
  distribution, generous bound (<3s), real values logged in output
- `POST /actions/job-run-stats`: zero-filled buckets, `expected`/`missed`/
  `skipped` counts vs observed runs; `lost`+`dispatched` counted (regression
  lock for the fixed anomaly)

## Transversal leak/stall checks

- After pause/disable/delete: tap on `emailsender.send` sees **zero** for 15s
- `liveTriggers` eviction: disable→delete→publish on subject → no dispatch
- No duplicate `job_run` per fire_seq; monotonic sequence per schedule

## Declared out-of-scope (can't be forced without downtime)

- `lost` (5-min sweeper) and `maxDeliver:5` nak-loop — logic-covered, not runtime-forcible
- Auto-heal reconcile interval (default 5min) — detection live OK; heal out (or `reconcile_interval_ms=15s` config override as stretch)
- Bulk actions (`disarm-all`/`pause-all`) — would destroy other specs' fixtures
- Cron fire-wait — arm-only check

## Cleanup contract

Every fixture self-purges or is deleted in `afterAll`: triggers via API
(soft-delete), schedules disarmed, shield row dropped, template row removed.
A failed test must not leak armed declarations — `afterEach` sweep on
`e2e-chain%` subjects.

## Deliverables

- `pnpm add -D @nats-io/transport-node@3.4.0 @nats-io/jetstream@3.4.0`
- `src/e2e/helpers/{nats,shield-identity,job-chain}.ts` + fake-brevo `received_at` + template seed
- `src/e2e/job-chain-live.spec.ts` — 6 phases, serial, ~4-5min
- Findings: any anomaly that survives assertion is reported, not masked —
  each becomes either a fix-plan or a §gaps entry

## Risks / open points to resolve at impl time

- Shield header format — read `client_shield_registry` + verify logic in
  `triggers-engine.ts`/`due-forwarder.ts` before writing `shield-identity.ts`
- `nats_url` in dev — confirm reachable from host (services connect; the test
  runs host-side → needs the published port)
- `@at` self-purge is documented behavior — if it doesn't purge, that's a
  finding not a test fix
