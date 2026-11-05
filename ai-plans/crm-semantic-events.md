# CRM Semantic Events — Sales-Logic Event Boundary

> Extracted from `job-rules-callable-targets.md` task 11 (marked "separate step")
> when that plan was archived 2026-11-05. Domain: a job rule must be able to
> subscribe to a *semantic* business event (`crm.customer_high_value`), not raw
> CRUD facts. The CRM module owns the derivation — the scheduler stays a dumb
> trigger and CRUD code never learns sales logic.

## Status: ⚪ TODO — Plan date: 2026-11-05

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | crm: identify where sales logic lives (module/service, ownership boundary per module-ownership rules) — `crm` is a BE module today; decide if the event is BE-emitted or needs a dedicated crm microservice | ⏳ not done | — | pre-requisite: the `crm` service's `emits` must declare the event |
| 2 | crm: subscriber on `crm.customer_changed` (domain fact) that derives `customer_high_value` per sales thresholds → emits `crm.customer_high_value` — separate subscriber, NOT in CRUD code | ⏳ not done | — | the boundary: CRUD emits facts; sales logic listens and emits semantics |
| 3 | crm: declare `crm.customer_high_value` in `emits` + `payload_schema` (so the FE path-picker shows real source-event fields, not hand-typed JSONPath) | ⏳ not done | — | per job-rules-callable-targets §callable-census: emits entries gain optional payload_schema |
| 4 | verify end-to-end: a `job_rule` with `source=crm`, `event=customer_high_value`, `target_subject` from census.callables, `payload_map` DST fires correctly | ⏳ not done | — | acceptance flow in source plan |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Context (verbatim from source plan)

```
customer CRUD ──pub──> crm.customer_changed            [domain fact]
        │
        ▼  (separate subscriber — sales logic, NOT in CRUD code)
   emits crm.customer_high_value                        [semantic event, in `emits`]
        │
        ▼
   job_rule: source=crm event=customer_high_value
            filter=[...] schedule=@every …
            target_subject='emailsender.send'           [from census.callables]
            payload_map={templateCode:const, to:path,…} [DST on the row]
        │
        ▼  fire time — JH resolves map → publishes to emailsender.send
   emailsender handles it like ANY caller. It never saw a schedule.
```

Acceptance flow (from source plan): a rule created end-to-end in the form —
source `crm`, event `customer_high_value`, target `emailsender.send` picked from
the combo — proves the semantic-event → callable-target chain works.

NOTE: `emailsender` subjects will rename under
`emailsender-to-comm-engine-rename.md` — the payload_map keys in the example
(`templateCode`, `languageIso`, `to`, `entityUuid`, `entityTable`, `initiatedBy`)
are the CURRENT camelCase wire shape and must follow whatever that plan decides.
