# Guide — Procedural Knowledge nei Doc + Fusione Stage (S0→S1 / S3+S4)

> Continuation of the Smart Guide workstream (top-bar CTA, cerebellum loop
> S0–S4, E2E benchmark `ai-guide-quality.spec.ts` at 4.00/4.4 baseline —
> NEW baseline 4.00 score / rank 4.4, 5/5 pass after full-corpus MDX regen
> + reindex 2025-XX).
> Threads: (A) deterministic procedural knowledge generated into the MDX
> manual pages — DONE; (B) stage fusion — SUPERSEDED by Part C;
> (C) real model-driven agentic loop via native tool-calling.

## Status: 🟠 WIP — Plan date: 2025-XX-XX

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | A0–A4 — Procedural MDX generation, full corpus, publish, reindex, E2E baseline | ✅ done | — | 15 pages, 213 chunks re-embedded, score 4.00 / rank 4.4, 5/5 pass |
| 2 | B1/B2 — Stage fusion evaluation | 🚫 dropped | — | Micro-optimizations on an orchestrated-search loop; superseded by Part C |
| 3 | C0 — Spike: template `tools` render + tool_call emission probe | ✅ done | — | Template renders tools (Qwen XML dialect); CPU q4 emits valid calls AND completes the round-trip with `tool` messages |
| 4 | C1 — Tool registry: `docs_search`, `docs_fetch`, `list_routes` + BE `POST /system/docs/document` | ✅ done | — | docs_fetch = fetch-by-path DAL+service+route, 401 verified live |
| 5 | C2 — Agent loop in guide-loop replacing S0–S2 | ✅ done | — | Model-driven turns; premature-DONE reprompt (fp16 quirk); lazy-done seed-search guard; deterministic intent regex replaces S0 intent |
| 6 | C3 — Multi-dialect tool-call parser | ✅ done | — | Wrapped, bare `{name,arguments}` JSON, AND fp16 shorthand `docs_search "query"` — WebGPU emits the third form |
| 7 | C4 — Final-answer contract | ✅ done | — | Kept answer_markdown + separate S4 census selection (unchanged downstream, least risk) |
| 8 | C5 — E2E on agent loop | ✅ done | — | score 4.00 / rank 4.4, 5/5 pass — parity with orchestrated v1, now model-driven |
| 9 | C6 — Follow-ups: model never chains >1 tool on fp16; docs_fetch unused yet; evaluate stricter prompts or non-Coder Instruct variant for richer multi-hop | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped -->

---

## Part A — Procedural knowledge nei doc MDX

### Stato attuale (verified facts)

- `render-page-docs.mjs` already emits deterministic procedure content:
  - `## How to create` numbered steps on create pages (nav target, first
    required field, save → redirect).
  - Column semantic digest (each column restated as a sentence).
  - Actions capability census + per-action digest sentence with permission
    and step-up flags.
  - `## Doc references` cross-links (also consumed by graph expansion in
    `docs-search-dal.ts`).
- **Edit pages have NO procedure section** — only frontmatter, Pages routes,
  Fields table, Save/Cancel. (`roles-edit.mdx` is 34 lines, zero procedure.)
- **Cross-entity correlations exist in meta but are unused by the generator:**
  - `user_profile.columns[].roles` → field links to `role_mapping` (the
    `RELATED` map already knows `roles → roles`).
  - `role_mapping.columns[].is_admin` (badge "Admin") = the application-admin
    flag — the *actual* mechanism for "make a user admin".
  - `user_profile.columns[].is_admin` has tooltip
    `system.entities.user_profile.hints.is_admin` (WARNING priority) — the
    IDP-admin flag, explicitly documented as *not* granting app admin.
  - The deterministic cross-entity procedure is therefore derivable:
    "To grant application admin rights to user X: edit the user, assign a
    role whose Admin flag is enabled (roles-edit page)."
- Chunking (`us-v3/ai/src/services/chunking.ts`) is heading-aware; bullet
  lines are **atomic chunks**. Semantic bullet lists are the ideal vehicle:
  each bullet embeds as a standalone fact, retrievable on its own.
- Chunk metadata carries `heading_path` + frontmatter `entity` — already
  used by the S4 entity gate.

### Design

**A1 — `## How to edit` on edit pages.** Mirror of the create procedure:
steps from list page (open record) → change fields → Save (PUT/PATCH
endpoint named). Deterministic from `pg.navigations`, `pg.endpoints`,
`pg.fields`.

**A2 — Cross-entity procedures.** New generator section emitted on the
*target* page when a correlation pattern matches:

| Pattern detection | Procedure emitted |
|---|---|
| entity A page has field/column linking to entity B AND B has a boolean "flag" column (e.g. `is_admin`) | "How to grant &lt;flag&gt; to a &lt;A&gt;": go to A edit → assign B → (ensure B has flag on, link to B-edit) |
| entity A create page has a `send_invitation`-style toggle | "How to invite X" already implicit — extend |
| `row_custom_actions` on B targeting A-type rows | "From &lt;B list&gt; you can &lt;action&gt; a &lt;A&gt;" |

Vocabulary: controlled templates, `<entity_singular>`/labels from the same
i18n resolution already used for purpose lines. Emitted as `## Procedures`
with numbered steps + an atomic-bullet digest restating each procedure in
one sentence (`Making a user an administrator requires assigning them a
role whose Admin flag is on — see Edit Role Mapping.`). The bullet digest
is what retrieval actually keys on.

**A3 — "What you can do here" census.** Per list page, a `## What you can
do here` section that enumerates enabled ops as action sentences with the
route they lead to (`Create a new user → /system/settings/users/create`).
This gives S4 *and* S3 a verbatim grounding for CTAs, and gives retrieval a
chunk that literally contains "how do I do X on this entity".

**A4 — Pilot.** Regenerate only users/organizations/roles (+create/-edit
siblings), reindex `ai.docs_kb` for those paths, measure:

- Retrieval audit (`guide-retrieval-audit.mjs` + new golden intents:
  "make user admin", "invite user", "assign role", paraphrases IT/EN).
  Metric: golden chunk in top-4 / top-15.
- E2E benchmark T4: grounded answer (procedure steps present, no invented
  `is_admin=true` DB claims) + correct actions (`roles`/`users`, never
  `*/create`).
- Score must not regress on T1–T3, T5.

### Acceptance criteria (Part A)

- `users-edit.mdx`/`roles-edit.mdx` contain a `## How to …`/`## Procedures`
  section with numbered deterministic steps.
- Retrieval audit: "make admin" intent retrieves the procedure chunk in
  top-4 on ≥4/5 paraphrases.
- E2E T4 answer contains the documented procedure (role + Admin flag),
  not DB-level inventions.

---

## Part B — Stage fusion evaluation (empirical, flag-gated)

### B1 — S0+S1 merge hypothesis

Today S0 (~2s, 25–70 gen tokens) produces queries+keywords+lang+intent.
Observed instability: the longer few-shot prompt made S0 emit Spanish
queries on T5. Hypothesis: **the retrieval value of S0 queries may be
replaceable** — embed the raw question directly (it already works: T1 hits
came from query ≈ question) and let S2 generate follow-up queries (it
already does, with *better* information: it has seen the chunks).

Empirical test, no LLM needed:
- Extend `guide-retrieval-audit.mjs`: for each golden intent, compare
  top-4 recall of (a) embedding raw question, (b) embedding the S0 queries
  captured in the last E2E runs (have them in logs), (c) raw + one S2
  follow-up round.
- If (a) or (c) ≥ (b) on the golden set → S0 demoted to a lightweight
  intent+keywords extractor (or dropped entirely; intent moves to S2's JSON,
  keywords extracted deterministically from question+top-chunk terms).

Savings if merged: −1 generation round (~2s), −1 JSON parse failure mode,
no more query-language drift.

### B2 — S3+S4 merge hypothesis

Today: S3 emits `{answer_markdown, actions:[]}` (actions discarded by
contract), then S4 regenerates with candidates (~5s at ~13 t/s observed).
Merge variant: inject the grouped candidate list into the S3 system prompt
and let the single generation emit real `actions`, still validated against
the census (selection, not generation — validator unchanged).

Expected benefit: −1 round-trip (~4–5s per turn, ~25% of turn latency),
single KV-resident context.

Honest risks to measure (not assume):
- Candidate list (+6–15 routes ≈ +150–300 prompt tokens) may distract a 3B
  from excerpt grounding — measure keyword/source score on T1–T5 vs current.
- Model may pick `*/create` by salience again — the kind-grouped list +
  intent-aware wording must hold inside S3, not just S4.
- Answer-conditioned selection is actually *stronger* in merge: the model
  writes the answer and immediately picks routes consistent with it (no
  second-context misread). Could improve T4.

Experiment: `execution_config.fuse_s34: true` flag in the cerebellum →
guide-loop branches; same E2E spec, same 5 turns. Compare: total turn
latency, action correctness (off-census / wrong-kind count), answer score.

### Acceptance criteria (Part B)

- B1: offline recall table per intent × strategy; decision backed by
  numbers, not preference.
- B2: if fused variant shows equal-or-better action quality AND equal-or-
  better answer score with −1 round → adopt behind config; else document
  the measured regression and keep the split.

---

## Instrumentation already in place

- `[guide-loop]` stage logs (s0/s1/s2/s4 candidates+result) — console.
- `[ai-worker]` measure/gen_done — prompt tokens, gen tokens, tail.
- `[guide-resp]` / `[dom]` — parse + render verification.
- E2E `ai-guide-quality.spec.ts` persists `guide_test_score`.
- Offline harnesses in `temp/`: `guide-retrieval-audit.mjs` (golden set),
  `guide-loop-harness.mjs`, `guide-raw-harness.mjs` — run retrieval without
  the flaky browser path.

## Open questions for the user

1. Procedure language: docs are English; emit procedure sentences in EN
   (consistent with corpus) — S3 translates at answer time. OK?
2. A2 scope: pilot only `users ↔ role_mapping` (the admin case) or also
   `organizations`? I'd pilot the one correlation first.
3. B2 risk appetite: if merge saves ~5s but drops action precision by N%,
   what's the threshold that makes it still worth it?

---

## MDX pattern alignment — disparities found & aligned spec

### Disparities found (pain points)

1. **Section position**: `## What you can do here` is emitted after Actions
   on list pages but before Fields on form pages → different position per
   page kind.
2. **Step cardinality**: create/edit use 3 numbered steps; delete/restore/
   audit/custom actions were single-line sentences → inconsistent shape.
3. **Save-step tail inconsistent**: "created and its detail page opens"
   (WRONG — the form tab closes and the list refreshes) vs bare
   "Click **Save**." → no shared closing pattern.
4. **Location wording**: "toolbar above the table" vs "above the table"
   for different controls → imprecise AND inconsistent.
5. **Technical trivia in procedures**: API endpoints, route paths, tab
   mechanics — user-manual prose must describe clicks and outcomes only.
6. **Dead evidence**: `onDeleteRow`/`onRestoreRow` page handlers are dead
   code (EntityListTable self-wires) — page-source scanning produced false
   `NOT OFFERED`; meta.actions is the only source of truth.
7. **Minor**: action name casing in tables (`create` vs `Change Password`),
   Save permission unresolved on create pages (`—` vs `create.single`),
   row-digest still mentions "new browser tab".

### Aligned spec (target)

- `## What you can do here` always in the SAME position: immediately after
  `## Pages routes`, before Columns/Fields/Actions — every page kind.
- Every procedure is a `### How to <verb> <entity>` with numbered steps,
  minimum 2 steps; one action per step; consequence on the last step.
- Canonical step vocabulary:
  - open form: `On the **{List}** list page, ...` when the procedure starts
    on a sibling page; bare imperative when it starts on this page.
  - create: `1. Click **New** in the toolbar` → `2. Fill in the form —
    required: ...` → `3. Click **Save** — the new {s} is created.`
  - edit: `1. Open the row actions menu on the {s} and click **Edit**` →
    `2. Update the fields — required: ...` → `3. Click **Save** — the
    changes to the {s} are saved.`
  - delete: `1. ... click **Delete** (step-up authentication is required)`
    → `2. Confirm the deletion in the dialog — the {s} is soft-deleted and
    can be restored.`
  - restore: `1. Open the table filters and set the deletion-state filter
    to show deleted records.` → `2. ... click **Restore**` → `3. Confirm
    in the dialog — the {s} is active again.`
  - audit: `1. ... click **Audit history**` → `2. The version history of
    the {s} opens.`
  - custom action: `1. ... click **{Label}**` → `2. {desc-derived step}.`
  - grant (cross-entity): `1. {open/form step}` → `2. In **{Field}** ...`
    → `3. Click **Save** — the {s} now has the permissions granted by the
    assigned {relPlural}.`
- No API paths, no route mechanics, no tab mechanics anywhere in
  procedure steps. Routes stay only in `## Pages routes`.
- Status vocabulary is binary: ENABLED / DISABLED (meta.actions is the
  source of truth; NOT OFFERED removed).

---

## Part C — Real agentic loop via native tool-calling

### Why this replaces Part B

Part B was micro-optimizing an **orchestrated-search** pipeline: today WE
search (S1 runs deterministic embeds of S0/S2 queries) and the model only
*judges* truncated digests. The user's challenge is correct: that is not
how agentic/reasoning chat works. In the standard architecture the model
itself decides to look things up — it emits a **tool call**, the harness
executes it, the result goes back into the conversation, and the model
keeps calling tools until it decides it has enough to answer. The loop is
driven by the model, not by our stage graph.

### Verified facts (empirical, gathered this session)

- **The model supports tool-calling natively.** `tokenizer_config.json` of
  `onnx-community/Qwen2.5-Coder-3B-Instruct` contains a `chat_template`
  that renders a `tools` variable and knows the special tokens
  `\|tool_call\|` / `\|tool_response\|` (Qwen2.5 tool-call dialect, XML-
  style tags wrapping a JSON `{name, arguments}` object).
- **`eos_token` is `\|im_end\|`** and the worker already handles it:
  `STOP_STRINGS` includes `\|im_end\|`/`\|im_start\|`, `eos_ids` resolves
  the token id, `skip_special_tokens: true` strips tags from the stream.
  The EOS/chat-tag plumbing needed for multi-turn agent conversation is
  already in place (`ai-worker.ts:487-493, 502-514`).
- **`apply_chat_template` is the render path** (`ai-worker.ts:469-474`).
  transformers.js forwards extra kwargs (e.g. `tools`) to the Jinja
  template — the tool schemas are injected by the template itself in the
  system block, which is how the model was fine-tuned to see them. Needs a
  C0 spike to confirm on our exact build.
- **Current worker runs ONE generation per call.** The agent loop must
  live one level up (guide-loop / use-guide-ai) or the worker must gain a
  multi-round mode: generate → detect tool_call → run tool → append
  `{role:'tool', content}` message → generate again.
- **Tool turns must not stream to the UI.** `skip_special_tokens` hides
  the tag but not the JSON body — a tool-call turn would leak raw JSON
  into the answer bubble. Mitigation: don't attach the UI streamer to
  intermediate turns (only post `debug`/`phase` events like
  `Searching docs…`), stream only the turn that produces the answer.
- **Coder variant caveat.** Qwen2.5-**Coder**-3B-Instruct is the weakest
  Qwen2.5 variant on tool-calling (fine-tuned for code, not the full
  instruct tool corpus). C0 must measure real tool-call emission rate; if
  low, `onnx-community/Qwen2.5-3B-Instruct` (non-Coder, same template) is
  the drop-in alternative. Hermes-style "respond with a JSON action
  object" prompting is the model-agnostic fallback — same loop, textual
  convention instead of special tokens.

### Design — model-driven loop

```
messages = [system(GUIDE + tools rendered by template), user(question)]
loop (max 4 tool turns):
  raw = generate(messages)                      // non-streamed while calling tools
  if raw contains <tool_call> JSON:
    {name,args} = parse + validate against schema
    result = await TOOL[name](args)             // deterministic, no LLM
    messages += [assistant(raw incl. tool_call), {role:'tool', content: result}]
    continue
  else: answer = raw; break
```

**Tools (bounded schema, deterministic):**

| Tool | Args | Returns | Backed by |
|---|---|---|---|
| `docs_search` | `{query: string}` | top-N chunk digests + doc paths | existing `searchDocs` |
| `docs_fetch` | `{path: string}` | full doc body (the fetch-by-path the current arch lacks) | new endpoint / docs_kb lookup |
| `list_routes` | `{}` | app route census | existing `fetchRoutesCensus` |

`docs_fetch` is the key unlock: the model sees a cited path in a digest and
can *open the whole document* — real multi-hop reading, not just wider
search.

**Guardrails:** cap 4 tool turns + 90s/turn timeout (already in worker);
tool args schema-validated before execution; unknown tool names → error
`tool` message (the model self-corrects, standard behavior); total tool
calls ≤ 6.

**Final answer contract (C4 decision):** either the same
`{answer_markdown, actions}` JSON we validate today, or free markdown +
a separate bounded action-selection pass. Measure both — keeping ONE
schema end-to-end is simpler but may constrain the model; the separate
pass costs +1 generation.

**What stays:** cerebellum config (temperature, budgets, similarity floor),
`searchDocs`, route census, docs_kb/chunking — none of that was wrong;
what was wrong is *who drives the loop*.

### Open questions

1. C0 result — does the 3B Coder emit valid tool calls? If <~70%, do we
   switch to Qwen2.5-3B-Instruct (re-embed unaffected: retrieval is the
   MiniLM, not the chat model) or Hermes-JSON on Coder?
2. Tool result size — full doc fetch can exceed the 4-chunk context habit;
   cap doc body (~2–3k tokens) and let the model call again if truncated.
3. Conversation history — do tool turns persist into `max_history_turns`
   (richer multi-turn) or are they ephemeral per question (cheaper)?
