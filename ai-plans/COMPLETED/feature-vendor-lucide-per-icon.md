# Vendor lucide — per-icon specifiers (no barrel waterfall)

> Decisione presa: opzione **A** — specifier per-icona risolti via
> import-map PREFIX (`@primebrick/ui/vendor/lucide/icons/` →
> `/vendor/icons/lucide/`). Il barrel `export *` (`vendor-lucide.js`,
> 1866 import statici) viene eliminato: oggi qualsiasi remote chunk che
> importa UN'icona scarica l'intero catalogo (~1890 req). Fabbisogno
> reale misurato: 31 icone uniche su tutti i sorgenti remoti.

## Status: 🟢 DONE — Plan date: 2026-10-25 13:30 UTC / 15:30 CEST — completed 2026-10-25 13:55 UTC

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | **core**: `vendor-plane.ts` — add `VENDOR_SPECIFIER_PREFIXES` + prefix branch in `resolveVendorSpecifier` | ✅ done | — | `['@primebrick/ui/vendor/lucide/icons/']`; order: exact → prefix → blocked → bundle |
| 2 | **core**: `diffVendorRequirements` — prefix-aware manifest lookup | ✅ done | — | manifest key ending `/` matches `specifier.startsWith(key)` → version compare |
| 3 | **core**: update `vendor-plane.test.ts` (prefix external/reject/diff cases) | ✅ done | — | |
| 4 | **core**: export `lucideIconSpecifier(name)` helper (`Cpu`→`icons/cpu.js` kebab) | ✅ done | — | pure fn, shared by vendor build + US rewrite; `([a-z0-9])([A-Z])`→`-`, `([a-z])([0-9]+)$`→`-` |
| 5 | **sdk**: nessun cambio (re-export `*` di core) — solo rebuild | ✅ done | — | verify |
| 6 | **FE vendor build**: `vite.vendor.config.ts` — drop `vendor-lucide` entry; add 2160 icon entries `icons/lucide/<name>` → lucide `dist/icons/*.js` stubs | ✅ done | — | entry map generata da `readdir` a config-load; entryFileNames `icons/lucide/[name].js` già coperto da `${name}.js` |
| 7 | **FE vendor build**: manifest — replace `lucide` key with prefix entry `"@primebrick/ui/vendor/lucide/icons/"` → `{url:'/vendor/icons/lucide/', version}` | ✅ done | — | fix assertion `entryKeys===specKeys` per prefix |
| 8 | **FE**: `app.html` import map — `"@primebrick/ui/vendor/lucide"` → `"@primebrick/ui/vendor/lucide/icons/" : "/vendor/icons/lucide/"` | ✅ done | — | 1 riga statica, scala per sempre |
| 9 | **FE**: delete `vendor/entries/vendor-lucide.ts` + stale `static/vendor/vendor-lucide.js` | ✅ done | — | rebuild pulisce static/vendor |
| 10 | **US shared rewrite**: nuova fn condivisa `rewriteLucideBarrelImports(code)` in core vendor-plane (o sdk) — transform `import {A as X,B} from '@primebrick/ui/vendor/lucide'` → `import {default as X} from '.../icons/a.js'` | ✅ done | — | named+`as`+skip `type` specifiers; pure fn testabile |
| 11 | **US ×3 vite.config**: call rewrite in `transform` (enforce pre, su .svelte/.ts/.js) + emit gate `allowed.has(spec)` → `resolveVendorSpecifier(spec)==='external'` | ✅ done | — | ai, emailsender, job-handler — stesse 3 modifiche |
| 12 | **US ×3**: `specifierVersion` prefix-aware (`icons/...` → wrapped version via longest-prefix match su UI_VENDOR_MAP keys) + icon-exists validation vs ui's lucide dist | ✅ done | — | build error su icona typo = fail-fast |
| 13 | **US ×3**: `pnpm fe:build` → verify deps.json has per-icon entries, no barrel specifier | ✅ done | — | |
| 14 | **Verify**: svelte-check FE 0/0; vitest core+FE; E2E reload `/system/ai/console` → request count /vendor/ ≈ 30 (da 1889); icons render | ✅ done | — | E2E stessa matrice del warm-up fix |
| 15 | Commit per repo + move plan COMPLETED | ✅ done | — | |

<!-- Status values: ✅ done · ✅ done · ⏳ partial · 🚫 dropped. -->

---

## Architettura target

```
remote source:   import { Cpu, Gauge } from '@primebrick/ui/vendor/lucide'
                        │ (US transform hook, pre-resolve)
remote emitted:  import { default as Cpu } from '@primebrick/ui/vendor/lucide/icons/cpu.js'
                 import { default as Gauge } from '.../icons/gauge.js'
                        │ (document import map, UNA riga prefisso)
browser:         /vendor/icons/lucide/cpu.js   /vendor/icons/lucide/gauge.js
                        │ (entry chunks vendor build — nomi deterministici, no hash)
                 ↓ importa shared-x.js (Icon base) + svelte.js via import map
```

## Decisioni di design

- **Specifier shape**: `.../icons/<dist-name>.js` — `.js` esplicito perché
  import-map prefix appende verbatim (no auto-extension). `<dist-name>` =
  nome file in `@lucide/svelte/dist/icons/` — copre canonical (1891) +
  alias stub `.js` (269, es. `alarm-check` → `alarm-clock-check.svelte`).
- **Authoring invariato**: i sorgenti remoti continuano a scrivere
  `import { Cpu } from '@primebrick/ui/vendor/lucide'` — il rewrite è
  build-time, tipi/IDE risolvono via ui wrapper `export *` (resta).
- **Nessuna de-sanzione centrale**: nuova icona = la usi, il rewrite la
  mappa, il file esiste già nel vendor build (tutti i 2160 nomi emessi).
  Nuovo MODULO = zero cambi a core/sdk/FE/ui.
- **Fail-fast**: icona typo → il rewrite valida `<kebab>.js` in ui's
  lucide dist → build error remoto, mai 404 a runtime.
- **Breaking accepted**: vecchi chunk con `vendor_requires:
  {"@primebrick/ui/vendor/lucide"}` → handshake `missing` → pannello
  errore → rebuild. Coerente con "no retrocompatibilità".
- **DynamicIcon** (ui glob lazy): invariato — i moduli icona ora esistono
  come entry `icons/lucide/<name>.js`; il dynamic-import del glob punta
  lì (rolldown dedupa entry+dep in un file solo). Meno `shared-*` orfani.
- **bits-ui**: stesso pattern latente (602KB barrel) ma componenti non
  enumerabili meccanicamente come icone — fuori scope, notato.

## Dettagli chiave verificati

- `@lucide/svelte@1.59.0` dist: 1891 `.svelte` canonici + 2160 `.js`
  (stub canonici + alias). Alias es. `alarm-check.js` →
  `export {default} from "./alarm-clock-check.svelte"`.
- Kebab rule verificata sui 31 nomi reali: `Maximize2`→`maximize-2`,
  `CheckCircle2`→`check-circle-2`, `AArrowDown`→`a-arrow-down`,
  `CircleGauge`→`circle-gauge` — tutti file esistenti.
- Tutti gli import remoti sono `import { N1, N2 as X }` — nessun
  default/namespace/type-only da gestire (type specifiers skippati).
- `specifierVersion` attuale: `icons/cpu.js` cadrebbe su
  `@primebrick/ui` version (sbagliato) → serve longest-prefix match su
  `UI_VENDOR_MAP` keys → `@lucide/svelte` version. Stessa fix nei 3 US.
- Loader FE (`verifyVendorDeps`): nessuna modifica — `diffVendorRequirements`
  prefix-aware basta; import map fa il resto.

## Acceptance

- `reload /system/ai/console` → `/vendor/` requests ≈ **30** (da 1889):
  primebrick-ui shared chunks + SOLO le ~25 icone usate + svelte entries.
- `vendor-lucide.js` non esiste più; `icons/lucide/<name>.js` serviti 200.
- Icons renderizzano nelle pagine remote (DocsIndexPage, AiSettingsPage…).
- Build error remoto su `import { NotAnIcon }` (fail-fast).
- Vecchio deps.json → pannello "vendor mismatch — rebuild" (no crash).
- svelte-check 0/0, vitest verdi, core tests aggiornati.

## E2E misurato post-fix (reale, network log)

`/system/ai/console` full reload, sessione autenticata:

| Metrica | pre per-icon | post per-icon | Δ |
|---|---|---|---|
| GET totali | 2741 | **952** | **-65%** |
| `/vendor/` GET | 1889 | **103** | **-94.5%** |
| `icons/lucide/*` | — | **30** | = icone dichiarate da ai-pages |
| SPA console→docs-index | ~11 | **3** | chunk+icone deduped |

Casi verificati: statiche (287 svg in console, 42 in docs-index), dinamiche
(`shared-badge-*.js` lazy via glob DynamicIcon — stesso chunk dedupato
degli stub `icons/lucide/`), gradient-stroke (AiIcon/GradientIcon topbar —
inline SVG `stroke="url(#…)"` intatto, fuori dal vendor plane).
Console: 0 errori; 1 warning `lifecycle_double_unmount` pre-esistente.
Struttura emessa: `icons/lucide/<name>.js` stub → `shared-<icon>-<hash>.js`
(rollldown dedupa entry+glob+alias in UN chunk per icona; alias→canonico).
`icons/lucide/index.js` (barrel interno lucide) escluso — fail-closed 404.
