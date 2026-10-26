# Module label flip — census seeds resolved labels (BE) → deterministic `$t` (FE)

> Bug reale riportato: launcher mostra "AI Assistant", dopo il click "AI".
> Causa: `resolveModuleLabel` risolve `label_key` via `$t` su dict che
> caricano route-scoped (CORE_DICT_MODULES + modulo corrente) — fuori dal
> modulo la chiave manca → fallback `name` (registry, non localizzato).
> Il valore mostrato dipende dal TIMING di caricamento dict. Stesso bug
> latente sui leaf-label della colonna 3 del launcher (chiave raw a eco).
>
> EVidenze misurate (DB live, it-IT): census ~8KB; label_key dichiarate
> = 33 uniche; labels map risolta = 1.330 byte (+16% payload). Crescita
> O(label dichiarate, access-filtered) — non O(dict). Un solo read path
> FE ($t) e un solo write path (mergeModuleDict): labels è trasporto,
> l'authoring resta *.translations — nessuna seconda fonte di verità.

## Status: 🟢 DONE — Plan date: 2026-10-25 14:05 UTC / 16:05 CEST

| # | Task (detail level) | Status | When | Notes |
|---|---------------------|--------|------|-------|
| 1 | BE `ModuleDiscoveryService.list(user, lang)` — collect `label_key` da module + nav + nav_hidden + routes + sheets | ✅ done | 2026-10-25 | `keyNamespaceOf` canonico per scope |
| 2 | BE — risolvi via `TranslationsService.getI18nDict(scope, lang)`; miss → chiave omessa; scope failure contenuto | ✅ done | 2026-10-25 | una fetch per scope, mai per chiave |
| 3 | BE — response `{ modules, labels }`; controller valida `?lang=` (UiLang supportate) | ✅ done | 2026-10-25 | `src/index.ts` |
| 4 | FE `fetchModules(lang)` → `{modules, labels}`; `loadShellNav` → `mergeModuleDict(lang, doc.labels)` | ✅ done | 2026-10-25 | `api.ts`, `modules-shell.svelte.ts` |
| 5 | FE — lang switch: `uiLang.subscribe` refetch census se `_censusLang` diverso | ✅ done | 2026-10-25 | modules-shell module-level |
| 6 | Rename end-user ×7 lingue: ai/emailsender/job/system patch firmate + `serviceDisplayName` | ✅ done | 2026-10-25 | 4 patch `20261025210000_*` applicate |
| 7 | Launcher colonne auto-width min→max 300px | ✅ done | 2026-10-25 | `SidebarAppLauncher.svelte` |
| 8 | Verify: vitest BE 17/17, FE 36+5, svelte-check 0/0, E2E live | ✅ done | 2026-10-25 | vedi sotto |
| 9 | Commit per repo | ✅ done | 2026-10-25 | BE `b143c4f`, FE `59413a1`, US `5eb3ee6`, workspace `2fca630` |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

## E2E evidence (2026-10-25, live, it-IT → en-GB → it-IT)

- `/api/v1/modules?lang=it-IT` → 200 `{modules, labels}`, 32 chiavi risolte cross-scope.
- Launcher aperto su `/system/settings/profile` (host): "Gestore degli
  Assistenti AI" immediato — zero "AI Assistant". Leaf col3:
  "Registrazione Microservizi", "Migrazione e Patch DB",
  "Modelli di Esportazione".
- Dentro `/system/ai/console`: trigger "Sistema / Gestore degli
  Assistenti AI" — identico, **nessun flip**. Remote mount OK (287 icone).
- Switch it-IT → en-GB: census refetch `?lang=en-GB` → "AI Assistants
  Manager", "Process Manager", "Email Manager", "AI Models",
  "Document Indexing"; trigger aggiorna. Ritorno a it-IT idem.
- Launcher colonne: 192/296/229px — auto-size entro min 192/208 max 300.
- Console: 0 errori (dopo restart US — v. nota).

> NOTA ambiente: i 3 US erano `migration_failed` da lock contention
> (boot `--hot` durante `db:migrate`) — ledger pulito, bastato restart.
> I 502/503 `/ws/` erano il proxy BE che isola i servizi degraded.

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Design

```
GET /api/v1/modules?lang=it-IT
→ { modules: [...],
    labels: { "ai.module.name": "AI", "ai.nav": "AI", … } }   // +1.3KB

FE loadShellNav:  mergeModuleDict(lang, data.labels)
→ _mergedDicts[lang] — lo STESSO flat store delle dict modulo
→ $t('ai.module.name') = "AI" ovunque, deterministico al primo render
```

## Perché nessuna seconda fonte di verità

- Authoring: `*.translations` invariato — il BE risolve da lì.
- Write path FE: `mergeModuleDict` — identico a quello delle dict.
- Read path: `$t` — i componenti non toccano `labels`, non esiste una
  map parallela, non esiste `m.labels` sui nodi.
- Cache browser: `_mergedDicts` è la cache in-memory che `$t` legge.
  Niente pseudo-slot localStorage: `displayModules` deriva dal census
  stesso → le label arrivano nello stesso documento delle nav → il
  flash è strutturalmente impossibile.

## Dettagli

- `key → scope`: `ai.module.name` → `ai` → `ai.translations`; core keys
  (`app.*`, `system.*`) risolte allo stesso modo (ridondanti ma
  idempotenti — la dict core le avrebbe comunque).
- Chiave assente dalla dict → omessa da `labels` → `$t` echo key /
  `resolveModuleLabel` fallback `name`. Deterministico: se manca nel
  seed, manca anche nella dict del modulo (stessa tabella).
- `name` registry resta fallback per `label_key: null` (webhook) —
  unico valore disponibile, deterministico.
- ETag: URL `/api/v1/modules?lang=xx-YY` distinto per lingua → cache
  pb:etag separata per lingua, corretto.
- Merge order: dict modulo vs seed — stesse sorgenti DB, valori
  identici; last-write-wins innocuo.
- Regressione attesa zero: `resolveModuleLabel`, `$t`, shape `modules[]`
  invariati; `labels` è un campo aggiunto a livello payload.
