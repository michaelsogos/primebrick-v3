# Feature — DynamicIcon `:filled` name qualifier (filled play/pause glyphs)

## Status: 🟠 WIP — Plan date: 2026-11-14 13:30 UTC / 14:30 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | `parseIconName` helper + `:filled` suffix contract in `@primebrick/ui` (`src/lib/icons/icon-qualifiers.ts`) | ✅ done | 2026-11-14 | ui commit `6458da6`; unit test `test/icon-qualifiers.test.ts` 4/4 green |
| 2 | `DynamicIcon` — `filled` prop + suffix parsing, `fill="currentColor"` on the lucide path | ✅ done | 2026-11-14 | same commit; svelte-check 0 err; fill mechanism proven empirically on `@lucide/svelte@1.59.0` (`buildLucideIconNode`: rest-prop `fill` overrides `fill="none"`, stroke-width stays 2) |
| 3 | JH meta — `pause`/`pause_all` → `icon:"pause:filled"` | ✅ done | 2026-11-14 | us commit `51a546c`; `service-routes.test.ts` smoke 4/4 |
| 4 | JH meta — `resume`/`resume_all` → `icon:"play:filled"` | ✅ done | 2026-11-14 | us commit `4e3b0d8`; smoke 4/4 |
| 5 | Stack verification — JH was DOWN (nothing on :3006) | ✅ done | 2026-11-14 | `dev-stack.ps1` restarted job-handler:3006 + crm:3007 detached; boot log clean, registered+heartbeat |
| 6 | E2E spec — served meta carries qualified names; bulk toolbar renders `fill="currentColor"` for pause/play, `fill="none"` for power | ✅ done | 2026-11-14 | `src/e2e/jobs-schedule-cta-icons.spec.ts` — 1/1 green vs live stack; surfaced + fixed JH stale-meta race (mid-edit boot) and toolbar auto-mode revert (selection-driven bulk is the real flow) |
| 7 | Branch repair — commits landed on `develop` in both repos (GitFlow violation) | ⏳ not done | — | feature branches already open → ASK before creating a new one (gitflow.md) |
| 8 | Extend `:filled` to other surfaces (nav `runs` icon, FiltersPanel Apply, `stop`, `square`…) | ⏳ not done | — | deliberate scope: user confirms look first |
| 9 | Icon opacity inconsistency on bulk custom CTAs — `opacity-70` when `action.color` absent; colored CTAs + row/card surfaces opaque. Option A chosen: drop the ternary → uniform opaque | ✅ done | 2026-11-14 | fe commit `515fe70`; spec extended (no `opacity-70` on the 3 CTA icons); E2E 1/1 green + svelte-check 0 err |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Protocol note — written retroactively

This work started from a chat discussion ("secondo te…") and escalated
directly to implementation — the Tic-Toc gate (analysis → plan →
"Planning complete" → PROCEED) was skipped. Commits 1–4 therefore landed
on `develop` in two repos, which `docs/gitflow.md` forbids ("NEVER work
directly on develop"). Task 7 exists to repair that.

## Domain map & doc findings

- **Icon request origin**: JH `entity_op` CTAs for schedule lifecycle —
  `primebrick-us-v3/job-handler/src/controllers/http/actions-route.ts`.
  `cta.icon` is the single source of truth: `makeServiceRoutes`
  synthesizes `row_custom_actions`/`bulk_custom_actions` from it
  (`primebrick-v3-sdk/src/http/service-routes.ts` L140–260; JH meta
  comment at `job.meta.ts` L241–243).
- **Validator**: `validateActionChrome` (core `entity-meta.ts`) only
  binds `ActionColor` vocabulary + semantic-icon↔color pairs — it does
  NOT check icon names against lucide, so a `:`-suffix passes. Semantic
  names (`exec-start`/`exec-stop`) already prove `icon` is a registry
  key, not strictly a lucide name.
- **Renderer**: `DynamicIcon` (`primebrick-v3-ui`) resolves `name` via
  `SEMANTIC_ICONS` → `COMPOSED_ICONS` → lucide `import.meta.glob`. Filled
  applies to the lucide path only.
- **Lucide fill**: `fill` is a supported svg prop — rest props land
  AFTER defaults in `buildLucideIconNode` → `fill="currentColor"` wins
  over `fill="none"`. Officially unsupported upstream (lucide #458) —
  hence an in-house qualifier, not an icon contribution.
- **Surfaces**: schedules page is HOST-rendered (`kind:"list"` →
  `EntityTablePage`) → `@primebrick/ui` consumed from SOURCE via vite
  alias → HMR, no dist rebuild needed. Remote chunks bundle their own
  ui copy but this page isn't remote.
- **Dev-server rule** (`docs/ai/dev-server.md`): JH is :3006; stack must
  be restarted detached via `primebrick-workspace/scripts/dev-stack.ps1`.

## Acceptance criteria

- [x] `pause:filled`/`play:filled` declared on `pause`, `resume`,
  `pause_all`, `resume_all` entity_ops (row + bulk).
- [ ] E2E: served meta carries the qualified names; rendered svgs have
  `fill="currentColor"` for pause/play and `fill="none"` for `power`
  (negative control — unqualified names never fill accidentally).
- [ ] Commits re-homed per GitFlow (feature branch — pending user call,
  branches already open).
- [ ] Visual sign-off by user on the filled look before extending.

## Deliberately out of scope (for now)

- `nav-declaration.ts` `icon:"play"` (runs leaf) — nav surface,
  different anatomy.
- `FiltersPanel` Apply — direct `<Play>` import, not `DynamicIcon`
  (`fill` prop available if wanted later).
- Row-level `stop`/`square`, `power` — untouched pending sign-off.
