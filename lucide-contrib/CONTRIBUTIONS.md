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

## Local assets

- **Fork**: https://github.com/michaelsogos/lucide
- **Clone**: `primebrick-workspace/temp/lucide-fork` — gitignored scratch
  (re-clone if missing; the pushed branch `feat/trash-arrow-up` lives on the
  remote fork regardless)
- **PR payloads**: `primebrick-workspace/temp/lucide-pr/` — the exact
  `trash-arrow-up.svg` + `.json` + PR body submitted
- **In-repo mirror**: `TRASH_ARROW_UP_NODES` in
  `primebrick-v3-ui/src/lib/icons/custom-icons.ts` (`CUSTOM_ICONS` registry,
  resolved by `DynamicIcon` — this IS the fallback until upstream ships)

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
