# Pre-Plan: Dynamic Form Pages from BE Schema

**Status:** PRE-PLAN (reminder for future deep-dive)
**Date:** 2026-09-01
**Scope:** FE + BE + SDK (cross-cutting)

## Objective

Eliminate static form pages. Any SuperForm/Formsnap form page should be
drawable from a **JSON form schema** provided by BE, combined with existing
**entity metadata** for RBAC, list behaviors, and visual representation.

Today: every form page (`/profile`, `/users/create`, `/orgs/create`,
`/security/create`, ...) is hand-coded with a fixed Zod schema, fixed field
layout, fixed validation. Adding a new entity = writing a new form page from
scratch.

Tomorrow: BE returns a form schema → FE renders the form dynamically →
validation is shared BE/FE → no more static form pages.

## Two-layer model

| Layer | Source | Purpose |
|-------|--------|---------|
| **Form Schema** | BE (new endpoint or entity metadata extension) | Field definitions, types, validation rules, widget hints, layout, grouping, visibility conditions |
| **Entity Metadata** | BE (existing `entityMetadata`) | RBAC permissions, list columns, dropdown options, labels, relationships, audit config |

Form Schema defines **how to edit** an entity.
Entity Metadata defines **what the entity is** and **who can do what**.
Combined at FE to render the full form page.

## Key constraints (learned from current form pages)

1. **Guards must remain**: `useFormGuard`, `useUnsavedChangesGuard`,
   `useFormGuard` tainted/valid CTA logic — all preserved.
2. **Validation rules from BE**: same rules BE uses in PUT/POST guards.
   Rules can be static (schema) or dynamic (from DB, like config items'
   `type_config.validation`). FE must handle both.
3. **Zod dynamic + SuperForms friction**: dynamic Zod schemas built at
   runtime don't always play well with SuperForms validators. Two paths
   to evaluate:
   - **Path A**: Heavy use of `refine()` / `superRefine()` on a fixed
     base schema (proven pattern from `users/create` password policy
     and `security/create` value validation).
   - **Path B**: BE compiles the Zod schema and sends it as a
     pre-built, serializable schema definition that FE reconstructs
     into a Zod instance once (not per-validation). Avoids runtime
     dynamic schema construction.
   - **Path C**: Hybrid — fixed Zod base from BE schema definition,
     `superRefine` for cross-field and dynamic rules.
4. **Custom components**: the form renderer must mount arbitrary Svelte
   components (Switch, ComboSelect, DateWheelPicker, Password.Input,
   ConfigValueInput, custom widgets) — NOT limited to HTML5 inputs.
5. **SPA mode**: `superForm(..., { SPA: true })` + `use:enhance` +
   `onUpdate` for API calls — preserved.
6. **i18n**: all labels/descriptions/placeholders/errors via translation
   keys, not hardcoded strings.

## Library evaluation (to research)

Need a library (or combination) that:
- Generates forms from a JSON schema or Zod schema
- Compatible with **Zod** (ideally Zod-first)
- Compatible with **sveltekit-superforms** (or replaces it cleanly)
- Compatible with **Formsnap** (or replaces it cleanly)
- **Svelte 5 runes** support (no legacy Svelte 4)
- Allows **custom Svelte components** as field renderers (not HTML5-only)
- Supports conditional fields, visibility rules, cross-field validation
- Active maintenance, recent releases

Candidates to evaluate (non-exhaustive — research needed):
- **Formsnap** itself — does it already support schema-driven rendering?
- **@sveltejs/forms** (if exists for Svelte 5)
- **TanStack Form** — Svelte adapter, Zod-compatible, custom components?
- **Conform** — Zod-first, framework-agnostic, Svelte support?
- **JSON Schema** ecosystem (rjsf-style for Svelte) — too HTML5-bound?
- **Custom in-house renderer** — minimal, built on SuperForms + Formsnap
  primitives we already use, driven by BE schema

## Open questions (to resolve in full plan)

1. Where does the form schema live? New BE table? Extension of entity
   metadata? SDK-defined? Per-entity or per-form (create vs edit)?
2. How are widget hints expressed? (`widget: "switch"`, `widget:
   "combo_select"`, `widget: "date_wheel_picker"`, custom?)
3. How are dynamic validation rules (from DB) injected into the schema
   at runtime? Same `type_config.validation` pattern as config items?
4. How are conditional fields / visibility rules expressed?
   (`visible_if: { field: "type", equals: "boolean" }`)
5. Does BE send a Zod-compatible schema definition, or a custom JSON
   shape that FE translates to Zod?
6. How to handle cross-field validation (e.g. password confirm match,
   send_invitation → password required)?
7. How to preserve per-entity custom logic that can't be schema-driven
   (e.g. avatar color generation, key uniqueness check)?
8. Migration path: do we convert all existing form pages at once, or
   entity-by-entity?

## Next steps (when we start the full plan)

1. Research and select the form-rendering library/approach
2. Define the form schema JSON shape (BE contract)
3. Define how BE compiles/stores validation rules (static + dynamic)
4. Build a POC with one entity (e.g. `config_entries` create page)
5. Generalize to a `<DynamicFormPage entity="..." form="create|edit" />`
   component
6. Migrate existing form pages one by one
7. Document the schema authoring guide for BE
