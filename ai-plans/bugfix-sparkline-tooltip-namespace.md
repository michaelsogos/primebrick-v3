# Bugfix — SparklineBars tooltip dead: wrong import shape

## Root cause (verified)

`primebrick-v3-ui/src/lib/components/SparklineBars.svelte` imports
`import { Tooltip } from './tooltip/index.js'`. In `tooltip/index.ts`,
`Tooltip` is `export { Root as Tooltip }` — a **component**, not the
namespace. `<Tooltip.Root>` therefore resolves `undefined`: the
per-slot `Trigger`/`Content` blocks never render → no hit areas →
tooltip dead.

The barrel in `src/lib/index.ts:34` uses `export * as Tooltip` —
namespace import is the canonical shape (that's why `CardField.svelte`
in fe works).

## Doc findings (gate — cited)

| Doc | Finding |
|---|---|
| `primebrick-v3-ui/src/lib/index.ts:34` | `export * as Tooltip` — namespace is the canonical consumer shape |
| `primebrick-v3-ui/src/lib/components/tooltip/index.ts` | named `Tooltip` = Root alias — direct named import is the trap |
| `primebrick-fe-v3/docs/ai/field-hints.md` | bits-ui Tooltip is the only canonical tooltip channel |
| `docs/ai/workflow.md` | verification = persistent spec, first-write |

## Changes

1. **Fix**: `import * as Tooltip from './tooltip/index.js'` in
   SparklineBars — same namespace shape the barrel exposes.
2. **Permanent e2e** (`sticky-hideable-columns.spec.ts`): hover a
   sparkline slot → assert `Tooltip.Content` (styled, portal-escaped)
   becomes visible with composed bucket text. Locator strategy: the
   trigger carries `aria-label="<date>: N <series>…"` — hover the
   trigger (`.lucide`-free, `data-tooltip-trigger` or aria), assert
   `[role=tooltip]`/bits-ui content node appears in `document.body`
   (portal), containing the same text.
3. Gates: svelte-autofixer, svelte-check, v3-ui build, e2e live.

## Acceptance criteria

- Hover any sparkline slot → styled tooltip visible with the bucket's
  quantified series.
- e2e asserts the behavior permanently — no rect-count-only proxies.
