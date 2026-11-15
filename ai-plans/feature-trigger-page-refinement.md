# Trigger page refinement — lifecycle CTAs order/colors + ELT preview pane

## Status: 🟠 WIP — Plan date: 2026-02-21 / session continuing

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Stop CTA icon `square` → `square:filled` + e2e coverage (TOC) | ✅ done | this session | us-v3 `aaeb258`, fe-v3 `1bfceee`, e2e 2/2 green |
| 2 | Decide + implement lifecycle CTA order & colors (see Part A) | ⏳ not done | — | TIC — pending user sign-off on proposal |
| 3 | Decide ELT `PreviewPanel` fate: ref-inspector vs removal (see Part B) | ⏳ not done | — | TIC — pending user decision |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Lifecycle CTA order & colors (TIC)

### Empirical semantics (verified `job-handler/src/services/schedule-service.ts`)

| Op | Mechanism | Status written | Permanence |
|----|-----------|----------------|------------|
| `stop` | `disarmSchedule(…,"stopped")` — JetStream purge + mirror flip | `stopped` | Transient — owner/engine may re-arm (trigger refresh, service re-declare) |
| `pause` | `disarmSchedule(…,"paused")` — same purge | `paused` | Held — `paused ∈ SUPPRESSED_STATUSES`, every re-arm path suppressed until `resume`; survives restarts |
| `disable` | `disableSchedule` → `dal.delete` on owning `job_trigger` — literal soft-delete; engine disarms via changed-broadcast | (row gone) | Permanent — only explicit `enable` (`dal.restore`) brings it back |

Key docstrings in service: `disarmed` = permanent off · `paused` = suspended until resume · `stopped` = temporary instance kill.

### Current state

- `actions-route.ts` declaration order: `stop, disable, enable, pause, resume`.
- `TableRow.svelte` renders custom ops in declaration order, before standard Delete — so on an armed row the kebab shows `stop, disable, pause` (destructive mid-menu).
- Colors today: `disable` = `destructive` ✓ already; `stop`, `pause`, `resume`, `enable` = neutral.

### Proposal (pending sign-off)

- **Order:** `stop, pause, resume, enable, disable` — `disable` last in every visible state:
  - armed → `stop, pause, …, disable`
  - paused → `resume, …, disable`
  - stopped → `enable?, …, disable`
- **Colors:** `pause` → `warning` (amber matches its status badge; it *holds* the schedule). `stop` stays neutral — transient kill, warning would overclaim. `resume`/`enable` neutral. `disable` stays `destructive`.
- **Semantics unchanged** — this is presentation-only; backend lifecycle untouched.

### Acceptance criteria

- [ ] Kebab order verified per row state (armed/paused/stopped) — `disable` always last custom op, before standard Delete/Restore block.
- [ ] `pause` renders `color: "warning"` in row + bulk surfaces.
- [ ] e2e spec extended: order + color assertions for the kebab menu.
- [ ] No change to `disarmSchedule`/`disableSchedule`/`resumeSchedule` behavior.

### Open questions for user

1. `stop` color — neutral (proposal) or warning (if you read "kill now" as stronger than "hold")?
2. Should `enable` sit next to `disable` (paired) or adjacent to `resume` (both = "bring back")? Proposal: adjacent to `disable` keeps the destructive pair at the tail.

---

## Part B — ELT `PreviewPanel` fate (TIC)

### Current state

- `PreviewPanel.svelte` duplicates the row's own record: fields transposed into sections (sticky/data/auditing) + kebab actions + micro-pager + "Edit mode — coming soon" stub.
- Sheets already cover: record view, edit, version history, ref navigation via stacking.
- Verdict from session analysis: the pane shows the row you're already looking at — redundant as-is.

### Options on the table

| Option | What it means | Cost | Value |
|--------|---------------|------|-------|
| **A. Remove** | Comment out / delete the pane + its mount points | Low | Kills dead weight; sheets own record detail |
| **B. Ref-inspector** | Pane auto-shows the *related* entity (e.g. `job_schedule` mirror → owning `job_trigger` document), not the record itself | Medium | Zero-click ambient context the sheet can't give; pane = context, sheet = action surface |
| **C. Keep as-is** | Status quo | Zero | Redundant duplicate of sheet functionality |

### Analysis

- Option B is the only version that earns its keep: the `job_schedule` row is a thin mirror (subject/spec/status) while the trigger is the real document — surfacing it ambiently is genuinely new information.
- Risk of B: splits the mental model — "when does a ref open in the pane vs a stacked sheet?" Needs a crisp rule (pane = automatic context, sheet = user-invoked navigation) or it becomes confusing.
- Option A is honest cleanup if B's UX rule can't be made crisp.

### Open questions for user

1. B or A? If B: which ref does the pane resolve for each entity (schedule→trigger obvious; what's the rule generically — first `entity_ref`/`ref` meta field? manifest-declared `preview_ref`?)
2. Does pane-vs-sheet need an explicit UX rule doc'd in `docs/dev-guide/` before we build B?

### Acceptance criteria (if B)

- [ ] Pane shows the *referenced* entity, not the row's own record.
- [ ] Rule for ref resolution documented (meta-driven, not hardcoded per entity).
- [ ] Sheet remains the action/edit surface; pane is read-only context.
- [ ] e2e: opening a schedule row shows trigger content in the pane.

### Acceptance criteria (if A)

- [ ] `PreviewPanel` + mount points removed/commented; no dead imports.
- [ ] No regression in list page render (e2e smoke).
- [ ] Decision recorded in dev-guide so it isn't re-proposed.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
