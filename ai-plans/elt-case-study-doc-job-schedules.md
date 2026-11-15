# Plan — ELT Case Study doc: job_schedule as the reference implementation

**Status**: pending — approved scope, file location proposed.
**Repos**: `primebrick-us-v3` (doc page), `primebrick-fe-v3` (cross-refs only).
**Original ask**: a doc that uses the schedules ELT as the running example of
*every* entity-class + entity-meta feature that produced a complex ELT — not a
generic schema reference (that already exists in `entity-metadata.mdx`).

---

## Why this doc exists

`job_schedule` is the richest declarative ELT in the system. Every advanced
meta feature in the platform is exercised by it — and most were *hardened by
it* (wire derivation, capability gating, reload UX all came out of adversarial
testing on this page). The doc answers: "I want to build an entity list that
does X — how does schedules do it, end to end?"

Per-feature format (the contract of every section):

```
DECLARATION   → entity/meta snippet (file:line citation, verbatim)
WIRE          → what the served meta / list response actually carries
CHROME        → what the FE renders from it (component + testid)
CONSUMPTION   → which ELT surface consumes it (toolbar/table/sheet/filter)
LOCK          → the test that keeps it true (spec file:line)
```

If a section can't fill all five rows, the feature is under-specified — that's
a finding, documented in a "Known gaps" section rather than smoothed over.

## Target file

`primebrick-us-v3/docs/dev-guide/elt-case-study-job-schedules.mdx`

Rationale: entity classes, meta declarations and service routes all live in
`job-handler/`; the doc is a service-developer doc (how to declare), not an
FE doc (how to render). FE `entity-list-table.mdx` links *to* it as the
canonical worked example. Sidebar: append to `_order.json` after
`adding-a-service` (it IS the advanced "what adding a service can produce").

## Structure

### 0. Baseline vs declarative — one table

`crm.customers` (near-autogen ELT: plain columns, default actions, no presets)
vs `job.job_schedule` (declarative advanced). One row per feature, "present /
absent" — establishes the vocabulary of what an ELT *can* do before the
per-feature deep dives.

### 1. Entity class → what it earns you

| Feature | Declaration | Why it matters for ELT |
|---|---|---|
| `Auditable(EntityBase)` mixin | `JobScheduleEntity extends Auditable(...)` | `created_by/updated_by` columns → searchable/filterable via derivation → filter panel audit options |
| `pgType` on persistence columns | `pgType: "uuid"` on `trigger_uuid` | pre-query typed validation → RFC 400 not PG 500 |
| calculated columns | `job_name` `COALESCE(jt.name, callable-tail)` | display_field on a computed value — list shows trigger name or callable tail, never raw uuid |
| `@Ref` display joins | `trigger_uuid_name` | label column without a FE lookup |
| NO `@AuditTrail` | (absent) | columns-audit present but no history table → `auditActors` capability still serves (the exact bug fixed by capability-gating — doc it as the canonical example of "columns ≠ history") |

### 2. Meta → wire → chrome (the core, ~15 features)

Each gets the five-row treatment:

- **`display_field: "job_name"`** — pin column identity + record sheet title
- **Column `order` band convention** — business 10-100, audited extras band
  2000-2030, canonical audit 2100+, `version` 2900 (declaration order == doc
  order == visual order — the renumbering we shipped)
- **`default_visible` / `hideable` / togglable** — `live` off by default,
  `disarmed_at` picker-only
- **Badges with `badge.values` vocab** — `kind`, `schedule_type`, `status`,
  `drift`, `run_as` (per-column color + label_key; `system` `#000000`)
- **`type: "ref"` + lazy-ref `ref.entity_field/key_field`** — `armed_by`
  badge→link→sheet; unresolved → graceful uuid fallback
- **`type: "sparkline" kind:"virtual"` + `sparkline.endpoint`** — ONE batch
  POST `/actions/job-run-stats` for all visible rows; bucket semantics
  (`lost`+`dispatched` counted — the anomaly we fixed)
- **`filter_presets` toolbar** — `schedule_kind` button_group owning
  `schedule_type`/`kind` fields; preset vs user filter composition
- **`type/format` wire formats** — `nats_subject`, `datetime` + 
  `datetime_iana_toggle` (record-vs-browser tz)
- **`icon`/`color` per column** — `zap`/`send` semantic icons
- **`audited: true` extras** — `fired_at`/`armed_at`/`disarmed_at` declared
  *inside* the audit band by convention, not via mixin
- **`actions_overrides`** — `delete`→Disable (exec-stop, confirm_key,
  busy_key), `restore`→Enable — same op, domain language
- **`reverse_ref`** — trigger→runs "view runs" drill-down
- **hidden infrastructure columns** — `service_code` (filterable, never shown)
- **route-level capabilities** — `auditActors` presence-gated route;
  entity capabilities `auditable`/`clonable` drive the router
- **`list` read-only surface** — mirror entity: no create/edit/delete routes,
  CTA hidden by served meta not FE hardcoding

### 3. List wire contract derived from this meta

The section that documents `deriveListWireSets` *by example*:

- searchable/filterable/sortable/deletable sets **from served meta**, not
  hand-authored arrays (the consolidation)
- `search_in` comma-join → DAL split → per-key strict 400
- `connector` top-level only (per-filter `connector` = wire-compat noise,
  ignored — documented as contract, not bug)
- typed filter values vs `pgType` → 400 pre-query
- `deleted_records` ∈ `EXCLUDED|ONLY|INCLUDED` (UI-mode names rejected)
- `PAGE_OUT_OF_RANGE` 400 + `extra{page,last_page,total}` + FE self-heal
- `page_size` ceiling: API ≤250, FE ≤100
- `options_source` vocab: `census.emits`, `census.callables`, `audit.actors`

### 4. The reload UX the page owns

KITT strip: `tick()`+2RAF render barrier, min-display ~250ms, reduced-motion —
one paragraph + link to `entity-list-table.mdx` (don't duplicate the FE doc).

### 5. Known gaps / intentional fallbacks

- `created_by` free-text vs `armed_ref_*` structured provenance vs `job_name`
  calc — three representations, deliberately divergent (documented semantics)
- `dispatched` runs real but transient (usually <1s in window)
- `job_run` `lost` visible in histogram, `dispatched` counted but rare
- drift `stale`/`missing` detection vs auto-heal boundary

## Process

1. **Inventory freeze** — enumerate every feature in `job.meta.ts` +
   `JobScheduleEntity`/`JobTriggerEntity`/`JobRunEntity` + the wire rules in
   `entity-service.ts`. Each gets file:line now (citations rot — write them).
2. **Draft the page** — five-row sections, English, Mermaid only if it earns
   it (probably one: declaration→meta→wire→chrome pipeline).
3. **`_order.json`** — append `elt-case-study-job-schedules`.
4. **Cross-link** — add a pointer in fe `entity-list-table.mdx` ("canonical
   worked example") and us `adding-a-service.mdx`.
5. **Verify** — every cited snippet re-read against current code; zero claims
   without a file:line or a test name. Commit.

## Explicitly NOT in scope

- Editing `entity-metadata.mdx` (generic schema ref — stays generic)
- user-guide docs (dev-guide only)
- Fixing any gap found — document it in §5 and report

## Deliverable

One MDX page + `_order.json` + 2 cross-links. ~250-350 lines of doc.
