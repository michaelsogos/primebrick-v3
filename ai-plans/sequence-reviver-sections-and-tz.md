# Sequence reviver — sezionale-owned periods, expire/switch lifecycle, `tz` kept (NOT NULL DEFAULT 'UTC')

> Continuation of `sequence-registry-columns-code-to-name.md` — the uuid-only
> identity TOC is shipped; this plan covers the TZ question and the missing
> auto-revive mechanism (one-row-per-period lifecycle).

## Status: ⚪ TODO — Plan date: 2026-12-29

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | core: `SequenceDecl`/`SequenceBound` + `SequenceDirectiveContext` gain `tz`, sez defaults, revive fields; `derivePeriodLabel` for revive slots; grammar comment updated (date tokens = `at`, never ambient) | ⏳ | — | |
| 2 | dal: `SequenceEntity` new columns (binding_key, sez*, revive_*, expire_at, switch_at, default_from, revived_from); validators + OpenAPI + meta columns updated — `tz` stays (NOT NULL DEFAULT 'UTC' ✅ shipped) | ⏳ | — | |
| 3 | dal: binding resolution → `binding_key` + `default_from ≤ now()` series lookup (replaces fixed detUuid); row-owned sez defaults merge into allocation ctx (owned slots immutable); `querySequence` spec widened | ⏳ | — | |
| 4 | dal: `sequenceRevive()` primitive — phase A create successors (detUuid series\|period, aligned expire, sez advanced), phase B soft-delete switched rows; `SequencesService.revive` RPC + `sequence-revive` route | ⏳ | — | |
| 5 | sdk: `mountSequenceReviveJob` — `<svc>.sequence_revive` callable + system trigger (partition_maintenance twin); `createMicroservice` wiring gated on sequence registry | ⏳ | — | |
| 6 | us-crm: schema patch (new cols, binding_key backfill via SQL detUuid; `tz` NOT NULL/DEFAULT ✅ shipped) + i18n patch (new field labels) + signed manifest | ⏳ | — | |
| 7 | ui/fe: SequenceInput + settings sheet fields (revive config, sez; `tz` IANA combobox ✅ shipped), list meta columns, e2e: revive cycle (expire → successor → switch → new series emitted), grace semantics, `{YYYY}` UTC default | ⏳ | — | |
| 8 | docs: sequence dev-guide + generated docs regen (UTC default documented), api-reference, commits per repo | ⏳ | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

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
`sequence.ts:13`). Today their values come ONLY from the write directive ctx
(`validateSequencePartitions` throws when absent — no row-level default).

`at` (business date) already exists end-to-end: directive ctx
(`field-validation.ts:275`), `sequenceSpecFor` ctx, `allocateAndRender`,
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
| `sez`,`sez2`,`sez3` | varchar NULL | **row-owned section defaults** — fill the pattern's slots when the directive doesn't supply them. The year IS `sez="2026"` on the row. |
| `revive_every` | interval NULL | `'1 year'`, `'3 months'`, `'15 days'`, `'2 years'`, `'1 month'`. NULL = never revives. |
| `revive_grace` | interval DEFAULT `'0'` | switch delay — the Jan-15 grace. |
| `revive_slot` | varchar DEFAULT `'sez'` | which sez slot the period label advances. Must be a slot the pattern uses. |
| `expire_at` | timestamptz NULL | **immutable**, computed at create (see anchoring). |
| `switch_at` | timestamptz NULL | `expire_at + revive_grace` — when the row stops being default and gets soft-deleted. |
| `default_from` | timestamptz NULL | when the row starts serving as the binding default — `created_at` for first rows, predecessor's `switch_at` for successors. |
| `revived_from` | uuid NULL | chain link to the retired predecessor (job idempotency + audit navigation + stale-uuid detail). |
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
- `'15 days'` → `date_trunc('day')` + 15d — **rolling 15-day windows**, NOT
  1st/16th semimonth (Q2 open)
- `switch_at = expire_at + revive_grace` — computed same moment, immutable

Successors: `expire_at_successor = expire_at_predecessor + revive_every`
— **chain-aligned, never from now()** — a job that runs late produces the
same calendar the uninterrupted one would have.

### 3. Binding resolution → series lookup

```
resolve binding `<table>.<field>`:
  SELECT * FROM sequences
  WHERE binding_key = $seed
    AND deleted_at IS NULL
    AND default_from <= now()
  ORDER BY default_from DESC LIMIT 1
```

- Before switch: successor's `default_from` > now → old row wins → **grace
  served by resolution** (Dec-dated invoices keep emitting the old series)
- At `switch_at` (job phase B): old row soft-deleted → new row wins
- If the job is down at expire: no successor exists → old still resolves →
  writes keep working (graceful degradation by construction)

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
  (a `sez2` the pattern ignores is a mis-key → reject)

`INV-{sez}-{seq:6}` + `sez="2026"` → renders `INV-2026-000001`, counter
partition_key `"2026\x1f\x1f"` — the year IS the partition, exactly the
user's model.

### 5. `sequenceRevive()` — the job's two phases

Phase A (`expire_at <= now`, no successor with `revived_from = uuid`,
not deleted): insert successor — same name/pattern/step/start/
description_key/revive_*/binding_key; `revive_slot` value ← period label
(year→`"2027"`, quarter→`"2027-Q1"`, month→`"2027-03"`, week→`"2027-W14"`,
day/smaller→`"2027-03-16"`); `expire_at`/`switch_at`/`default_from` chained;
`revived_from` = old uuid; new counter implicitly starts at `start`
(new uuid → new counter namespace).

Phase B (`switch_at <= now`, successor exists, not deleted): soft-delete
via entity service (audited).

### 6. Job mounting — partition_maintenance twin

`dal.makeSequenceReviveJob(registry)` → `{needed, run, i18nNs}`;
`sdk.mountSequenceReviveJob` mounts `<svc>.sequence_revive` callable +
system trigger (seed e.g. `*/15 * * * *`, user-editable). Needed-gate =
the module owns `sequences` (every module with the builtin decl →
reviver by construction, same "OGNI MODULO" contract).

Also a governed `sequence-revive` RPC on `SequencesService` (permission
`<ns>.sequence.revive.all`) — the callable and operators share the same
service method; tests invoke the RPC directly.

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

## Open questions for the user (resolve before TOC)

1. **`tz` disposition** — ✅ RESOLVED 2026-12-30: the column STAYS —
   `NOT NULL DEFAULT 'UTC'`, IANA combobox via the new `iana.tzones`
   vocabulary (phase 1 shipped this session). Decl/ctx `tz` remain
   resolve-time context.
2. **`'15 days'` anchoring** — rolling day-aligned windows (proposed) vs
   calendar semimonth (1st & 16th)? Same question for `'1 week'`.
3. **`{yyyy}` on a revived row** — allowed (renders `at`, independent of
   the sez period) or forbidden (double period semantics)? Proposal:
   allowed, documented.
4. **Successor `name`** — verbatim copy (registry shows the series under
   one name, old rows under deleted-filter) vs suffixed (`… (2027)`).
   Proposal: verbatim — `name` is display data, `sez`/uuid distinguish.
5. **Late job** — create only the CURRENT period's successor (skipping
   missed periods — their counters were never claimable anyway) vs full
   chain? Proposal: current-only, `revived_from` points at the actual
   predecessor.
6. **Stale explicit uuid** — `{seq:{uuid}}` on a soft-deleted row errors
   today; add `revived_to` in the error detail so callers can follow
   deliberately (no silent cross-uuid allocation — consistent with
   uuid-is-identity). Confirm.
7. **Revive config mutability** — `revive_every`/`revive_grace`/… editable
   post-create or immutable like `expire_at`? Proposal: immutable (the
   period contract is the row's identity; change → new sequence).
8. **Operator series** — should an operator row be allowed to SET
   `binding_key` (join a named series, resolvable via a future
   `{seq:{series}}` form) or is `binding_key` bound-only? Proposal:
   bound-only for now; operator rows revive their chain, callers follow
   via `revived_to`.
