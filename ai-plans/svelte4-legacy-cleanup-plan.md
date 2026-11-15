# Svelte 4 Legacy Cleanup + a11y Labels — Plan

> Branch: `feature/i18n-module-translations` (FE). Scope: `primebrick-fe-v3`.
> Companion rule written: `.devin/rules/svelte4-legacy-idioms.md`.
> Verification baseline: `pnpm run check` → 0 errors / 2 warnings today.

## Objective

Remove remaining Svelte 4 legacy idioms (the `$$Props` interface idiom) and
fix the 2 a11y label warnings left by svelte-check. Pure typing/markup
cleanup — zero runtime behavior change expected.

## Part 1 — `interface $$Props` → typed `$props()` (16 files)

### Evidence (verified 2026-09-27, `git grep "interface \$\$Props"`)

| File | Props shape | Notes |
|---|---|---|
| `AppTopbar.svelte` | `unreadNotifications?: number` | trivial |
| `entity-list-table/panels/ColumnSelectorPanel.svelte` | columns groups + handlers | **also dead import** — see dead-code section |
| `entity-list-table/panels/FiltersPanel.svelte` | filter state + callbacks | used only as `content:` prop — see plan B wart |
| `entity-list-table/panels/SearchInPanel.svelte` | search keys + callbacks | **dead code** — see below |
| `ui/ai-icon/ai-icon.svelte` | size, stroke_width, class, no_animation | JSDoc comments on props — preserve them |
| `ui/gradient-icon/gradient-icon.svelte` | size/colors | — |
| `smart-regex-input/regex-flags-panel.svelte` | flags | — |
| `smart-regex-input/smart-regex-input.svelte` | value/flags bindable + many props | largest interface — keep doc comments |
| `entity-list/sheets/panels/ColumnsPanel.svelte` | column groups + reorder/reset | — |
| `entity-list/sheets/panels/FiltersPanel.svelte` | `content` (unused!), columns, filters | drop dead `content` prop — plan B |
| `entity-list/sheets/panels/SearchInPanel.svelte` | search keys | — |
| `entity-list/sheets/panels/VersionHistoryPanel.svelte` | entity/rowUuid | — |
| `shell/sheets/SheetHeader.svelte` | `title`, `actions` Snippets | — |
| `shell/sheets/panels/CurrencySelectPanel.svelte` | select props | — |
| `shell/sheets/panels/PhonePrefixSelectPanel.svelte` | select props | — |
| `shell/sheets/panels/ProtocolSelectPanel.svelte` | select props | — |

### Migration pattern (per file)

```diff
-  interface $$Props {
-    foo: string;
-    bar?: number;
-  }
-  let { foo, bar = 1 }: $$Props = $props();
+  let { foo, bar = 1 }: { foo: string; bar?: number } = $props();
```

For interfaces >6 fields or with heavy JSDoc (`smart-regex-input.svelte`,
`ai-icon.svelte`), keep a named `interface Props` (not `$$Props`) so JSDoc
stays attached:

```ts
interface Props {
  /** The regex pattern string (bindable). */
  value?: string;
}
let { value = $bindable('') }: Props = $props();
```

Impact: **none at runtime** — `$$Props` is a plain interface name in runes
mode; only typing idiom changes. Every touched file passes through
`svelte-autofixer` first.

### Regression tests (Part 1 — requested by user)

The repo already has the full harness — reuse, don't invent:

- `pnpm run check` (svelte-check + tsc) — run **before** the migration and
  **after**; diff must show 0 new diagnostics.
- `pnpm run test:unit` (vitest + jsdom + `@testing-library/svelte`) — run
  the existing suite before/after; it must stay green.
- New component tests (`src/lib/__tests__/`, pattern =
  `smoke-component.test.ts`): render tests for the riskiest migrated files —
  - `smart-regex-input.svelte` — bindable `value`/`flags` props still
    bind two-way after `$props()` typing change.
  - `ai-icon.svelte` / `gradient-icon.svelte` — render with defaults +
    overridden props (catches default-destructuring mistakes).
  - `SheetHeader.svelte` — renders `title`/`actions` snippets (props typing
    change touching every sheet).
  - one entity-list panel (`ColumnsPanel` or `SearchInPanel`) — render with
    fixture props, assert list items + reset handler wiring.
- `pnpm run build` — production build catches `state_referenced_locally`
  (elevated to error) and anything typecheck misses.
- E2E: existing `src/e2e/` suite (`pnpm run test:e2e`) — at minimum the
  navigation/sweep spec, since `AppTopbar` and sheet panels are touched.

## Part 2 — `FormField` composite + a11y label warnings

### Current-state audit (verified 2026-09-27)

| Mechanism | Covers | Gap |
|---|---|---|
| `ui/form/*` (formsnap + superforms) | Auto-wired label via `Control`, `FieldErrors`, `Description` | Needs a `sveltekit-superforms` `form` object — only "real" forms (~login/users/orgs pages), not dynamic config rows |
| `forms/FormLabelWith{Priority}Help` | `?` icon + (priority) tooltip | NOT a label — no `for`/`id` wiring; 8 files |
| `switch-field` | switch + label + description + tooltip | Switch-only, not generalized |
| raw `<label>` | — | **38 occurrences in `src/routes`** — the copy-paste duplication |

`docs/ai/patterns.md:45` already prescribes shared form building blocks —
this component is the documented direction.

### Complete form inventory (verified 2026-09-27 — ALL 56 raw `<label>` sites)

**Superforms `ui/form` (8 files — untouched)**: `LoginForm`,
`ChangePasswordCard`, `configurations/create`, `organizations/create`,
`organizations/[uuid]`, `profile`, `users/create`, `users/[uuid]`.

**Sheet-panel quick-forms** (ad-hoc labels inside global-sheet panels —
the "quick enough → sheet" form class):
- `shell.aiCerebellum` / AiCerebellumPanel — 3 labels
  (`for="cerebellum-*"` → associated)
- `shell.aiModelImport` / AiModelImportPanel — 1 label (dtype select)
- `entity.filters` / entity-list FiltersPanel — 4 labels
  (`for="advanced-*"` → associated)
- `entity-list-table/panels/FiltersPanel` — 4 labels (DEAD file —
  deleted in this plan)

**Routes with ad-hoc labels**:
- `modules/[code]` — 8: six already `for`/`id`-paired (author,
  github_repo_url, …), **two unassociated = the 2 warnings** (:192
  caption, :225 config row)
- `translations` — 5 labels (legacy admin page, wrapping `<select>`/
  `<input>` — verify association per-site during migration)
- `templates` — 1, `welcome` — 3 (OTP/password labels)
- `roles/[uuid]`, `roles/create` — 2 (implicit wrap association —
  HTML-valid but check per-site)
- `organizations/create` — 2 checkbox labels, `users/[uuid]` — 3 checkbox
  labels, `users/create` — 5 checkbox labels (all `for`-paired, inside
  superforms pages — left to `ui/form` or migrated later)

**Inside reusable components** (correct by design, out of scope):
`switch-field` (own label anatomy), `slider-field` (forwards `id` so
external `<label for>` works), `ColorSelector`,
`json-schema-choice-card` (wrap), `AuthMethodsPromptDialog`.

**Score**: ~40/56 already `for`-paired; wrapping-implicit ≈ valid; real
violations = the 2 warnings + a handful in `translations`/`templates`/
`roles` to verify site-by-site in the follow-up migration.

### Decision (user): build ONE prime-field composite — `PrimeField`

New `src/lib/components/ui/form/prime-field.svelte` (component
`PrimeField`, exported from `ui/form/index.ts`) — single field row owning
label + tooltip + hint + error + i18n, control injected via snippet so it
wraps ANY closed-set input (Input, ComboSelect, NumericInput,
PasswordInput, SwitchField, …) — NOT tied to superforms.

**Naming/path (user decision)**: lives in `ui/form/` alongside the
formsnap wrappers; named `PrimeField` to avoid collision with the
existing formsnap `FormField`.

### Impact analysis — what changes and what does NOT (verified)

| Page / area | Mechanism today | Action |
|---|---|---|
| `configurations/create/+page.svelte` | `ui/form` superforms set — label auto-wired via `FormControl`, `TranslatedFormFieldErrors`, inline hints, `FormLabelWithPriorityHelp` inside `FormLabel`. **User: "practically perfect"** | **UNTOUCHED** |
| `users/create`, `users/[uuid]`, `organizations/*`, `profile` | same `ui/form` set; profile/users-[uuid] are **meta-driven** (`getColMeta()` → `tooltip`, `tooltip_priority`, `tooltip_title`, `show_form_tooltip` from EntityMeta columns) | **UNTOUCHED** in this plan; `PrimeField` must expose a `help`/`meta`-compatible shape so a FUTURE optional migration is trivial — not done now |
| `modules/[code]/+page.svelte` | raw `<label>` ×2 (the warnings) + ad-hoc rows | **MIGRATED** to `PrimeField` (the proving ground) |
| `ConfigListRow`/`ConfigValueInput` | dynamic input renderer, no label today | evaluated during modules migration; adopt `PrimeField` only if the row anatomy fits — otherwise unchanged |
| Sheet-panel quick-forms (AiCerebellum ×3, AiModelImport ×1, entity.filters ×4) | ad-hoc labels, mostly `for`-paired | untouched now; PrimeField fit evaluated in follow-up |
| All other raw `<label>` sites (56 total — full table below) | mixed: ~40 `for`-paired, implicit wraps, 2 real violations | inventory-only, separate follow-up plan |

Meta-driven contract — **verified the MetaColumn shape is THE only one**
(`entity-list/types.ts:85-94`): `tooltip`, `tooltip_priority`,
`tooltip_title`, `show_form_tooltip` (+ `show_list_tooltip` for list ctx).
All ~8 consumers copy the identical `{#if meta.tooltip &&
meta.show_form_tooltip !== false}` → `FormLabelWithPriorityHelp` mapping —
no variant to standardize, and the duplication itself is absorbed:
`PrimeField` accepts `help` as either `{ text, priority?, title?,
labelKey? }` OR the raw `MetaColumn` (component does the `$t` + gate
internally). Bonus finding — `forms/FormLabelWithHelp.svelte`: **zero code
consumers** (verified `git grep`: only doc artifacts reference it;
`/configurations/create` + `/profile` use `FormLabelWithPriorityHelp`).
Its own doc admits *"without a priority, PriorityHelp behaves like
FormLabelWithHelp"* → strict subset. **Delete WITH doc cleanup**:
remove `form-label-with-help.mdx`, its rows/links in
`components/index.mdx`, `form.mdx`, `tooltip.mdx`, `ui-components.mdx`,
`_order.json` if present; re-run `pnpm extract-docs` to regenerate
`components.json`/`component-provenance.json`.

```svelte
<PrimeField
  id="cfg-{entry.key}"
  label={entry.label_key ? $t(entry.label_key) : entry.key}
  hint={entry.description_key ? $t(entry.description_key) : undefined}
  help={{ text, priority, title }}   <!-- optional → reuses FormLabelWithPriorityHelp -->
  error={errors?.[entry.key]}
  required
>
  {#snippet control({ id })}
    <Input {id} bind:value={...} />
  {/snippet}
</PrimeField>
```

Internal anatomy — **TWO layouts** (verified in production; styles
preserved, nothing invented):

**`layout="stacked"` (default)** — for standard inputs
(`Input`/`ComboSelect`/`NumericInput`/`PasswordInput`/`ConfigValueInput`/…):
`space-y-2` → header (`<label for>` `text-sm font-medium` + `required *`
+ help icon) → `control` → `hint`/`error` below.

**`layout="inline"`** — for boolean/choice controls
(`Switch`/`Checkbox`/`choicebox`/radio-likes):
`space-y-2` → `flex items-center gap-2` row = `control` FIRST +
`<label for>` `text-sm font-medium leading-none
peer-disabled:cursor-not-allowed peer-disabled:opacity-70` + help icon
→ `hint`/`error` below. Exact anatomy of `switch-field` (Switch+label+
`FormLabelWithPriorityHelp`+description) and profile's manual checkbox
rows — generalized for any control.

Both: `control` snippet receives `id` → real `label for`/`id` pairing
always (user decision); `hint` = `text-xs text-muted-foreground`;
`error` = translated line under the control (`text-destructive`,
consistent with `form-field-errors`); help via
`FormLabelWithPriorityHelp` reused as-is.

Note: `switch-field` is already Layout-B-complete for Switch — untouched;
`PrimeField layout="inline"` generalizes the same anatomy for
Checkbox/choicebox and future bool-like widgets (possible future
consolidation — SwitchField could become `PrimeField`+Switch internally;
NOT in this plan).

### Fix the 2 warnings via `PrimeField`

- **:192** — read-only `service_version` caption → `PrimeField` without a
  real control is wrong here; it's a section caption → plain
  `<span class="text-sm font-medium">` (no label element).
- **:225** — per-`configEntries` row → migrate the whole row to
  `PrimeField` with `id="cfg-{entry.key}"` (entry.key is snake_case →
  id-safe, prefixed for uniqueness).

### New rule (doc)

`.devin/rules/form-field-standard.md`:
**no raw `<label>` in routes** — superforms pages use `ui/form`; everything
else uses `PrimeField`; read-only captions use `<span>`/`<p>`, never
`<label>`.

### Documentation (user-requested — part of the deliverable)

**Two SEPARATE anatomy pages, cross-linked** — one per field anatomy:

- `docs/user-guide/components/form-fields.mdx` — **superforms/formsnap
  anatomy**: `FormField` + `FormControl` + `FormLabel` + `Control` props
  (`{...props}` → auto `id`/`for`/`aria-invalid`), `TranslatedFormFieldErrors`,
  hint `<p>` pattern, `FormLabelWithPriorityHelp` inside `FormLabel`.
  Real-world reference: `configurations/create` (canonical page). When to
  use it: any form backed by `sveltekit-superforms`.
- `docs/user-guide/components/prime-field.mdx` — **PrimeField anatomy**:
  the standalone wrapper for NON-superforms rows (config entries, dynamic
  meta rows, settings widgets). `id` + `label` + `control` snippet +
  `hint`/`required`/`help`/`error` props. When to use it: any field row
  outside a superforms `form`.
- Each page links the other ("using superforms? see …" / "not in a form?
  see …") + both link the decision table in `docs/ai/patterns.md` and the
  `form-field-standard` rule.
- Content, **case by case with live examples**:
  1. label only (`<PrimeField id label>` + Input)
  2. label + hint
  3. label + `required`
  4. label + `help` tooltip (plain and `priority` variants — mirroring
     `configurations/create`'s optional-tooltip pattern)
  5. label + `error` (translated error line)
  6. meta-driven (`help` fed from `getColMeta()` output — tooltip/
     priority/title/show_form_tooltip) — documented as the bridge for
     future meta consumers, examples from profile page shape
  7. different controls across BOTH layouts: `ComboSelect`,
     `NumericInput`, `PasswordInput`, `ConfigValueInput` (stacked) +
     `Switch`, `Checkbox`, `choicebox` (`layout="inline"` — mirroring
     `switch-field` and profile checkbox rows)
  8. non-field captions → `<span>` (anti-pattern section: read-only values
     must not use `<label>`)
- Each example: snippet + which existing page it mirrors.
- `docs/ai/patterns.md` — extend the form section with the two anatomies +
  decision table (`ui/form` vs `PrimeField` vs `<span>`).
- `docs/user-guide/components/index.mdx` + `_order.json` updated per
  docs-user-guide rules; `pnpm extract-docs` picks the component up.

### Gradual migration (separate phase, flagged — not this plan)

The remaining raw `<label>` sites (full 56-site inventory above —
routes + sheet-panel quick-forms + dialog) get a follow-up per-site
verification + migration to `PrimeField`/`ui/form`. Tracked as a separate
plan to keep this change reviewable.

### How to test ARIA/WCAG UX (Part 2 — requested by user)

The pipeline already exists — `scripts/axe-audit.mjs` (`pnpm run test:a11y`)
drives `@axe-core/playwright` over the app with WCAG 2.0/2.1/2.2 A/AA/AAA +
Section 508 + EN 301 549 tags and emits `public/vpat/vpat-data.json` — the
input the docs-repo VPAT generator consumes. Plan:

1. **Baseline**: run `pnpm run test:a11y` (dev server on 5173) BEFORE the
   fix; save `vpat-data.json` as baseline evidence of the 2 violations.
2. Add the module-detail route to `ROUTES` in `scripts/axe-audit.mjs`
   (`/system/settings/modules/<code>` — note: needs auth, check how
   authenticated (app) routes are reached in the audit today).
3. **After-fix run**: same audit → diff violations JSON; expect the two
   `label`-rule violations gone, no new ones.
4. **Targeted assertions** (beyond axe, which can't check *correct*
   association): new Playwright spec or extend an existing one —
   `expect(input).toHaveId(...)`, `page.getByLabel('...')` resolves the
   config input (proves the accessible name actually wires the label to
   the control), `expect(locator('label')).toHaveAttribute('for', ...)`.
   jest-dom matchers are already available via `vitest-setup.ts`.
5. **Manual SR pass** (documented, not automatable): NVDA (Win) /
   VoiceOver quick checklist on the modules config tab — field name
   announced, focus order sane. Record in plan evidence, not CI.

axe answers *"which WCAG rules are violated"*; role/label queries answer
*"does the name actually reach the control"*; only a screen reader answers
*"does it sound right"* — the three layers together = the ARIA test story.

## Part 3 — WebLLM residue (evidence report, decision needed)

Verified facts:

- `@mlc-ai/web-llm@0.2.85` is pinned in `package.json` and in the lockfile,
  but **no live source file imports it** — only the 4 `.webllm.bak.*` files
  (kept intentionally for future WebLLM re-integration).
- `sw-manager.ts` keeps `webllm-models-` in `SW_OWNED_CACHE_PREFIXES` —
  legitimate legacy-cache purge, **keep as-is**.
- ~8 files still mention "WebLLM" in JSDoc/comments
  (`ModelCachePanel`, `ModelCacheSection`, `smart-regex-input`,
  `api-types.ts`, `/ai/+page.svelte`) — doc drift only, harmless.
- **Decision (user)**: **REMOVE** the unused `@mlc-ai/web-llm` dependency —
  `pnpm remove @mlc-ai/web-llm`, then `pnpm install` (lockfile sync),
  `pnpm run check` + `pnpm run build` to prove nothing imports it
  (verified: only `.bak` files reference it; re-add on re-integration).

## Dead code — verified verdict (2026-09-27 deep audit)

The live features work through `entity-list/sheets/panels/*` (registered in
`SheetHost`, opened via `openSheet`) — the user's tested column-selector /
search-in / filters all use those. The `entity-list-table/panels/*` twins
are **obsolete pre-SheetHost duplicates** left behind by commit `df3a1bf`
("feat(ui): global SheetHost", Apr 2026) which migrated panels to the
global sheet. Evidence: near-identical files — the old ones still take `t`
as a prop (pre-i18n-store API) instead of importing `$t`.

- `ColumnSelectorPanel.svelte` — 0 render sites; only an unused import at
  `EntityListTableHeader.svelte:4` + `panels/index.ts` re-export → DELETE.
- `SearchInPanel.svelte` (entity-list-table) — 0 render sites; only the
  `index.ts` re-export → DELETE.
- `FiltersPanel.svelte` (entity-list-table) — referenced ONLY as
  `content: FiltersPanel` prop in the `entity.filters` openSheet call, and
  the sheet panel **never renders `content`** → dead in practice; remove
  together with the `content`/`props` call-shape wart (sheet plan §3).
- `PreviewPanel.svelte` — LIVE (`PreviewPanelWrapper` renders it) → keep.
- After deletions, prune `panels/index.ts` exports.

## Steps

0. **Baseline capture**: `pnpm run check`, `pnpm run test:unit`,
   `pnpm run test:a11y` → save outputs (evidence of pre-existing state:
   0 errors, 2 warnings, N axe violations).
1. Migrate the 16 `$$Props` files (batch by directory, autofixer per file).
2. Create `src/lib/components/ui/form/prime-field.svelte` + export in
   `ui/form/index.ts` (anatomy per Part 2, autofixer-clean), reuse
   `FormLabelWithPriorityHelp` for `help`; delete dead
   `forms/FormLabelWithHelp.svelte` **with doc cleanup** (mdx page +
   index/links + `pnpm extract-docs` regeneration).
3. Migrate `modules/[code]/+page.svelte` rows to `PrimeField`; fix the
   :192 caption → `<span>`; write `form-field-standard` rule; write BOTH
   docs pages `docs/user-guide/components/{form-fields,prime-field}.mdx`
   (cross-linked, per Documentation section) (+ index/_order) and
   extend `docs/ai/patterns.md` form section.
4. `pnpm remove @mlc-ai/web-llm` + lockfile sync + verify zero live imports.
5. Dead-code removal: `ColumnSelectorPanel` import + file,
   `SearchInPanel` file, `FiltersPanel` file (+ prune `panels/index.ts`;
   `FiltersPanel` removal pairs with the `content:` call-shape cleanup in
   the sheet plan — coordinate order or do both here).
6. New unit render tests (smoke pattern) for the riskiest files +
   `FormField` (label `for`/`id` wiring, hint/error render, help tooltip).
7. Add modules-detail route to `scripts/axe-audit.mjs` ROUTES; re-run
   `pnpm run test:a11y` → diff vs baseline.
8. `pnpm run check` + `pnpm run test:unit` + `pnpm run build` → all green.
9. Targeted ARIA Playwright assertions for the label association.
10. Update `docs/ai/svelte-runes.md` (or AGENTS.md § rules) to reference
    `.devin/rules/svelte4-legacy-idioms.md` + `form-field-standard`.

## Acceptance criteria

- `git grep "interface \$\$Props\|createEventDispatcher\|export let "` → 0 hits.
- `pnpm run check` → 0 errors, 0 warnings.
- `pnpm run test:unit` green incl. new render tests; `pnpm run build` clean.
- `pnpm run test:a11y` → label violations gone, no regressions.
- `PrimeField` renders `label for`/`control id` pairs (unit test +
  `getByLabel` Playwright assertion prove the wiring).
- `configurations/create` (and all `ui/form` superforms pages): **zero
  diff** — untouched by design.
- `form-fields.mdx` + `prime-field.mdx` exist, cross-linked, with
  per-case examples; `pnpm extract-docs` picks the component up.
- No behavioral change (visual/E2E identical).
