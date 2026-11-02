# Generated-docs wiring for meta-pages — evidence + fix plan

**Status**: evidence collected, no fixes applied yet (user instruction: "solo evidenze").
**Collected**: 2026-11-02, on release branches (be 3.4.0, us 3.4.0, fe 3.3.0, sdk 3.3.0, dal 3.4.0, core 3.1.0, ui 3.1.0).

## Goal

Generated user-guide docs must cover service-owned meta-pages the same way they
cover BE-owned static pages today. Pilot target: `job_handler` `job_rule`
CREATE/EDIT/LIST (`/system/job/rules[/create|/{uuid}]`) — the first fully
metadata-driven form archetype (`FormPageLayout` + `page_props.form`).

## What works today (baseline)

`users.mdx` / `users-create.mdx` / `users-edit.mdx` regenerate correctly —
committed in `be@342dadf` during release 3.4.0. The render tracks live wiring:
the diff picked up the parent-sync change verbatim
(`"opens the create form in a new browser tab"` → `"in the same tab"`).

Pipeline (ai service, `primebrick-us-v3/ai/scripts/`):

```
docs-extract.ts  → AST on FE src/routes/(app)/**/+page.svelte → pages-all.json
docs-render.ts   → pages-all.json + BE *.meta.ts + DB translations → *.mdx
docs-generate.ts → extract + render + index-docs.ts (KB reindex)
```

## The 3-level wiring loss for `rules.*`

`git log --all -- docs/user-guide/generated/rules*.mdx` → **zero history**.
Render on release branch emits **no rules file at all**.

### Level 1 — extractor only sees static `+page.svelte`

`docs-extract.ts` walks `src/routes/(app)`. `system/job/rules/` contains only
the list `+page.svelte` (`EntityTablePage`). CREATE (`/system/job/rules/create`)
and EDIT (`/system/job/rules/{uuid}`) are **meta-pages** declared in
`job-handler/src/nav-declaration.ts` (`kind:"create"`, `kind:"detail"`,
`page_props.form: RULE_FORM`), mounted at runtime by the `/[...path]` catch-all
(`RemotePageMount` + `EntityFormPage` — see its extracted facts:
`remoteMount: true`). They have **no physical file** → invisible to extraction.

Extracted routes prove it: `/system/job/rules` has facts (list page),
`rules/create` and `rules/{uuid}` are absent from `pages-all.json` entirely.

### Level 2 — meta loader cannot evaluate service metas

`docs-render.ts:82-114` loads `*.meta.ts` via `transpileModule` + a
`localRequire` that returns `{}` for every non-relative import
(`@primebrick/*`, everything bare). This works for BE metas because they are
**pure literal objects** (`import type` only — e.g.
`be/src/modules/users/user-profiles.meta.ts`).

JH's `job.meta.ts` is **not** literal:

```ts
import { withColumnConstraints } from "@primebrick/dal-pg";      // → {}
import { JobRuleEntity, ... } from "../../domain/entities/registry.js";
export const jobRuleMeta: EntityMeta = withColumnConstraints({...}, JobRuleEntity);
```

`withColumnConstraints` resolves to `undefined` → eval throws → swallowed by
`catch {}` → `metaByEntity["job_rule"]` never registered → renderer treats the
entity as *foreign* and skips all its routes:

```
- /system/job/job-schedules (entity 'job_schedule' owned by another service)
- /system/job/rules        (entity 'job_rule' owned by another service)
- /system/job/runs         (entity 'job_run' owned by another service)
```

Verified empirically: `BE_DIR=<job-handler>` still skips them — the failure is
inside the loader, not the BE_DIR default. Cause: the architectural decision
*"physical constraints derive from entity classes"* broke the loader's
*"meta = pure literal object"* assumption.

### Level 3 — JH docs-pack carries no docs

`job-handler/scripts/build-docs-pack.ts` calls `buildDocsPack` **without**
`docsDir` → `dist/docs-pack` = 0 files + openapi only. JH has no
`docs/user-guide/` directory and no render step anywhere in its scripts.
The renderer's own comment assumes *"the OWNING service's own pipeline"* —
that pipeline does not exist for JH (or emailsender).

## Collateral anomalies found

| File/route | Evidence |
|---|---|
| `generated/[...path].mdx` | **Junk output**: the FE docs-viewer catch-all `/docs/[...path]` is rendered as a page titled *"[...path] List"* — slug collision on the dynamic segment. Left untracked (not committed). |
| `generated/customers.mdx` (be) | **Stale ghost**: `/crm/customers` now skipped as foreign (entity moved to crm), but the old BE copy still exists — never re-emitted, never cleaned. Live copy is `crm/docs/user-guide/generated/customers.mdx` (shipped via `docsDir`, proof the ownership model works). |
| `/system/settings/credentials`, `migrations`, `templates`, `translations` | "no extractable facts" — 4 settings pages silently lost (likely became config-list/dynamic pages the AST extractor can't see). |
| `providers`, `templates` (emailsender), `job-schedules`, `runs` | Same fate as `rules`: foreign in BE render + no render leg in owning service. |

## Coverage map (run 2026-11-02, BE pack)

- Emitted: `clients(-create,-edit)`, `configurations(-create)`, `modules(-edit)`,
  `organizations(-create,-edit)`, `profile`, `roles(-create,-edit)`,
  `users(-create,-edit)` — 18 files.
- Skipped `foreign`: customers, providers, email_templates, job_schedule,
  job_rule, job_run.
- Skipped `no facts`: `/`, `/dev/rc`, credentials, migrations, templates,
  translations, `/[...path]`.

## Fix plan (not started)

1. **Meta-page extraction (L1)**: teach `docs-extract` to read service
   `nav-declaration.ts` meta-pages (route, kind, entity, `page_props.form`)
   — or expose nav-meta via a build-time artifact the extract step can
   consume, so `rules/create` + `rules/{uuid}` produce real facts
   (`page_props.form` already contains field placement, `options_source`,
   constraints — richer than AST facts).
2. **Meta evaluation (L2)**: replace `localRequire` stubs with real module
   resolution (or import compiled meta via the service's own runtime — e.g.
   `bun -e "import('...job.meta.ts')"` prints the meta JSON), so
   `withColumnConstraints`-wrapped metas evaluate correctly in the owning
   service's context.
3. **Per-service render leg (L3)**: add `docsDir` to JH/emailsender
   `build-docs-pack` + a shared `generate-reference-docs`/`docs-render`
   invocation parameterized on the service (same pattern CRM uses
   accidentally via copied file — should be deliberate).
4. **Catch-all guard**: skip routes matching `/\[.*\]/` patterns in render
   (or render a proper "dynamic route" doc), preventing `[...path].mdx` junk.
5. **Ghost cleanup**: stale `customers.mdx` in BE generated/ — decide policy
   (auto-delete ghosts vs keep-and-warn; the ghost check already detects
   them).

## Verification target

After fix, `pnpm docs:generate` (or JH equivalent) must emit into JH's pack:

- `rules.mdx` — list page (entity `job_rule`, `EntityTablePage`)
- `rules-create.mdx` — fields from `RULE_FORM` in `page_props.form`:
  `event_subject` (options `census.emits`), `target_subject`
  (options `census.callables`), `filter` (json schema), `payload_map`,
  `schedule_spec`, `immediate` — with permission/op tables like users-create.
- `rules-edit.mdx` — same form, update mode (detail kind).

Acceptance: `git status` on JH docs shows the 3 files; no `[...path].mdx`
junk; `customers.mdx` ghost resolved.
