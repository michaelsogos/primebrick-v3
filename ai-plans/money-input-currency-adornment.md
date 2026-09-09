# Money Input: Leading Zero Normalization + Currency Symbol Inside Input

## Verified Architecture (empirical)

### Key findings from codebase inspection

1. **`docs/ai/patterns.md` line 25** mentions `MoneyInput` as a domain component pattern, but no `MoneyInput.svelte` exists yet. `NumericInput` is already a custom (non-vendored) component in `ui/` that handles all numeric types including money. Adding currency adornment to `NumericInput` is more DRY than creating a separate `MoneyInput` that duplicates the `useNumericInput` composable wiring.

2. **`InputGroup` + `InputGroupInput`**: `InputGroup` styles based on `data-slot="input-group-control"` (from `InputGroupInput`), NOT `data-slot="input"` (from `Input`). So when rendering inside `InputGroup`, we must use `InputGroupInput` (bare `<input>`, no border) not `Input` (styled, has border).

3. **SearchBar pattern** (`entity-list-table/toolbar/SearchBar.svelte`): `InputGroup` + `InputGroupAddon` (inline-start, icon) + `HighlightedInput` (middle) + `InputGroupButton` (inline-end, CTA that opens sheet via `openSheet`).

4. **`useNumericInput` composable** already parses `currency` from `type_config` (line 46) but doesn't expose it. `ConfigValueInput` has its own `moneyCurrency` derived (lines 89-97) — duplicated parsing.

5. **`ConfigList`** only tracks `formValues` (value changes), not `type_config` changes. `handleBulkSave` only sends `{ uuid, value, version }`. Type_config editing is not supported in the editable list yet. The currency CTA will be functional on the **create page** (where `$form.type_config` is editable) and display-only on the ConfigList.

6. **Sheet panel pattern** (`SearchInPanel.svelte`): uses `SheetHeader` + `closeSheet` + list of selectable items. Props passed via `openSheet(panelId, props)`.

7. **No existing normalize/stripZero logic** anywhere in the codebase.

## Issue 1: Leading Zero Normalization

### Spec
- `000000000011123` → `11123`
- `0` → `0` (single zero stays)
- `000` → `0` (all zeros → single zero)
- `0.50` → `0.50` (preserve decimal part, only normalize integer part)
- `000.50` → `0.50` (leading zeros in integer part stripped, keep one zero before decimal)
- `-000123` → `-123` (preserve sign)
- `-0.50` → `-0.50` (preserve sign + decimal)
- `` → `` (empty stays empty)
- `-` → `-` (lone minus stays)

### Implementation
Add `normalize()` function to `useNumericInput.svelte.ts`:

```ts
function normalizeNumericString(raw: string): string {
  if (raw === '' || raw === '-') return raw;
  const negative = raw.startsWith('-');
  const body = negative ? raw.slice(1) : raw;
  const [intPart, ...decParts] = body.split('.');
  // Strip leading zeros from integer part, keep at least one digit
  const normalizedInt = intPart.replace(/^0+(?=\d)/, '');
  const decPart = decParts.length > 0 ? '.' + decParts.join('.') : '';
  return (negative ? '-' : '') + normalizedInt + decPart;
}
```

Expose as `normalize()` method on the composable. Call in `NumericInput.handleBlur()` before writing to `value`.

### Files
- `src/lib/composables/useNumericInput.svelte.ts` — add `normalizeNumericString()` + expose `normalize()`
- `src/lib/components/ui/numeric-input/numeric-input.svelte` — call `num.normalize()` in `handleBlur()`
- `src/lib/__tests__/useNumericInput.test.ts` — add normalization tests

## Issue 2: Currency Symbol Inside Input + Currency Selection Sheet

### Spec
- When `type === 'money'`, the currency symbol (e.g. `€`) appears INSIDE the input as an `InputGroupAddon` (inline-start)
- A CTA button showing the currency code (e.g. `EUR`) appears as an `InputGroupButton` (inline-end)
- Clicking the CTA opens a right-side sheet with a searchable currency list
- Selecting a currency updates `type_config` JSON with the new currency code
- Non-money numeric types render as plain `Input` (unchanged)

### Implementation

#### A. Expose `currency` from composable

`useNumericInput.svelte.ts` already parses `currency` from `ParsedTypeConfig`. Add a getter:

```ts
get currency(): string {
  const parsed = parseTypeConfig(type_config());
  return parsed?.currency ?? 'EUR';
}
```

This eliminates the duplicated currency parsing in `ConfigValueInput`.

#### B. NumericInput with currency adornment

Add optional props to `numeric-input.svelte`:
- `currencySymbol?: string` — when provided, render `InputGroup` with addon
- `currencyCode?: string` — shown on the CTA button
- `onCurrencyChange?: (code: string) => void` — called when user selects a currency

When `currencySymbol` is provided:
```svelte
<InputGroup class="w-full border-primary-gradient ...">
  <InputGroupAddon align="inline-start" class="bg-transparent border-none pr-0">
    <span class="text-sm font-medium text-muted-foreground">{currencySymbol}</span>
  </InputGroupAddon>
  <InputGroupInput
    bind:ref
    inputmode={num.inputMode}
    min={num.effectiveMin ?? undefined}
    bind:value={num.localValue}
    oninput={handleInput}
    onblur={handleBlur}
    aria-invalid={hasError || ...}
    {...restProps}
  />
  {#if currencyCode}
    <InputGroupButton
      variant="ghost"
      size="xs"
      class="border-left-primary-gradient-soft hover:brightness-105"
      onclick={() => openSheet('config.currencySelect', { currentCurrency: currencyCode, onCurrencyChange })}
    >
      {currencyCode}
    </InputGroupButton>
  {/if}
</InputGroup>
```

When `currencySymbol` is NOT provided (bigint/number): render plain `<Input>` as before.

#### C. New sheet panel: `config.currencySelect`

**`sheet-manager.svelte.ts`**:
- Add `'config.currencySelect'` to `SheetPanelId`
- Add props: `{ currentCurrency: string; onCurrencyChange: (code: string) => void }`

**`SheetHost.svelte`**:
- Import + register `CurrencySelectPanel.svelte`

**`CurrencySelectPanel.svelte`** (NEW at `src/lib/shell/sheets/panels/`):
- Uses `Command` (searchable list) pattern from `ComboSelect`
- Lists all currencies from `getAllCurrencies()` — code, name, symbol
- Highlights current currency
- On select: calls `onCurrencyChange(code)` + `closeSheet()`

#### D. ConfigValueInput money branch

Replace the current money block:
```svelte
{:else if type === 'money'}
  <div class="w-full flex items-center gap-2">
    <NumericInput ... />
    {#if moneyCurrencySymbol}
      <span ...>{moneyCurrencySymbol}</span>
    {/if}
  </div>
```

With:
```svelte
{:else if type === 'money'}
  <NumericInput
    type="money"
    {type_config}
    bind:value
    errors={errors}
    {onChange}
    currencySymbol={moneyCurrencySymbol}
    currencyCode={moneyCurrency}
    onCurrencyChange={handleCurrencyChange}
    data-testid={`config-input-money-${fieldKey}`}
  />
```

Add `handleCurrencyChange(code: string)` to `ConfigValueInput`:
- Parse current `type_config` JSON
- Set `currency` field to new code
- Serialize back to JSON string
- Call `onTypeConfigChange?.(newTypeConfig)` — new optional prop

Add `onTypeConfigChange?: (typeConfig: string) => void` prop to `ConfigValueInput`.

#### E. Create page wiring

The create page passes `bind:value={$form.value}` to `ConfigValueInput`. For currency change, it needs to update `$form.type_config`:

```svelte
<ConfigValueInput
  ...
  onTypeConfigChange={(newConfig) => $form.type_config = newConfig}
/>
```

#### F. ConfigList (display-only currency for now)

`ConfigList` doesn't support `type_config` editing. The currency CTA will be hidden on the ConfigList (pass `currencyCode` but no `onCurrencyChange`). The symbol still displays.

### Impacted Files

| File | Action | Description |
|------|--------|-------------|
| `src/lib/composables/useNumericInput.svelte.ts` | MODIFY | Add `normalizeNumericString()` + `normalize()` + `currency` getter |
| `src/lib/components/ui/numeric-input/numeric-input.svelte` | MODIFY | Add currency adornment via InputGroup, call normalize on blur |
| `src/lib/components/config-list/ConfigValueInput.svelte` | MODIFY | Pass currency props, add handleCurrencyChange + onTypeConfigChange |
| `src/routes/(app)/system/settings/security/create/+page.svelte` | MODIFY | Pass onTypeConfigChange to ConfigValueInput |
| `src/lib/shell/sheets/sheet-manager.svelte.ts` | MODIFY | Add 'config.currencySelect' panel ID + props |
| `src/lib/shell/sheets/SheetHost.svelte` | MODIFY | Register CurrencySelectPanel |
| `src/lib/shell/sheets/panels/CurrencySelectPanel.svelte` | CREATE | Searchable currency selector sheet panel |
| `src/lib/__tests__/useNumericInput.test.ts` | MODIFY | Add normalization tests |
| `src/lib/i18n/messages/en-GB.json` | MODIFY | Add currency selection translations |
| `src/lib/i18n/messages/it-IT.json` | MODIFY | Same in Italian |

### Acceptance Criteria

1. Typing `000000000011123` in any numeric field and blurring → `11123`
2. Typing `0` and blurring → `0`
3. Typing `000.50` and blurring → `0.50`
4. Typing `-000123` and blurring → `-123` (signed)
5. The currency symbol appears INSIDE the input border (InputGroup addon)
6. A CTA button showing the currency code appears at the right end
7. Clicking the CTA opens a right-side sheet with searchable currency list
8. Selecting a currency updates type_config and the symbol displayed
9. Non-money numeric types (bigint, number) render without currency adornment
10. All existing tests pass
11. `svelte-check` passes with 0 errors
