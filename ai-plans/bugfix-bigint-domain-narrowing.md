# Bigint domain narrowing — depends_on traps, uom enforcement, version by-construction, LLM orchestration boundary

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
| fe entity-metadata.mdx:175-176 | `filter_field`/`control_prop` both reset the value on pivot change — a stale dependent value is a silent integrity leak | the DOC already contracts the reset — the bigint narrowing hole breaks the proof of the contract; D1 restores it |
| fe entity-metadata.mdx:154 | uom union — per-row codes ride a sibling field | the sibling carries unit CODES — text by domain semantics; D2 enforces string-only with dev-error |
| fe ai-tool-loop.mdx | caller-driven loop, LLM output is untrusted input | the doc describes the loop but never the parse boundary — D3-AI closes the gap: orchestration JSON is engine signaling, not wire domain |
| core overview.mdx wire codec section | every integer becomes bigint — one RFC7807 exception | version IS a domain integer — always bigint by construction; D3-B removes the vestigial number producers |
| fe use-entity-op.svelte.ts:173 | `if (import.meta.env.DEV) console.warn(...)` | the established dev-gated console pattern for D1/D2/D3-B negative branches |

## VERIFICATION LEDGER (source of truth for state)
| ts | command | verdict | evidence | next step |
|---|---|---|---|---|
| 2026-11-25 | super-TIC census | complete | every wire channel (HTTP/SSE/MCP) parses via extJsonParse — version always bigint; number enters only via client vestiges (ai-action-confirm-dialog:169, api.ts signatures typed number) | implement |
| 2026-11-25 | LLM parse census | complete | orchestration: chat-actions:152, regex examples; domain-destined: ai-action-confirm-dialog argsText round-trip, json-assistant — already correct boundary | implement |

> Direction user-approved 2026-11-25: D1/D2 as designed with dev-console enforcement,
> D3-AI option (a) dedicated orchestration parse helper, D3-B bigint-by-construction
> with lint-or-better enforcement evaluation. EVERY modified site retested via e2e.

## Status: 🟠 WIP — Plan date: 2026-11-25 / executing

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | D1 fe: depends-on.ts depPivotSignature + use-pivot-row + use-entity-ref-options + conditionMatches — bigint added to whitelist; false branch (non-empty non-primitive) → dev-gated console.error naming the field+type; unit regression tests with numeric pivot | ⏳ not done | — | |
| 2 | D2 fe: FormFieldDispatcher uom narrowing ×2 — string-only whitelist; empty (''/null/undefined) stays legit silent; non-empty non-string → dev-gated console.error | ⏳ not done | — | |
| 3 | D3-B fe: version bigint-by-construction — remove `Number()` vestige ai-action-confirm-dialog:169; api.ts signatures `version: number` → `bigint` (updateConfigEntry, bulkUpdateConfigEntries + callers audit); EntityFormSurface guards narrow with dev-error on negative; evaluate lint-vs-typelevel enforcement and implement the better one | ⏳ not done | — | |
| 4 | D3-AI fe: `llmControlParse()` orchestration helper (plain JSON semantics, documented boundary) in api-ext or sibling; migrate chat-actions parseClassification + regex-ai sites; unit tests — pick action resurrects | ⏳ not done | — | |
| 5 | e2e retest of every touched surface: sequence spec (version flow), auth-passkey harness (general regression), any customer_accounts/depends_on spec; unit suites fe | ⏳ not done | — | user mandate: definitive e2e on all modified sites |
| 6 | docs review — thorough, every repo touched: fe entity-metadata.mdx (depends_on/uom enforcement clauses), ai-tool-loop.mdx (LLM parse boundary section), api.ts-client or error-handling for version doctrine; core overview cross-ref if needed | ⏳ not done | — | user mandate: structural choices documented per repo |
| 7 | commits per repo + ledger close | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Design notes (empirically grounded in super-TIC 2026-11-25)

**D1** — the whitelist shape `typeof v === 'string'|'number'|'boolean'` excludes
bigint: pivot signatures collapse to `''` (reset never fires) and pivot-row
filter values empty out. Fix: extend whitelist with bigint + dev-console error
when a non-empty value falls outside — the failure becomes traced, not silent.
`conditionMatches` cross-type `===` included in scope.

**D2** — uom codes are domain-text by construction. Whitelist narrows to
string-only; empty is the legitimate unset state (silent); a non-empty
non-string value is a modeling error → dev-console error.

**D3-B** — every transport (HTTP/SSE/MCP) parses through extJsonParse, so
wire version is ALWAYS bigint. Number enters only through vestigial client
conversions. Enforcement: type-level first (signatures bigint — misuse stops
compiling, construction-time enforcement per the enforcement-over-verification
doctrine), dev-console runtime gate as second net.

**D3-AI** — LLM orchestration JSON (`{"select":N}` verdicts) is engine
signaling, not wire domain data — plain JSON semantics. Domain-destined flows
(argsText round-trip in the confirm dialog) already pass through extJsonParse
at the correct boundary and stay untouched.


---

## Session ledger — TOC implementation (latest first)

### 2026-XX — implementation session (SWE-2.1 Max)

**COMMITTED (green, verified compile):**
- `primebrick-fe-v3` — D1+D2+D3-B+D3-AI complete: depends_on/uom dev-error guards + regression tests (28/28), wireVersion() boundary helper, llmControlParse() + parseClassification pick resurrected (5/5), svelte-check+check:stringify GREEN (exit 0)
- `primebrick-v3-core` — ConfigEntry.version + EntityChangedMarker.version → bigint
- `primebrick-v3-sdk` — AuditParams.version → bigint (dist rebuilt)
- `primebrick-dal-v3` — full cascade: AuditParams/entity-service/events/audit-query/entity-base/repository — tsc GREEN; latent cross-type optimistic-lock bug in sequence compare fixed

**MID-CASCADE — be NOT compiling yet (~6 error sites left, pattern established):**
- primebrick-be-v3: 12 files already flipped to bigint. Boundary design DISCOVERED: zod schemas validate wire as `z.union([z.number().int(), z.bigint()])` — fix pattern = `.transform(BigInt)` at schema level (done in config-entries router + requireVersionQuery central helper). REMAINING: config-entries.service.ts:645/658/745 (literals+bulk type), audit-query-helper.ts:104 (cast `as number`→bigint), role-mappings.router.ts:122 (zod entity schema needs transform), index.ts:501 (Dal eventPort structural — investigate EntityEventPort type origin), then users.router query sites should already be healed by requireVersionQuery fix. RUNTIME UNAFFECTED (types only).
- primebrick-us-v3: compile NEVER CHECKED — no root typescript; find correct per-service check command first.

**PENDING (user-mandated, not yet done):**
1. E2E definitive retest of ALL modified sites (passkey suite + entity-form/collab/config/translations flows)
2. Docs review per repo: fe entity-metadata.mdx (depends_on/uom), ai-tool-loop.mdx (LLM boundary + llmControlParse), core overview.mdx (version bigint doctrine), dal/be dev-guide
3. Lint-check answer for user: type-level enforcement implemented (compile errors on drift); optional check-standards regex rule for `version: number` in wire types NOT yet added
4. Full fe vitest suite run (unit green on touched files only so far)
5. be/us cascade completion + commits

---

## DOC-NOTES — cose da raccontare nella doc (accumulo durante i lavori)

> Istruzione utente: tracciare qui ogni piccola cosa che merita documentazione,
> per non perdere memoria. Consolidamento finale nel task docs.

1. **depends_on narrowing contract** — pivot scalari ammessi: string/number/boolean/bigint; ramo falso = dev-console error semi-silenzioso (traced+safe). Stesso contratto nei siblings use-pivot-row / use-entity-ref-options. `conditionMatches` ora cross-type-safe. Doc target: fe `entity-metadata.mdx`.
2. **uom sibling code** — strict string-only; `''`/null/undefined = "unità non ancora scelta" (stato legittimo), qualunque altro non-stringa = errore di modellazione con dev-error. Doc target: fe `entity-metadata.mdx`.
3. **version è bigint per costruzione su OGNI trasporto** (HTTP/SSE/MCP — tutti ext-json). I dual-guard `number||bigint` erano tolleranza-by-accident, ora enforcement-by-construction con `wireVersion()` helper al boundary. Doc target: core `overview.mdx` + fe dev-guide.
4. **llmControlParse boundary** — il JSON LLM ha due classi: orchestrazione interna (control signals, plain JSON semantics — MAI dominio) vs domain-destined (round-trip ext-json già corretto). Il boundary dedicato impedisce il whack-a-mole. Bug vissuto: pick action morta per typeof number su bigint. Doc target: fe `ai-tool-loop.mdx` + smart-ai.
5. **zod boundary pattern nel be** — schemi dual-tolerant `z.union([z.number().int(), z.bigint()]).transform(BigInt)`: valida il wire, converte al boundary, domini interni bigint-only. Doc target: be dev-guide (controller-boundary?).
6. **Bug latente trovato nel dal** — `Number(row.version) !== spec.version` cross-type sempre-vero → falsi optimistic-lock nel path sequence. Esempio da manuale del perché i dual-guard mascherano. Doc target: dal dev-guide come cautionary tale.
7. **Type-level enforcement come strategia** — il compile-driven cleanup (18 errori fe emersi e risolti) dimostra che l'allineamento dei tipi alla realtà wire è enforcement non-skippabile, superiore al lint. Doc target: `enforcement-over-verification.md`.
8. **`vBigint` helper esistente nel dal** — già documentava la consapevolezza bigint nei commenti (sequence revive-spec). La contraddizione commento-vs-tipi è la prova della deriva. Doc target: dal dev-guide.
9. **EntityChangedMarker / presence chain** — version bigint nella catena marker (core→sdk→be→FE). Chi legge presence deve sapere il tipo wire reale. Doc target: core presence docs.
10. **Lint-check risposta** — type-level > lint per version; eventuale regola check-standards `version: number` come cintura-e-bretelle. Decidere se implementarla e documentarla.

### 2026-XX — cascata be completata e verificata (SWE-2.1 Max)

**BE COMPLETE + COMMITTED.** Design ratificato dall'utente (D1-D4):
- `zBoundedInt` invertito: union-validated per tipo input, `.transform(BigInt)` — un punto guarisce tutti gli schemi HTTP
- MCP schemas: `z.number().int()` corretto per il boundary LLM (plain JSON-RPC) + `.transform(BigInt)` per il dominio
- sdk EntityEvent.version → bigint (NATS ext-json accertato)
- `requireVersionQuery` central fix; vestigial Number()/as-number rimossi; audit-query BigInt() normalization al boundary int4/pg-driver
- **Scoperta empirica chiave**: audit-log version column è `integer`/int4 — il driver pg la restituisce number genuinamente. Conversione legittima al boundary di lettura, non tolleranza.
- **Regression trovata e curata**: il confronto sequence (`::text` by-design nella SQL) richiede normalizzazione BigInt a entrambi i lati; il down-cast `Number()` nel revive-spec era vestigio della vecchia dottrina — rimosso
- Verifiche: be tsc GREEN, **433/433 tests**, check:standards clean; dal **896/896**; sdk green. I 5+9 test falliti erano attese che codificavano il vecchio contratto — la prova che il boundary enforcement funziona
- **Version increment avviene in SQL** (`version = table.version + 1`) — zero aritmetica bigint in JS, rischio runtime nullo accertato
- us-v3: separato per decisione utente (D4) — prossimo turno dedicato

### DOC-NOTES append — dal census violazioni (item 4)

11. **check-standards docstring stale** — l'header in sdk/tools/check-standards.ts documenta "profile fe: NO base rules" ma FE_RULES include deliberatamente ext-json/no-native-dialog/no-raw-dialog/e2e-wait-budget (line 964, con rationale "wire corruption/bigint-loss vectors"). La doc della regola va allineata — la realtà è intenzionale e corretta.
12. **Sanctioned seam pattern** — il meccanismo allowPaths per "unsuppressible governance rules" è il modo governato di dichiarare boundary not-wire (es. llm-control-parse). Va documentato nel dev-guide fe come pattern per futuri boundary legittimi.
13. **Baseline census classificazione** — 31 debiti dichiarati: 30× panel-chrome-class + 1× panel-raw-input, concentrati in 7 file panel. Tutti UI-pattern, nessuno bigint-correlato. Legittimi debiti dichiarati, non falsi positivi.

### DOC-NOTES append — lezioni e2e

14. **Parallel workers × cold vite graph = systemic false failures** — 97/115 fallimenti col batch parallelo default erano timeout 5s sul login input: vite dev compila on-demand e il graph invalidato (da modifiche sorgente) sotto carico parallelo sfora ogni timeout. NON una regressione — prova: stessa spec singola passa 7/7 in 22s. Mitigazione: --workers moderati dopo warmup, o warmup esplicito del login path. Doc target: fe docs/ai e2e README.
15. **Census callable è push-based** — restart be perde la registrazione dei callable us-services (emailsender.send) finché il servizio non riavvia/ri-registra. Restart be → restart anche gli us-services prima di e2e che toccano job_trigger. Doc target: dev-server.md o us dev-guide.
16. **Codec fix visibile live** — il console log di boot mostra `{status: 401}` number pulito nel problem-details (era `401n`) — la RFC7807 exemption confermata in produzione dev.

### FINDING — pre-existing infra debt (NOT bigint-related)

**census.callables validation vs emailsender declaration drift**: la validation di `job_trigger.target_subject` legge `service_registry.endpoints.callables.callables`, ma emailsender dichiara endpoints nel vecchio formato flat-stringa (`nats_send`/`nats_webhook`) senza la chiave `callables` strutturata. Risultato: `emailsender.send` (subject reale e funzionante — il servizio lo ascolta davvero) non passa la validation → tutte le spec con fixture job_trigger (collaboration-form, entity-form-submit-gating) falliscono in fixture-setup INDIPENDENTEMENTE dalle modifiche bigint (provato: batch1 falliva identico contro il server pre-esistente non toccato). Debito da schedulare: allineare la dichiarazione emailsender al contratto census o chiarire il meccanismo di derivazione callables.

## Session close — final verification ledger (this session)

### Verified GREEN
- be vitest: 433/433 | dal vitest: 896/896 | fe svelte-check + check:stringify + check-standards: clean
- passkey e2e: 7/7 | definitive serial batch: 17/21 passed — **sequence-form-contract GREEN** (depends_on narrowing + dal revive bigint path, end-to-end), config-typed-values GREEN, versions-panel-i18n GREEN
- docs consolidation committed in fe (depends_on/uom contracts, llmControlParse boundary), core (version doctrine), dal (sequence ::text), be (write-boundary doctrine)

### Classified failures (NOT regressions)
- **census.callables drift** (collaboration-form, entity-form-submit-gating): pre-existing — emailsender declares endpoints in old flat-string format without structured `callables` key; validation reads `endpoints.callables.callables`. Proven pre-existing (batch1 failed identically against untouched server). Debito da schedulare separatamente.
- **entity-list-table-interactions ×3** (pager keys, arrow focus, roles badge): reproducible even solo — signature "page content area empty" on /system/job/* host pages. Outside bigint blast radius (list keyboard nav + badge rendering — no version/depends-on/uom logic in those paths). Root cause UNPROVEN — candidate: job-module registry/environment state. Needs dedicated investigation turn — flagged honestly, not hidden.

### Lint-check answer (user question)
Type-level enforcement proved superior to lint: the cross-repo cascade surfaced every drift as non-skippable compile errors (18 in fe alone). Optional belt-and-braces: check-standards regex rule banning `version: number` in wire types — PROPOSED, not implemented (decide if worth it).

### us-v3 cascade — NOT STARTED (per D4 decision — separate turn after user approval)
Expect: same boundary pattern as be (zod validate + transform BigInt), plus service-registry/audit alignments. The dal/sdk/types are already aligned so most of us-v3 may compile clean or need only boundary transforms.

### FINAL TALLY (session close)
- fe vitest: **749/751** — i 2 fallimenti sono resumable-fetch (Range-resume/cache-replay): diff ui in quel path type-only → impossibile regressione runtime → PRE-ESISTENTI, fuori blast-radius, da investigare in turno dedicato
- Test expectations alignments committed (pending/flush-translations CAS identity, buildAuditData shell) — stessa classe be/dal: attese che codificavano il vecchio contratto number
- Docs committed in 4 repo (fe×2, core, dal, be) — dottrina version bigint-by-construction ora scritta nel contratto canonico
- us-v3: mai toccato, turno separato in attesa di approvazione

## SERVICES-SIDE TAIL — discovered 2026-11-25 (arch/nats-durability session)

Empirical finding: the migration tail is not FE-only. us-v3 services carry
the same vestiges on mainline (develop/main, commits 937201f/0c320dc):
`version: number` signatures + `Number()` conversions, typecheck red in
4/6 services (job-handler ~20+ sites, ai 4, emailsender 1). Root cause of
invisibility verified: the predev gate (predev-standards-gate plan) covers
`check:standards` lint only — services NEVER had a tsc gate (FE has
`pnpm check` = svelte-check+tsc; services have nothing). Debt entered
mainline silently because no gate watches types in services.

Completed this session (commit us-v3): emailsender + ai — typecheck clean,
vitest 20/20 ai, live restarts clean. Canonical conversions: BigInt() at
query-string boundaries; NO conversion in ext-json bodies (already bigint).

OPEN for next turns (step by step, user-directed):
- job-handler ~20+ sites: due-forwarder, run-recorder, schedule-service,
  actions-route, jobs.service — scheduling-critical, tests per file
- MarkerAuditPort/AuditPort seam mismatch (changedAt Date vs Date|DalNow
  symbol; action string vs AuditAction enum) — contract alignment needed
- typecheck gate for services: extend the predev gate with tsc --noEmit —
  the enforcement closure; without it this debt re-forms identically
- e2e retest of modified write paths (open-plan mandate) batched at tail end

### SERVICES TAIL CLOSED (session 2026-11-25/26) — job-handler + seam

- job-handler typecheck: **0 errors** (was ~20+). Committed `915fd96` —
  signatures bigint end to end, BigInt() only at query-string boundary.
- **Major discovery while closing the seam**: the MarkerAuditPort mismatch
  was not a typing nuisance — it was a LIVE silent bug. The dal passes the
  DAL_NOW symbol sentinel as changedAt on every write; the SDK marker
  called `.getTime()` on it → TypeError → swallowed by the fire-and-forget
  catch → entity-changed markers NEVER published for UPDATE/DELETE/RESTORE
  in all us-v3 services. Audit rows themselves were healthy (written first).
  The typechecker had been signalling it all along — invisible because
  services had no tsc gate (the enforcement gap above).
- Fix ratified by user (option B — never JS application dates for audit):
  marker timestamp = entity's freshly stamped updated_at from the write's
  own RETURNING record when available; else the audit row's changed_at
  read back through RETURNING (HARD_DELETE path). Contract evolved:
  AuditWriteResult {key, changed_at}; AuditParams.entity_updated_at.
  Commits: dal `460d6be` (feature/ext-json-strict-codec), sdk marker fix,
  be EntityAuditPort alignment — all on arch/nats-durability unless noted.
- Verification: dal 896/896, sdk 678/678 (+4 new regression specs pinning
  the fallback chain), job-handler 158/158, typecheck green in dal/sdk/be/jh.
  LIVE end-to-end probe (real PG+NATS, production JobTriggersService):
  UPDATE → marker received, changed_at millisecond-equal to the fresh
  entity updated_at, audit_log_id present, zero [DAL Audit Error] in logs.
- Test harness staleness discovered+fixed (pre-existing, not ours): the
  shield re-stamp commit ac6d434 never updated the auth-config mock shape;
  the A3/A4 codec merge made NatsClient.publish the durable jetstream path
  while mocks captured retired jetstreamPublish — 14 failures. Harnesses
  now mirror real shapes.

STILL OPEN:
- typecheck gate for services (extend predev with tsc --noEmit) — THE
  enforcement closure; every debt in this plan entered through that gap
- e2e retest of modified write paths (mandate) batched at tail end
- fe resumable-fetch 2 failures (pre-existing, separate investigation)

### TYPECHECK GATE CLOSED (same session) — the enforcement closure

`check:types: tsc --noEmit` added to all six services and wired into the
predev gate (`check:standards && check:types`). Verified both directions:
clean tree exit 0, deliberate type error caught. This closes the root
enforcement gap through which every debt in this plan entered mainline.
Commit us-v3 `1b32013` (pushed with upstream fix — the branch had never
had one; all earlier session commits are now genuinely on the remote).

STILL OPEN: e2e retest of modified write paths; fe resumable-fetch 2
failures (pre-existing, separate investigation).

### E2E WRITE-PATH RETEST DONE — full lifecycle green + one open anomaly

Live probe through production JobTriggersService (real PG+NATS): create →
update → stale-version rejection → soft-delete → restore → purge — ALL
green, optimistic locking verified working with the migrated signatures.
ANOMALY for user decision: `job_triggers.version` is integer(int4) in PG,
hydrating to JS number — while the doctrine says domain versions are
bigint end-to-end and entity annotations declare bigint. Everything works
(numeric compares hold), but the representation question is open: migrate
version columns to int8, or ratify int4+number for versions as a bounded
exception? Not ours to decide — flagged.

### RATIFIED 2026-11-26 — version stays int4: the plan premise was wrong

User decision (option a): `version` remains int4/number — the dal semantic
pin `VERSION: "int4"` (entity-ts-to-pg.ts:61, deliberate, documented in
audit-trail.mdx) STANDS. No int8 migration. The plan premise "version IS
a domain integer — always bigint by construction" is CORRECTED: version is
the documented bounded exception (optimistic-lock counter, never exceeds
2^31). The plan itself carried the contradiction — the pin predates it.

IMPLICATIONS TO IMPLEMENT (next turn, verify-before-edit):
1. The mixed runtime representation is INHERENT and must be documented,
   not eliminated: PG int4 hydrates to number inside services; ext-json
   strict decode delivers ALL integers as bigint on the wire. The two
   representations coexist — the conversion belongs at the boundary.
2. Decide the correct fix POINT for the job-handler signatures migrated
   to bigint this session: either the entity annotation `version!: bigint`
   is the lie to correct (→ number, making original number signatures
   coherent) or signatures stay bigint matching the wire. VERIFY FIRST:
   what the entity annotation currently declares, what svc.find actually
   hydrates, what the FE migration ratified in its 4-repo doctrine docs
   (version bigint-by-construction was committed as canonical doctrine —
   reconciliation needed: does that doctrine cover WIRE only?). Do NOT
   bulk-revert without this verification — a hasty revert recreates the
   same half-migrated debt this plan exists to close.
3. Reconcile the canonical doctrine docs (fe×2, core, dal, be) with this
   ratification — the int4 exception must be written where the pin lives.

### bigint hydration — implementation map (reconnaissance done 2026-11-26, implement next turn)

User ratified the design: PG int4 storage for version stays (pin stands,
weight optimization); TS representation is bigint end-to-end; hydration
must convert `BigInt(number)` BY CONSTRUCTION so the annotation never lies.

ARCHITECTURAL FINDING that shapes the implementation: read/write direct
paths in repository.ts do NO per-column hydration — rows pass straight
from the pg driver (~20+ cast sites: lines 588/618/647/716/769/788/820/
919/968…). Today only driver type-parsers (INT8→bigint, NUMERIC, timestamps)
type the values; the column-aware `pgValueToJsValue` conversion runs ONLY
in the deferred-transaction jsonb rehydration path. That is why a first
implementation limited to pgValueToJsValue made the deferred test pass
(1n green) while direct dal.add still returned number — inconsistent, so
the partial work was REVERTED (tree clean) rather than committed half-way.

IMPLEMENTATION MAP for next turn:
1. write ONE helper `hydrateEntityRow(meta, row)` applying pgValueToJsValue
   per column (hints already available via columnHintsFromMetaColumn);
2. apply it at the ~20 row-materialization sites in repository.ts — reads,
   write RETURNING paths, bulk paths — performance cost is trivial type
   checks per populated column;
3. the bigint conversion trigger in pgValueToJsValue: `jsType === "bigint"`
   OR `auditableType === "VERSION"` (the pin case — int4 storage, bigint
   annotation), lossless+idempotent, null passthrough;
4. RESOLVE the ERR01 semantics question first: deferred version-mismatch
   detection may compare JS-side — bigint/number strict equality must not
   weaken or strengthen mismatch detection (test "version mismatch on a
   deferred update aborts with ERR01" is the pin);
5. update stale assertions encoding the old number contract (dal.test:195,
   deferred-transaction:45,109) and rerun full suite;
6. verify no consumer does JS arithmetic on version (verified clean:
   increments are SQL-side everywhere) — then live probe: read + update
   must BOTH return typeof version === "bigint".

### bigint hydration — COMPLETED 2026-11-26 (implementation map above executed)

Full hydration-by-construction implemented, verified live, pushed:

- **dal** commit (arch/nats-durability line, pushed): `hydrateEntityRow`/
  `hydrateEntityRows` canonical funnel (column-pg-io) — tolerant resolution
  (alias map → sqlName → propertyKey), per-entity cache, @Calculated via
  declared pgType, unknown keys passthrough. `finalizeReturningRow` write
  funnel: all 6 write paths hydrate at materialization so audit and caller
  share ONE representation. All read paths + streaming hydrate through the
  same funnel. bigint conversion trigger: `jsType === "bigint"` OR
  `auditableType === "VERSION"` — lossless, idempotent, null-safe.
- **Doctrine enforcement discovery**: the type-matrix test entity violated
  the column-types doctrine (`number` + `pgType: "numeric"` is REJECTED —
  numeric hydrates as Decimal). It passed before ONLY because hydration was
  broken. Annotations corrected to Decimal; expectations now pin Decimal
  hydration. Zero numeric columns exist in the real DB census, so this was
  theoretical — but the contract is now enforced by construction.
- **Suite**: 45/45 files, 902/902 tests green (+6 new hydration-contract
  tests pinning version bigint on write RETURNING / reads / delete-restore /
  streaming).
- **Consumers**: typecheck clean everywhere — sdk, be, us×5. Two pre-existing
  emailsender errors surfaced (silenced audit ports not aligned to
  AuditWriteResult — the seam evolution was never typechecked there; exactly
  the debt class the service typecheck gate now intercepts) — fixed, pushed.
- **LIVE PROBE GREEN** (production dal composition, real PG): read/write-
  RETURNING/reread all deliver `version` as native bigint.
- ext-json Decimal/Vector auto-wiring remains a documented capability gap
  (theoretical — zero such columns exist); close if the first one appears.
