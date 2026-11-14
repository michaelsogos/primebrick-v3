# Custom `trash-restore` icon (single glyph) + Lucide contribution

> Standalone. Trigger: the restore action icon was a broken 2-icon compound —
> requested a purpose-built glyph reusing lucide conventions, candidate for
> upstream contribution to lucide. **DECIDED: variant C** (verbatim
> archive-restore construction, 8u gap); mechanism changed mid-TOC from a
> `.svelte` component to pure `IconNode` tuples in `CUSTOM_ICONS` — testable
> in node vitest and literally the lucide `icons/<name>.json` PR payload.

## Status: 🟡 PARTIALLY DONE — Plan date: 2026-11-14 14:05 UTC / 15:05 CET · session 2026-11-14 (TOC: variant C shipped — CUSTOM_ICONS registry + 7 call sites + tests + docs; residual: live UI eyeball (dev session expired during verification) + upstream PR)

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | TIC: doc pass (workflow, icon-conventions, temp-files) + locate all restore-icon call sites + extract lucide source geometry | ✅ done | 2026-11-14 | evidence below |
| 2 | Draft candidate glyphs A–D + multi-size preview (14–32px + 96px zoom + CTA mock) | ✅ done | 2026-11-14 | `d:\git\primebrick\temp\trash-restore-preview.{html,png}` — rendered & screenshotted via Playwright; temp HTTP server on :8321 dies with session |
| 3 | **DECISION (user)**: pick variant | ✅ done | 2026-11-14 | user chose **C** — 8u gap (exact `archive-restore` proportion) |
| 4 | Register glyph in `@primebrick/ui` — `CUSTOM_ICONS` node-tuple registry resolved by `DynamicIcon` after semantic, before composed+glob | ✅ done | 2026-11-14 | `src/lib/icons/custom-icons.ts` (`TRASH_RESTORE_NODES`), `DynamicIcon.svelte` custom branch, `index.ts` export. Component approach dropped: vitest can't compile `.svelte` → node tuples = pure data, node-testable, contribution-ready |
| 5 | Replace all 7 compound `Trash`+`ArrowUpFromLine` call sites | ✅ done | 2026-11-14 | all → `<DynamicIcon name="trash-restore">`; zero `ArrowUpFromLine` imports left (grep-verified) |
| 6 | Docs: icon-conventions (rule 3 + canonical map + frontmatter), special-icons.mdx section, dynamic-icon.mdx resolution order, entity-metadata icon field | ✅ done | 2026-11-14 | user approved doc updates in prompt |
| 7 | Verify: typecheck ui+fe, check:standards, vitest — incl. NEW persistent specs | ✅ done | 2026-11-14 | ui: svelte-check 0, standards clean, `test/custom-icons.test.ts` 4/4 (geometry pin + no-lucide-collision). fe: svelte-check 0, `dynamic-icon-custom.test.ts` 2/2 (real render: svg paths + class inheritance via testing-library). Live UI check blocked: dev session expired mid-verification — pending user eyeball |
| 8 | Lucide contribution (user-driven): fork lucide repo, add `icons/trash-restore.json` = `TRASH_RESTORE_NODES` verbatim, open PR | ⏳ not done | — | outside repo scope; nodes are already the exact payload |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Findings (evidence, no memory)

### A.1 The broken compound — 7 identical mashups (ALL REPLACED)

| File | Context |
|---|---|
| `entity-list-table/toolbar/BulkActionsToolbar.svelte` | bulk CTA (`entity-bulk-restore`), `Trash size-3.5` + `ArrowUpFromLine absolute bottom-px size-2` |
| `entity-list-table/components/TableRow.svelte` | row action `-bottom-[1px] size-3` |
| `entity-list-table/components/CardActions.svelte` | card row action |
| `entity-list-table/panels/PreviewPanel.svelte` | `text-warning/70` |
| `entity-list-table/cards/CardList.svelte` | `text-warning/70` |
| `entity-list-table/cards/CardGrid.svelte` | `text-warning/70` |
| `entity-list-table/components/StateRenderer.svelte` | `text-warning/70` |

`DictRow.svelte` uses plain `RotateCcw` — different semantic (dict local
revert), intentionally unchanged and now documented as such.

### A.2 Shipped glyph (variant C — `TRASH_RESTORE_NODES`)

```json
["path",{"d":"M3 6h18"}],
["path",{"d":"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"}],
["path",{"d":"M5 6v14a2 2 0 0 0 2 2h1"}],
["path",{"d":"M19 6v14a2 2 0 0 1-2 2h-1"}],
["path",{"d":"m9 15 3-3 3 3"}],
["path",{"d":"M12 12v10"}]
```

trash minus inner verticals · baseline split h1/h-1 → gap x=8..16 (exact
`archive-restore` 8u construction) · canonical `3-3 3 3` chevron · shaft
lands ON baseline y=22 · all-integer coords · 2px padding respected.

### A.3 Resolution architecture (`primebrick-v3-ui`)

`DynamicIcon` resolves: `SEMANTIC_ICONS` (self-colored) → `CUSTOM_ICONS`
(authored `IconNode` tuples, sync render, `currentColor`, color-neutral —
`validateActionChrome` does NOT bind them) → `COMPOSED_ICONS` (masked
mashups) → lucide `import.meta.glob`. No `trash-restore`/`trash-arrow-up`
exists in lucide 1.59.0 — contribution slot free; if upstream ships the
name the test "never collides with a lucide icon name" fails → drop the
entry and the glob resolves it identically.

## Part B — Lucide conformance

24×24 · stroke 2 · round cap/join · integer coords · ≥2px padding ·
gap-in-edge = `archive-restore`/`square-arrow-*-enter` convention ·
chevron is canonical lucide up-arrow · name `trash-restore` mirrors
`archive-restore` naming.

## Part C — Acceptance criteria (verified)

1. ✅ One glyph on all 7 restore surfaces; zero `ArrowUpFromLine` imports
   (grep clean); `data-testid`s unchanged.
2. ✅ `currentColor` — inherits `text-warning/70`/variant colors (render
   test asserts class pass-through).
3. ✅ `pnpm check` green ui+fe; `check:standards` clean; ui vitest 4/4,
   fe render spec 2/2.
4. ⏳ Live-app eyeball at 14/16px — dev session expired during TOC;
   pending user's first look (HMR picks the rebuilt dist automatically).
5. ✅ Contribution-ready per §B.

## Part D — Lucide PR notes (task 8)

Payload = `TRASH_RESTORE_NODES` verbatim → `icons/trash-restore.json` in a
lucide fork; fill `contributors`/`tags` (`restore, trash, undelete, bin`)
per repo CONTRIBUTING; categories likely `arrows`/`files`. Name
`trash-restore` (mirrors `archive-restore`).

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
