# Guide docs pipeline — productization (generate → index → inspect at runtime)

> Continuation of `guide-procedural-knowledge-and-stage-fusion.md` — the MDX
> pattern/spec work lives there; this plan covers turning the today's
> manual dev scripts into project logic: build-time pre-generation,
> background startup reconcile, user-triggered runtime regeneration, and
> a docs-index admin page.

## Status: 🟠 WIP — Plan date: 2026-01-23 (session: docs pipeline productization) · updated 2026-10-09

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Move extractor+renderer into the repo as project code (not temp/) | ✅ done | 2026-10-09 | `us-v3/ai/scripts/docs-extract.ts` + `docs-render.ts` — paths parameterized (FE_DIR/BE_DIR/DATABASE_URL), default route scan added, `[uuid]`→`{uuid}` slug fix |
| 2 | Build-time pre-generation of MDX (CI / prebuild hook) | ✅ done | 2026-10-09 | `docs-generate.ts` orchestrator + `pnpm docs:generate` (extract→render→index); output to `v3-docs/pages/frontend/guide/manual` (committed) |
| 3 | Startup reconcile: hash-diff → incremental embed, background/async | ✅ done | 2026-10-09 | `index.ts` onReady → fire-and-forget `runEmbeddingPipeline`; `tsc` green |
| 4 | Full reinit path (model change / schema change / manual request) | ✅ done | 2026-10-09 | `runEmbeddingPipeline({full})` → `truncateDocsKb()` before the loop; `--full` on `index-docs.ts` and `docs-generate.ts`. Needed for vector-dimension/index changes (hash alone can't swap column width) + known-state recovery. `tsc` green |
| 5 | Runtime regeneration trigger (user-initiated only) | ⏳ not done | — | new module docs, tooltip change → regenerate + reindex on demand |
| 6 | Docs-index admin page (list, group by type, sizes, vector stats) | ⏳ not done | — | reuse /system/settings/ai or dedicated page |
| 7 | BE endpoints: docs index status, regenerate, reindex | ⏳ not done | — | controller→service, rbac declared |
| 8 | Verification tooling: doc↔chunk match check + search probe | ⏳ not done | — | SQL + endpoint, see Part E |

---

## Part 0 — How the pipeline works today (reference)

### Generation flow (manual, dev-machine only — NOT automated)

```
primebrick-fe-v3 +page.svelte AST
  └─ temp/extract-page-docs.mjs  →  temp/pages-all.json
        {fields, widgets, endpoints, navigations, composables,
         customActions, schemaVar, i18nKeys}  per route
temp/render-page-docs.mjs
  └─ inputs: pages-all.json + BE *.meta.ts (columns, actions_overrides)
    + BE *.router.ts scan (entityName/permissions/actionMiddlewares
      → capsByEntity, extraRoutes) + DB translations (en-GB)
  └─ output: temp/mdx-all/*.mdx → hand-copied into
     primebrick-v3-docs/pages/frontend/guide/manual/
primebrick-us-v3/ai/scripts/index-docs.ts
  └─ docs-loader → chunking → embedding-pipeline → docs_kb (pgvector)
```

Nothing runs automatically: no build hook, no startup reconcile, no
runtime regeneration. The user asked for exactly that (Part A–C).

### Sources of truth (decisions taken)

| Fact | Source | Rule |
|------|--------|------|
| Action availability | `meta.actions` via `deriveEntityActions` (BE route table) | Every standard op always present; `enabled:false` = route missing or `actions_overrides`. Status vocabulary is binary: ENABLED / DISABLED. `NOT OFFERED` was removed — EntityListTable self-wires delete/restore/audit (`useRowActions` calls the API internally); page handlers like `onDeleteRow` are dead code, never evidence. |
| Create/Update reachability | page `navigations` (goto/window.open/href) | Edit menu needs a page `onEditAction`; create button needs `onCreateAction` — only these two ops depend on page wiring. |
| Custom row actions | `meta.table.row_custom_actions` + `customActionHandlers` binding | Bound → ENABLED; unbound → DISABLED. |
| List columns | entity meta `columns` (+`audited` excluded) | Table + per-column digest bullet. |
| Form fields | page AST `fields` (zod required/constraints, `$state` on forms) | `$state` fields are real on create/edit, noise on list-kind pages — filtered by page kind. |
| Labels/tooltips | DB translations (page i18nKeys → entity fields → humanize fallback) | English only for generated MDX. |
| Cross-entity procedures | `RELATED` field map → `FIELD_LINKS` + `adminFlagOf` (boolean/badge column matching /admin/i on the related entity) | Drives `### How to grant admin rights…`. |
| Step-up auth | BE `actionMiddlewares` (requireMfaStepUp) | Appended as "(step-up authentication is required)". |

### MDX layout canon (aligned spec — enforced by renderer)

```
frontmatter (title/description/entity)
intro line (description)
## Pages routes            ← only place with page paths
## What you can do here    ← ALWAYS immediately after routes, all kinds
   ### How to <verb> <entity>   numbered steps, ≥2 steps, one action/step,
                                consequence on the last step
## Columns (list) / ## Fields (forms)   table + digest bullets
## Actions                 row/bulk (list) or form (Save/Cancel/custom)
## Doc references          only slugs that exist in the generated set
```

Step vocabulary (user-manual register — clicks and outcomes only, never
API paths, routes, or tab mechanics):

- create: `Click **New** in the toolbar.` → `Fill in the form — required: …`
  → `Click **Save** — the new {s} is created.`
- edit: `Open the row actions menu on the {s} and click **Edit**.` →
  `Update the fields — required: …` → `Click **Save** — the changes to the
  {s} are saved.`
- delete: `… click **Delete** (step-up authentication is required).` →
  `Confirm the deletion in the dialog — the {s} is soft-deleted and can be
  restored.`
- restore: `Set the deleted-records filter to **Deleted only** or **All
  records** to show recoverable records.` → `… click **Restore**.` →
  `Confirm in the dialog — the {s} is active again.`
- audit: `… click **Audit history**.` → `The version history of the {s}
  will appear on the right sheet panel.`
- custom: `… click **{Label}**.` → `{desc-derived step}`.
- grant: open-form step → `In **{Field}**, select a {rel} whose **{Flag}**
  flag is enabled…` → `Click **Save** — the {s} now has the permissions
  granted by the assigned {relPlural}.`
- First step is prefixed `On the **{List}** list page,` only when the
  procedure starts on a sibling page (form pages); bare imperative when it
  starts on the current page (list).

### Indexing flow and model

- Table: `docs_kb(repo, path, title, chunk_idx, content, embedding,
  metadata, content_hash)` — pgvector, 384-dim.
- Embedding provider: `@huggingface/transformers` —
  **`Xenova/paraphrase-multilingual-MiniLM-L12-v2`** (384-dim, 512-token
  max sequence). This model is the KB contract: a different model = a
  different vector space. `content_hash` covers
  `provider.name + embedding_input + metadata.links + entity`, so
  switching providers automatically re-embeds every chunk on the next run
  — no manual flag needed.
- Chunking: `chunkMarkdown` splits by headings; bullet lines are atomic
  chunks (that's why digests are bullets — retrieval-ready units).
- Contextual preamble (Anthropic-style, deterministic): each chunk is
  embedded as `Document: "title" (type) — entity — description` +
  `Section: heading` + content. `description` comes from frontmatter.
- Incremental reindex (current command):
  `DATABASE_URL=postgres://… npx tsx scripts/index-docs.ts`
  — unchanged chunks skipped by hash; stale chunk_idx deleted per doc;
  docs removed from disk are deleted from `docs_kb`.
- Full reinit today: `DELETE FROM docs_kb;` then run the indexer
  (provider change does NOT require this — hash mismatch re-embeds
  everything anyway).
- Verify doc↔vector match:
  `SELECT repo, path, COUNT(*) FROM docs_kb GROUP BY 1,2 ORDER BY 1,2;`
  compared against the loader's doc list; semantic check via the BE
  `docs-search` endpoint (`searchDocsKb` in be-v3
  `src/modules/system/docs-search-dal.ts`) with a query taken verbatim
  from a generated bullet — the chunk path must come back in top-k.

---

## Part A — Productize generation

**A1. Move the two scripts into the repo.** Candidate home:
`primebrick-us-v3/ai/scripts/` (they already consume BE sources + DB
translations read-only) or a small `docs-gen` module. Rules: read-only
inputs (FE pages, BE metas/routers, translations), deterministic output,
no LLM anywhere. The temp/ copies die once moved.

**A2. Build-time pre-generation.** Run `extract → render` in the build
pipeline (prebuild script or CI step) so a fresh checkout produces the
full `pages-all.json` + `mdx/` set without human steps. Output goes to
the docs source tree that the indexer reads (single source of truth —
kill the hand-copy step).

**A3. Startup reconcile (background, non-blocking).** On service start:
- load the generated corpus, compute per-doc hashes;
- diff vs `docs_kb` (new/changed docs → incremental embed; deleted docs →
  delete; provider/schema mismatch → full re-embed);
- run it `fire-and-forget` after readiness: the service serves
  immediately while indexing catches up; expose progress via the status
  endpoint (Part C).
- Decision rule incremental-vs-full: full only when provider name or
  embedding-input schema changed, or explicitly requested — everything
  else is incremental by `content_hash`.

**A4. Runtime regeneration — user-triggered only.** An explicit action
(e.g. after installing a module's docs or editing a tooltip) calls
`regenerate → reindex-incremental` for the affected scope. Never
automatic: no watchers, no DB triggers on translations — the admin
decides when the KB rebuilds.

## Part B — Docs-index admin page

Reuse `/system/settings/ai` if it fits its layout, else a dedicated page
(e.g. `/system/settings/docs-index`). Content:

- **Doc list** grouped by type: manual MDX, generated MDX, OpenAPI,
  other repos. Per doc: repo, path, title, chunk count, byte size,
  last content_hash change, staleness flag (on-disk hash ≠ indexed hash).
- **Aggregate stats**: total docs/chunks, total `pg_column_size(embedding)`
  vector footprint, embedding dimension, provider name, estimated token
  count per doc (chars/4 heuristic is fine), index coverage %.
- **Actions**: `Reindex now` (incremental), `Rebuild index` (full,
  confirm dialog — destructive), `Regenerate docs` (extract+render+
  reindex, confirm). All user-triggered; show last-run summary + progress
  while a background reconcile runs.

Backend endpoints (new controller + service, rbac declared):
- `GET /api/v1/ai/docs-index` → doc list + stats (SQL on `docs_kb` joined
  with on-disk manifest).
- `POST /api/v1/ai/docs-index/reindex` `{mode: incremental|full}` → starts
  background job, returns job id.
- `POST /api/v1/ai/docs-index/regenerate` `{scope?}` → runs extract+render
  then incremental index.
- `GET /api/v1/ai/docs-index/job/:id` → progress for the FE poll.

## Part C — Empirical acceptance

1. Fresh checkout → build produces `pages-all.json` + MDX set with zero
   manual steps.
2. Service start with empty `docs_kb` → full embed completes in
   background; service was ready before completion (measure readiness vs
   index-finish timestamps).
3. Edit one tooltip → trigger regenerate → only that doc's chunks are
   re-embedded (`chunks_embedded` ≈ that doc's chunk count; rest skipped).
4. Switch embedding provider → next reconcile re-embeds all (hash covers
   provider) without manual truncate.
5. Docs-index page shows real numbers matching
   `SELECT COUNT(*), pg_column_size …` on `docs_kb`.
6. Guide retrieval unchanged for unchanged docs (spot-check a known
   bullet → same path in top-k).

## Open questions

1. Host for the generator code: `us-v3/ai` (closest to the indexer) vs a
   shared `docs-gen` package? Leaning to us-v3/ai — single pipeline owner.
2. Build-time output location: generated MDX committed to `v3-docs` repo
   (traceable diffs) vs build artifact (never committed)? Committing keeps
   the "docs as code" review loop — recommend commit.
3. `/system/settings/ai` reuse vs dedicated page — inspect its layout
   before deciding.
4. Job runtime: in-process async (simple) vs NATS worker (survives
   restart)? Start in-process; move to worker only if reindex duration
   becomes a problem.
