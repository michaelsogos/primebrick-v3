# Vendor plane — proportional drift policy (runtime leniency + lint enforcement)

# ⚠️ TURN PROTOCOL — READ THIS BLOCK EVERY TURN. IT IS THE WORKFLOW.

Every turn, in this order, NO EXCEPTIONS:
1. Read this whole plan — this block IS the operative workflow.
2. Fill in DOC RECEIPTS below before any action (cite doc:line).
3. State of the world = VERIFICATION LEDGER, never your memory.
4. Execute only the declared scope. Anomaly → STOP → report, max 2 retries.
5. Output waits ≤30s. Beyond that = anomaly, not "still running".
6. Before closing: write verdict + ledger + next step into the plan.
7. Prova del 9: every state claim carries `file:line` — if you cannot
   cite it, you did not verify it, it is an assumption.

## DOC RECEIPTS (fill before acting)
| doc:line | what it says | how it applies this turn |
|---|---|---|
| primebrick-v3-core/src/vendor-plane.ts:159-165 | exact-match policy + rationale ("svelte/internal non stabile, semver-tolerant deferirebbe solo opaque import failure") | è il contratto che la direttiva utente CORREGE: proporzionalità patch/minor, enforcement spostato al lint-time |
| primebrick-fe-v3/src/lib/components/remote-page/remote-loader.ts:194-200 | verifyVendorDeps throw fail-closed PRIMA dell'import | il punto esatto della brutalità: patch drift @primebrick/ui 3.5.0→3.5.1 ha impedito la pagina all'utente |
| primebrick-us-v3/crm/fe/vite.config.ts (depsManifest) | deps.json emesso a build-time con versioni risolte da node_modules; vite config DUPLICATO in 4 servizi (ai, crm, emailsender, job-handler) | il lint check confronta l'artefatto deps.json con la risoluzione corrente — la staleness è chunk-vs-libs |
| us-v3 docs/dev-guide/adding-a-service.mdx:129-141 | chunk esm-mount + module-assets; il remote-mount machinery | il re-vehicle test dimostra che esiste già il pannello import-error in-content con retry — worst case coperto |
| remote-loader.test.ts (fe-v3 src/lib/__tests__) | unit test che inchiodano il blocco vendor | da aggiornare alla nuova politica proporzionale |
| docs/ai/enforcement-over-verification.md (dottrina) | comportamento enforced a construction/lint time, mai check skippabile | la direttiva utente È la dottrina applicata: enforcement al lint, non blocco runtime |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-27 | playwright remote-vendor-drift.spec.ts (pre-fix) | RED confermato | test 1 fallito "Expected: visible, Received: hidden" — il drift @primebrick minor uccideva la pagina | implementazione |
| 2026-11-27 | core vitest vendor-plane.test.ts | GREEN 22/22 | classificazione versionDrift/isPrimebrickVendorSpecifier + diff invariato | loader FE |
| 2026-11-27 | fe vitest remote-loader.test.ts | GREEN 39/39 | casi lenient (passa+warn) e blocking (throw) inchiodati | lint tool |
| 2026-11-27 | sdk vitest check-vendor-drift.test.ts | GREEN 7/7 | fixture E2E del tool: patch=exit0 warning, minor/major=exit1, assente=pass, vendor-map wrapped resolution | wiring servizi |
| 2026-11-27 | check-vendor-drift sui 4 servizi reali | PROVA DEL 9 lint | emailsender ERROR minor reale (3.3.0→3.5.1), ai+job-handler WARNING patch (3.5.0→3.5.1), crm clean — classificazione esatta sul workspace vivo | rebuild drift reali |
| 2026-11-27 | pnpm fe:build ×3 (emailsender, ai, job-handler) + re-lint | clean 4/4 | il loop lint→rebuild→clean si chiude; era il caso utente originale | spec e2e |
| 2026-11-27 | playwright remote-vendor-drift.spec.ts (post-fix) | GREEN 3/3 | @primebrick minor MONTA; svelte patch MONTA; svelte minor pannello vendor + container hidden+empty | correzione spec |
| 2026-11-27 | correzione asserzione test 3 | lezione registrata | remote-page-content è SEMPRE nel DOM per design (bind pre-import, RemotePageMount.svelte:231-241) — la verità è hidden+empty, non count=0. Il test iniziale era sbagliato, non il prodotto | — |
| 2026-11-27 | svelte-check fe-v3 / crm pnpm test | 0 err 0 warn / 24-24 | vendor-drift visibile nella chain test accanto a check:standards | commit |

## Status: 🟢 GREEN — Plan date: 2026-11-27 / sera

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | TIC: doc receipts + design + direttiva registrata | ✅ done | 2026-11-27 | questa sezione |
| 2 | Spec RED e2e: pagina remota MONTA nonostante drift @primebrick patch E minor; third-party minor blocca ancora | ✅ done | 2026-11-27 | RED dimostrato pre-fix |
| 3 | core: classificazione semver-aware drift (patch/minor/major) in vendor-plane.ts + unit test | ✅ done | 2026-11-27 | versionDrift, isPrimebrickVendorSpecifier, VendorMismatchClass; 22/22 |
| 4 | fe remote-loader: @primebrick/* mai bloccante; third-party patch lenient; third-party minor/major + missing bloccano; console.warn diagnosi | ✅ done | 2026-11-27 | 39/39 unit test |
| 5 | sdk tools: check-vendor-drift.ts — patch=warning, minor/major=errore — + unit test tool | ✅ done | 2026-11-27 | 7/7 fixture test |
| 6 | Wiring lint nei 4 servizi con fe chunk (ai, crm, emailsender, job-handler) | ✅ done | 2026-11-27 | predev/prebuild/test accanto a check:standards |
| 7 | Spec GREEN eseguita in sessione | ✅ done | 2026-11-27 | 3/3 sullo stack reale |
| 8 | Prova del 9: drift REALI del workspace rilevati e rimediati via lint loop | ✅ done | 2026-11-27 | emailsender minor (error) + ai/job-handler patch (warning) → rebuild → clean 4/4 — il caso utente originale chiuso dal meccanismo stesso |
| 9 | Ledger + commit + push tutti i repo toccati | ⏳ in corso | — | core, fe-v3, sdk, us-v3, workspace |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Direttiva utente 2026-11-27 (ratificata, testuale)

Caso scatenante: `/crm/customers/create` morto con "vendor mismatch — rebuild
the module chunk: @primebrick/ui: requires 3.5.0, host provides 3.5.1" — un
PATCH drift ha ucciso la pagina.

1. "se io aggiorno la ui non è che tutto smette di funzionare a prescindere"
   — ci possono essere breaking changes ma non deve essere così brutale
2. Lint check: **patch cambiata → warning** (consiglia rebuild); **minor
   cambiata → errore** (DEVE rebuildare)
3. "a runtime non poniamo blocchi fail closed, lasciamo che le cose vadano
   altrimenti addio" — vale per le nostre lib SDK/DAL/UI/CORE rispetto ai consumer
4. Fork third-party DECISO dall'utente: **patch mai bloccante (tutto),
   minor/major third-party blocca ancora a runtime**

## Politica finale (derivata dalle direttive 3+4 combinate)

Runtime (remote-loader):
| specifier | patch drift | minor/major drift | missing dal manifest host |
|---|---|---|---|
| `@primebrick/*` | passa (console.warn) | passa (console.warn) — MAI bloccante | blocca (import impossibile) |
| third-party (svelte, bits-ui, …) | passa (console.warn) | **blocca** (vendor error panel) | blocca |

Lint-time (check-vendor-drift, tutti gli specifier in vendor_requires):
| drift | esito |
|---|---|
| patch | WARNING — rebuild consigliato |
| minor/major | ERROR — rebuild obbligatorio (exit 1) |
| deps.json assente | pass — chunk mai buildato, niente da confrontare |

## Note di design

- Nessuno split-instance possibile a runtime: il chunk importa SEMPRE la copia
  vendored dell'host — il rischio mismatch è API-shape, mai duplicazione.
- Worst case leniency: chunk genuinamente rotto → import failure → il pannello
  in-content con retry ESISTE GIÀ (testato in jobs-pages.spec.ts) — la shell
  sopravvive in ogni caso.
- La classificazione semver vive in core vendor-plane.ts (pure, env-neutral).
- Il lint tool vive in primebrick-v3-sdk/tools/ (sede degli altri tool
  condivisi: check-standards, check-stringify, gitflow).
- GAP documentale registrato: nessuna pagina dev-guide descrive il vendor
  plane — il contratto vive solo in commenti codice. Da valutare doc dedicata
  a fine slice (proporre, non silent-write).

## Aperto / fuori scope

- Duplicazione vite.config.ts vendor-plane nei 4 servizi — preesistente,
  non questo slice (candidato refactor condiviso futuro)
