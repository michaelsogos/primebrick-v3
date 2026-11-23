# Dialog — CTA severity autowire + BorderedDialog-only standard

> BUG FIX / TECH DEBT: export bulk CTAs were styled `variant="outline"`
> hardcoded on the button (leaf), bypassing the meta-chrome contract —
> the contract lacked a `variant` axis entirely. Restore contract-first:
> chrome (color+variant) lives in `meta.actions[op]`, defaults are
> designed per-op, overrides explicit. Same target as before (export
> dialog = primary top-strip) but the fix is at contract root.

## Status: ✅ COMPLETED — all tasks shipped 2026-11-23 — Plan date: 2026-11-23

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
| 1 | core: `ActionVariant` closed set (`'default'\|'outline'`) + `ACTION_VARIANTS` + `EntityAction.variant?` + `ActionsOverrides/Row/BulkCustomAction.variant` + `validateActionChrome` ext (membership + outline-needs-color) | ✅ | core `babce85` | tsc clean; RowCustomAction/BulkCustomAction carry variant too |
| 2 | be `entity-actions.ts` + sdk `service-routes.ts`/`entity-router.ts`/`rpc-router.ts`: merge `variant` end-to-end + served default `export`→`{color:"primary",variant:"outline"}` + resolved-triple validation (be had NONE before) | ✅ | sdk `0d835d1`+`1693870`, be `8c90e1a` | sdk cta 14/14, be entity-actions 7/7 — incl. NEW tests: export served chrome + both construction errors |
| 3 | ui: `actionChromeButtonProps(chrome, fallback?)` → `{variant,tone}`; dialog confirms keep `actionColorButtonVariant` (filled) | ✅ | ui `61edfc6` | svelte-check 0/0, built |
| 4 | fe: `ActionChrome` pick +`variant`; `opChrome` carries it; `bulkExportChrome=opChrome('export')`; toolbar ALL buttons → resolver; **hardcoded `variant="outline" tone="info"` REMOVED** (CTA was info, now contract-primary) | ✅ | fe `49730f3` | svelte-check 0/0, eslint 0/0 |
| 5 | fe: `chrome` prop on Export/HtmlExport/ExportPreview (`?? 'primary'`)/ChangePassword (`?? 'warning'`) dialogs; EntityListTableDialogs threads `exportChrome`; `extraDialogs` gains `row_custom_actions` → users page passes the SAME action color | ✅ | fe `49730f3` | CTA+dialog+confirm-button all follow severity |
| 6 | enforcement: `no-raw-dialog` check-standards rule — **CENSUS CLEAN**: zero `Dialog.Root/Content/Portal/Trigger`, `DialogContent`, `AlertDialog`, raw bits-ui Dialog import in fe src + us/*/fe outside `dialogs/` (only hit: `Dialog.Close` INSIDE BorderedDialog = legal content part, migrations/+page:470). Draft: unconditional LINE_RULE in `check-standards.ts` (same class as `no-native-dialog` → `FE_RULES`+`NO_EXEMPT_RULES`); pattern bans surface-creating anatomy `Dialog.(Root\|Content\|Portal\|Trigger\|Overlay)`, `AlertDialog`, `DialogContent/Portal/Overlay`, `Dialog` from vendor/bits-ui; `Dialog.(Close\|Header\|Title\|Description\|Footer)` = legal parts → excluded. ui profile allowPath: `lib/components/dialog/`+`dialog-bordered`+`command-dialog`. `dialog-chrome-prop` guard deferred — all 4 dialog families now take `chrome`, a literal-scan would false-positive on intentional `?? default` fallbacks. **HALT → APPROVED → SHIPPED**: rule live in check-standards (FE_RULES+LIB_RULES+NO_EXEMPT), fe+ui clean, negative probe flags all 7 anatomy forms; ui barrel `DialogContent/Trigger/Portal/Overlay` named exports REMOVED (bypass vector, zero consumers); allowPath extended with `lib/components/sheet/` | ✅ | sdk `5712134`, ui `9e372b8` | census evidence presented; user approved |
| 7 | `roles/[uuid]` hand-rolled overlay → **VERIFIED: no dialog/overlay in the file** — nothing to migrate | ✅ | — | empirical: zero matches for fixed/inset-0/z-50/overlay/Dialog |
| 8 | E2E headed `elt-export-chrome.spec.ts` (persistent, /crm/settings/sequences): served meta.actions['export'] = {primary,outline}; BOTH CTAs `border-primary-gradient`; dialog strip `.h-2` `animate-gradient-pan`+`via-indigo-500` (not yellow, not soft popover). Missing `entity-bulk-export{,-html}` testids added; primary strip made ANIMATED (`bg-linear-to-r …via-indigo-500…animate-gradient-pan`) — was static `to-br`, plan required animated | ✅ | fe `1fc1075`, ui `b27490a` | 1/1 passed headed, 9.0s |
| 9 | docs: `entity-confirm-dialogs.md` rule 7 extended (ELT dialogs + chrome contract) + rule 9 (no-raw-dialog); `entity-meta.mdx` Action chrome section (color→CTA+dialog, variant→CTA-only); `dialog-bordered.mdx` primary strip animated | ✅ | core `6b43fd0`, fe `24cf5c4` | sdk extract-docs: api.json unchanged (TypeDoc carries `variant` via EntityAction) |

## Locked decisions

- `variant` vocabulary: **`default|outline`** — SAME names as the svelte
  Button shape axis (user-locked: "lo stesso che usiamo in svelte").
- Dialog `tone` is NOT meta-addressable: `soft` = reserved auth/security
  family; every action dialog is `tone=""` top-strip. (user-locked)
- Variant is a CTA-only axis by design — it can never produce an
  "outline dialog" by accident.
- **Illegal pairs are construction errors, never fallbacks** (user-
  locked, "NO workaround arbitrari"): `validateActionChrome` rejects
  `variant:"outline"` without an explicit non-`neutral` `color` —
  neutral-outline has no designed look.
- Both export dialogs share the `export` op chrome (user: "per adesso
  si") — splitting later is free: a distinct op key inherits the channel.
- `ChangePasswordDialog` gets `chrome` and `users/+page.svelte` passes
  the `change_password` custom-action's OWN color — row item and dialog
  coherent BY CONSTRUCTION (same meta field, two surfaces).
- `ExportPreviewDialog` (95vw result surface) inherits the same `export`
  chrome — part of the same action flow; no lint exception needed.
- `no-raw-dialog` rule: census + rule draft, then **HALT — show user
  the evidence and proposed rule BEFORE any fixes** (user-locked).
- Served-defaults placement (answered in TIC survey): the layered-
  default architecture EXISTS but has no central registry — defaults
  live per-layer per-purpose: (1) wire/scan served defaults
  (`be/entity-actions.ts:158-163` + `sdk/service-routes.ts` custom-CTA
  push), (2) convention-derived (`{ns}.actions.{op}`, `placement??`
  heuristic), (3) component `??` fallbacks as last line. Action-chrome
  defaults belong at layer 1 — `export` goes INLINE where duplicate/
  update already are (existing pattern, no new machinery). A shared
  `DEFAULT_OP_CHROME` table would only dedupe the be↔sdk mirror —
  optional follow-up, not this fix.
