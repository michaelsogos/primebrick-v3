# Feature — display_field physical nullability must be explicitly authored (construction lint)

**Status**: ✅ **DONE 2026-12-21** — WS-A DAL nullable-authorship guard `6b6ec50` (752/752 DAL, 158/158 JH); filter tooltip `5f31917` (7 languages + docs regen); WS-B RuleFilterEditor single-row cascade `9e64f89` (choreography spec green live). Moved to COMPLETED.

## Objective

Add a non-suppressible construction-time error in `withColumnConstraints`: when a
**writable physical** column serves as `display_field` and its `nullable` was
never explicitly declared in `@Column({ nullable: … })`, meta construction fails
with a clear error.

Rule (user's words): *"serve se il dev usa i default, non se lo esplicita"*
— the error exists for the developer who never declared nullability; a developer
who wrote `nullable: true` OR `nullable: false` explicitly has "esplicitato" and
passes. The write contract already forces `required` on the wire (served
`nullable:false`); the physical DB fact stays the author's responsibility and
must be stated, never defaulted silently.

## Verified facts (evidence, not assumptions)

- `@Column` assigns `col.nullable` ONLY when the option is present
  (`entity-decorators.ts:475`: `if (sqlNameOrOpts.nullable !== undefined) col.nullable = …`).
- Decorators inject `nullable` as a side effect — these are NOT authored choices:
  `@Key` → false (`:599`), `@Unique` → false only when undefined (`:572`),
  `@Partition` → false (`:722`), `@DeletableField` → true (`:633`),
  `@CloneField` → true (`:659`).
- Persistence resolution collapses omission: `entry.nullable = reg.nullable ?? false`
  (`entity-decorators.ts:1205`) — undeclared ⇒ NOT NULL in DDL
  (`emit-sql-patch.ts:44-45`: `false` → `" NOT NULL"`). The authored-vs-derived
  distinction is LOST at this point unless preserved.
- Implicit convention columns exist: `syncImplicitEntityColumns`
  (`entity-decorators.ts:373-392`) registers undecorated props via
  `discoverInstancePropertyKeys` — a bare `display_name!: string` is a physical
  column with `nullable` never touched. This is the primary "dev uses defaults"
  target.
- `enforceIdentityColumnContract` (`column-constraints.ts:737-882`) already owns
  the display_field write-contract convention block (`:842-871`); it receives
  only `entityClassName` — the persistence object must be passed for the new check.

### Runtime probes (executed, verbatim output — TIC is empirical)

`bun -e` against `src/meta/entity-decorators.ts` + `src/schema-diff/`:

```
A-implicit-nullable (@Column({length:50}), no nullable) → {"name":{"nullable":false}}
B-explicit (@Unique + @Column no nullable)              → {"code":{"nullable":false}}   // @Unique-injected, NOT authored
C-undecorated-prop (bare class field)                    → {"name":{"nullable":false},"deleted_at":{"nullable":true}}
snapshot: name → isNullable: false;  implicit_col → isNullable: false   // → " NOT NULL" (emit-sql-patch:45)
```

Proves: (1) omission resolves `false` → NOT NULL — the "default" is the
*missing declaration*, not a nullable column; (2) undecorated props ARE physical
columns (implicit convention) with `nullable` never touched; (3) decorator
side-effects inject `nullable` without any authored choice. The lint's real
target is the *authored-intent gap*, and `nullableAuthored` is required because
the resolved value can no longer distinguish these cases.

## Census — every display_field in the workspace (all currently authored; zero breakage)

| Entity → display_field | Column declaration | Authored? |
|---|---|---|
| 16× dict entities → `label_key` | `@Column({ length: 100, nullable: false })` | ✓ |
| `organization`, `user_profile`, `customer` → `display_name` | `@Column({ nullable: true })` | ✓ |
| `job_trigger` → `name` | `@Column({ length: 200, nullable: false })` | ✓ |
| `job_schedule`/`job_run` → `trigger` | `@Calculated` — not physical | exempt |
| `provider` → `provider` | `@Unique` + `@Column({ length: 50, nullable: false })` | ✓ |
| `ai_model` → `model_id` | `@Unique + @Column({ length: 100, nullable: false })` | ✓ |
| `ai_cerebellum` → `assistant_key` | `@Unique + @Column({ length: 60, nullable: false })` | ✓ |
| `role_mapping` → `idp_role` | `@Unique + @Column({ length: 255, nullable: false })` | ✓ |
| `client_registry` → `ua_prefix` | `@Unique + @Column({ length: 255, nullable: false })` | ✓ |
| `config_entry` → `key` / `value` | base `@Column({ nullable: false })` / `@Column({ nullable: true })` | ✓ |
| `email_template` → `subject` | `@Column({ nullable: true })` | ✓ |
| `local_address` → `street`, `legal_form` → `name_local`, `customer_consent` → `doc_version`, `customer_account` → `company_name`, dict `code` cols | all `nullable` authored | ✓ |

Expected blast radius: **none** — the lint is future-proofing + the implicit-column trap.

## Changes

### 1. `primebrick-dal-v3/src/meta/entity-decorators.ts` — provenance flag

a) `ColumnRegistration` (~line 109, next to `nullable`): add

```ts
/** `nullable` was explicitly declared via `@Column({ nullable })`.
 *  Decorator-imposed defaults (@Key/@Unique/@Partition/@DeletableField/
 *  @CloneField) and the implicit `?? false` fallback do NOT set this —
 *  it records authored intent, not the resolved value. */
nullableAuthored?: boolean;
```

b) `@Column` implementation (~line 475): inside the existing
`if (sqlNameOrOpts.nullable !== undefined)` branch add `col.nullableAuthored = true;`

c) `EntityPersistenceMeta["columns"]` entry type (~line 1024): add the same
optional `nullableAuthored?: boolean` with the same doc comment.

d) Entry resolution (~line 1205, after `entry.nullable = reg.nullable ?? false`):
`if (reg.nullableAuthored !== undefined) entry.nullableAuthored = reg.nullableAuthored;`

Merge semantics: `collectEntityColumnRegistrations` is parent-first/subclass-wins
per whole `reg` object (`:351-359`) — `nullableAuthored` inherits the same fate
as `nullable` automatically (a subclass re-declaration that omits `nullable`
drops both the value and the authored flag → error surfaces; correct by rule).

### 2. `primebrick-dal-v3/src/meta/column-constraints.ts` — the guard

a) `enforceIdentityColumnContract` signature (`:737`): accept the full
`persistence` object instead of `entityClassName` (or add it as a param);
call site `:704` updated accordingly; internals read `persistence.entityClassName`.

b) Inside the display_field write-contract block (`:852-871`), inside the existing
`if (writable)` gate, BEFORE the contract injection:

```ts
const phys = persistence.columns[meta.display_field];
if (phys && phys.nullableAuthored !== true) {
  throw new Error(
    `withColumnConstraints[${persistence.entityClassName}]: display_field "${meta.display_field}" does not declare nullability — ` +
      `the write contract forces required on the wire, but physical nullability is the column author's choice: ` +
      `declare @Column({ nullable: false }) (NOT NULL — aligned) or @Column({ nullable: true }) (accepted divergence)`,
  );
}
```

Gate = the SAME `writable` predicates as the convention block (physical, not
calculated/virtual, not managed, not audited, not uid): the lint guards exactly
the columns that inherit the forced write contract — the divergence only exists
there. Calculated/virtual display_fields (`job_schedule.trigger`, `job_run.trigger`)
and relation entities (display_field already forbidden) are exempt by construction.

c) Doc header (`:23-44` numbered ENFORCEMENT list): add item 7 —
"the display_field column resolves to a writable physical column whose
`nullable` was never declared in `@Column` — decorator-imposed values and the
implicit `?? false` fallback are not a declaration".

### 3. `primebrick-dal-v3/test/column-constraints.test.ts` — coverage

New `it` cases in the `display_field convention` area (mirror `Cc*` fixtures):

- `@Column({ length: 200 })` WITHOUT `nullable` on display_field →
  `withColumnConstraints` throws; message contains entity name, `"display_field"`,
  the column key, `nullable: false` and `nullable: true` suggestions.
- Implicit column (bare prop, no decorator) as display_field → throws
  (the "uses the defaults" target case — needs `discoverInstancePropertyKeys`
  to see the prop; fixture declares it as a plain class field).
- `@Column({ nullable: false })` → passes (already-covered fixture `name`).
- `@Column({ nullable: true })` → passes (already-covered `display_name` fixture).
- `@Unique` ALONE on the display_field prop (injected false, no `@Column`) →
  throws — proves decorator-injected is not authored.
- Calculated display_field → exempt (existing test at :88-112 already covers).

## Message contract

Single throw site, `Error` (file convention; TypeError used only in decorator files).
Text: names entity class + `display_field` + the column key; states the two
legal escapes explicitly (`nullable: false` → NOT NULL aligned; `nullable: true`
→ accepted divergence). No suppressions, no warnings — construction throw.

## Out of scope

- No DDL/behavior change: `nullable` omitted keeps resolving `?? false` (NOT NULL).
- No served-meta change: the forced `nullable:false` write contract stays.
- `nullable:true` remains fully legal — explicitly authored divergence.
- No FE/SDK/BE changes; no doc edits without approval (flag for later:
  `entities.mdx` does not yet document the display_field write contract at all —
  report as stale-doc candidate, do NOT fix silently).

## Acceptance criteria

1. New flag flows: `@Column({nullable})` → `ColumnRegistration.nullableAuthored`
   → persistence entry → readable in `withColumnConstraints`.
2. Writable physical display_field without authored `nullable` → construction throw.
3. `nullable:true`/`nullable:false` authored → pass; injected-only → throw.
4. Calculated/virtual/managed/audited/uid display_fields → exempt.
5. `pnpm test` green in dal; `test/column-constraints.test.ts` covers all cases.
6. `tsc --noEmit` clean; live JH meta resolution (dev-condition → src) still boots
   (its 158-test suite exercises every real display_field through the new path).
7. Commit on `develop` (conventional), tree clean.

---

# Workstream B — `rule_filter` composer: single-row cascade + JSON preview

## Objective

Restructure `RuleFilterEditor.svelte` (the `format:"rule_filter"` composer —
`job_trigger.filter`, `primebrick-fe-v3/src/lib/entity-form/`) from a
progressively-REVEALED vertical stack into the payload-mapper anatomy:

1. ONE row — field PropNavigator · op ComboSelect · value control · add CTA
   (row end) — all rendered immediately, `disabled` in cascade
   (field → op → value → add) instead of `{#if}`-hidden.
2. Between the combo row and the JSON preview: committed filters as badges;
   empty → `system.entities.list.filter_badge.no_filters_applied`
   ("Nessun filtro applicato" — already seeded in all 7 languages, zero i18n work).
3. Below: `JsonValueEditor` with `preview_open={false}` bound to the same
   `value` — the preview accordion like the payload mapper
   (`payload-map-editor.svelte:1251-1278`). Its own toolbar toggle covers
   preview⇄edit, so the `mode:'json'` branch and the "Edit JSON" ghost CTA
   (the second non-standard CTA) are deleted — one editing surface, not two.

## Verified facts (component anatomy, read verbatim)

`RuleFilterEditor.svelte` (356 lines):

- PropNavigator row always rendered (`:236-246`); op PrimeField only
  `{#if newField}` (`:249`); value PrimeField only `{#if newField}` +
  `newOp !== 'exists'` (`:265`); add row always rendered,
  `disabled={addDisabled}` (`:301-317`); JSON ghost CTA → `mode='json'`
  full-surface replace (`:313-316`, `:211-229`).
- Badges only `{#if filters.length > 0}` (`:321`); empty editable state shows
  NOTHING; locked-empty shows raw `value` (`:352-353`).
- `PropNavigator` accepts `disabled` (`prop-navigator.svelte:52`) — the cascade
  is natively supported.
- Wire contract: `value` is `JSON.stringify(RuleFilter[])`; `$effect` re-parses
  external edits into the `filters` draft (`:106-109`); invalid JSON →
  `parseFilters` returns null → draft untouched (today forces raw mode).
- `schema={column.json_schema}`, `on_ai_assist`, `extra_completions` props are
  already forwarded to JsonValueEditor in json mode — forward them identically
  to the always-visible editor.
- `entity-events-choreography.spec.ts:129-161` exercises
  `rule-filter-field` → `rule-filter-op` → `rule-filter-value` →
  `rule-filter-add` → `rule-filter-badges` — testids stay stable.

Reference anatomy (payload-map-editor.svelte): composer rows use
`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] items-start gap-2`
(`:979`, `:915`, `:1191`); the JSON surface is a `JsonValueEditor
preview_open={false}` sibling below the composer (`:1251`).

## Changes

### 1. `RuleFilterEditor.svelte` — restructure

Script: delete `mode` state; add cascade derivations:

```ts
const fieldDisabled = $derived(locked || !source_schema); // no schema → no paths
const opDisabled    = $derived(locked || !newField);
const valueDisabled = $derived(locked || !newField || newOp === 'exists');
```

(`source_schema`-absent field disable = cascade level 0: without the emit's
payload_schema the navigator has no paths to offer.)

Markup (builder — the only mode):

```svelte
<div class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,2fr)_auto] items-start gap-2">
  <PropNavigator nodes={pathTree} … disabled={fieldDisabled} data-testid="rule-filter-field" … />
  <ComboSelect … options={opOptions} disabled={opDisabled}
               placeholder={$t('system.entities.list.operator')} data-testid="rule-filter-op" />
  <div class="min-w-0"><!-- same value-kind switch --></div>
  <Button variant="outline" size="sm" type="button" disabled={addDisabled}
          onclick={addFilter} data-testid="rule-filter-add"><Plus/> {add_filter}</Button>
</div>
{#if filters.length > 0}
  …existing badge strip…
{:else}
  <span class="text-xs italic text-muted-foreground/70" data-testid="rule-filter-empty">
    {$t('system.entities.list.filter_badge.no_filters_applied')}
  </span>
{/if}
<JsonValueEditor bind:value {schema} minRows={6} preview_open={false}
                readonly={locked} {on_ai_assist} {extra_completions} />
```

Value control keeps the schema-leaf switch (enum combo / boolean combo /
NumericInput / TextInput), `disabled={valueDisabled}`, placeholder
`system.entities.list.value`. PrimeField per-cell labels drop — the payload-map
rows are unlabeled; the form wrapper already labels the field itself.

Removed: `mode` state, `{#if mode === 'json'}` branch, the Braces ghost CTA,
PrimeField wrappers inside the composer, the `{#if newField}` reveals, the
locked-empty `value || '—'` span (JsonValueEditor readonly-preview replaces it
— richer and consistent).

Kept: `parseFilters` + resync `$effect` (raw edits below keep badges honest),
`addFilter`/`removeFilter`, `addDisabled` logic, all `data-testid`s.

### 2. Tests / verification

- `entity-events-choreography.spec.ts` — flow unchanged (same testids);
  verify it still passes live.
- svelte-autofixer MCP pass on the new markup; `pnpm run check` clean.
- E2E evidence: create trigger, exercise cascade + empty state + preview toggle.

## Out of scope (B)

- No wire change: `value` stays `JSON.stringify(RuleFilter[])`; `matchFilter`
  `.every()` semantics untouched.
- No i18n patch: every label/key already seeded or fallback-covered.
- Invalid-JSON edge: `parseFilters` null → badges keep last valid draft; the
  raw document stays editable in the JSON surface (same honesty rule as today).

## Acceptance criteria (B)

1. Single-row composer, all controls rendered immediately, cascade-disabled.
2. Empty committed state renders "Nessun filtro applicato" (seeded key).
3. JsonValueEditor preview accordion visible below, `preview_open={false}`.
4. No `mode` state, no separate Edit-JSON CTA, no PrimeField composer labels.
5. `pnpm run check` clean; choreography spec green live.
6. Commit on `develop` (conventional), tree clean.
