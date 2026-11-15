# Money Input: Locale-Aware Thousand Separators + Decimal Separator

## Verified Architecture (empirical)

### Key findings

1. **No masking library** in the project. We implement locale-aware formatting using `Intl.NumberFormat` (already used in `currency-helpers.ts` and `date-format.ts`).

2. **`Intl.NumberFormat` locale separators** (verified via Node.js):
   - `it-IT`: thousand=`.`, decimal=`,`  →  `1.234.567,89`
   - `de-DE`: thousand=`.`, decimal=`,`  →  `1.234.567,89`
   - `en-GB`: thousand=`,`, decimal=`.`  →  `1,234,567.89`
   - `en-US`: thousand=`,`, decimal=`.`  →  `1,234,567.89`

3. **`uiLang`** is a Svelte writable store (`svelte/store`). In `.svelte.ts` composables, we can use `get()` from `svelte/store` to read it, or pass a reactive getter from the `.svelte` component (current pattern used by `useNumericInput`).

4. **Current `filterNumericInput`** accepts BOTH `.` as decimal separator. It strips everything except digits and `.`. This must change to accept ONLY the locale's decimal separator.

5. **Current `normalizeNumericString`** splits on `.`. This must change to split on the locale's decimal separator.

6. **Current Zod validation** (`config-validation.ts` line 84):
   ```ts
   const numRegex = isUnsigned ? /^\d*\.?\d+$/ : /^-?\d*\.?\d+$/;
   ```
   This only accepts `.` as decimal. Since the form value will be canonical (dot decimal, no thousand separators), this regex stays as-is.

7. **DB stores canonical values**: dot as decimal separator, no thousand separators. The FE converts locale-formatted display → canonical before writing to the form. The BE/SDK never sees locale-formatted strings.

### Design decisions

**Dual-value architecture:**
- `_rawValue` (internal): canonical string — dot decimal, no thousand separators. This is what gets written to the form/DB.
- `displayValue` (derived): locale-formatted string — locale decimal + thousand separators. This is what the user sees in the input.

**Why not `bind:value` on the input?**
With a masked input, we can't use `bind:value` because the displayed value differs from the raw value. Instead:
- The input's `value` attribute is set to `displayValue`
- `oninput` handler: parse display → extract raw → filter → update `_rawValue` → recompute `displayValue`
- Cursor position is managed manually after reformatting

**When do thousand separators appear?**
- Real-time, as the user types (the user explicitly said "until i enter digit the thousand separator must automatically appear")
- The mask must not disrupt typing (no cursor jumps, no lag)

**When does the decimal separator appear?**
- When the user types the locale's decimal separator character
- The other separator (e.g. `.` in IT locale) is rejected by the filter

**Cursor position management:**
- Before input: save `selectionStart`
- After input: count digits before cursor in the OLD display → find position after that many digits + separators in the NEW display
- This is the standard masked-input cursor technique

**BigInt:**
- No decimal separator (integers only)
- Thousand separators still apply in display

## Implementation

### 1. Composable: `useNumericInput.svelte.ts`

Add `lang` option to `UseNumericInputOptions`:
```ts
interface UseNumericInputOptions {
  type: () => NumericType;
  type_config: () => string | null;
  value: () => string | bigint | number;
  lang: () => string;  // NEW — BCP 47 tag (e.g. 'it-IT', 'en-GB')
}
```

Add locale derivation:
```ts
// Derive decimal and thousand separators from lang using Intl.NumberFormat
const decimalSeparator = $derived.by<string>(() => {
  try {
    const parts = new Intl.NumberFormat(lang()).formatToParts(1.1);
    return parts.find(p => p.type === 'decimal')?.value ?? '.';
  } catch { return '.'; }
});

const thousandSeparator = $derived.by<string>(() => {
  try {
    const parts = new Intl.NumberFormat(lang()).formatToParts(1111);
    return parts.find(p => p.type === 'group')?.value ?? '';
  } catch { return ''; }
});
```

Replace `_state._localValue` with dual values:
```ts
const _state = $state({
  _rawValue: toCanonical(String(value())),  // canonical: dot decimal, no separators
});
```

Add `displayValue` derived:
```ts
const displayValue = $derived.by<string>(() => {
  return formatDisplay(_state._rawValue, type(), decimalSeparator, thousandSeparator);
});
```

`formatDisplay` function:
- Split raw into integer + decimal parts (on `.`)
- Format integer part with thousand separators using `Intl.NumberFormat` for the locale
- Rejoin with the locale's decimal separator
- For bigint: format integer with thousand separators, no decimal

Update `filterInput` to accept only the locale's decimal separator:
```ts
function filterInput(displayStr: string): void {
  // 1. Strip thousand separators from display string
  // 2. Replace locale decimal separator with '.'
  // 3. Filter to valid chars (digits, one '.', optional leading '-')
  // 4. Store as _rawValue
}
```

Update `normalize` to work with canonical raw value (already uses `.` — no change needed).

Add `toCanonical` and `fromCanonical` helpers.

Expose `displayValue`, `decimalSeparator`, `thousandSeparator` via getters.

Add `setCursorPosition` helper for cursor management.

### 2. Component: `numeric-input.svelte`

Remove `bind:value={num.localValue}` — use explicit value setting:
```svelte
<InputGroupInput
  value={num.displayValue}
  oninput={handleInput}
  onblur={handleBlur}
  ...
/>
```

`handleInput`:
```ts
function handleInput(e: Event) {
  const input = e.target as HTMLInputElement;
  const cursorPos = input.selectionStart ?? 0;
  num.filterInput(input.value);  // parse display → raw
  // Restore cursor position after Svelte re-renders
  tick().then(() => {
    const newPos = num.computeCursorPosition(cursorPos, input.value);
    input.setSelectionRange(newPos, newPos);
  });
}
```

`handleBlur`:
```ts
function handleBlur() {
  num.normalize();  // normalize raw value
  const canonical = num.rawValue;
  if (canonical !== lastValue) {
    lastValue = canonical;
    value = canonical;
    onChange?.(canonical);
  }
}
```

### 3. Validation: `config-validation.ts`

**No changes needed.** The form value is canonical (dot decimal, no thousand separators). The existing Zod regex (`/^\d*\.?\d+$/`) validates canonical values correctly.

### 4. Create page + ConfigValueInput

Pass `lang` to `NumericInput`:
```svelte
<NumericInput
  type="money"
  {type_config}
  bind:value
  lang={$uiLang}
  ...
/>
```

`ConfigValueInput` passes `$uiLang` through.

### 5. Tests

Update `useNumericInput.test.ts`:
- Add `lang` to `createComposable` helper
- Test `displayValue` for en-GB (thousand=`,`, decimal=`.`)
- Test `displayValue` for it-IT (thousand=`.`, decimal=`,`)
- Test `filterInput` rejects wrong decimal separator
- Test `filterInput` accepts correct decimal separator
- Test `normalize` with canonical raw value
- Test cursor position computation

### Impacted Files

| File | Action | Description |
|------|--------|-------------|
| `src/lib/composables/useNumericInput.svelte.ts` | MODIFY | Add lang, decimalSeparator, thousandSeparator, displayValue, dual-value architecture, cursor management |
| `src/lib/components/ui/numeric-input/numeric-input.svelte` | MODIFY | Use displayValue, manual cursor management, pass lang |
| `src/lib/components/config-list/ConfigValueInput.svelte` | MODIFY | Pass lang to NumericInput |
| `src/lib/__tests__/useNumericInput.test.ts` | MODIFY | Add locale-aware tests |

### Acceptance Criteria

1. Typing `1000000` in en-GB shows `1,000,000` in real-time as the user types
2. Typing `1000000` in it-IT shows `1.000.000` in real-time
3. In it-IT, typing `,` as decimal separator works; typing `.` as decimal separator is rejected (or treated as thousand separator context)
4. In en-GB, typing `.` as decimal separator works; typing `,` is rejected
5. The raw form value is always canonical (e.g. `1000000.50` — dot decimal, no thousand separators)
6. Cursor position is preserved during typing (no jumps when separators are inserted)
7. On blur, leading zeros are normalized in the raw value
8. On blur, the display value updates to show the formatted normalized value
9. Existing Zod validation works (validates canonical form value)
10. BigInt type shows thousand separators but no decimal separator
11. All existing tests pass
12. `svelte-check` passes with 0 errors
