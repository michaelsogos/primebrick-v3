# Website Landing — UUID v7 Identity, Portability & Automatic Navigability Value Props

> Standalone plan. Scope: add the new platform-differentiating value props
> (UUID v7 public identity, full data portability, metadata-driven automatic
> navigability, and related novelties) to the `primebrick-v3-website` Astro
> landing page (`src/pages/[lang]/index.astro`).

## Status: ⚪ TODO — Plan date: 2026-11-25

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Inventory current landing sections + confirm insertion point(s) for the new value props (candidate zones: after `dataPrivacy`, inside `forDevs`/`forCtos`, or a dedicated section between `openSource` and `finalCta`) | ⏳ not done | — | Landing sections live in `src/pages/[lang]/index.astro`; copy keys in `src/i18n/translations.ts` |
| 2 | Draft copy for **UUID v7 identity**: every record publicly identified by time-ordered UUID v7 — sortable, globally unique, no internal integer IDs ever crossing API boundaries | ⏳ not done | — | Tone check vs `primebrick-v3-website` copy conventions; user approves wording before implementation |
| 3 | Draft copy for **data portability**: records are not bound to auto-increment sequences — data is fully portable/exportable/mergeable across environments and deployments without identity remap; import/export keeps the same public keys | ⏳ not done | — | Key claim: zero lock-in on record identity |
| 4 | Draft copy for **automatic navigability**: entity references are declared once in metadata — every ref cell automatically renders drill-through (record sheet) + external-link to the pre-filtered target list; no hand-wired links anywhere | ⏳ not done | — | Backed by `elt-ref-cell-sheet-plan.md` work |
| 5 | Select additional value props to include (candidates below) — user picks the final set before implementation | ⏳ not done | — | See "Candidate additional props" |
| 6 | Write `t.*` keys in `src/i18n/translations.ts` for all 6 site languages (EN, IT, DE, ES, PT, FR) — real translations, no key fallback | ⏳ not done | — | Website uses 6 languages (not the app's 7) |
| 7 | Implement section/cards in `index.astro` following existing section anatomy (gradient headings, `px-6 py-24`, icon+title+text card grid) | ⏳ not done | — | Reuse existing card patterns; no new component framework |
| 8 | Visual check all breakpoints + all 6 languages; run website checks/build | ⏳ not done | — | `pnpm build` in `primebrick-v3-website` |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Context — why these props, why now

The metadata-driven migration plus the ELT ref-cell/record-sheet work landed a
set of architectural properties that are genuinely rare in the market and
worth stating on the landing page — they are **provable from the product**,
not aspirational:

- **UUID v7 public identity** — `dal-v3-many-identity-alignment`,
  `dal-v3-breaking-changes`, `uuid_v4_to_v7_rewrite` patches: integer IDs are
  internal-only; UUID v7 is the sole identity crossing API boundaries.
- **Portability as a consequence** — because identity is not a DB-local
  sequence, records carry the same key across export/import, env promotion,
  backups, and multi-instance topologies. This is a real, demonstrable
  property — not marketing.
- **Automatic navigability** — `type:"ref"` columns declare `{entity,
  value_field, route, filter_field}` once in `*.meta.ts`; the FE then
  renders drill-through (record sheet with stacked navigation) and a
  pre-filtered external-link CTA for free, on every entity, card and table.

## Candidate additional props (user selects the final set)

| Prop | Provenance | Landing angle |
|------|-----------|---------------|
| One metadata contract drives DB + API + forms + lists + filters + translations | metadata-driven migration | "Declare a field once — it exists everywhere correctly" |
| Built-in version history & audit actors on every record | VersionHistoryPanel, `v` badge, audit fields | compliance/auditability out of the box |
| Closed, lint-enforced contracts — malformed widgets/fields fail at build | standards lint + baselines | "the platform refuses drift, not just discourages it" |
| Per-record timezone-aware datetimes (IANA field on the row) | `datetime_iana_toggle.record_iana_field`, DateWheelPicker | global teams, correct times per record |
| Readonly record sheets on shared form widgets (pencil-toggle ready) | EntityRecordSheet / EntityFormField | inspect any record without mutating it |
| 6-language UI/DB translations managed in-product | system.translations | real i18n, not a plugin |
| MCP OAuth clients self-register via RFC 7591 Dynamic Client Registration | `mcp_oauth_clients` + oauth-dcr.router | "AI tools onboard themselves — no admin-provisioned credentials" |

## Constraints

- **User approves copy before implementation** — task 2–4 drafts are
  proposals; final wording is a user decision.
- Website is an **Astro static site on Cloudflare Workers** (auto-deploy on
  `main`); i18n is file-based (`translations.ts`), no CMS.
- Keep the existing section anatomy — no new design system; cards/gradients
  must match the current page's visual language.
- Claims must stay **true to shipped behavior** — anything still in-flight
  (e.g. the pencil edit toggle) is phrased as architecture, not as a
  finished feature.

---

> **Lifecycle rules**: plans live here; only fully-done plans move to
> `COMPLETED/` (one-way archive — nothing inside is ever revisited).
> Drift (unresolved tasks/notes) MUST be re-homed to an open plan before
> archiving. See `PLAN-CONVENTIONS.md` — it is the normative doc.
