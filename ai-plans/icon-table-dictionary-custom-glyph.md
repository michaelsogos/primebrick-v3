# Custom `table-dictionary` icon (single glyph) + Lucide contribution

> Companion to `icon-trash-arrow-up-custom-glyph.md` — same mechanism
> (`CUSTOM_ICONS` node-tuple registry in `@primebrick/ui`, `DynamicIcon`
> custom branch, upstream contribution flow via `michaelsogos/lucide` fork).
> Trigger: dict-kind routes need a purpose icon — they currently fall back
> to the generic `list` glyph via `DEFAULT_ROUTE_ICONS` (`@primebrick/core`).
> Icon = `table` construction with the column divider moved to x=10.5
> (narrow code column / wide label column — the dict row anatomy).

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-11-20 · session 2026-11-20 (TOC: `table-dictionary` shipped in `CUSTOM_ICONS` + wired as dict-kind default in `@primebrick/core` + upstream PR #5269 opened; `list-dictionary` POC glyph shipped in `CUSTOM_ICONS` (user picked B3 geometry), upstream PR held pending live evaluation; residual: PR outcomes via `lucide-icons-watch` + POC verdict)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | TIC: verify no artifacts survived the accidental cloud session (registry, fork branches, upstream PRs, CUSTOM_ICONS, all repo remotes) | ✅ done | 2026-11-20 | zero traces — see §A.1; `trash-arrow-up` PR #5215 still open awaiting maintainer review |
| 2 | Draft glyph: `table`/`table-properties` base (rect 3,3,18,18 rx2 · h-lines y=9/y=15), divider x=10.5 → 7.5u/10.5u ≈ 42/58; multi-size preview (14–32px, 96px zoom, CTA/nav/light mocks) | ✅ done | 2026-11-20 | `d:\git\primebrick\temp\table-dictionary-preview.html` — user approved x=10.5 ("avevamo provato con 10.5, era meglio" — half-pixel already vetted in the lost cloud session); .5 coords are upstream-sanctioned (959 lucide icons use them) |
| 3 | Register glyph in `@primebrick/ui` `CUSTOM_ICONS` + pin spec (exact tuples + 0.5-grid assertion) | ✅ done | 2026-11-20 | ui `fb1556b` — `TABLE_DICTIONARY_NODES`, registry entry, new `describe` block |
| 4 | Rewire dict-kind default: `DEFAULT_ROUTE_ICONS.dict` `list`→`table-dictionary` in `@primebrick/core` + BE doc comment + `module-discovery.service.test.ts` expectations | ✅ done | 2026-11-20 | core `783e22d` + `287da41` (api-docs regen), be `8972fb3` |
| 5 | FE-side render spec for the new glyph (mirrors `dynamic-icon-custom.test.ts` trash-arrow-up block) | ✅ done | 2026-11-20 | fe `f7fbd4c` — asserts divider path + rect + row lines + currentColor |
| 6 | Verify: ui `pnpm check`+vitest+`pnpm build`, core `pnpm test`+`pnpm build`, be `pnpm check`+targeted vitest, fe targeted vitest | ✅ done | 2026-11-20 | ui svelte-check 0/0, standards clean, vitest 93/93, dist rebuilt · core 149/150+1skip, standards clean, tsc dist rebuilt · be tsc 0, module-discovery spec 24/24 · fe render spec 3/3 |
| 7 | Lucide contribution: fork `feat/table-dictionary` → `icons/table-dictionary.{svg,json}` → PR upstream | ✅ done | 2026-11-20 | PR https://github.com/lucide-icons/lucide/pull/5269 — clean lucide-style commit on `michaelsogos/lucide` (no Devin trailer); `$extends:table-properties` verified against upstream usage; fork has no node_modules so `checkIcons` not run locally — CI will validate |
| 8 | Registry + bookkeeping: `lucide-contrib/CONTRIBUTIONS.md` row+history, this plan's task table | ✅ done | 2026-11-20 | row added (status 🟡 open), history entry, payloads mirrored in `temp/lucide-pr/` |
| 9 | Second icon POC — detached dict rows: variants A/B/C previewed, user picked B → refined B3 (gap inline 3px, code 6 + gap 3 + label 9 = 40/60 preserved); D thin-rows rejected | ✅ done | 2026-11-20 | `temp/table-dictionary-rows-preview.html`; geometry: 3 rows `h=4` y=3/10/17 (3px gaps — only symmetric integer split of 18u), cells `x3w6`/`x12w9` rx1 |
| 10 | POC naming per lucide convention: `table-dictionary-rows` rejected by user (`table` misdescribes detached rows) → **`list-dictionary`** — upstream `list-*` subject-qualifier family (`list-todo`, `list-music`); zero `dictionary`/`lexicon`/`vocab` collision | ✅ done | 2026-11-20 | ui `9e30263` (register) + `9488652` (rename), fe `aba2ef0` (render spec 4/4); ui svelte-check 0/0, spec 8/8, dist rebuilt |
| 11 | `list-dictionary` upstream PR — HELD pending live evaluation (POC stage) | ⏳ not done | — | files to mirror `temp/lucide-pr/list-dictionary.{svg,json}` when green-lit |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Findings (evidence, no memory)

### A.1 Cloud-session artifacts: NONE survived

| Where checked | Result |
|---|---|
| `lucide-contrib/CONTRIBUTIONS.md` | only `trash-arrow-up` (#5215, 🟡 open) |
| GitHub `lucide-icons/lucide` PRs `author:michaelsogos` | total 1 → #5215 |
| Fork clone `temp/lucide-fork` | clean on `feat/trash-arrow-up`; no dict branch local/remote, no stash |
| `CUSTOM_ICONS` (`v3-ui/src/lib/icons/custom-icons.ts`) | `trash-arrow-up`, `question-mark` only |
| All repo remote branches (`devin`/`cloud`/`dict`/`icon` patterns) | none |
| `ai-plans/` | no table-dictionary plan existed |

### A.2 Shipped glyph (approved variant — x=10.5)

```json
["path",{"d":"M10.5 3v18"}],
["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],
["path",{"d":"M3 9h18"}],
["path",{"d":"M3 15h18"}]
```

Same construction as `table` (x=12 → 50/50) and `table-properties` (x=15 →
67/33): divider at x=10.5 → columns 7.5u/10.5u ≈ 42/58 — narrow `code`
column, wide `label` column = dict row anatomy. Half-pixel coordinates are
upstream-conformant (grep: 959 `icons/*.svg` carry `.5` values).

### A.3 Wiring — dict-kind icon default lives in `@primebrick/core`

`page-route.ts` `DEFAULT_ROUTE_ICONS` (`dict: "list"` today) → emitted by
`module-discovery.service.ts` `materializeRouteIcons` at `/api/v1/modules`
discovery time; nav leaves inherit via `iconByHref` census map. FE resolves
the name through `DynamicIcon` → `CUSTOM_ICONS` (sync) before the lucide
glob — a custom glyph is servable to every consumer (host + remote
bundles, each carrying its own ui copy). An authored `icon` on a decl
always wins — the default only fills nulls.

Resolution chain for rebuilds: core `tsc`→`dist/` (be/sdk resolve core
dist; sdk re-export is a runtime ref, no sdk rebuild needed) · ui
`svelte-package`→`dist/` (fe vitest + dev resolve ui dist).

### A.4 GitFlow context

All workspace repos sit on the ONE open work branch
`feature/ext-json-strict-codec` (all clean, all synced to origin). Rule:
commits land there and push immediately — no new branch (orphan=STOP).
Fork PR commit is clean lucide-style (no Devin trailer — OSS).

---

## Part B — Acceptance criteria

1. `DynamicIcon name="table-dictionary"` renders the authored glyph
   (ui vitest pins tuples verbatim + 0.5-grid; fe render spec asserts
   svg paths + class inheritance).
2. `GET /api/v1/modules` emits `icon:"table-dictionary"` for dict-kind
   routes without authored icons — nav leaves inherit it (be spec green).
3. `pnpm check`/`pnpm test` green in every touched repo; ui+core `dist`
   rebuilt.
4. Upstream PR opened as `michaelsogos:feat/table-dictionary` → tracked
   in `CONTRIBUTIONS.md` (`lucide-icons-watch` skill handles follow-up).

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
