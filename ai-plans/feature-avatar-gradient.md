# Plan: Avatar Gradient Rendering (Hexagon + Dynamic Gradient)

## Objective

Replace solid-color avatar backgrounds with dynamic gradients in the Primebrick FE.
The user's `avatar_color` (hex) is used as the **centroid** of a gradient — start and
end colors are computed by shifting hue ±30° and lightness ±12%. This produces two
distinct but harmonious colors (like the PrimeBrick logo sky→indigo feel), not trivial
same-hue gradients.

## Algorithm (validated with 10 Tailwind color samples)

```
computeAvatarGradient(userColor: hex) → { start, end, textColor }
  1. Convert userColor hex → HSL
  2. start = hslToHex(hue - 30, saturation, lightness - 12)
  3. end   = hslToHex(hue + 30, saturation, lightness + 12)
  4. textColor = avgLuminance(start, end) > 0.5 ? '#000000' : '#ffffff'
  5. CSS: background: linear-gradient(135deg, start, end)
```

- Gradient direction: 135deg (oblique top-left → bottom-right, matches PB logo)
- Text color: average luminance of start AND end (not just the user color)
- Hue wraparound handled (e.g. hue=10° → start hue=340°)

## Files to modify

### 1. `src/lib/avatar-chrome-palette.ts` (CORE — add gradient logic)

Add these new functions (do NOT remove existing ones):

- `hexToHsl(hex): [number, number, number]` — convert hex to HSL [h(0-360), s(0-100), l(0-100)]
- `hslToHex(h, s, l): string` — convert HSL back to hex (with hue wraparound + clamp)
- `computeAvatarGradient(hex): { start: string; end: string; textColor: string }` — the algorithm above
- `getContrastTextColor(hex)` — UPDATE to accept a gradient by computing average luminance of start+end. Keep backward compatible: if passed a single hex, use current behavior.

Actually, to keep it clean:
- Keep `getContrastTextColor(hex)` unchanged (single color, used by non-avatar code potentially)
- Add `getGradientContrastTextColor(startHex, endHex)` — averages luminance of two colors
- `computeAvatarGradient` uses `getGradientContrastTextColor` internally

### 2. `src/lib/components/ui/avatar-preview/AvatarPreview.svelte`

Change the inline style from solid to gradient:

Current (line 38-40):
```svelte
style={avatarColor
  ? `background-color: ${avatarColor}; color: ${getContrastTextColor(avatarColor)};`
  : ""}
```

New:
```svelte
style={avatarColor
  ? (() => {
      const g = computeAvatarGradient(avatarColor);
      return `background: linear-gradient(135deg, ${g.start}, ${g.end}); color: ${g.textColor};`;
    })()
  : ""}
```

Import `computeAvatarGradient` instead of (or in addition to) `getContrastTextColor`.

### 3. `src/lib/components/sidebar/SidebarProfileMenu.svelte`

Update the `avatarStyle` derived (lines 27-33):

Current:
```typescript
const avatarStyle = $derived.by(() => {
  const color = user?.avatar_color;
  if (!color) return null;
  const textColor = getContrastTextColor(color);
  return {
    style: `background-color: ${color}; color: ${textColor};`,
    class: 'rounded-none text-xs font-semibold'
  };
});
```

New:
```typescript
const avatarStyle = $derived.by(() => {
  const color = user?.avatar_color;
  if (!color) return null;
  const g = computeAvatarGradient(color);
  return {
    style: `background: linear-gradient(135deg, ${g.start}, ${g.end}); color: ${g.textColor};`,
    class: 'rounded-none text-xs font-semibold'
  };
});
```

Import `computeAvatarGradient` (replace `getContrastTextColor` import if no longer used).

### 4. `src/lib/user-profile-store.svelte.ts`

- **Remove** the dead code function `getUserAvatarStyle()` (lines 67-74) — never called anywhere.
- **Remove** the `import { getContrastTextColor } from './avatar-chrome-palette'` (line 1) — only used by the removed function.

### 5. `src/routes/mcp/consent/+page.svelte`

This page uses only the chrome fallback (hardcoded 'PB', no custom color). No change needed — the fallback palette stays solid colors (Tailwind classes). Gradient applies ONLY when `avatar_color` is set.

## Files NOT modified (confirmed no change needed)

- `src/lib/composables/useAvatarPreview.svelte.ts` — only handles fallback class, no custom color logic
- `src/lib/utils/avatar-initials.ts` — initials only, no color
- `src/app.css` — `avatar-hex` clip-path unchanged
- `src/routes/(app)/system/settings/profile/+page.svelte` — uses AvatarPreview component (which will be updated)
- `src/routes/(app)/system/settings/users/create/+page.svelte` — uses AvatarPreview component
- `src/routes/(app)/system/settings/users/[uuid]/+page.svelte` — uses AvatarPreview component
- `src/lib/components/sidebar/SidebarOrgSwitcher.svelte` — org avatars use images, not colors
- `src/lib/components/ui/color-picker/` — generic color picker, not avatar-specific

## Implementation order

1. Add HSL conversion + gradient functions to `avatar-chrome-palette.ts`
2. Update `AvatarPreview.svelte` to use gradient
3. Update `SidebarProfileMenu.svelte` to use gradient
4. Remove dead code from `user-profile-store.svelte.ts`
5. Run `pnpm run check` — must be 0 errors
6. Visual verification (dev server or screenshots)

## Acceptance criteria

- [ ] `computeAvatarGradient(hex)` function exists in `avatar-chrome-palette.ts`
- [ ] `hexToHsl` and `hslToHex` utility functions exist in `avatar-chrome-palette.ts`
- [ ] `getGradientContrastTextColor(start, end)` function exists
- [ ] AvatarPreview renders gradient when `avatarColor` is provided
- [ ] SidebarProfileMenu renders gradient when `user.avatar_color` is set
- [ ] Fallback (no color) still uses Tailwind chrome palette classes (solid)
- [ ] `getUserAvatarStyle()` removed from `user-profile-store.svelte.ts`
- [ ] `getContrastTextColor` import removed from `user-profile-store.svelte.ts`
- [ ] `pnpm run check` passes with 0 errors
- [ ] MCP consent page unchanged (fallback only)

## Edge cases handled

- **Hue wraparound**: hue=10° → start hue=340° (handled by `((h % 360) + 360) % 360`)
- **Lightness clamp**: 0% ≤ l ≤ 100% (clamped in `hslToHex`)
- **Saturation clamp**: 0% ≤ s ≤ 100% (clamped in `hslToHex`)
- **Invalid hex**: `hexToHsl` returns null → `computeAvatarGradient` falls back to the input color as both start and end (solid fallback)
- **Grayscale colors** (s=0): hue shift has no effect, gradient becomes lightness-only (dark→light gray) — still visually distinct

## Algorithm parameters (tunable)

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Hue shift | ±30° | 60° total spread — distinct but harmonious (PB logo: sky 199° → indigo 239° = 40°) |
| Lightness shift | ±12% | 24% total — visible luminance gradient without washing out |
| Gradient angle | 135deg | Oblique top-left → bottom-right, matches PB logo SVG gradient |
| Text luminance threshold | 0.5 | Same as existing `getContrastTextColor` |
