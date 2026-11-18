# Settings module always last in level-2 navs (+ breadcrumb reflection)

> ✅ DONE (2026-12-08) — shipped as fe-v3 `489e06f`.

## As built (2026-12-08)

- `modules-shell.svelte.ts`: `isSettingsModule` (`settings` | `*-settings`)
  + stable `settingsLast` comparator, applied inside `modulesForRoot` and
  `inaccessibleModulesForRoot`. No BE/schema/flag changes.
- `modules-shell.test.ts`: fixture gained `crm-settings` sibling +
  inaccessible `ai-settings`; expectations updated to
  `[job,crm,settings]` / `[crm,crm-settings]`; new cases for
  settings-last, stable non-settings order, reveal-list parity.
- Verified: vitest 14/14, svelte-check 0/0, check-standards
  `--profile=fe` clean.
- Leaf-level `settings` rule intentionally skipped (no leaf exists —
  convention documented in the comparator comment).

## Requirement

> "Qualsiasi sia l'ordine del secondo livello delle navs, settings sia
> sempre (in tutte le app/moduli) l'ultima della lista; e che questo si
> rifletta anche nelle breadcrumb."

Level model of the shell nav tree:

```
L1  root/app      'system', 'crm', …            (listRoots: system first, rest A-Z)
L2  module        job, ai, settings, crm, crm-settings, …   ← THE FIX LEVEL
L3  nav leaf      triggers, schedules, providers, …          (declaration order)
```

**Settings-family detection (convention)**: module id `settings` (the
reserved platform module, BE static nav) OR `*-settings` (sibling
modules emitted as `{code}-settings` — today: `crm-settings`).

## Empirical evidence (census)

- BE `ServiceRegistryService.findAll` — **no ORDER BY**: module order =
  registry insertion order; siblings appended after their declaring
  service (`module-discovery.service.ts` L321-363).
- FE `modulesForRoot(root)` (`modules-shell.svelte.ts` L189-195) — the
  SINGLE ordering seam, consumed by:
  - `SidebarAppLauncher` L73 — launcher column 2 (module list per app)
  - `moduleBreadcrumbSegments` L65-66 — breadcrumb MODULE switcher
  - `defaultModuleForRoot` L208-211 — landing fallback ("first member")
  - `inaccessibleModulesForRoot` L199-205 — reveal-switch disabled list
- Existing test proves the gap: `modules-shell.test.ts` L144 expects
  `['job','settings','crm']` under `system` — settings mid-list today.
- No `settings` nav LEAF exists in any declaration (crm dicts live in
  the `crm-settings` sibling module, not as leaves) — leaf-level is out
  of scope.

## Design

**One comparator, one seam.** Sorting inside `modulesForRoot` +
`inaccessibleModulesForRoot` propagates to launcher AND breadcrumb for
free — they share the source. No BE change, no schema change, no
declaration flag.

```ts
// modules-shell.svelte.ts
/** Settings-family modules (reserved `settings`, `*-settings` siblings)
 *  always render LAST within their root — convention, not a declaration
 *  flag: `id` is already the emitted identity. */
const isSettingsModule = (m: { id: string }) =>
  m.id === 'settings' || m.id.endsWith('-settings');

const settingsLast = <T extends { id: string }>(list: T[]): T[] =>
  [...list].sort((a, b) => Number(isSettingsModule(a)) - Number(isSettingsModule(b)));
```

Applied at both `modulesForRoot` and `inaccessibleModulesForRoot`
(reveal-switch disabled list stays consistent). **Stable sort** —
non-settings order untouched (registry/declaration order is authored
signal, not alphabetical).

## Side effects (audited)

| Consumer | Effect | Verdict |
|---|---|---|
| `defaultModuleForRoot` fallback → `members[0]` | first member can never be a settings module | ✅ desired — landing on an app opens its primary module |
| breadcrumb module switcher | settings item last in dropdown | ✅ the requested reflection |
| breadcrumb page switcher (`items` from `nav`) | unchanged — leaf level, declaration order | ✅ out of scope |
| `resolveModuleFromRoute` / dict resolution | unchanged — ordering only, no resolution | ✅ |
| favorites grouping (`favoriteGroups`) | iterates `shellNav.modules` raw | unchanged (module declaration order, by design) |

## Files

- `primebrick-fe-v3/src/lib/shell/modules-shell.svelte.ts` — comparator +
  apply in the two `*ForRoot` getters.
- `primebrick-fe-v3/src/lib/__tests__/modules-shell.test.ts` — update
  L144 expectation (`['job','crm','settings']`) + new cases: `crm-settings`
  sibling last under `crm` root; multiple settings modules keep relative
  order; no-settings root unchanged; reveal-list ordering.

## Verification

- `vitest run src/lib/__tests__/modules-shell.test.ts` — updated + new cases green
- `svelte-check` clean; `check:standards` clean
- Empirical: the same seam feeds launcher + breadcrumb — the unit test
  on `modulesForRoot` IS the runtime contract (no second code path).

## Open decision

- **Leaf-level extension** (a future `id:'settings'` nav leaf inside a
  module, or `*-settings` href): none exists today — skip (convention
  documented in the comparator comment) or enforce now? Recommendation:
  skip — conventions enforced before existence become unverifiable.
- **Naming**: convention on emitted id (`settings` / `*-settings`) vs an
  explicit declaration flag (`nav_position:'last'`) — flag is schema
  work for zero current benefit; convention recommended.
