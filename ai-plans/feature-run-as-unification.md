# Feature — `run_as` unification: execution_context + lane → one field, meaningful values

> Continuation of `schedule-lane-run-as-label.md` — user escalated scope:
> rename the FIELDS (not only labels) and give values logical meaning.
> Auto-TOC authorized in the same turn ("fase tic approfondita e poi toc
> in automatico").

## Status: 🟠 WIP — Plan date: 2026-11-14

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Entities: `job_trigger.execution_context`→`run_as` (len 20), `job_schedules.lane`→`run_as`, `job_runs.lane`→`run_as` + docs | ⏳ not done | — | |
| 2 | job.meta.ts: trigger `run_as` badge column (originator/author/system); add authored `run_as` badge columns on schedule + run (default_visible:false) | ⏳ not done | — | |
| 3 | Service code: triggers-engine laneAuth switch, schedule-service, run-recorder, due-forwarder, jobs.service FILTERABLE sets, nav-declaration form default `originator` | ⏳ not done | — | |
| 4 | v3-core `jobTriggerShapeIssues`: `run_as==="originator"` rule + closed-vocab issue; be-v3 patch renaming `user_context_requires_source` key + copy ×5 | ⏳ not done | — | |
| 5 | FE: EntityFormPage coerce originator→author + disabledBadgeValues + key; build-entity-form-schema `target_matches_lane` mapping | ⏳ not done | — | |
| 6 | DDL patch 0016: 3× RENAME COLUMN + trigger value migration (user→originator, me→author) + translation key renames/inserts ×7 | ⏳ not done | — | |
| 7 | Unit tests: trigger-shape, triggers-engine, schedule-service, run-recorder, due-forwarder, core field-validation, fe build-schema | ⏳ not done | — | |
| 8 | e2e: jobs-pages, elt-filters-parity, job-trigger-form-lifecycle, collaboration-form, form-draft | ⏳ not done | — | |
| 9 | Snapshots regen (db:check), docs/dev-guide/index.mdx, generated user-guide, live verify + commits | ⏳ not done | — | |

---

## Analysis (TIC findings, cited)

### The unified concept

`run_as` = **the identity the fire executes under**. Three entities carry
it today under two jargon names:

| Entity | Today | New field | Values today | New values |
|---|---|---|---|---|
| `job_trigger` | `execution_context` varchar(10) | `run_as` varchar(20) | `user\|me\|system` | `originator\|author\|system` |
| `job_schedule` | `lane` varchar(10) | `run_as` | `user\|system` | `user\|system` (unchanged) |
| `job_run` | `lane` varchar(10) | `run_as` | `user\|system` | `user\|system` (unchanged) |

Trigger values get semantic names:
- `originator` (was `user`) — the event originator's AuthUser rides the
  forwarded headers; requires an event source
- `author` (was `me`) — the trigger author's AuthUser, resolved via
  `auth.ctl.resolve_user` at dispatch time
- `system` — module privileges (unchanged)

Schedule/run values stay `user|system` — they mirror the **materialized
auth channel** (the due lane). `originator`/`author` both materialize as
`user` on the wire — the mirror honestly cannot distinguish them.

### Wire stays untouched

`jobs.due.<user|system>.<svc>.<action>` is the cross-service protocol —
`Lane = "user"|"system"` type and `lane` wire-internal names stay (they
literally name the subject segment). Only ENTITY fields/meta/translations
rename; trigger→lane mapping: `originator|author→user`, `system→system`.

### Touchpoints

**us-v3/job-handler** — entities ×3; `job.meta.ts:114` (badge column);
`jobs.service.ts:18-20` (FILTERABLE sets); `triggers-engine.ts:58,164-195`
(`laneAuth` switch on `trigger.run_as`); `schedule-service.ts:170,276`;
`run-recorder.ts:70-74,123`; `due-forwarder.ts` (insertRun param → entity
write); `nav-declaration.ts:43,48`; comments in `events-declaration.ts`,
`actions-route.ts`, entity docs; tests ×5; `db-meta/snapshot-*.json` regen.

**v3-core** — `field-validation.ts:639` (`entity.run_as === "originator"`,
issue path `run_as`, new closed-vocab check — today ANY string passes
server-side, an enforcement gap); `field-validation.test.ts`.

**be-v3** — `app.common.validation.user_context_requires_source` lives in
seed patches ×5 langs (en-GB, it-IT, fr-FR, es-ES, de-DE) → rename key to
`app.common.validation.originator_requires_source` + copy mentions
`"author"`/`"system"`.

**fe-v3** — `build-entity-form-schema.ts:75-89` (`target_matches_lane`:
`data.run_as` → wire `originator|author→user`); `EntityFormPage.svelte`
(`data.run_as==='originator'` → coerce `'author'`; `col.key==='run_as'`;
`disabledBadgeValues:['originator']`); `build-entity-form-schema.test.ts`.

**e2e** — `jobs-pages.spec.ts:267` (field key `run_as`);
`elt-filters-parity.spec.ts:90-96` (label /run.?as/i, values
System+Author); `job-trigger-form-lifecycle.spec.ts:124`;
`collaboration-form.spec.ts:65` + `form-draft.spec.ts:68`
(`run_as:"originator"`).

**Translations** (patch 0016, `job.translations`) —
- `job_trigger.fields.execution_context` → `fields.run_as`:
  en "Run As" · it "Eseguito Come" · fr "Exécuté En Tant Que" ·
  es "Ejecutado Como" · de "Ausführen Als" · pt "Executado Como"
- `job_trigger.hints.execution_context` + `_title` → `hints.run_as`/`_title`
  — rewrite copy (originator/author/system; drop the dead "must match the
  lane in the destination subject" — target is a census callable now)
- `job_trigger.status.user` → `status.originator`:
  en "Originator" · it "Origine" · fr "Origine" · es "Origen" ·
  de "Auslöser" · pt "Origem"
- `job_trigger.status.me` → `status.author`:
  en "Author" · it "Autore" · fr "Auteur" · es "Autor" · de "Autor" · pt "Autor"
- `job_schedule.fields.lane` + `job_run.fields.lane` → `fields.run_as`
  (same Run As family)
- INSERT `job_schedule.status.user`/`status.system` and
  `job_run.status.user`/`status.system` ×7 (badge vocab for the new
  authored columns — person labels: User/System, Utente/Sistema, …)
- Every UPDATE carries the audit triple (`updated_at`, `updated_by`,
  `version+1`) — the 0014 cache-bust lesson.

### DDL (patch 0016)

```sql
ALTER TABLE job.job_triggers RENAME COLUMN execution_context TO run_as;
ALTER TABLE job.job_triggers ALTER COLUMN run_as TYPE varchar(20);
UPDATE job.job_triggers SET run_as='originator' WHERE run_as='user';
UPDATE job.job_triggers SET run_as='author' WHERE run_as='me';
ALTER TABLE job.job_schedules RENAME COLUMN lane TO run_as;
ALTER TABLE job.job_runs RENAME COLUMN lane TO run_as;
```

## Acceptance criteria

- `run_as` is THE field name on all three entities — `execution_context`/
  `lane` gone from entity properties, served meta, translations, OpenAPI.
- Trigger form: "Run As" badge with Originator/Author/System; no event
  source → Originator disabled and coerced to Author.
- Closed vocab enforced server-side (`jobTriggerShapeIssues` rejects any
  `run_as` outside `originator|author|system`).
- Existing trigger rows migrated (user→originator, me→author); schedules/
  runs keep their wire-derived values.
- Wire `jobs.due.<user|system>` untouched — declared schedules keep
  dispatching on their existing lane.
- All unit tests + e2e green live; `db:check` snapshot regenerated;
  dev-guide + generated user-guide reflect the new vocabulary.
- Breaking-change accepted by user: saved column prefs keyed
  `execution_context` orphan (documented, no migration).
