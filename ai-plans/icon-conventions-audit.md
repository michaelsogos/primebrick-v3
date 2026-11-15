# Icon conventions — canonical vocabulary, audit fixes, LD documentation

> Standalone plan. Goal: one canonical icon vocabulary with declared
> meaning/opposite per glyph, enforced across all FE-bearing repos
> (primebrick-v3-ui, primebrick-fe-v3, primebrick-us-v3 remote components,
> primebrick-v3-docs). Triggered by the combo-select `eye` misuse:
> `eye`/`eye-off` mean SECRET reveal/hide only; hidden non-secret data uses
> `eye-dashed` + color state, never a slashed glyph.

## Status: ⚪ TODO — Plan date: 2026-01-16 / icon audit evidence 2026-01-16

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Rewrite `primebrick-fe-v3/docs/dev-guide/icon-conventions.mdx` as the canonical LD page: state-vs-action doctrine + all families below with meaning/opposite/reuse | ⏳ not done | — | draft content exists in session |
| 2 | Update `primebrick-v3-ui/docs/dev-guide/special-icons.mdx`: every gallery entry gains a declared meaning; intro + Conventions updated | ⏳ not done | — | full BEFORE/AFTER drafted in session |
| 3 | Fix banned/deprecated aliases: `XCircle`+`CheckCircle2`→`CircleX`/`CircleCheck` (ai/fe/DocsIndexPage:201,205,241,245); `Loader2`→`LoaderCircle` ×3 (spinner.svelte:18, ai-action-chips:93, ai-action-confirm-dialog:240,337); `AlertCircle`→`CircleAlert` ×5; `Fingerprint`→`FingerprintPattern` ×6; `MoreVertical`→`EllipsisVertical` ×5; `MoreHorizontal`→`Ellipsis`; `HelpCircle`→`CircleQuestionMark` | ⏳ not done | — | lucide 1.59 aliases verified in node_modules |
| 4 | Migrate `Trash2`→`Trash` everywhere (canonical in lucide 1.59; `trash-2` is alias stub → `trash.svelte`) — fe-v3 ×10+, ui ai/ModelCache*, BulkActionsToolbar `Trash` already canonical | ⏳ not done | — | |
| 5 | Fix `✕` literal char close → `X` icon / SheetPanelLayout (job-handler/fe/RunDetailSheet.svelte:86); `▼`/`▶` unicode → `chevron-*` (json-value-editor.svelte:115) | ⏳ not done | — | |
| 6 | `Eye`/`EyeOff` misuse for non-secret preview/view — 8 sites (ErrorsPanel:177, JsonPreviewEditor:100, TableRow:280, CardActions:167, CardList:168, CardGrid:169, SelectionCounter:57-59, json-value-editor:137) → decided glyph (default candidate `panel-right-open`, already the preview-panel toggle) | ⏳ not done | — | BLOCKED on decision D1 |
| 7 | `zap` dilutions: `Zap`@amber-600 bandwidth (ai/fe/machine-capabilities-section:123) → new glyph; `zap` on `once` schedule preset (job-handler/job.meta.ts:208, e2e-locked jobs-pages.spec.ts:135-142) → new glyph + e2e update | ⏳ not done | — | BLOCKED on decisions D2/D3 |
| 8 | RefreshButton adoption where hand-rolled RefreshCw (ai/fe/DocsIndexPage:162-164, fe RemotePageErrorPanel:58, clients/[uuid] regen); `RefreshCw animate-spin`→`LoaderCircle` (MetadataLoading:31); `Star.animate-spin`→`LoaderCircle` (ai/fe/AiSettingsPage:654) | ⏳ not done | — | |
| 9 | Deduplicate assistant glyph: `Bot` plain (regex-ai-chat-panel:197,327; json-config-ai-chat-panel:302; json-ai-chat-panel:195; mcp/consent:163,191) vs gradient `BotIcon` (AiChatPanel:252,321,351; ai-chat-panel:522,561) | ⏳ not done | — | BLOCKED on decision D5 |
| 10 | Extract duplicated `starPaths`/`amberStops` (PageHeader.svelte:123-127 vs SidebarAppLauncher.svelte:465-470) → shared export | ⏳ not done | — | |
| 11 | Restore composite `trash`+`arrow-up-from-line` duplicated 7× (TableRow:305, PreviewPanel:204, CardActions:192, CardList:203, CardGrid:204, StateRenderer:34, BulkActionsToolbar:151) → shared `RestoreIcon`/action component in ui | ⏳ not done | — | |
| 12 | Round `User` in CommandPalette demo (:231-234) → `square-user` or remove demo item | ⏳ not done | — | |
| 13 | Document `MetaColumn.icon` gap in dev-guide entity-metadata pages (primebrick-v3-docs pages/frontend|backend/dev/entity-metadata.mdx cover row-action icon, not column form-label icon) | ⏳ not done | — | |
| 14 | Re-run e2e specs touching icons (jobs-pages.spec.ts, payload-map-widget.spec.ts) + svelte-check + builds | ⏳ not done | — | after code fixes |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Canonical doctrine (the LD contract)

Two glyph families:

- **State pairs** — a glyph expressing a binary STATE has an opposite glyph:
  `eye`/`eye-off` (secrets), `circle-check`/`circle-x` (boolean),
  `star`/`star-off` (favorite), `cloud`/`cloud-off` (health),
  `panel-right-open`/`panel-right-close` (preview), `chevron-up`/`chevron-down`
  (reorder/disclosure).
- **Actions** — a glyph firing an action has NO opposite: `pencil`, `trash`,
  `eraser`, `x`, `plus`, `send`, `copy`, `download`, `rotate-ccw`.
- **Color-state singletons** — `eye-dashed` is the ONLY state glyph without an
  opposite: same glyph, `text-muted-foreground` (hidden) ↔ `text-foreground`
  (shown) + `aria-pressed`. Meaning: reveal hidden NON-SECRET data (filtered-out
  options, disabled partitions). Never secrets.

## Part B — Verified alias table (empirical, lucide 1.59.0)

Alias stubs verified in `primebrick-v3-ui/node_modules/@lucide/svelte/dist/icons/`:
deprecated names ship as `.js`/`.d.ts` re-export stubs only; canonical names own
the `.svelte` file.

| Deprecated alias | Canonical | Direction verified |
|---|---|---|
| `trash-2` | `trash` | trash-2.js → `export { default } from "./trash.svelte"` |
| `user-square` | `square-user` | user-square.js → square-user.svelte |
| `loader-2` | `loader-circle` | loader-2.js → loader-circle.svelte |
| `alert-circle` | `circle-alert` | per aliases.d.ts |
| `x-circle` | `circle-x` | banned by convention |
| `check-circle`/`check-circle-2` | `circle-check` | banned by convention |
| `fingerprint` | `fingerprint-pattern` | per aliases.d.ts |
| `more-vertical`/`more-horizontal` | `ellipsis-vertical`/`ellipsis` | per aliases.d.ts |
| `help-circle` | `circle-question-mark` | DynamicIcon already uses canonical |
| `alert-triangle` | `triangle-alert` | banned by convention |
| `user` (round) | `square-user` for user-base semantics | see system icons |

Rule of thumb: the `.svelte`-bearing name is canonical; `.js`-only stubs are
deprecated aliases. DynamicIcon resolves only canonical names (the glob reads
`dist/icons/*.svelte`) — `name="trash-2"` via DynamicIcon renders `?`.

## Part C — Full gap inventory (doc vs code)

Families MISSING from icon-conventions.mdx today (all evidenced in code):

1. **Reorder/move** — `chevron-up`/`chevron-down` = manual list reorder
   (payload-map-editor:753,756 — the canonical reference); `GripVertical` =
   drag handle (sortable-handle.svelte:23); `ArrowUp/ArrowDown/ArrowUpDown/
   ArrowUpNarrowWide/ArrowDownWideNarrow` = SORT, never reorder.
2. **NATS/events** — `send` + `sky-500` = callable destinations / NATS
   subjects / inject kind (EntityFormPage:161-162, KIND_ICONS inject,
   job.meta.ts:101); `zap` + `amber-500` = events/emits ONLY
   (EntityFormPage:144-145, KIND_ICONS path, job.meta.ts:86). Contract:
   `EmitDecl`/`CallableDecl` carry no `icon` field — the vocabulary is applied
   uniformly by FE census chrome; services cannot override it.
3. **eye-dashed** — the hidden-partition toggle (combo-select:659,680).
4. **System/identity** — `square-user` = user base (NEVER round `user`;
   only round-`user` usage in production is the CommandPalette demo);
   `building-complex` = org/tenant (SidebarOrgSwitcher); `shield-user` =
   role/admin; `shield-off` = no-valid-role; `shield-check`/`shield-alert`/
   `shield-x` = security states; `key-round` = credentials; 
   `fingerprint-pattern` = passkey/WebAuthn; `smartphone` = TOTP; `qr-code` =
   enrollment QR; `cookie`/`rotate-ccw-key` = session; `image-off` = avatar
   remove. These are SYSTEM icons: reuse is allowed only while preserving the
   declared meaning — never repurpose `shield-user` for generic security or
   `square-user` for a single person profile (that stays avatar/initials).
5. **AI family** — `AiIcon` (animated gradient = live AI work; `no_animation`
   = capability marker); `BotIcon` (gradient = assistant identity/avatar —
   the "who"); `brain-circuit` = AI capability; `circuit-board` = cerebellum
   tuning; `cpu`/`server`/`microchip` = local/remote runtime; `ModelIcon` =
   per-model brand glyph (9 brand SVGs + `cpu` fallback); `send` = prompt-send
   (same glyph as callable dispatch — the shared meaning is "dispatch/
   submit"; `sky-500` is reserved to the NATS context); `circle-stop` = stop
   streaming; `sticky-note-plus` = new session; `thumbs-up`/`thumbs-down` =
   recommendation verdicts; params: `thermometer` (temperature), `gauge`
   (top_p/speed), `gavel` (rep. penalty), `brackets` (max_tokens), `database`
   (kv_cache); `trophy`/`award`/`circle-gauge`/`flask-conical`/`calendar-fold`
   = model test report.
6. **Favorites** — ON = `GradientIcon` custom star paths, amber gradient,
   filled; OFF = lucide `star` outline `text-muted-foreground`;
   `star-off` = unfavorite affordance (launcher). Duplicated path data to
   deduplicate (task 10).
7. **Health/infrastructure** — `cloud`/`cloud-off` = BE/IDP/service
   reachability; `database` = Postgres; `database-zap` = Redis; `radio` =
   NATS; `brain-circuit` = AI-LLM row; `server-off` = unavailable.
8. **Entity-list chrome** — sort arrows (see reorder split), `funnel` =
   filters, `columns-3` = column picker, `table-2`/`layout-grid`/
   `layout-list` = view modes, `panel-right-open`/`panel-right-close` =
   preview panel, `ellipsis-vertical` = row actions menu, `file-clock` =
   audit/history, `history` = version panel, `list-check`/`list-x`/
   `text-align-justify` = deletion-filter modes, pagination chevrons
   (`chevrons-left/right`/`chevron-left/right`).
9. **Schema-type icons** — payload-map vocabulary: KIND_ICONS
   (list→list-plus, map→braces, path→zap@amber-500, const→text-cursor-input,
   meta→activity-cog composed, inject→send), FORMAT_TYPE_ICONS (email→mail,
   url/uri→link, uuid→fingerprint-pattern, date-time/datetime→calendar-clock,
   date→calendar, time→clock, phone→phone, color_hex→palette, lang→languages),
   TYPE_ICONS (string→type, number/integer/bigint→hash, boolean→toggle-left,
   array→brackets, object→braces, null→circle-slash), META_ICONS
   (actor_uuid→user-cog, rule_id→file-key, fired_at→clock-check,
   actor_locale→languages), enum→tags, const→pin, unknown→circle-question-mark,
   nullable union → `_icon_dashed` stroke modifier.
10. **Priority/tooltip** — `info`/`badge-alert`/`badge-x`/
    `badge-question-mark`/`lightbulb`/`badge-check` (content priority) vs
    `triangle-alert`/`octagon-x`/`help-circle` (field-label triggers) — two
    intentionally different trigger-vs-content glyph sets.
11. **Module/nav glyphs** — declared in service registration/nav-decl:
    `users` (crm), `mail` (emailsender), `list-clock` (job-handler), `webhook`,
    `sparkles` (ai module) vs `brain-circuit` (ai console leaf — ⚠️ two AI
    glyphs in one module, flag), `layers` (app root), `git-branch`, 
    `layout-template`, `book-search`, `play`, `list-checks`, `plus`,
    `repeat` (recurring preset), `list-clock` (all preset).
12. **Config types** — `configTypeOptions` 16-icon map
    (configurations/create/+page.svelte:38-58): type, square-text,
    toggle-left, binary, hash, coins, tag, list-check, list-checks, link,
    key-round, braces, calendar, calendar-clock, clock, mail, phone.
13. **Form widgets misc** — `ban` = null/no-value chip, `circle-check-big` =
    validated-ok, `ticket-x` = invalid (⚠️ weak semantic), `calendar`/`clock`/
    `chevrons-up-down` = date-wheel picker, `hash`/`palette`/`droplets`/
    `flask-conical`/`layout-grid` = color-picker modes, `circle` = unmet
    password rule, `dices` = generate, `lock`, `mail-check`, `house`,
    `arrow-left` = back, `minimize-2`/`maximize-2` = panel expand,
    `book-open`/`book-search`/`library-big`/`file-text`/`file-json` = docs,
    `code` = RFC type (⚠️ mild stretch).

## Part D — Misuse findings (empirical, by severity)

### D.1 Violations to fix

| Site | Wrong | Right |
|---|---|---|
| ai/fe/DocsIndexPage.svelte:201,205,241,245 | `XCircle`, `CheckCircle2` | `CircleX`, `CircleCheck` |
| job-handler/fe/RunDetailSheet.svelte:81-87 | literal `✕` char + hand-rolled sheet chrome | `X` / SheetPanelLayout |
| ui json-value-editor.svelte:115 | `▼`/`▶` unicode chars | `chevron-down`/`chevron-right` |
| `Trash2` imports (fe ×10+, ui ModelCachePanel/Section) | deprecated alias | `Trash` |
| `Eye`/`EyeOff` on non-secret preview — ErrorsPanel:177, JsonPreviewEditor:100, TableRow:280, CardActions:167, CardList:168, CardGrid:169, SelectionCounter:57-59, json-value-editor:137 | secret glyph for view affordance | decided glyph (D1) |
| `Zap`@amber-600 bandwidth (ai/fe/machine-capabilities-section:123) | event-marker collision | decided glyph (D3) |
| `zap` `once` preset (job-handler/job.meta.ts:208) | event glyph on schedule type | decided glyph (D2) + e2e update |
| `Loader2` ×3, `AlertCircle` ×5, `Fingerprint` ×6, `MoreVertical` ×5, `MoreHorizontal`, `HelpCircle` (ui triggerIconMap:38) | deprecated aliases | canonical names (table B) |
| `RefreshCw` hand-rolled (DocsIndexPage:162-164, RemotePageErrorPanel:58, clients/[uuid] regen) | convention = RefreshButton | RefreshButton |
| `RefreshCw animate-spin` (MetadataLoading:31), `Star.animate-spin` (AiSettingsPage:654) | wrong spinner | `LoaderCircle` |

### D.2 Semantic collisions / weak mappings (decide)

- `Bot` plain vs `BotIcon` gradient — two assistant glyphs (D5).
- `send` prompt-send vs `send` callable-dispatch — propose shared meaning
  "dispatch/submit", sky-500 reserved to NATS chrome.
- `TextAlignJustify` = deletion-filter "all" — text glyph for "everything";
  candidates `rows-3`/`list`/`list-filter`.
- `TicketX` = invalid input — ad hoc; candidates `circle-x`/`octagon-x`
  (octagon-x already = ERROR trigger).
- `sparkles` module + `brain-circuit` nav leaf — two AI glyphs, one module.
- `play` = run-list nav (jh) — reads as "execute", not "list".
- `Code` = RFC type — mild stretch.
- Dead import `TriangleAlert` (ui ModelCacheSection:29).
- Mixed import styles `../../vendor/lucide.js` vs
  `@primebrick/ui/vendor/lucide` inside ui's own source.

### D.3 Clean confirmations (no action)

- No arrows for reorder; no `X` as delete; `zap` never on callables;
  `send` never on events; delete = trash family everywhere.
- send/zap vocabulary honored everywhere it is declarable: census chrome
  supplies it, `EmitDecl`/`CallableDecl` correctly lack an `icon` field —
  services cannot diverge.

## Part E — Open decisions (user call before code)

- **D1** Preview/view affordance glyph — current `Eye` misuse ×8. Candidate:
  `panel-right-open` (already the preview-panel toggle icon) or another glyph.
- **D2** `once` schedule-preset glyph replacing `zap` — candidates `play`,
  `timer`, `calendar-clock`, `circle-dot`.
- **D3** Bandwidth stat glyph replacing `Zap`@amber-600 — candidates `gauge`
  (used for speed already), `activity`, `signal`.
- **D4** `trash` canonical confirmed by alias direction — migrate `Trash2`
  everywhere (task 4) — user said "trash2 con delete" verbally; the lucide
  1.59 canonical file is `trash`. Confirm.
- **D5** Assistant glyph dedup — keep `BotIcon` gradient for identity and
  migrate plain `Bot` sites, or keep both with documented split.

## Part F — Acceptance criteria

- icon-conventions.mdx lists every family in Part C with meaning + opposite.
- special-icons.mdx entries all carry a declared meaning.
- Zero deprecated/banned aliases in `rg` across the 4 repos (verify with the
  alias table in Part B — including `trash-2`/`Trash2`).
- Zero `✕`/`▼`/`▶` literal glyphs, zero `Eye`/`EyeOff` on non-secret
  affordances, `zap`/`amber-500` only on events/emits/paths.
- DynamicIcon names are canonical (`.svelte`-bearing) only.
- e2e jobs-pages + payload-map-widget green after icon changes.
