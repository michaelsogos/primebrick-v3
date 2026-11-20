# no-raw-json lint — ban JSON.stringify/JSON.parse/.json() on wire paths, ext-json everywhere

> Continuation of `dict-page-create-flow-anatomy.md` — the `runEntityOp` work
> surfaced a crash class: raw `JSON.stringify` on bodies carrying ext-json
> `bigint` fields (ELT bulk delete throws `TypeError` on develop today).
> User directive: "non si può più passare per json standard — extjson
> serializza e deserializza in automatico tutto".

## Status: ⚪ TODO — Plan date: 2026-11-20 (TIC)

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **`no-raw-json` rule** in `check-standards.ts` — NO_EXEMPT; patterns `JSON\.(stringify\|parse)\s*\(` + `\.json\s*\(\s*\)` (Response/Request bodies); fe+lib+consumer profiles; E2E tests for the rule itself | ⏳ | census below is the baseline |
| 2 | **G1 wire request bodies** (~45 fe): `body: JSON.stringify(x)` → `extJsonStringify(x)` — includes the TypeError crash class (`useBulkActions:166,253`, `useRowActions:238,338`, `api.ts` ×8, `welcome`, smart-ai payloads) | ⏳ | biggest-bang group — kills live crashes |
| 3 | **G2 wire response reads** (~144 fe): `res.json()`/`response.json()`/`*.json()` on fetch Responses → `extJsonParse(await res.text())` or `apiFetchExt` where call-site already uses apiFetch | ⏳ | api.ts `res.clone().json()`, Passkey `beginResp.json()`, `EntityRecordSheet:333`, … |
| 4 | **G3 local state storage** (~18 fe): sessionStorage/localStorage JSON in `useEntityList` (×10), `use-form-draft`, `i18n/store`, `user-profile-store`, draft stores → ext-json (payloads MAY carry entity fields — selection keys, draft rows, bigint ids) | ⏳ | same codec = zero risk; also fixes latent bigint-in-storage crashes |
| 5 | **G4 deep-copy** (2 fe): `JSON.parse(JSON.stringify(x))` → `structuredClone(x)` — native, handles bigint/Date/Map correctly | ⏳ | strictly better, not just compliant |
| 6 | **G5 pretty-print** (~8 fe): `JSON.stringify(v, null, 2)` → `extJsonStringify(v, null, 2)` — codec already supports `space` | ⏳ | display/tooltip paths |
| 7 | **G6 user/AI-typed JSON** (~30-40 fe): `smart-json-assistant/*`, `smart-json-config/*`, `utils/json-object.ts`, `zod-messages`, `ai-action-confirm-dialog` → **extJsonParse/extJsonStringify too — NO exemption** (user decision: one codec, zero mixing; extJson is a strict superset and preserves >2^53 that JSON.parse silently corrupts). In-memory caveat handled at consumption: `Number(v)` where a plain number is required (zod `z.number()` fields, arithmetic `+`) | ⏳ | NO helpers needed — the codec IS the helper |
| 8 | **G7 tests+e2e** (54 files — `.spec.ts`, `__tests__`, e2e helpers): Playwright `APIResponse.json()` + fixture JSON.* → ext-json; e2e asserts `version` (bigint!) in `shield-identity` + the gate spec. **Requires `alsoTests` on the rule — `isTestFile()` skips test files unless `--tests` runs, and `pnpm check:standards` doesn't pass it** | ⏳ | user requirement: tests must not bypass the codec either |
| 8b | **`alsoTests` rule flag** in check-standards — a rule may opt into scanning test files (`no-raw-json` sets it; other rules stay prod-only — no noise) | ⏳ | alternative `--tests` global = blast radius on all rules — rejected |
| 9 | **Other repos phase-2** — be-v3 (57), dal (24), sdk (16), ui (26), core (3): per-repo census → classify; codec lives in core/sdk (internal use legit, allowPath); us-v3 already at **0** | ⏳ | decide per-repo scope after fe green |
| 10 | **Docs + verify** — update `docs/ai/` wire-codec doc (or create), `check-standards` run clean, full E2E re-run of touched surfaces | ⏳ | dict-gate spec + affected pages |

## Census (2026-11-20, `src/` non-test)

| Repo | `JSON.stringify` | `JSON.parse` | `*.json()` | Total | Status |
|------|------------------|--------------|------------|-------|--------|
| primebrick-fe-v3 (prod) | 121 | 55 | ~144 | **~320** | worst offender |
| primebrick-fe-v3 (**incl. tests**) | **249** | **106** | **243** | **~600** | 54 test files — user: tests are in-scope |
| primebrick-us-v3 | 0 | 0 | 0 | **0** | ✅ already clean |
| primebrick-be-v3 | — | — | — | 57 | phase-2 census |
| primebrick-dal-v3 | — | — | — | 24 | phase-2 (pg driver legit) |
| primebrick-v3-sdk | — | — | — | 16 | phase-2 (codec internals) |
| primebrick-v3-ui | — | — | — | 26 | phase-2 |
| primebrick-v3-core | — | — | — | 3 | phase-2 |

fe clusters: `api.ts` ×8 bodies · `useEntityList` ×10 storage ·
`smart-json-*` ~30 AI-domain · `welcome` ×4 · `use-ai-assistant` ×4 ·
`useBulkActions` ×4 (2 crash-class) · auth/passkey ~10 `.json()`.

## Rule design

- **id**: `no-raw-json`, `NO_EXEMPT` (inline `standards-exempt` rejected).
- **patterns** (line rules, comments skipped by the engine):
  - `JSON\.(stringify|parse)\s*\(` — bans `JSON.stringify`/`JSON.parse`
    including `window.JSON.*` (prefix-agnostic is correct — same global).
  - `\.json\s*\(\s*\)` — bans `*.json()` on anything (Response reads AND
    Request body reads — both are the wire codec boundary). False-positive
    risk: non-Response `.json()` methods — census at implementation time;
    if any exist, narrow to `(\bres|\bresponse|\bresp|\w+Resp|\w+Res)\.json\(`.
- **allowPaths** (config-level, diff-reviewable — the only escape):
  expected **empty in fe** — user directive is a total ban; codec
  internals (`json-bigint` wrappers in core/sdk) get paths at phase-2.
  Anything else needs a documented reason in config, never inline.
- **`alsoTests`** — new rule flag: `no-raw-json` scans test files too
  (`isTestFile()` skips `__tests__/`/`*.spec|test.ts`/`/tests?/` unless
  `--tests` runs — and `pnpm check:standards` never passes it). Chosen
  over global `--tests` which would expose tests to ALL rules (i18n,
  boundaries) with unknown noise. The wire contract holds in tests:
  e2e `APIResponse.json()` reads bigint `version` — wrong `===` compares.
- **Profiles**: `fe` + `lib` (remote `fe/src` inherits) + `consumer` when
  phase-2 census lands. `tools/` is out of `src/` scope (scripts legit).

## Why groups, not blanket replace

- **G1+G2 (wire)** is mechanical and high-value — kills the bigint crash
  class (bulk delete/restore TODAY) and bigint-precision loss on reads.
- **G3 (storage)** is the same codec — but payloads may carry entity
  fields (selection uuids are strings; ids/versions are bigint → current
  `JSON.stringify` would throw on save; `JSON.parse` returns `number`
  on load → silently corrupts optimistic concurrency). ext-json fixes it.
- **G4/G5** are pure upgrades (`structuredClone`, codec `space` param).
- **G6 migrates too** (user override — correct on the merits): two
  codecs in one codebase guarantee boundary corruption — `JSON.parse`
  output fed to `extJsonStringify` silently loses >2^53, `extJsonParse`
  output fed to `JSON.stringify` throws. One codec kills the class.
  In-memory `bigint` needs `Number(v)` at consumers that require plain
  numbers — same discipline wire rows already follow.
- **G7 (e2e)** — Playwright `APIResponse.json()` parses OUR wire; e2e
  asserts `version` — same corruption class as prod code.

## Perf investigation (2026-11-20, measured — bun 1.4.2 | node 24.14)

Question asked: can ext-json be faster / does Bun justify itself vs Node.
Payload: entity-list rows (uuid, code, label_key, version, sort, created_at,
deleted_at, active, amount).

**DES — parse (ms/op, × = vs native JSON.parse):**

| rows | KB | Bun JSON | Bun ext | Bun fast | Node JSON | Node ext | Node fast |
|---|---|---|---|---|---|---|---|
| 10 | 2 | 0.003 | 0.024 (7.8×) | 0.021 (6.6×) | 0.003 | 0.022 (7.3×) | 0.026 (8.7×) |
| 100 | 17 | 0.028 | 0.220 (7.8×) | 0.177 (6.2×) | 0.028 | 0.186 (6.6×) | 0.251 (8.9×) |
| 1000 | 180 | 0.305 | 2.81 (9.2×) | **1.93 (6.3×)** | 0.291 | 2.01 (6.9×) | 2.35 (8.1×) |

**SER — stringify:**

| rows | Bun JSON | Bun ext | Bun fast | Node JSON | Node ext | Node fast |
|---|---|---|---|---|---|---|
| 10 | 0.001 | 0.011 (9.1×) | 0.010 (8.3×) | 0.002 | 0.010 (5.4×) | 0.014 (7.6×) |
| 100 | 0.021 | 0.106 (5.1×) | 0.095 (4.6×) | 0.019 | 0.101 (5.5×) | 0.092 (5.0×) |
| 1000 | 0.146 | 1.22 (8.4×) | **0.995 (6.8×)** | 0.310 | 1.26 (4.1×) | **1.02 (3.3×)** |

`fast` = engine-native candidates: `JSON.parse` + `context.source` reviver /
`JSON.stringify` + `JSON.rawJSON` replacer — verified present in both
V8 (node 24) and JSC (bun 1.4). Re-runnable bench:
`EXT_BENCH=1 npx vitest run src/ext-json.test.ts` (core, branch
`feature/ext-json-bench`).

**Readings — Bun vs Node (evidence for the BE→Bun plan):**
- Bun's native JSON.stringify is ~2× faster than Node's at 180KB
  (0.146 vs 0.310 ms) — parse is equal.
- json-bigint (pure-JS tokenizer) runs ~20% faster on V8 than JSC
  (ext DES 2.01 vs 2.81ms) — JSC pays more for JS-side parsing.
- **Bun + fast-parse is the best DES combination** (1.93ms) and beats
  Node's best (ext, 2.01ms). On Node fast-parse LOSES to ext — reviver-
  per-token costs more than the JS tokenizer on V8.
- **fast-stringify wins on BOTH runtimes** (−19% bun, −19% node @180KB).

**Codec bug found by the bench (empirical, now pinned in tests):**
integers ≥21 digits — BigNumber `.toString()` emits exponential form →
`BigInt("1.23e+28")` throws → codec falls back to `toNumber()` →
**silent corruption to imprecise float**. The corrected fast-path
preserves them exactly. Real-world impact ~zero (bigint max = 19 digits)
but it's a latent wire-fidelity hole.

**What the fast path costs (verified empirically + spec):**
- `strict:true` — narrower than it looks: native JSON.parse rejects
  trailing commas, unquoted keys, comments, NaN identically (grammar
  strictness is spec-identical). The ONLY difference is **duplicate
  keys**: `{"a":1,"a":2}` → native last-wins (spec behavior), json-bigint
  strict throws. And it CANNOT be recovered: the reviver sees `this`
  (holder) with the dup already collapsed — last-wins applied before
  any user code runs. Dup detection requires tokenizing the source =
  exactly the cost json-bigint pays; a regex can't do it (strings can
  legitimately contain `"a":` text → false positives). Verdict:
  strict dup-key rejection is inherently a custom-parser feature —
  you either pay a JS tokenizer or you don't get it. Real-world
  impact ~zero on our server-generated wire (our serializer never
  emits dup keys) — accepted loss, documented.
- Engine availability — resolved, NOT a polyfill: `context.source`/
  `JSON.rawJSON` are **TC39 stage-4 "JSON.parse source text access"** —
  the proposal's canonical example IS this exact use case
  (`digitsToBigInt`/`bigIntToRawJSON` = our fastJsonParse/Stringify
  verbatim). Support: Chrome/Edge 114+ (2023-05), Firefox 135
  (2025-02 — Mozilla delayed 132→135 over perf issues, consistent
  with our V8 measurement), Safari 18.4 (2025-03). Gate = one-time
  feature-detect at init → json-bigint fallback for pre-2023 engines.
- Alternatives evaluated and rejected: WASM/simdjson — object
  materialization into JS values dominates (wasm boundary per value),
  parser benchmarks show it *slower* than native JSON.parse; wins only
  for validate/traverse without materialization. Worker-offloaded
  parse = the only remaining lever (bigint survives structuredClone)
  but unjustified at our payload sizes.
- FE caveat on the "80% Bun" estimate: FE extJsonParse runs in the
  **browser**, not Bun — Chromium=V8 (DES fast slightly LOSES there,
  ~+340µs @180KB), Safari=JSC (wins). Bun coverage = server-side
  (BE post-migration, US, tools). Absolute numbers are sub-ms/µs-class
  either way — the perf delta is not the real argument; the wins are
  dropping a runtime dep, fixing the ≥21-digit hole, and simpler code.
- Why ignored: `context.source`/`JSON.rawJSON` are recent TC39
  additions (~Node 21+/Chrome 128/2024); when the codec was written
  json-bigint was the only portable bigint-safe path, `useNativeBigInt`
  was tried and rejected (floats throw), and perf was never measured —
  the requirement was bigint fidelity, not speed.

**Recommendation:** ship the corrected fast path (value+source reviver /
rawJSON replacer) behind a one-time feature-detect, json-bigint as
fallback — strictly-more-correct + faster on our target runtime (Bun)
+ drops a dep on modern engines. Decision pending user TOC.

## Open questions (decide at TOC)

1. ~~G6 mechanism~~ — **resolved by user**: total ban, extJsonParse
   everywhere, no helpers/allowPaths in fe (Number() at consumption).
2. **`.json()` scope**: ban all `*.json()` (uniform, catches Request bodies
   too) vs Response-name-pattern only (fewer FPs, misses oddly-named vars).
3. ~~e2e inclusion~~ — **resolved by user**: tests+e2e are in scope,
   enforced via `alsoTests` flag (task 8b).
4. **phase-2 repos**: apply `consumer` profile now or after fe green?

## Acceptance

- `check-standards` → `no-raw-json` violations listed with count; after
  migration, **0 unsuppressed** in fe (allowPaths only for documented
  G6/util files).
- No `JSON.stringify|JSON.parse|.json()` in `src/` outside allowPaths.
- ELT bulk delete/restore no longer throws `TypeError` (fixed as part of
  G1 + task-15 converge — verified by the dict-gate spec pattern on an
  ELT surface).
- e2e gate spec stays 4/4 green; touched pages smoke-verified.
