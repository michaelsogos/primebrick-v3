# Lucide upstream contributions — tracking registry

Source of truth for Primebrick-authored icons submitted to
[lucide-icons/lucide](https://github.com/lucide-icons/lucide).

**How to check status**: invoke the `lucide-icons-watch` skill
(`D:\git\primebrick\.devin\skills\lucide-icons-watch\SKILL.md`) — trigger
phrase e.g. *"verifica le nostre icone inviate a lucide"*. The skill queries
the GitHub API with the cached `michaelsogos` credential, interprets the
state and updates this file.

## Submissions

| Icon | PR | Submitted | Author | Status | Last check | Notes |
|------|----|-----------|--------|--------|------------|-------|
| `trash-arrow-up` | [#5215](https://github.com/lucide-icons/lucide/pull/5215) | 2026-11-14 | michaelsogos | 🟡 open | 2026-11-14 | CI 5/5 green (PR Title Lint, Icon Preview, Generate PR Title, triage, Metadata Suggestions); bot posted icon render preview; awaiting maintainer review |
| `table-dictionary` | [#5269](https://github.com/lucide-icons/lucide/pull/5269) | 2026-11-20 | michaelsogos | 🟡 open | 2026-11-20 | `table` construction, column split x=10.5 (7.5u/10.5u ≈ 42/58); tags `$extends:table-properties`, categories `$extends:table`+layout; CI 3/5 green at open (Title Lint, PR Title, triage), Icon Preview + Metadata Suggestions running |
| `list-dictionary` | [#5270](https://github.com/lucide-icons/lucide/pull/5270) | 2026-11-20 | michaelsogos | 🟡 open | 2026-11-20 | detached key\|value rows (3× h=4, code x3w6 + label x12w9, 3px gaps both axes, 40/60); named per `list-*` qualifier family after `table-dictionary-rows` rejected as misleading |

## Local assets

- **Fork**: https://github.com/michaelsogos/lucide
- **Clone**: `primebrick-workspace/temp/lucide-fork` — gitignored scratch
  (re-clone if missing; the pushed branch `feat/trash-arrow-up` lives on the
  remote fork regardless)
- **PR payloads**: `primebrick-workspace/temp/lucide-pr/` — the exact
  `*.svg` + `.json` + PR bodies submitted (`trash-arrow-up`, `table-dictionary`)
- **In-repo mirror**: `TRASH_ARROW_UP_NODES` + `TABLE_DICTIONARY_NODES` +
  `LIST_DICTIONARY_NODES` in
  `primebrick-v3-ui/src/lib/icons/custom-icons.ts` (`CUSTOM_ICONS` registry,
  resolved by `DynamicIcon` — this IS the fallback until upstream ships).
  `table-dictionary` is also the `dict` kind default in
  `@primebrick/core` `DEFAULT_ROUTE_ICONS` (BE discovery emits it for
  icon-less dict routes; nav leaves inherit via the census map)

## Check cadence

- **Real-time signal is GitHub itself** — the PR author (`michaelsogos`) is
  auto-subscribed to the thread; every comment/review/merge reaches his
  notifications. No polling needed for events.
- **Skill check cadence: ~weekly digest** (maintainer icon reviews run in
  batches — 1–4 weeks is a normal wait). Daily checks are noise.
- **On any change-request notification**: run the skill immediately —
  maintainers cool off if a requested change sits unanswered for weeks.
- **Before bumping `@lucide/svelte`**: run the skill — a merge may have
  shipped the glyph upstream.

## Status lifecycle

`open` → maintainer review → **merged** / **changes-requested** /
**closed-rejected**.

- **Merged ≠ shipped**: the glyph lands in `@lucide/svelte` only at the next
  lucide release. When we bump past the version carrying it, the
  no-collision test in `primebrick-v3-ui/test/custom-icons.test.ts` fails by
  design → drop the `CUSTOM_ICONS` entry and the glob resolves upstream
  identically.
- **Changes requested**: summarize maintainer asks, fix in the fork clone,
  push to the same branch (PR updates automatically).
- **Rejected**: keep the `CUSTOM_ICONS` entry — it is our permanent
  fallback; optionally revisit with a different design/name later.

## History

| Date | Event |
|------|-------|
| 2026-11-14 | `trash-arrow-up` designed (variant C: 8u baseline gap, canonical chevron, shaft on baseline), shipped in `CUSTOM_ICONS`, PR #5215 opened |
| 2026-11-20 | `table-dictionary` designed (x=10.5 split, half-pixel user-approved), shipped in `CUSTOM_ICONS` + wired as `dict` kind default (`@primebrick/core`), PR #5269 opened |
| 2026-11-20 | `list-dictionary` designed (detached rows POC → approved variant B3), shipped in `CUSTOM_ICONS`, PR #5270 opened |
