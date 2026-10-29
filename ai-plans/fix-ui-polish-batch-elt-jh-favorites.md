# UI polish batch — ELT keybind legend, solid toolbar CTAs, job_rule form layout, hierarchical favorites (+ strict guards)

> TIC plan. Scope: 7 user-reported UI issues across `primebrick-fe-v3`,
> `primebrick-v3-ui`, `primebrick-us-v3` (job-handler), `primebrick-be-v3`
> (i18n seeds) and `primebrick-v3-sdk` (check-standards tool). Every item
> lists empiric findings (file:line), the root cause, the fix, and the
> enforcement hook that prevents recurrence.

## Status: ⚪ TODO — Plan date: 2026-10-28 — Awaiting approval

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | ui: `Toolbar` gains a `center?: Snippet` slot (absolute-centered overlay); docblock contract updated | ⏳ not done | — | enables centered legends without ad-hoc absolute wrappers |
| 2 | ui: move `Kbd` from fe `$lib/components/ui/kbd` → `@primebrick/ui`; new `KeyboardHints` composite (`hints[]` + optional `end` snippet) | ⏳ not done | — | one canonical legend component for launcher + ELT |
| 3 | fe: `TableFooter` renders centered `KeyboardHints` (↑↓ move · Space select · ⏎ row actions · ←→ preview · Esc close); launcher footer migrated to same component | ⏳ not done | — | |
| 4 | be: `public.translations` patch — `system.entities.list.keys.*` + `app.favorites.other` (7 langs) + MANIFEST re-sign | ⏳ not done | — | |
| 5 | fe: `ConfigList` bulk CTAs soft→solid (`warning`, `destructive`); `FilterBar` clear-all + `CardViewRenderer` sort/dir triggers → `outline` | ⏳ not done | — | matches `BulkActionsToolbar` convention |
| 6 | fe: delete dead `toolbar/BulkActions.svelte` + `pagination/Pagination.svelte` and their index re-exports | ⏳ not done | — | zero consumers found |
| 7 | us/job: `nav-declaration` — `name` loses `span:2`; `enabled` moves right after it; `source_subject` placement + comment removed | ⏳ not done | — | field count 8→7 |
| 8 | fe: `EntityFormPage` renders booleans via `SwitchField` anatomy (control-first) inside `FormControl`; `FormFieldDispatcher` `'switch'` branch deleted | ⏳ not done | — | construction-time enforcement |
| 9 | ui: `SwitchField` spreads `...restProps` onto inner `Switch` (FormControl `id`/`aria-*` wiring) | ⏳ not done | — | |
| 10 | ui+fe: new `due_target` widget — composite `jobs.due.` + lane (from `execution_context`) + owner ComboSelect (modules census) + action input; `nav-declaration` uses `widget:"due_target"` | ⏳ not done | — | DECISION point (alt: keep textbox) |
| 11 | fe: migrate hand-rolled/misplaced switch usages to `SwitchField` (clients create+edit, launcher footer, CardViewRenderer datetime toggle) | ⏳ not done | — | |
| 12 | fe: `SidebarAppLauncher` favorites → hierarchy: col2 = modules owning favorites (+ `__other` orphans pseudo-group), col3 = favorite pages | ⏳ not done | — | `Preferiti → JH → Create Rules` |
| 13 | fe: eslint `no-restricted-imports` — `Switch` named import from `@primebrick/ui` banned outside allowlist | ⏳ not done | — | mirrors sheets/vendor/chrome precedent |
| 14 | sdk tool: `check-standards.ts` gains `.svelte` scanning + gated rules `raw-switch`, `button-variant-toolbar`; fe-v3 wires `pnpm check:standards` + `.devin/check-standards.json` | ⏳ not done | — | fe currently has NO standards gate (doc drift) |
| 15 | fe e2e: update `jobs-pages.spec.ts` + `job-rule-form-lifecycle.spec.ts` (source_subject assertions, 8→7 fields, due_target if adopted) | ⏳ not done | — | specs assert field presence today |
| 16 | docs: update `button-variant-standard`, `form-field-standard`, `patterns.md` toolbar note; report `verify-file-creation.md` drift | ⏳ not done | — | canonical docs only — propose text, write after approval |
| 17 | verify: `pnpm check`, `pnpm lint`, `pnpm test`, `svelte-check` on touched repos + Playwright visual pass on `/system/job/rules/create`, a config list page, ELT footer, launcher favorites | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Empiric findings per reported item

### 1. ELT footer keybind legend (request: centered legend like the app launcher)

**What exists today**

- Keyboard navigation IS implemented: `useKeyboardNavigation.svelte.ts`
  bound at `EntityListTable.svelte:575` (`<svelte:window onkeydown>`).
  Real bindings (verified):
  - `↑/↓` — roving row focus; crosses page boundary at first/last row
    (auto `onPageChange`/`clientSelectedPage`); drives preview when open.
  - `Space` — toggles selection on focused row.
  - `Enter` — opens the focused row's kebab dropdown.
  - `←/→` — prev/next inside the open preview panel.
  - `Esc` — closes row dropdown + blurs.
- The launcher's legend (`SidebarAppLauncher.svelte:758-781`) is a plain
  flex footer with `Kbd` chips (`$lib/components/ui/kbd`), `Kbd size="key"|"modifier"`,
  plus a trailing `show all` Switch. It is hand-rolled per-surface.
- `TableFooter.svelte` renders `Toolbar card={false}` with `{#snippet left()}`
  (range + `SelectionCounter`) and children (page-size dropdown + pagination).
- `Toolbar` (`primebrick-v3-ui/.../toolbar.svelte`) has exactly two zones:
  `left` (`flex-1`) and `children` (`ml-auto`). **No center slot exists** —
  a centered legend is unrepresentable today without an ad-hoc absolute
  overlay.

**Root cause**: not a bug — a missing contract. The legend exists only as
a one-off in the launcher; ELT never got the affordance, and `Toolbar`
cannot express "centered content" today.

**Fix design**

1. `Toolbar` (`@primebrick/ui`) gains an optional `center?: Snippet`,
   rendered in an absolutely-centered overlay inside the (now `relative`)
   root: `pointer-events-none absolute inset-x-0 flex justify-center`,
   content re-enabled via `pointer-events-auto`. Contract comment updated:
   `[left] [center] [children] | [group] | refresh | [primary]`.
   This is the *enforcement* move: the centered slot becomes the only
   sanctioned way to center toolbar content — no per-page absolute hacks.
2. Extract the legend into ONE reusable component in `@primebrick/ui`
   (doctrine: "every component judged reusable lands HERE at creation"):
   - move `kbd/` from `primebrick-fe-v3/src/lib/components/ui/` →
     `primebrick-v3-ui/src/lib/components/kbd/` (3 import sites to update:
     `SidebarAppLauncher`, `CommandPalette`, `ui/kbd/index.ts` consumers).
   - new `KeyboardHints` composite: `hints: { keys: string[]; label?: string }[]`
     + optional `end`/`trailing` snippet; renders the launcher's exact chrome
     (`border-t bg-muted/50 px-3 py-1.5 text-[11px] text-muted-foreground`,
     gap-3, Kbd chips + translated labels). Launcher footer migrates to it
     (its `show all` Switch goes in the `end` snippet).
3. `TableFooter` renders `<KeyboardHints>` in the new `center` slot with
   the ELT bindings: `↑↓` move, `Space` select (only when
   `rowSelectionEnabled`), `⏎` actions, `←→` preview, `Esc` close.
   `data-testid="elt-kbd-legend"`.
4. i18n: new BE-owned keys (see Part E) — labels: *move*, *select*,
   *actions*, *preview*, *close* (reuse `app.common.close`).

### 2. Toolbar CTAs still `soft` instead of `solid`

**Verified inventory** (`variant="soft"` / relevant CTAs):

| File:line | Element | Current | Should be |
|---|---|---|---|
| `config-list/ConfigList.svelte:287` | bulk revert CTA | `soft`+`tone="warning"` | `variant="warning"` |
| `config-list/ConfigList.svelte:299` | bulk delete CTA | `soft`+`tone="destructive"` | `variant="destructive"` |
| `entity-list-table/toolbar/FilterBar.svelte:61` | "Clear all" reset | `soft`+`tone="primary"` | `variant="outline" tone="primary"` (secondary role) |
| `entity-list-table/components/CardViewRenderer.svelte:224,245` | sort column / sort direction dropdown triggers | `soft` | `variant="outline"` (trigger chrome) |
| `entity-list-table/toolbar/BulkActions.svelte` (all) | legacy bulk bar | `soft` ×4 | **dead code — delete** |
| `entity-list-table/pagination/Pagination.svelte` (all) | legacy pager | `soft` ×4 | **dead code — delete** |

- `BulkActions.svelte` and `Pagination.svelte` are exported from
  `toolbar/index.ts` / `pagination/index.ts` but have **zero consumers**
  (verified: only index re-exports reference them). `TableFooter` and
  `components/BulkActionsToolbar.svelte` are the live implementations —
  the latter already uses the correct solids (`default`, `destructive`,
  `warning`).
- `EntityListToolbar` itself is already correct: ghost secondary controls
  + `variant="default"` create CTA.
- Doc says `soft` is for "in-card CTA only in Layout 1 when a footer
  primary already exists" (`detail-page-cta-placement.md:51-54`) — the
  toolbar usages were simply never migrated; nothing in code forbids it.

**Fix**: solids in ConfigList; `outline` for secondary reset/trigger
chrome; delete dead files; doc amendment (Part D) + lint gate (item 14).

### 3. `name` single column + `enabled` switch beside it (JH create rules)

- `nav-declaration.ts:67,81` — `name` is `span:2` (full row); `enabled`
  is the LAST placement. Grid is `grid-cols-2` (`EntityFormPage:224`).
- Change: `{ key: "name" }` (span dropped) then
  `{ key: "enabled", default_value: true }` immediately after → row 1 =
  `name | enabled`; rows shift to: `event_subject | target_subject`,
  `schedule_spec | execution_context`, `filter` (span 2).
- Depends on item 6 for the switch's canonical anatomy; the bool cell
  needs bottom-alignment (`items-end pb-2`-ish) so the switch row aligns
  with the text input row — verify visually.
- Nav-decl is persisted at service register → job-handler re-register
  (`bun --hot` restart) propagates it into `service_registry.endpoints`.

### 4. Why is "Destinazione evento" (`target_subject`) a plain textbox?

**Root cause (verified, multi-layer)**

- `FormFieldDispatcher.resolveControl()`: `format:"nats_subject"` +
  `options_source === "census.emits"` → `subject_combo`; **without**
  `options_source` → `text`. `target_subject` declares no
  `options_source` (`nav-declaration.ts:72`), hence `TextInput`.
- The options vocabulary is a **closed union** — literally only
  `"census.emits"` (`core/page-route.ts:129`, sdk
  `FORM_FIELD_OPTIONS_SOURCES`). And `jobs.due.*` was *deliberately*
  excluded from emits: those subjects are published by **nats-server** at
  fire-time, not by any module (`events-declaration.ts:10-13`; pilot plan
  §G: "target_subject: NOT emits-fed — structural pattern").
- So the textbox is the dispatcher's default for "no declared option
  vocabulary" — not a random choice, but the best option today is only
  "free text + `target_matches_lane` cross-field validator"
  (`build-entity-form-schema.ts:93-105`).

**Precedent already in repo**: the remote `SchedulePage.svelte` composes
`target` as `jobs.due.${lane}.${service}.${action}` from a lane select +
service + action inputs — i.e., the canonical due-target UX is a
**composite**, not a textbox. The meta form never got that treatment.

**Fix design (recommended — DECISION point)**: new widget `due_target` in
the FE dispatcher registry + `DueTargetInput` component (`@primebrick/ui`):

```
[ jobs.due. ] [ <lane> ] [ . ] [ owner ▾ combo ] [ . ] [ action ______ ]
   chip        chip (auto)      census modules          free text
```

- `lane` is **derived live** from the sibling `execution_context` field
  (display-only chip that flips user↔system) — a wrong lane becomes
  *unrepresentable*; `target_matches_lane` stays as belt-and-braces.
- `owner` options = module/service codes from the already-client-side
  `shellNav.modules` census (`m.id`), `allowCreate` for non-censused.
- `action` free text (NATS segment grammar via existing subject refine).
- Plumbing: `FormFieldDispatcher` is field-scoped today — pass a
  `formValues: () => Record<string, unknown>` getter so the widget reads
  `execution_context` live. `placement.widget: "due_target"` in
  nav-declaration (`widget` is already a closed placement key; its *value*
  registry is FE-side — no core/sdk type change).
- New enforcement: `resolveControl()` returning an unresolvable `widget`
  value currently renders NOTHING silently → make
  `buildEntityFormSchema`/`EntityFormPage` throw on unknown widget keys
  (mirror the `validators` closed-registry pattern).

**Alternative**: keep TextInput (doc-only answer). The composite is
proposed because it kills the error class at construction and matches
SchedulePage's mental model.

### 5. Why is "Sorgente al lancio" (`source_subject`) still in the form?

- `nav-declaration.ts:76-80` — placement kept `readonly` to "document the
  pending capability" (fire-time `Nats-Schedule-Source` indirection,
  deprecated pending the workflow engine). User decision: it must
  disappear from the form entirely.
- Fix: delete the placement line + comment block. Consequences:
  - `meta.columns.source_subject` stays (entity column still exists —
    list/detail surfaces unaffected; `default_visible:false`).
  - `job.translations` keys for field label + hints stay (harmless; they
    document the pending capability. Optional later cleanup patch —
    NOT required).
  - DB column untouched; rules engine untouched.
  - E2E fallout: `jobs-pages.spec.ts:272` lists `source_subject` in the
    visible-field loop and the comment says "8 declared fields";
    `job-rule-form-lifecycle.spec.ts:99-106` asserts the readonly combo.
    Both must be updated (item 15).

### 6. The switch doesn't follow the bool UX — why, and why no guard stopped it

**What the standard says (canonical docs)**

- `switch-field.svelte` docblock: *"every user-facing labelled switch in a
  form MUST be a SwitchField"* — anatomy = switch FIRST, label beside,
  tooltip support. Raw `<Switch>` allowed only inside composites owning
  their labelling.
- `form-field-standard.md` / `input-anatomy.md`: boolean controls use the
  inline (control-first) anatomy.
- Pilot plan §C listed `enabled` → `SwitchField` — the implementation
  deviated from the approved design.

**What the code does instead**

- `EntityFormPage.svelte:225-259` wraps EVERY field in the uniform
  label-above anatomy (`FormField` → `FormLabel` → dispatcher).
- `FormFieldDispatcher.svelte:76,162` maps boolean → bare
  `<Switch bind:checked>`, which then renders *under* the label — the
  wrong anatomy. `SwitchField` is never emitted.

**Why it slipped through (under the hood)**

1. The dispatcher only decides the *control*; the *field anatomy* is owned
   by the page wrapper, which is control-type-blind — bool gets the text
   anatomy by construction. **No structural seam forces the bool anatomy.**
2. `Switch` is publicly exported from `@primebrick/ui` and importable
   anywhere — the "SwitchField only" rule is documentation, not code.
3. `primebrick-fe-v3` has **no `check-standards` wiring at all** (sdk tool
   exists; be-v3 + every US service run it; fe only has eslint), and no
   eslint rule restricts the `Switch` import — the precedent mechanism
   (`no-restricted-imports` for sheets/vendor/chrome) was never extended
   to it.
4. `verify-file-creation.md` (fe docs) references a `check-standards.ts`
   `truncated-sibling` rule + `pnpm check:standards` — **doc drift**:
   neither exists in fe-v3's package.json/scripts.

**Raw-`Switch` usage inventory** (fe, verified):

| File | Anatomy verdict |
|---|---|
| `entity-form/FormFieldDispatcher.svelte:162` | ❌ label-above — the reported bug |
| `routes/.../clients/create/+page.svelte:224-227` | ⚠️ correct anatomy but hand-rolled `<Switch>+<FormLabel>` — migrate to SwitchField |
| `routes/.../clients/[uuid]/+page.svelte:306` | ⚠️ same — migrate |
| `sidebar/SidebarAppLauncher.svelte:778` | ⚠️ hand-rolled inline label — migrate to `SwitchField size="sm"` |
| `entity-list-table/components/CardViewRenderer.svelte:280` | ⚠️ label-then-switch header toggle — migrate to `SwitchField size="sm"` |
| `config-list/ConfigValueInput.svelte:306` | ✅ sanctioned composite (bare only when unlabelled) |
| `entity-list/sheets/panels/FiltersPanel.svelte:428,573` | ✅ mode toggles (dual-label), composite |
| `entity-list-table/panels/PreviewPanel.svelte:143` | ✅ icon mode toggle, composite |
| `anchor-tabs/anchor-tabs-mode-switch.svelte` | ✅ composite |
| `routes/.../modules/+page.svelte:334` | ✅ unlabelled row toggle |

**Fix**

- `EntityFormPage`: `column.type === 'boolean'` → render `SwitchField`
  (`label=$t(col.label_key)`, `tooltip*` from col meta, `disabled=readonly`,
  `bind:checked=$form[key]`) inside `FormControl` — errors/`aria-*` stay
  wired via control props.
- `FormFieldDispatcher`: delete the `'switch'` branch + `Switch` import —
  no code path can emit a bare switch in the archetype (unrepresentable).
- `SwitchField` (`@primebrick/ui`): accept `...restProps` and spread onto
  the inner `Switch` so `id`/`aria-invalid`/`aria-describedby`/
  `data-testid` from FormControl reach the real control.
- Migrations per the table above (clients create/edit, launcher,
  CardViewRenderer).
- Guards — see Part D (eslint import ban + check-standards `.svelte`
  rules). Also keep `Switch` exported (composites legitimately need the
  primitive); the gate is *where it may be imported*.

### 7. Favorites render flat instead of `Preferiti → module → leaf`

**Current** (`SidebarAppLauncher.svelte:74-126,605-659`): under the
`__favorites` pseudo-root, column 2 renders `favoriteItems` — a flat list
of hrefs with `decl.label_key ?? leaf.label_key` labels; column 3 is
empty. A favorite of `/system/job/rules/create` shows as a bare
"Create Rules" row — module context lost.

**Data already available**: `CensusRoute.module` (`api.ts:563-565`) — every
census decl carries its owning module id; detail-row favorites resolve via
`routePatternMatches` → same decl → module. `resolveModuleLabel(m, $t)`
is the canonical module display name.

**Fix design**

- New derived `favoriteGroups`: group resolved favorites by module id;
  each group = `{ module: ModuleInfo | null, items: FavoriteItem[] }`.
  Orphans (no decl, disabled module) fall into a `__other` pseudo-group
  (label = new key `app.favorites.other`, star icon, muted).
- Column 2 under favorites renders the *groups* as module-like rows
  (module icon or star fallback, `resolveModuleLabel`, `ChevronRight`;
  NO goto CTA — groups preview only). Column 3 renders the group's
  favorite leaves exactly like the normal pages column (icon, translated
  label, current-page dot, `StarOff` remove CTA, click/Enter = goto).
- Keyboard model unchanged: col2 select previews col3; `→`/`Enter` on a
  col2 group descends into col3; `←` returns. `activateAt`, `colFocusIdx`,
  `targetRows`, `hoverPath` (`Preferiti › Module › Page`) updated to the
  grouped shape.
- Edge cases: module `enabled===false`/`accessible===false` → census skips
  it → items become orphans (muted, still removable — today's contract).
  `favoriteItems` order follows the stored array (user's starring order);
  groups ordered by first appearance of a favorite.

---

## Part B — File touch list

| Repo | File | Change |
|---|---|---|
| v3-ui | `src/lib/components/toolbar/toolbar.svelte` | `center?: Snippet` overlay slot + `relative` root + docblock |
| v3-ui | `src/lib/components/kbd/*` (new, moved from fe) | `Kbd` component relocated |
| v3-ui | `src/lib/components/keyboard-hints/*` (new) | `KeyboardHints` composite |
| v3-ui | `src/lib/components/switch-field/switch-field.svelte` | `...restProps` → inner `Switch` |
| v3-ui | `src/lib/components/due-target-input/*` (new, if item-4 widget approved) | composite lane+owner+action input |
| v3-ui | `src/lib/index.ts` | export `Kbd`, `KeyboardHints`, `DueTargetInput` |
| fe | `src/lib/components/ui/kbd/*` | deleted (moved to ui); import sites updated (`SidebarAppLauncher`, `CommandPalette`, `input-group` css is class-only — verify) |
| fe | `entity-list-table/components/TableFooter.svelte` | centered `KeyboardHints` in `center` slot |
| fe | `sidebar/SidebarAppLauncher.svelte` | footer → `KeyboardHints` (+ `SwitchField`); favorites → grouped 2-col model |
| fe | `components/config-list/ConfigList.svelte` | bulk CTAs → `warning`/`destructive` |
| fe | `entity-list-table/toolbar/FilterBar.svelte` | clear-all → `outline` |
| fe | `entity-list-table/components/CardViewRenderer.svelte` | sort/dir triggers → `outline`; datetime toggle → `SwitchField` |
| fe | `entity-list-table/toolbar/BulkActions.svelte`, `pagination/*` | DELETE + `toolbar/index.ts`, `pagination/index.ts`, `index.ts` cleanup |
| fe | `entity-form/EntityFormPage.svelte` | boolean → `SwitchField` anatomy; bool cell alignment |
| fe | `entity-form/FormFieldDispatcher.svelte` | drop `'switch'`; add `due_target`; `formValues` getter |
| fe | `entity-form/build-entity-form-schema.ts` | unknown `widget` value → throw (closed registry) |
| fe | `routes/(app)/system/settings/clients/{create,[uuid]}/+page.svelte` | hand-rolled switch → `SwitchField` |
| fe | `src/e2e/jobs-pages.spec.ts`, `job-rule-form-lifecycle.spec.ts` | field assertions updated (7 fields, no source_subject) |
| fe | `eslint.config.js` | `no-restricted-imports` `Switch` ban + allowlist ignores |
| fe | `.devin/check-standards.json` (new) + `package.json` script | wire shared tool |
| us/job | `job-handler/src/nav-declaration.ts` | layout: `name` 1-col, `enabled` beside, `source_subject` removed, `widget:"due_target"` on `target_subject` |
| be | `db-meta/patches/<ts>_elt_kbd_and_favorites_i18n.sql` | new keys ×7 langs; re-sign `MANIFEST.json` |
| sdk | `tools/check-standards.ts` | `.svelte` scan + `raw-switch`, `button-variant-toolbar` gated rules |

---

## Part C — i18n keys (BE patch, `public.translations`, 7 langs)

| Key | en-GB | it-IT | Purpose |
|---|---|---|---|
| `system.entities.list.keys.move` | Move | Sposta | ↑↓ hint |
| `system.entities.list.keys.select` | Select | Seleziona | Space hint (row-selection only) |
| `system.entities.list.keys.actions` | Actions | Azioni | ⏎ hint |
| `system.entities.list.keys.preview` | Preview | Anteprima | ←→ hint |
| `app.favorites.other` | Other | Altri | orphans pseudo-group |

(reuse `app.common.close` for Esc.) Patch = insert-once rows for all 7
shipped languages (en-GB/en-US/it-IT/fr-FR/es-ES/pt-PT/de-DE), then
`primebrick-db sign --db-meta db-meta --key @<keyfile> --key-id <id>`.

---

## Part D — Enforcement plan (make the wrong thing unrepresentable)

Following `enforcement-over-verification.md` (construction > mandatory
checkpoint > lint > compile; tests are the second net):

1. **Toolbar center slot** — centered content gets ONE canonical API; no
   absolute-positioned workarounds needed.
2. **Bool anatomy at construction** — `EntityFormPage` routes
   `type:"boolean"` through `SwitchField`; `FormFieldDispatcher` loses its
   `switch` branch → no remaining code path renders label-above bools.
3. **eslint import ban** (fe — mirrors the existing sheets/vendor/chrome
   mechanism):

   ```js
   {
     files: ['src/**/*.{ts,svelte}'],
     ignores: [
       'src/lib/components/config-list/ConfigValueInput.svelte',
       'src/lib/entity-list/sheets/panels/FiltersPanel.svelte',
       'src/lib/components/entity-list-table/panels/PreviewPanel.svelte',
       'src/lib/components/anchor-tabs/anchor-tabs-mode-switch.svelte',
       'src/routes/(app)/system/settings/modules/+page.svelte',
     ],
     rules: {
       'no-restricted-imports': ['error', {
         paths: [{ name: '@primebrick/ui', importNames: ['Switch'],
           message: 'Labelled booleans MUST use SwitchField (switch-first anatomy). Raw Switch is composite-internal only — add to the allowlist only if the file owns its labelling.' }],
       }],
     },
   }
   ```

4. **check-standards extension** (sdk tool, shared): `walk()` gains
   `.svelte`; two new gated rules —
   `raw-switch` (`import { …Switch… } from '@primebrick/ui'` outside
   `allowPaths`) and `button-variant-toolbar`
   (`variant="soft"` inside `appliesTo` dirs: `components/config-list/`,
   `components/entity-list-table/`). fe-v3 adopts the tool:
   `"check:standards": "bun ../primebrick-v3-sdk/tools/check-standards.ts src"`
   + `.devin/check-standards.json` (`i18n_namespaces`, allowlists) +
   wire into `lint`/`prebuild`. (Also fixes the `verify-file-creation.md`
   doc drift — the tool it cites will finally exist in this repo.)
5. **Closed widget registry** — `resolveControl()`/`buildEntityFormSchema`
   throws on a `placement.widget` value with no registered control (today:
   silent nothing-rendered).
6. **`due_target` composite** — wrong-lane subjects unrepresentable;
   `target_matches_lane` remains as the second net.
7. **Doc amendments** (canonical text proposed for approval):
   `button-variant-standard.md` += "toolbar action CTAs are solid variants
   only (`default`/`destructive`/`warning`/`outline` for secondary);
   `soft` is reserved for Layout-1 in-card secondary CTAs";
   `form-field-standard.md` += "boolean fields render `SwitchField`
   (control-first) — inside superforms `FormControl` too; hand-rolled
   `Switch`+`<FormLabel>` rows are forbidden".

---

## Part E — Open decisions for the user

- [ ] **Item 4**: adopt the `due_target` composite widget (recommended —
  matches SchedulePage, kills lane drift at construction) or keep the
  plain TextInput?
- [ ] **Item 2**: `FilterBar` "Clear all" → `outline` (recommended: it is
  a secondary reset) vs `default`? CardViewRenderer sort/dir triggers →
  `outline` (recommended) vs leave `soft`?
- [ ] **Item 6 scope**: also migrate launcher footer + CardViewRenderer +
  clients forms to `SwitchField` now (recommended, completes "one anatomy")
  or limit to the entity-form archetype?
- [ ] **Item 1**: move `Kbd` to `@primebrick/ui` (recommended, doctrine)
  vs duplicate a fe-local legend component?
- [ ] **Item 7**: orphan favorites under a muted `Other` pseudo-group
  (recommended) vs flat muted rows as today?
- [ ] **Item 5**: keep `source_subject` translation/hint keys (recommended
  — pending capability) or also soft-delete them via patch?

---

## Part F — Acceptance criteria

1. ELT footer shows a centered Kbd legend (move/select/actions/preview/
   close), hidden hints for N/A features (e.g. no `Space` when selection
   off); identical component to the launcher footer.
2. Config list bulk CTAs render solid `warning`/`destructive`; zero
   `variant="soft"` left in `config-list/` + `entity-list-table/` except
   allowlisted trigger chrome (post-decision).
3. `/system/job/rules/create` row 1 = `name` | `enabled` (SwitchField,
   default ON); `source_subject` absent; 7 fields total.
4. `target_subject` either composite (`due_target`, lane follows
   `execution_context`, owner combobox = module codes) or documented
   TextInput — per decision.
5. Bool fields render switch-first inline anatomy everywhere migrated;
   eslint rejects `import { Switch }` outside the allowlist.
6. Favorites: `Preferiti → <module> → <page>` columns; orphans grouped
   muted under "Other"; remove + goto + keyboard descent all work.
7. `pnpm check`, `pnpm lint`, `pnpm test`, `check:standards` clean on
   touched repos; e2e specs updated and passing.
8. Visual pass (Playwright screenshots): rules/create form, a config
   page toolbar, an ELT footer, launcher favorites — attached for review.
