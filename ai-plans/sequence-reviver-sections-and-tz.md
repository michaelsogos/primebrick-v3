# Sequence reviver — sezionale-owned periods, expire/switch lifecycle, `tz` kept (NOT NULL DEFAULT 'UTC')

> Continuation of `sequence-registry-columns-code-to-name.md` — the uuid-only
> identity TOC is shipped; this plan covers the TZ question and the missing
> auto-revive mechanism (one-row-per-period lifecycle).

## Status: ✅ ALL QUESTIONS RESOLVED — ready for TOC — Plan date: 2026-12-29

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | core: `SequenceDecl`/`SequenceBound` + `SequenceDirectiveContext` gain `tz`, sez defaults, revive fields; `derivePeriodLabel(prev_label, unit)` — parse-and-preserve the slot label format; grammar comment updated (date tokens = `at`, never ambient) | ✅ | 2026-12-30 | core `8f706e4` — 57/57 seq tests, 213 suite green; `SequenceBound` inherits via `SequenceDecl &` |
| 2 | dal: `SequenceEntity` new columns (binding_key, sez*, revive_*, expire_at, switch_at, default_from, revived_from); validators + OpenAPI + meta columns updated — `tz` stays (NOT NULL DEFAULT 'UTC' ✅ shipped) | ✅ | core `4f67ab1` (`reviveExpireAt`/`reviveAddInterval`/`SEZ_VALUE_RE`); dal `874d914` | dal 842/842 + validator 14/14; revive_every/grace stored varchar not interval — pg output normalizes ('3 months'→'3 mons') breaking the closed wire format |
| 3 | dal: binding resolution → `binding_key` + `default_from ≤ at` series lookup (replaces fixed detUuid); row-owned sez defaults merge into allocation ctx (owned slots immutable); `querySequence` spec widened | ✅ | dal `17dd172` | dal 847/847 — adoption/gen-pick/sez-merge covered in sequence-write-path (5 new tests) |
| 4 | dal: `sequenceRevive()` primitive — phase A create successors (aligned expire, sez_slot via `derivePeriodLabel`), phase B soft-delete switched rows; `SequencesService.revive` RPC + `sequence-revive` route | ✅ | dal `ae96cc2` | dal 852/852 — sequence-revive.test.ts 5/5 (successor, idempotent, switch, late chain catch-up→`#2026-04` serves binding, only_uuid scope) |
| 5 | sdk:  +  registration gating — callable  (queue per-replica, system lane), system trigger via , JH coordinates | ✅ | sdk `93897e2`; be `a40d16f`; us `93d5f67` (7 mount sites) | sdk 622/622; be+6us typecheck clean |
| 6 | us-crm: schema patch (new cols, binding_key backfill via SQL detUuid; `tz` NOT NULL/DEFAULT ✅ shipped) + i18n patch (new field labels) + signed manifest | ⏳ | — | |
| 7 | ui/fe: SequenceInput + settings sheet fields (revive config, sez; `tz` IANA combobox ✅ shipped), list meta columns, e2e: revive cycle (expire → successor → switch → new series emitted), grace semantics, `{yyyy}` UTC default | ⏳ | — | |
| 8 | docs: sequence dev-guide + generated docs regen (UTC default documented), api-reference, commits per repo | ⏳ | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## The feature — why it exists (user, 2026-12-30)

Invoice-style systems need **counter reset at period boundary AND counter
preservation**: the 2025 counter must stay inspectable forever ("quale era
il contatore del 2024") while the 2026 series starts fresh. The paradox is
resolved by **row duplication**: the period lives on the ROW as a sezionale
slot value; at expiry the job clones the row (new uuid → new counter
namespace → first claim returns `start`), increments the indicated sez
slot, and retires the old row — an atomic deactivate/activate flow where
the old counter's final value is frozen, auditable, never lost.

Example: `P:"TEST-{seq:6}/{sez}"`, `sez="26"`, `start=1` → emits
`TEST-999999/26` through 2026; at `expire_at` the successor appears with
`sez="27"` and `default_from=switch_at`; at `switch_at` the old row is
soft-deleted → emissions become `TEST-000001/27` on a fresh counter.

### The two period axes — `at` vs `sez` (orthogonal, never conflate)

**`at`** = the BUSINESS date carried by the write directive's context
(document date on the payload_map/field directive; `field-validation.ts:276`
`ctx.at` — defaults `now()` at claim). It feeds exactly two things:

1. `derivePeriodKey(period_kind, at, tz)` — the **counter-level** auto-roll
   that already exists: PK `(sequence_uuid, period_key, partition_key)`,
   first-claim-of-period creates the counter row atomically. A
   `{yyyy}`-pattern resets the counter every year ON THE SAME ROW.
2. Date/time token rendering — `{yyyy}`/`{yy}`/`{MM}`/`{dd}`/`{q}`/`{HH}`…
   render `dateParts(at, row.tz)` at emit time. They are DISPLAY of the
   business date, never a period assignment.

**`{sez}`/`{sez2}`/`{sez3}`** = positional partition slots — today
directive-supplied; with revive they gain **row-owned defaults** (the row
carries `sez="26"`). This is the REVIVE axis: `revive_slot` names which
slot the job increments. `partition_key` (used-slots tuple) already keeps
`{sez}` vs `{sez3}` namespaces disjoint.

A pattern may carry both axes — `FATT-{seq:6}-{sez}-{yyyy}`: `sez` is the
legal period (incremented at revive, row-owned), `yyyy` is the issue-year
of each document (renders `at`). Different semantics, both honest.

### `derivePeriodLabel` — the sez-increment spec (the piece that was missing)

The job must know **which slot** advances (`revive_slot` column) and **how
to render the next label** — parse-and-preserve on the current value:

| Current slot value | Grammar matched | Next label |
|---|---|---|
| `2026` | `YYYY` | `2027` |
| `26` | `YY` | `27` |
| `2026-Q1` | `YYYY-Qn` | `2026-Q2` (wrap→`2027-Q1`) |
| `2026-03` | `YYYY-MM` | `2026-04` (wrap→`2027-01`) |
| `03` | `MM` | `04` (wrap→`01`) |
| `2026-W14` | `YYYY-Wnn` | `2026-W15` (wrap by ISO weeks) |
| `2026-03-16` | `YYYY-MM-DD` | `2026-03-17` |

`revive_every` supplies the calendar UNIT (`year|quarter|month|week|day`);
`derivePeriodLabel` matches the value's shape and adds one unit. Shapes
incompatible with the unit (e.g. `sez="URGENT"` on a `year` revive) →
**construction error at create/update validation** — never a job-time
surprise. A `revive_every`-carrying row MUST have a parseable
`revive_slot` value; rows without `revive_every` keep free sez values.

### Counter reset — mechanism, not a write

The successor gets `uuid = detUuid("<binding_key>|<default_from ISO>")` →
its counter namespace is virgin → the first claim returns `start` (1 →
`TEST-000001/27`). No counter row is written, no `value=1` update exists —
reset is a consequence of identity. `revived_from` links the chain for
audit and for stale-uuid error detail.

---

## TIC findings (empirical — verified this session)

### The period_key model that exists today

`core/sequence.ts` already auto-rolls counters per date-token granularity:
`{yyyy}`→period_kind `year` → counter PK `(sequence_uuid, period_key, partition_key)`
gets a fresh row each year. **But it is counter-level only — the sequence ROW
never expires, never gets a successor, never leaves the registry.** The user's
model is row-level: one registry row per period, soft-delete of the retired
one, defaults re-pointed. Confirmed missing by construction.

`{sez}`/`{sez2}`/`{sez3}` — up to 3 positional slots confirmed (grammar
`sequence.ts:14`). Today their values come ONLY from the write directive ctx
(`validateSequencePartitions` throws when absent — no row-level default).

`at` (business date) already exists end-to-end: directive ctx
(`field-validation.ts:276`), `sequenceSpecFor` ctx, `allocateAndRender`,
forecast/setCounter/analyze RPCs. `tz` on the ROW feeds only `dateParts`
(render + `derivePeriodKey`) — nothing else consumes it.

### Binding = fixed detUuid, no series concept

`loadOrMaterializeBound` → `querySequence(uuid = detUuid(seed))` — ONE row for
the binding's whole life. The user's "trovare le entity mappate e sostituirle
ai default" has no mechanical equivalent yet: nothing can re-point a binding
because the binding IS the uuid. Introducing `binding_key` (series identity)
turns "rebind defaults" into a **resolution rule**, not a rewrite job — see
design below.

### Job infrastructure — exact template exists

`partition_maintenance` (`sdk/microservice/partition-maintenance-job.ts`):
`<svc>.X` callable mounted by `createMicroservice`, system trigger materialized
via `declareSystemJobs` → `jobs.ctl.triggers.materialize` → JH arms JetStream
`jobs.schedule.*` → due-forwarder republishes → owning service executes in its
own schema. Seed schedule user-editable on the trigger row. The reviver clones
this twin exactly (gated on the module owning sequences).

### Live data

`crm.sequences`: `customers.code` (bound, `CUST-{seq:5}`) + expr row + e2e
leftovers. **Zero patterns using `{sez}` or date tokens** — the semantics land
on a clean slate. `tz` is `'UTC'` on every row after the
`20261230120000` NOT NULL/DEFAULT patch (243 rows backfilled).

---

## Design (proposed — open questions at the end)

### 1. `sequences` schema changes

| Column | Type | Notes |
|---|---|---|
| `binding_key` | varchar(130) NULL | series identity: `<table>.<field>` for decl-bound rows, `<table>.<field>@expr_<hash>` for expr rows; NULL for operator rows. Backfilled where `uuid = detUuid(name)` via the SQL digest already proven in the re-key patch. |
| `sez`,`sez2`,`sez3` | varchar NULL | **row-owned section defaults** — fill the pattern's slots when the directive doesn't supply them. The period IS `sez="2026"` on the row. |
| `revive_every` | interval NULL | `'1 year'`, `'3 months'`, `'15 days'`, `'2 years'`, `'1 month'`, `'1 week'`. NULL = never revives. |
| `revive_grace` | interval DEFAULT `'0'` | **the overlap window**: how long the retired row stays alive (not soft-deleted) after `expire_at`, so documents whose business date `at` falls in the OLD period can still legally mint the old series. `grace=0` → expire and switch coincide, backdated minting impossible. |
| `revive_slot` | varchar DEFAULT `'sez'` | which sez slot the period label advances. Must be a slot the pattern uses AND whose value parses under `derivePeriodLabel` for the revive unit. |
| `expire_at` | timestamptz NULL | **immutable**, computed at create (see anchoring) — the PERIOD BOUNDARY on the `at` axis: successor's `default_from`, and the split point for backdated-vs-current resolution during grace. |
| `switch_at` | timestamptz NULL | `expire_at + revive_grace` — when the row is physically retired (phase-B soft-delete). Recomputed on `revive_grace` edits. |
| `default_from` | timestamptz NULL | when the row starts serving as the binding default — `created_at` for first rows, **predecessor's `expire_at`** for successors (the period boundary, NOT switch — at-routing needs the new row to claim new-period docs immediately). |
| `revived_from` | uuid NULL | chain link to the retired predecessor (job idempotency + audit navigation + stale-uuid detail). |
| `revived_at` | timestamptz NULL | when the revive actually ran — may be far after `expire_at` (late job); the honest record of WHEN. |
| `revived_by` | varchar NULL | who fired the revive — `system`/job actor today; column exists so a user-triggered revive RPC later is a data change, not a schema change. |
| `tz` | **KEPT** — `NOT NULL DEFAULT 'UTC'` | Q1 resolved 2026-12-30: the row owns the render zone (UTC default, overridable at create via IANA combobox). Decl/ctx `tz` stay resolve-time context. |

Wire: `revive_every`/`revive_grace` as text `'N unit'`
(`^\d+ (day|week|month|quarter|year)s?$` closed validator → PG interval);
`revive_slot` ∈ `sez|sez2|sez3`; `sez*` validated by `SEZ_VALUE_RE`;
`expire_at`/`switch_at`/`default_from`/`revived_from` **read-only served**
(never in write keys). `SEQUENCE_WRITE_KEYS` keeps `tz` (already shipped),
adds `sez|sez2|sez3|revive_every|revive_grace|revive_slot`.

### 2. `expire_at` anchoring

`expire_at = date_trunc(<largest unit of revive_every>, created_at) + revive_every`

- `'1 year'` created Jun-2026 → `2027-01-01` (calendar-aligned — the 2026
  series dies at year boundary)
- `'3 months'` → `date_trunc('quarter')` + 3mo
- `'1 month'` → 1st of next month
- `'15 days'` / `'1 week'` → `date_trunc('day')` + N — **rolling windows**
  (Q2 ✅ resolved 2026-12-30: rolling day-aligned, NOT calendar semimonth)
- `switch_at = expire_at + revive_grace` — computed same moment, immutable

Successors: `expire_at_successor = expire_at_predecessor + revive_every`
— **chain-aligned, never from now()** — a job that runs late produces the
same calendar the uninterrupted one would have.

### 3. Binding resolution → series lookup (`at`-aware — the grace semantics)

```
resolve binding `<table>.<field>` for directive.at (default now()):
  SELECT * FROM sequences
  WHERE binding_key = $seed
    AND deleted_at IS NULL
    AND default_from <= COALESCE(at, now())
  ORDER BY default_from DESC LIMIT 1
```

The split is on the BUSINESS date, not wall-clock — this is what makes
`revive_grace` meaningful:

- Doc with `at` in the old period (backdated invoice during grace) →
  successor's `default_from = expire_at` > `at` → **old row wins** →
  mints the old series. Exactly the Jan-15 case.
- Doc with `at` in the new period → successor wins immediately at
  `expire_at` — no dead window.
- After `switch_at` (phase-B): old row soft-deleted → a doc backdated
  past `expire_at` finds no candidate → `SequenceNotFound`. **Honest
  enforcement**: you cannot mint December numbers on a dead series in
  February — the grace window is the legal allowance, not an arbitrary
  fallback.
- If the job is down at expire: no successor exists → old still
  resolves → writes keep working (graceful degradation by construction).

`loadOrMaterializeBound` becomes: series lookup → miss → materialize
`detUuid(seed)` first row (operator-managed rows keep winning via ON
CONFLICT + operator `binding_key` is authoritative). Successor uuids:
`detUuid("<seed>|<default_from ISO>")` — deterministic, ON CONFLICT makes
job re-fires idempotent.

### 4. Row-owned sez defaults + merge rules

Resolved partitions = `{row.sez, row.sez2, row.sez3}` ∪ directive ctx:
- **row-owned slots are immutable** — directive supplying an owned slot with
  a different value → `ValidationError` (same value tolerated)
- non-owned slots: directive supplies freely
- create-time: row `sez*` values must be exactly the pattern's used slots
  (a `sez2` the pattern ignores is a mis-key → reject); when `revive_every`
  is set, `revive_slot`'s value MUST parse under `derivePeriodLabel` for
  the unit — unparseable = construction error at create, not job-time

`INV-{sez}-{seq:6}` + `sez="2026"` → renders `INV-2026-000001`, counter
partition_key `"2026\x1f\x1f"` — the year IS the partition, exactly the
user's model.

### 5. `sequenceRevive()` — the job's two phases

Phase A (`expire_at <= now`, no successor with `revived_from = uuid`,
not deleted): insert successor — same pattern/step/start/
description_key/revive_*/binding_key; `revive_slot` value ←
`derivePeriodLabel(prev_value, revive_unit)` (see spec table above);
name ← name convention (below); `expire_at`/`switch_at`/`default_from`
chained; `revived_from`/`revived_at`/`revived_by` = old uuid / now /
job actor; new counter implicitly starts at `start` (new uuid → new
counter namespace — reset by identity, never a counter write).

Phase B (`switch_at <= now`, successor exists, not deleted): soft-delete
via entity service (audited).

#### Successor `name` convention (Q4 resolved 2026-12-30)

`#` is the splitter — the convention suffix carries the row's own sez
values, self-documenting the period:

```
base      = name with a trailing "#<SEZ-charset>" suffix stripped
            ("/#[A-Za-z0-9_.\-/]*$/" — SEZ_VALUE_RE charset)
name_next = base + "#" + usedSlotValues.join("-")
```

- `MySeq` → first revive → `MySeq#27` (sez 26→27) → next → `MySeq#28`.
- Multi-slot `sez="2026" sez2="Q1"` → `MySeq#2027-Q1`.
- The base name is whatever the decl/user authored (`name` required in
  the decl) and stays user-editable — the convention regenerates only
  the suffix at each revive; a user rename between revives becomes the
  new base. Requires ≥1 used sez slot — a revive row always has one
  (`revive_slot` must be a used slot).
- Alternative `#N` self-increment counter was rejected by the user in
  favor of the sez-derived suffix — no separate counter state, the
  period documents itself.

### 6. Job mounting — partition_maintenance twin (anatomy verified)

Exact clone of `sdk/microservice/partition-maintenance-job.ts` — every
piece of the user's requested shape already exists:

- **dal owns the logic**: `dal.makeSequenceReviveJob(registry)` →
  `{needed, run, i18nNs}` (dal.ts:780 pattern) — `run` calls
  `getDal().sequenceRevive()`; zero per-service code, every module
  owning `sequences` gets the reviver BY CONSTRUCTION.
- **sdk mounts once at registration**: `mountSequenceReviveJob` inside
  `createMicroservice` `deferredOnReady` (makeRunOnceInit) — callable
  `makeNatsRoutes({subject:"<svc>.sequence_revive", queue:svc,
  permissions:[]})` (work item, exactly one replica per fire, L1
  shield only) + `declareSystemJobs` → `jobs.ctl.triggers.materialize`
  → JH arms `jobs.schedule.*` → due lane fires back to the callable.
- **Needed-gate**: `options.sequenceRevive?.needed` — registry owns the
  `sequences` builtin decl → mounted; else nothing is declared
  (a trigger for a job that can't run is a lie).
- **Ownership split** (materialize contract): code owns
  `target_subject`/`run_as:"system"`/`event_subject`; user owns
  `schedule_spec`/`name`/enable — seed `*/15 * * * *`, user-editable,
  never resurrected after disable.
- **JH receives nothing new** — standard materialize→arm→due→result
  machinery; executions land on `jobs.result.<svc>.sequence_revive` +
  `job_runs` by construction.

Also a governed `sequence-revive` RPC on `SequencesService` (permission
`<ns>.sequence.revive.all`) — the callable and operators share the same
service method; tests invoke the RPC directly.

### 6b. Observability — who/what/when + missed runs (Q5 resolved 2026-12-30)

**Audit on the row**: `revived_from` (what preceded), `revived_at` (when
the revive ran — honest, may lag `expire_at`), `revived_by` (who —
`system`/job actor; the column exists so a future user-triggered revive
is data, not schema).

**Events already wired by construction** (the user's "emetti l'evento,
tanto nessuno ascolta" is literally the current architecture):

- Successor INSERT + old-row soft-delete go through the **entity
  service** → dal write path emits `events.<svc>.sequence.<uuid>` on the
  durable ENTITY_EVENTS JetStream — `emitted_by`/`emitted_at` in the
  envelope, before/after/delta in the payload. JH is the sole consumer;
  a `job_triggers` row can already react.
- The job's own executions land on `jobs.result.<svc>.sequence_revive`
  (governance tap) → `job.job_runs` rows with the closed status
  vocabulary `dispatched|succeeded|failed|lost|skipped` + `error_code`.

**Missed run ≠ blocked run** — a late job RESUMES, never halts. The
"should have fired but didn't" case is detectable **by construction**
today: `job.job_schedules.next_fire_at` (engine-maintained NATS mirror)
is overdue with no covering `job_runs` row. The detector + the LOG
INTERCEPTOR that escalates (mail/push) are a separate plan — JH owns
schedules+runs data; this plan's contract is only that emission lanes
(entity events, `jobs.result`, `job_runs`) carry enough signal for that
interceptor to consume later.

### 7. `tz` disposition — column KEPT, governed (Q1 resolved 2026-12-30)

User decision: the row owns the render zone — `NOT NULL DEFAULT 'UTC'`
(physical + served via `defaultSql`, same contract as `step`/`start`).
Date tokens render `at` in the row's zone, UTC by default; the static
year is `sez` (row-owned partition, not a date). The create surface picks
the zone from the closed `iana.tzones` vocabulary (`ComboSelect`, client
`Intl.supportedValuesOf("timeZone")`) — never free text.

Shipped this session (phase 1 — vocabulary autowire):
- core: `MetaColumnOptionsSource` gained `"iana.tzones"` (closed union
  member — client-side vocabulary, `allow_create` is a construction error)
- dal: `COLUMN_OPTIONS_SOURCES` + closed-vocab `allow_create` guard
  extended; `SequenceEntity.tz` → `nullable:false, defaultSql:"'UTC'"`;
  sequence decl column → `options_source:"iana.tzones"`; write path omits
  empty/absent `tz` (DB default fills, same as `step`/`start`)
- ui: `getIanaTimeZones()` extracted to `utils/iana-timezone.ts` — single
  source consumed by `date-wheel-picker` and the dispatcher
- fe: `FormFieldDispatcher` gained `iana_tz` (form, single) /
  `iana_tz_multi` (filter, IN semantics) controls + branches
- crm: patch `20261230120000_sequences_tz_not_null_default_utc` —
  NULL backfill → `SET DEFAULT 'UTC'` → `SET NOT NULL`; signed + applied
  (243 rows, `is_nullable=NO`, `column_default='UTC'`)
- e2e: `sequences.spec` asserts meta (`options_source`, `default:"UTC"`,
  no `allow_create`) + wire default (create without `tz` → `"UTC"`) — 2/2

Decl/ctx `tz` remain resolve-time context (unchanged); operator rows now
carry the same field the bound rows use — one source of truth for the
zone, stored once on the row.

### 8. Meta columns

Default-visible: `revive_every`, `expire_at` (definition data, same class
as step/start). Hidden-toggleable: `sez`,`sez2`,`sez3` (key-class),
`revive_grace`, `revive_slot`, `switch_at`, `default_from`, `revived_from`.
`tz` stays (definition data — combobox via `iana.tzones`, UTC default).

---

## Open questions — re-explained (why each exists + proposed solution)

1. **`tz` disposition** — ✅ RESOLVED 2026-12-30: column STAYS,
   `NOT NULL DEFAULT 'UTC'`, IANA combobox via `iana.tzones` (shipped).
2. **`'15 days'`/`'1 week'` anchoring** — ✅ RESOLVED 2026-12-30: rolling
   day-aligned windows (`date_trunc('day') + N`), NOT calendar semimonth.
3. **`{sez}` vs `{yyyy}` on revived rows** — ✅ RESOLVED 2026-12-30: the
   question was malformed — they are orthogonal axes, not alternatives.
   Revive increments the `revive_slot` SEZ slot (row-owned period);
   `{yyyy}` keeps rendering `at` (business date, row tz) on every row.
   Both may coexist in one pattern. See "The two period axes" above.

4. **Successor `name`** — ✅ RESOLVED 2026-12-30: `#` splitter
   convention — `base + "#" + usedSlotValues.join("-")`, regenerated each
   revive from the new slot values (see §5).
5. **Late job** — ✅ RESOLVED 2026-12-30: late jobs RESUME, never halt —
   current-period successor only, `revived_from` to the actual
   predecessor; `revived_at`/`revived_by` audit columns added; missed-run
   detection + log-interceptor escalation = separate plan, lanes already
   wired (see §6b).

### All resolved — 2026-12-30

6. **Pinned-uuid directives** — ✅ bare `SequenceNotFound` stays, ZERO
   new machinery. `revived_to` error detail rejected as overengineering:
   `revived_from` only points backward, so reverse lookup is new
   machinery for a rare ad-hoc surface. The chain stays navigable via
   served meta columns: filter `revived_from=<dead-uuid>` in the
   registry → the successor; `expire_at`/`switch_at`/`revived_*` explain
   why the pinned row is gone. NEVER auto-follow regardless — a pinned
   uuid means "that exact counter namespace"; silent re-pointing is
   stealth corruption. (The pinned case is a `SequenceDirective`
   surface — `{seq:{uuid:"…"}}` stored values / trigger ctx — NOT the
   declared field→seq map, which resolves through `binding_key` series
   and follows revives automatically.)
7. **Post-create mutability** — ✅ `revive_every`/`revive_slot`
   immutable (period contract = row identity, same class as `pattern`);
   `revive_grace` EDITABLE — only moves `switch_at`, recomputed on
   write; never materialized until expire.
8. **`binding_key` authority** — ✅ bound-only — written only by the
   system at binding materialize (decl / `@expr_<hash>`); never in
   `SEQUENCE_WRITE_KEYS`. A writable key would let a hand-made row
   claim `crm.customers.code` and win the resolution set — hijack by
   insert. Operator rows keep `NULL`, revive their own private chain
   via `revived_from`.
