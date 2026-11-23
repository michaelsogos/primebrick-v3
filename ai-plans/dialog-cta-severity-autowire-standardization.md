# Dialog — CTA severity autowire + BorderedDialog-only standard

> Workstream: the CTA that opens a dialog passes its semantic color
> auto-wired (no dev wiring), and the ONLY legal dialog in the codebase is
> `BorderedDialog` in its 2 styles — enforced by construction + lint.
> Canon: `docs/ai/entity-confirm-dialogs.md` rule 7 (severity is
> meta-derived, never caller-chosen), `dialog-bordered.svelte`.

## Status: ⚪ TODO — Plan date: 2026-11-23

## TIC evidence (censuses, all verified)

### A. The autowire path that already exists (entity ops)
`meta.actions[op].color` (`ActionColor` closed set:
`neutral|primary|info|success|warning|destructive|violet`,
`validateActionChrome` guard at construction, `entity-meta.ts:103-125`)
→ `EntityOpChrome` (`use-entity-op.svelte.ts:47`) →
`entityOpState.confirm.chrome` → `EntityOpConfirmHost` (ONE mount in
`(app)/+layout.svelte`) → dialog `chrome.color` → `severity` →
`actionColorButtonVariant(severity)` on the confirm button.
`genericChrome` default: `warning` (`EntityOpConfirmHost:36`).

| Dialog | severity today | autowired? |
|---|---|---|
| `DeleteDialog` (ui) | `chrome?.color ?? 'destructive'` | ✅ |
| `BulkDeleteDialog` | `chrome?.color ?? 'destructive'` | ✅ |
| `RestoreDialog` / `BulkRestoreDialog` | `chrome?.color ?? 'warning'` | ✅ |
| `DuplicateDialog` | `chrome?.color ?? 'violet'` — gets `chrome={duplicateChrome}` at mount | ✅ |
| **`ExportDialog`** | `severity="warning"` **hardcoded**, NO `chrome` prop | ❌ — the reported case |
| **`HtmlExportDialog`** | `severity="warning"` **hardcoded**, NO `chrome` prop | ❌ |
| **`ChangePasswordDialog`** | `severity="warning"` **hardcoded** | ❌ |
| `ExportPreviewDialog` | `severity="primary"` hardcoded (95vw preview — different anatomy) | n/a |

`EntityListTableDialogs` already mounts `chrome={duplicateChrome}` for
duplicate — the prop-plumbing pattern exists in the same file.

### B. Dialog standard census (2 legal styles)
- `tone=""` — top animated gradient strip (default);
  `tone="soft"` — full-around gradient border = **security family**
  (AuthMethodsPrompt, MfaStepUp, MfaManagement enroll+delete,
  SessionExpired — all `severity="primary" tone="soft"`).
- Raw `DialogContent`/`AlertDialog`/custom overlays: none found in
  fe-v3 `src/` outside `dialogs/` — the unified migration already
  converged (except `roles/[uuid]` hand-rolled overlay per old plan —
  verify at TOC).
- Remote FE: `ai/fe/AiSettingsPage.svelte` uses standard `DeleteDialog` ✅.
- Enforcer infra exists: `.devin/check-standards.json` custom rules
  (`no-native-dialog`, `raw-switch`, `button-variant-toolbar`, `panel-*`)
  + `NO_EXEMPT_RULES` gate — a `no-raw-dialog` rule lands the same way.
  Construction-side: only `BorderedDialog` + family dialogs are exported
  from `@primebrick/ui` index (raw `bits-ui` `Dialog` never re-exported —
  verify at TOC).

## TOC tasks

| # | Task | Status | When | Notes |
|---|---|---|---|---|
| 1 | `ExportDialog`/`HtmlExportDialog`/`ChangePasswordDialog`: add `chrome?: { color?: ActionColor }` prop (same contract as DeleteDialog) → `severity = chrome?.color ?? <current default>`; `EntityListTableDialogs` derives `exportChrome`/`passwordChrome` from `meta.actions` like `duplicateChrome` | ⏳ | — | export CTA meta must declare `color:"primary"` (verify which action key: `export.bulk`/`export.single`) |
| 2 | Export bulk dialog final state: `tone=""` top-strip animated gradient in **primary** (per user spec — preview dialog already proves primary top-strip renders) | ⏳ | — | if export meta lacks `color`, add `"primary"` in the owning decl (crm sequence meta? — find the export action decl) |
| 3 | Lint rule `no-raw-dialog` in check-standards: ban `Dialog.Root`/`DialogContent`/`AlertDialog`/direct `bits-ui` Dialog imports outside `dialog-bordered.svelte` + `dialogs/` family + `allowPaths` | ⏳ | — | mirror `no-native-dialog` registration; NO_EXEMPT_RULES applies |
| 4 | Construction guard: `@primebrick/ui` index never re-exports raw Dialog primitives; `BorderedDialog` `tone` prop stays the closed union `'' \| 'soft'` | ⏳ | — | verify exports; tighten if raw primitives leak |
| 5 | `roles/[uuid]` hand-rolled overlay → migrate to `BorderedDialog` or prove exemption (non-dialog overlay) | ⏳ | — | verify first, then act |
| 6 | E2E: sequence ELT → bulk export dialog shows `primary` top-strip (headed) + lint rule negative probe | ⏳ | — | extend `sequences.spec.ts` |
| 7 | Docs: `entity-confirm-dialogs.md` — extend the contract beyond entity ops ("any dialog opened by a CTA inherits its `color`"); component docs regen | ⏳ | — | |

## Open decisions (resolved in TIC)

- Scope of autowire: `meta.actions[].color` flows for **entity-ops**
  already; table dialogs get `chrome` prop fed from the same meta field —
  same vocabulary, same guard.
- `tone="soft"` semantics = security/auth family only — documented, not
  lint-enforced (semantic choice, not mechanical).
