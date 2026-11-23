# Dialog — CTA severity autowire + BorderedDialog-only standard

> BUG FIX / TECH DEBT: export bulk CTAs were styled `variant="outline"`
> hardcoded on the button (leaf), bypassing the meta-chrome contract —
> the contract lacked a `variant` axis entirely. Restore contract-first:
> chrome (color+variant) lives in `meta.actions[op]`, defaults are
> designed per-op, overrides explicit. Same target as before (export
> dialog = primary top-strip) but the fix is at contract root.

## Status: ⚪ TODO — Plan date: 2026-11-23

## TIC evidence — the full anatomy

### Contract (`@primebrick/core` `entity-meta.ts`)
- `EntityAction` chrome: `label_key|icon|color|confirm_key|busy_key` —
  "Cosmetics only: gating, dialogs and dispatch are untouched". Sources:
  `entity_op.cta` on `crud_action` routes + `meta.actions_overrides[op]`.
- `ActionColor` closed set (7): `neutral|primary|info|success|warning|
  destructive|violet`; `ACTION_COLORS` + `validateActionChrome` guard
  (semantic icon↔color binding). **NO `variant` field exists.**
- `opChrome(op)` (`EntityListTable.svelte:538`) resolves
  `meta.actions[op]` → `ActionChrome` Pick — wired for
  update/delete/restore/duplicate (single+bulk). **`export` never gets an
  `opChrome` call** — its CTA has no chrome channel at all.

### CTA side
- `actionColorButtonVariant(color)` (`ui/semantic-icons.ts:39`): maps
  severity→FILLED variant; `neutral|primary|undefined`→`default`.
  Outline/soft/ghost shapes are unreachable through the contract.
- `BulkActionsToolbar`: edit/duplicate/delete/restore = chrome-driven;
  **export/htmlExport = `variant="outline"` hardcoded** (the debt).
- Button (`ui/button.svelte`) ALREADY models the right axes:
  `variant` (shape: filled severities | soft | outline | ghost …) ×
  `tone` (ActionColor minus neutral) + compounds `outline+tone`→
  `border-{tone}-gradient`, `soft+tone`→`-soft`.

### Dialog side
- Entity ops (delete/restore/generic): `chrome.color`→`severity` via the
  ONE `EntityOpConfirmHost`; confirm button reuses
  `actionColorButtonVariant` — 1 meta field, 3 surfaces locked.
- `BorderedDialog`: `severity: DialogSeverity` (same ActionColor family)
  + `tone: ''|'soft'` — top animated strip | full-around border.
  **`tone="soft"` = reserved security/auth semantics** (MFA/OTP/session —
  all primary+soft), NOT a general shape axis.
- Hardcoded severity, no `chrome` prop: `ExportDialog` (warning),
  `HtmlExportDialog` (warning), `ChangePasswordDialog` (warning).
  `ExportPreviewDialog` primary — preview surface, not action confirm.
- Meta-proven override example (`job.meta.ts:194-197`): delete→disable
  exec-stop/destructive, restore→enable exec-start/success.

### Design answer (LOCKED — user-confirmed 2026-11-23)
`color` = semantic meaning → drives CTA tone + DIALOG severity.
`variant` (`standard|outline`) = **CTA shape ONLY** — never reaches the
dialog: an "outline dialog" IS the security-soft style, and `tone="soft"`
is semantically reserved to the auth/security family (MFA/OTP/session).
Therefore ALL action dialogs keep `tone=""` — the high animated top
strip — and only `color` flows CTA↔dialog. Objective 1 closes with
export = CTA outline+primary + dialog primary top-strip.

Served defaults ALREADY exist at the merge point
(`be/entity-actions.ts:158-163`: `duplicate.bulk`→violet+copy,
`update.bulk`→primary+pencil; `sdk/service-routes.ts` mirrors for US
entities; `actions_overrides` merge at `:186-190`) — `variant` rides the
same channel: `EntityAction.variant?` + merge line + served default for
`export` → `{color:"primary", variant:"outline"}` = today's look, from
contract.

## TOC tasks

| # | Task | Status | When | Notes |
|---|---|---|---|---|
| 1 | core: `ActionVariant` closed set (`'standard'\|'outline'`) + `ACTION_VARIANTS` + `EntityAction.variant?` + `validateActionChrome` ext | ⏳ | — | additive `?:` — contract versioning safe |
| 2 | be `entity-actions.ts` + sdk `service-routes.ts`: merge `o.variant` into `EntityAction` + served default `export`→`{color:"primary",variant:"outline"}` (same spot as duplicate/update served defaults) | ⏳ | — | the variant channel end-to-end |
| 3 | ui: `actionChromeButtonProps(chrome)` resolver → `{variant,tone}` (color→tone, variant→shape; `standard`→filled severity variant) — replaces `actionColorButtonVariant` call sites | ⏳ | — | keep old fn as deprecated alias or migrate all callers |
| 4 | fe: `ActionChrome` pick + `variant`; `opChrome` carries it; toolbar export buttons → chrome-driven (`bulkExportChrome = opChrome('export')`); row/export CTAs aligned | ⏳ | — | removes the hardcoded `variant="outline"` — the debt itself |
| 5 | fe: `chrome` prop on ExportDialog/HtmlExportDialog/ChangePasswordDialog → `severity = chrome?.color ?? <op default>`; EntityListTableDialogs threads export chrome | ⏳ | — | target: primary top-strip |
| 6 | enforcement: `no-raw-dialog` check-standards rule (BorderedDialog-only outside the component itself) + `dialog-chrome-prop` guard (dialogs under `entity-list-table/dialogs/` resolve severity from `chrome`, literals only via allowPaths) | ⏳ | — | mirror `no-native-dialog` registration |
| 7 | `roles/[uuid]` hand-rolled overlay → migrate or allowPath with reason | ⏳ | — | verify first |
| 8 | E2E headed: sequence ELT bulk-export dialog = primary top-strip + CTA unchanged visually + lint negative probes | ⏳ | — | |
| 9 | docs: `entity-confirm-dialogs.md` — contract extends to any CTA→dialog pair; `entity-meta` docs gain `variant` axis | ⏳ | — | |

## Locked decisions

- `variant` vocabulary: `standard|outline` only (user-locked). `soft`/
  `ghost` join only when a real op needs them — closed set.
- Dialog `tone` is NOT meta-addressable: `soft` = reserved auth/security
  family; every action dialog is `tone=""` top-strip. (user-locked)
- Variant is a CTA-only axis by design — it can never produce an
  "outline dialog" by accident.
