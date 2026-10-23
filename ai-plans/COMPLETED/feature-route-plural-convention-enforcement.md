# Route plural convention — rename job list + mechanical enforcement at enrollment

> Convenzione: entità singolari, tabelle/pagine/route plurali.
> Oggi `job-handler` dichiara la lista `job_schedule` su `/system/job` (leaf
> singolare = codice modulo) e la traduzione IT è `'Job'`. Non basta la fix:
> serve il gate meccanico — errore oggi, errore domani, impossibile registrare
> una nav che viola la convenzione.

## Status: 🟢 DONE — Plan date: 2026-10-21 12:45 UTC / 14:45 CEST

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | SDK: sposta `validateNavDeclaration` da BE `module-nav-meta.ts` a `@primebrick/sdk` (è il validatore del payload `service.register` — casa naturale); BE lo re-importa, zero riscritture call-site | ✅ done | 2026-10-21 | condiviso anche dai test US (write-time feedback) |
| 1b | SDK: **`entityPaths(prefix, listLeaf)`** — UNICO costruttore di path: `{list, create, detail}` derivati dal leaf, mai literal; i moduli dichiarano via builder → divergenza impossibile *by construction* | ✅ done | 2026-10-21 | risposta a "path non hardcoded in un punto" |
| 2 | SDK: regola **R1-list-plural** — `routes[].kind === 'list'` → ultimo segmento statico DEVE essere plurale (`pluralize.isPlural`, leaf kebab→words); kinds `create`/`detail`/`page` esenti | ✅ done | 2026-10-21 | dep `pluralize` su SDK |
| 3 | SDK: regola **R2-nav-leaf** — link foglia: risolve a route `list` dichiarata → coperta da R1; risolve ad altro kind → ok; NON risolve a nessuna route → plurale OPPURE `SINGULAR_LEAF_ALLOWLIST` (`profile`, `new`, …) | ✅ done | 2026-10-21 | allowlist piccola in codice, estensione deliberata = diff visibile |
| 3b | SDK: regola **R3-create/detail-leaf** — `kind:"create"` → leaf `=== 'create'`; `kind:"detail"` → leaf `=== '[param]'` | ✅ done | 2026-10-21 | `create` è LA convenzione unica (decisione utente); `/new` rifiutato a enrollment |
| 4 | BE test: `MODULE_NAV` (settings) validato dallo stesso validator — i moduli statici non possono regredire in CI | ✅ done | 2026-10-21 | module-discovery/module-nav-meta test |
| 5 | US job-handler: nav[0] `href` e route list → `/system/job/job-schedules`; create → `/system/job/job-schedules/create`; rules create → `/system/job/rules/create`; dichiarazione via `entityPaths()` | ✅ done | 2026-10-21 | `job-handler/src/index.ts` |
| 5b | US crm: `/crm/customers/new` → `/crm/customers/create` via `entityPaths()` — settings già conforme | ✅ done | 2026-10-21 | `crm/src/index.ts` |
| 6 | US job-handler + crm: test che invoca `validateNavDeclaration(nav)` — errore a write-time se la dichiarazione regredisce | ✅ done | 2026-10-21 | stesso gate dell'enrollment |
| 7 | FE: sposta `(app)/system/job/+page.svelte` → `(app)/system/job/job-schedules/+page.svelte`; `job/new/` → `job/job-schedules/create/`; `job/rules/new/` → `job/rules/create/`; `crm/customers/new/` → `crm/customers/create/`; `(app)/system/job/+page.ts` redirect → `job-schedules` (pattern settings) | ✅ done | 2026-10-21 | nessun link residuo alla vecchia lista |
| 8 | Translations: nuova patch `0005` — `job.jobs.nav`/`job.jobs.title` en → "Job Schedules", it → "Pianificazioni"; label create analoghe | ✅ done | 2026-10-21 | patch nuova + `primebrick-db sign` (mai editare patch shipped) |
| 9 | E2E: aggiorna path `/system/job` → `/system/job/job-schedules` in jobs-pages/ownership/access specs; suite verdi | ✅ done | 2026-10-21 | |
| 10 | Docs sync + commit (trailer SWE-2 Max); restart servizi dev (miei: BE + job) per ri-registrare nav + idp_code | ✅ done | 2026-10-21 | nav vive in service_registry.endpoints.nav → si aggiorna al boot |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Perché il gate è meccanico e non documentale

Il punto di strozzatura **unico** è `validateNavDeclaration`: gira a
`service.register` (enrollment, prima della persistenza) — OGNI servizio che
dichiara nav ci passa, per sempre. Spostandolo nell'SDK:

- **BE** lo importa identico → nessuna superficie API cambia;
- **US** i servizi lo chiamano nei propri unit test → errore a *write-time*,
  non solo a enrollment;
- **BE test** su `MODULE_NAV` → i moduli statici (settings) coperti in CI.

`pluralize.isPlural(leaf)` distingue `job`/`customer` (singolare) da
`runs`/`rules`/`customers`/`schedules`/`migrations` (plurale) — niente
euristica casereccia. L'allowlist per leaf singolari legit (`profile`,
`new`) è una costante in codice: aggiungervi una voce è un diff esplicito.

## Convenzione risultante (post-rename)

```
/system/job                     → redirect a nav[0] (module prefix, no page)
/system/job/job-schedules       list   job_schedule   "Job Schedules"/"Pianificazioni"
/system/job/job-schedules/create  create (remote chunk)
/system/job/runs                list   job_run        (già plurale ✓)
/system/job/runs/create  (se esiste — verifica)
/system/job/rules               list   job_rule       (già plurale ✓)
/system/job/rules/create        create (remote chunk)
/crm/customers/create           create customer      (era /new)
```

## Convenzione create/detail — UNA modalità

`create` leaf è LA convenzione (decisione): `/{list}/create`. Detail =
`/{list}/[{param}]`. `/new` sparisce ovunque — validator R3 lo rifiuta a
enrollment, `entityPaths()` non lo produce più.

La costruzione NON è più un literal: `entityPaths(prefix, leaf)` in SDK è
l'unico punto che compone i path entity — i moduli dichiarano
`routes: [...entityPaths("/system/job", "job-schedules")]` e non possono
sbagliare.

## Note / osservazioni collaterali

- **Create-leaf divergenza RISOLTA**: settings `/create` vince — è LA
  convenzione unica; crm/job migrano `/new` → `/create` + R3 la rende
  impossibile da violare.
- `service_registry.endpoints.nav` si ri-registra al boot del servizio —
  in dev basta restart del job service (mio, lo faccio io).
- La patch traduzioni è nuova (`0005_*`), mai editare `0004` shipped.
- `module.module.name` label resta "Job"/"Job Handler" come da decisione —
  il rename tocca la PAGINA, non il modulo.
