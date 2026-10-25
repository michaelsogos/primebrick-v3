# Launcher: preview-chain selection + virtual path header

> Fix UX approvato: il launcher (Finder-style) perde il senso di navigazione
> perché il gradiente marca solo la route corrente e il click non lascia
> traccia. Modello A: la selezione segue la preview chain (le righe
> cliccate/focalizzate); la route corrente tiene un puntino-marker quando
> diverge. Nuovo header con il path virtuale composto + href reale.
> Enter resta l'unico goto (footer hint già esistente) — niente Ctrl+Enter.

## Status: 🟢 DONE — Plan date: 2026-10-25 21:30 UTC / 23:30 CEST

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | `previewLeaf` state (col3 focus) + reset in `selectApp`/`selectModulePreview`/`handleOpenChange` | ✅ | 2026-10-25 | terzo anello della chain |
| 2 | `aria-selected` + gradient seguono SOLO la preview chain esplicita o la route — mai i fallback di contenuto (col0 `activeApp`, col1 `selModuleId`, col2 `selLeafId`) | ✅ | 2026-10-25 | fix: no auto-select di default module/leaf — solo preview/route/diverged-dot |
| 3 | Route marker: puntino `bg-primary` dopo label sulle righe route-context quando divergono dal preview | ✅ | 2026-10-25 | col0/col1/col2 |
| 4 | Header strip: path 1-1 con la selezione (root→`/root`, modulo→`route_prefix`, leaf→`href`) + hover preview testuale (display-only, zero effetto su selezione/navigazione) | ✅ | 2026-10-25 | NO fallback nel path — solo selezione composta |
| 5 | svelte-check 0/0 + E2E | ✅ | 2026-10-25 | vedi sotto |
| 6 | Commit FE | ✅ | 2026-10-25 | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

## E2E evidence (2026-10-25)

- `/crm/customers` + open: header `CRM › CRM › Clienti` + `/crm/customers`,
  catena intera selezionata (route == preview).
- Click "Sistema": gradiente solo su Sistema; puntino su CRM in col0
  E in col1 (route marker), col2 mostra i contenuti del modulo
  previewato SENZA selezione (nessun auto-select di default module/leaf
  — selezione = solo righe previewate o route chain).
- Click "Impostazioni": `Sistema › Impostazioni › Profilo` +
  `/system/settings/profile` nell'header (target risolto di Enter),
  Impostazioni SEL, CRM dot, col2 senza selezione finché non si
  previewa una leaf.
- Hover root "Sistema" → `Sistema` + `/system`; hover modulo →
  `Sistema › Impostazioni` + `/system/settings` (prefix, non leaf);
  hover leaf → path completo + suo href. mouseleave → torna la
  selezione. Hover mai tocca selezione/navigazione.
- Path label = solo livelli selezionati/composti — il fallback di
  default-leaf serve solo al goto (Enter), non alla breadcrumb.
- svelte-check 0 errors / 0 warnings.

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Design

**Stato** (`SidebarAppLauncher.svelte`):

```ts
let previewLeaf = $state<ModuleNavLink | null>(null);
// selectApp: previewLeaf = null; selectModulePreview: previewLeaf = null;
// handleOpenChange(open): previewLeaf = null;
```

**Selezione (model A — il gradiente È la preview chain)**:

| Col | selezionato se | marker route (puntino) se |
|-----|----------------|---------------------------|
| 0 | `activeApp === root` | `currentRoot === root && preview diverge` |
| 1 | `activeModuleId === m.id` | `currentModuleId === m.id && diverge` |
| 2 | `previewLeaf?.id === item.id` **o** (nessun previewLeaf e `pathname === item.href`) | `pathname === item.href && diverge` |

- `aria-selected` segue la stessa logica del gradiente (un solo truth).
- `activeModuleId` fallback al default del root previewato = la riga che
  Enter aprirebbe → coerente, la selezione mostra il target.

**Header** (dentro `Popover.Content`, sopra `div.flex.divide-x`):

```
Sistema › Impostazioni › Profilo
/system/settings/profile
```

- Riga 1: label path via `$t`/`resolveModuleLabel`, separatore `›`.
- Riga 2: href = target del goto — `previewLeaf.href` |
  `moduleHomeInApp(activeModule, activeApp)` | default-chain della root.
  Identico a ciò che Enter esegue → il path *è* il link costruito.
- Edge: path parziale se root senza moduli o modulo senza leaf nel root.

**Marker route**: `<span class="size-1.5 rounded-full bg-primary">` dopo
la label (prima di CTA/chevron). Visibile solo quando la riga route
NON è quella selezionata dal preview.

## Non cambia

- Enter = goto del row/link (unico binding, footer hint esistente).
- `handleOpenChange` reset + focus-route-row (già fatto) — all'apertura
  preview == route, header mostra la route corrente.
- Reveal switch: righe hidden possono comporre il path (ghost) ma Enter
  resta bloccato — coerente col reveal.

## Test manuale (E2E)

1. `/crm/customers` → apri: CRM/CRM/Clienti selezionati, header
   `CRM › CRM › Clienti` + `/crm/customers`.
2. Click "Sistema" → gradiente su Sistema + moduli sistema; CRM tiene
   puntino su col0, Clienti puntino su col3 se visibile; header si
   aggiorna a `Sistema › Impostazioni › Profilo` + href.
3. Enter sul preview → naviga all'href mostrato nell'header.
