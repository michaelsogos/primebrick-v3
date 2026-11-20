# no-raw-json lint — ban JSON.stringify/JSON.parse/.json() on wire paths, ext-json everywhere

> Continuation of `dict-page-create-flow-anatomy.md` — the `runEntityOp` work
> surfaced a crash class: raw `JSON.stringify` on bodies carrying ext-json
> `bigint` fields (ELT bulk delete throws `TypeError` on develop today).
> User directive: "non si può più passare per json standard — extjson
> serializza e deserializza in automatico tutto".

## Status: 🟢 MIGRATION COMPLETE (tasks 1-9 shipped 2026-12) — task 10 docs pending

| # | Task | Status | Notes |
|---|------|--------|-------|
| 1 | **`no-raw-json` rule** in `check-standards.ts` — NO_EXEMPT; patterns `JSON\.(stringify\|parse)\s*\(` + `\.json\s*\(\s*\)` (Response/Request bodies); fe+lib+consumer profiles; E2E tests for the rule itself | ✅ | shipped as `ext-json` rule — live since 2026-11-20 |
| 2 | **G1 wire request bodies** (~45 fe): `body: JSON.stringify(x)` → `extJsonStringify(x)` — includes the TypeError crash class (`useBulkActions:166,253`, `useRowActions:238,338`, `api.ts` ×8, `welcome`, smart-ai payloads) | ✅ fe `0f9a609` | 47 sites/28 files; crash class killed — `entity-op-confirm-gate` 4/4 (bulk DELETE 200). Bonus find: BE uuid v4→v7 fix `e492488` (pre-existing, caught by auth E2E) |
| 3 | **G2 wire response reads** (~144 fe): `res.json()`/`response.json()`/`*.json()` on fetch Responses → `extJsonParse(await res.text())` or `apiFetchExt` where call-site already uses apiFetch | ✅ fe `a6aa408` | 139 sites/49 files; bigint boundary fixes: session `expires_at`→Number, `orderedColumns` order→Number (core `65c5148`), `default_page_size`→Number — "Load failed" root-caused + fixed |
| 4 | **G3 local state storage** (~18 fe): sessionStorage/localStorage JSON in `useEntityList` (×10), `use-form-draft`, `i18n/store`, `user-profile-store`, draft stores → ext-json | ✅ fe `a6aa408` | same commit as G2 — storage read/write pairs + `useEntityList` ×18 |
| 5 | **G4 deep-copy** (2 fe): `JSON.parse(JSON.stringify(x))` → `structuredClone(x)` — native, handles bigint/Date/Map correctly | ✅ fe `3b329b8` | DEVIATION (empirical): `structuredClone` rejected — DataCloneError on $state proxies; shipped as `extJsonParse(extJsonStringify(x))` (proxy-safe + bigint-correct) |
| 6 | **G5 pretty-print** (~8 fe): `JSON.stringify(v, null, 2)` → `extJsonStringify(v, null, 2)` — codec already supports `space` | ✅ fe `3b329b8` | signature differs: `extJsonStringify(v, 2)` — no middle arg |
| 7 | **G6 user/AI-typed JSON** (~30-40 fe): `smart-json-assistant/*`, `smart-json-config/*`, `utils/json-object.ts`, `zod-messages`, `ai-action-confirm-dialog` → **extJsonParse/extJsonStringify too — NO exemption** (user decision: one codec, zero mixing; extJson is a strict superset and preserves >2^53 that JSON.parse silently corrupts). In-memory caveat handled at consumption: `Number(v)` where a plain number is required (zod `z.number()` fields, arithmetic `+`) | ✅ fe `3b329b8` | boundary fixes: zod length `Number(minVal/maxVal)` in config-validation; `z.preprocess(bigint→number)` on type-config `rules.value` |
| 8 | **G7 tests+e2e** (54 files — `.spec.ts`, `__tests__`, e2e helpers): Playwright `APIResponse.json()` + fixture JSON.* → ext-json; e2e asserts `version` (bigint!) in `shield-identity` + the gate spec. **Requires `alsoTests` on the rule — `isTestFile()` skips test files unless `--tests` runs, and `pnpm check:standards` doesn't pass it** | ✅ fe `7b72423` | 57 files, 280→0 violations; e2e imports `@primebrick/core/ext-json` (node-safe); `helpers/nats.ts` local codec deduped to canonical; asserts updated to bigint (`1n`, `365n`) |
| 8b | **`alsoTests` rule flag** in check-standards — a rule may opt into scanning test files (`no-raw-json` sets it; other rules stay prod-only — no noise) | ✅ | shipped with the rule |
| 9 | **Other repos phase-2** — be-v3 (57), dal (24), sdk (16), ui (26), core (3): per-repo census → classify; codec lives in core/sdk (internal use legit, allowPath); us-v3 already at **0** | ✅ | sdk `84bc5d0` · be `968c8aa` (incl. `express.json()`→`extJsonBodyParser()` harness fix) · ui `6ba3026` · us `aa95b07` (+ `plainJson` gutted-by-496f7d6 restored) · dal/core clean — **0 violations all 7 repos** |
| 10 | **Docs + verify** — update `docs/ai/` wire-codec doc (or create), `check-standards` run clean, full E2E re-run of touched surfaces | ⏳ | `sdk/docs/dev-guide/ext-json.mdx` exists — GAP: `Number(v)` boundary-coercion rule + per-context import convention (core/e2e vs api-ext/fe vs sdk/services) not documented |

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

**Strict-mode resolution (user: "INACCETTABILE" on silent last-wins):**
dup-key rejection is non-negotiable — silent last-wins makes payloads
look correct while wrong, near-impossible to debug. Verified: native
`JSON.parse` CANNOT detect dup keys (reviver sees holder post-collapse;
detection fundamentally requires tokenizing the source). Grammar
strictness is otherwise spec-identical (trailing comma/unquoted/
comments/NaN all rejected natively).

**STRICT fast-path architecture — measured, working** (committed as
bench candidate in `ext-json.test.ts`, branch `feature/ext-json-bench`):
```
validateStrict(text, flags, unsafe)  — JS tokenizer: grammar + dup-key
                                       Sets + int-token flags (source
                                       order) + unsafe-int digit strings
JSON.parse(text)                     — native materialization
bigintWalk(obj, flags, unsafe)       — DFS flag application
                                       (walk order ≡ source order)
```
- **DES @180KB: strictFast 2.24ms bun / 1.55ms node vs ext 2.65/1.99**
  → 1.18-1.28× FASTER than ext AND strict (tokenizer never materializes;
  only the dup-key scan is JS, the expensive part is native)
- dup keys thrown at every depth ✓ · trailing comma rejected ✓ ·
  string-embedded `{"a":1,"a":2}` correctly NOT flagged ✓
- unsafe ints EXACT (better than codec's ≥21-digit corruption) ·
  float-notation integers (1e3/1.0) flagged value-based → codec parity
- known hazard pinned by test: 16-digit SAFE ints must NOT populate the
  unsafe-digit array (walk's isSafeInteger branch wouldn't consume it →
  counter desync → wrong bigint values downstream — guard test added)
- **Rust→WASM upgrade path** (user proposal — legit): swap only
  `validateStrict` for a Rust tokenizer compiled to wasm — validate
  ~1.4ms→~0.2ms @180KB → total ~1.0ms = **~2.5× over ext**. Same
  flags/unsafe interface; single wasm artifact serves browser+Bun+Node.
  Estimated boundary cost ~60-100µs (TextEncoder encode + wasm call).
  Decision: phase-2 — the JS variant already beats ext AND is strict;
  Rust is perf-headroom, not a requirement for correctness.
- Engine availability for the alternatives — the non-strict
  `context.source`/`JSON.rawJSON` path remains available as a
  *secondary* candidate only if strict requirements ever change
  (TC39 stage-4, Chrome/Edge 114+, Firefox 135+, Safari 18.4+);
  SER fast-path (`rawJSON` replacer, −20/-40% both engines, no
  strictness concern — stringify has no dup-key surface) is
  unconditionally recommended.
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

## Step 1+2 DONE (2026-11-20) — strictFast shipped + enforcement live

**Codec (core `9365cc8`, `0f7df0d` — `feature/ext-json-bench`)**
`ext-json.ts` is strictFast: validateStrict (grammar + dup-key +
trailing-comma) → native `JSON.parse` → flag-applied bigint walk.
Strict, ~1.2–1.4× faster than json-bigint, fixes the ≥21-digit corruption.
`extJsonStringify` = `JSON.rawJSON` replacer + json-bigint fallback.
149/149 tests green; check-standards clean.

**Enforcement (sdk `e8d278f` — `feature/no-native-dialog`)**
- `ext-json` rule now flags `JSON.stringify|parse` AND argument-less
  `.json()` wire reads (`res.json(body)` senders unaffected — verified).
- New per-rule `alsoTests` flag — ext-json scans `__tests__`/`*.test.ts`
  even without `--tests` (wire contracts hold in tests).
- ext-json in `FE_RULES` (always-on for browser code incl. `fe/src`
  remote surfaces) and `NO_EXEMPT_RULES` — inline `standards-exempt`
  cannot suppress it; `exempt-governance` flags the attempt.
- Checker suite: 52 tests incl. 7 new ext-json cases (dup-key read,
  sender immunity, NO_EXEMPT, allowPaths, alsoTests, fe profile).

**Exemption migration (all repos)** — inline `standards-exempt: ext-json`
converted to `.devin/check-standards.json` `allowPaths` where the reason
is a genuine external-format seam (be×7: Casdoor/JWS/JWT/webauthn/manifest;
sdk×4: NDJSON logs, RFC7807, OpenAPI; dal×5: signed artifacts/CLI/quoting;
us×6: mistral.rs/OpenAPI/embeddings/Brevo/webhook; decimal×1: the "…d"
format itself; core×2: codec + its parity spec). UI editor/preview
exempts were G5/G6-class claims — removed, NOT allowPathed (real debt).

**Gate state after landing** — violations now VISIBLE (declared debt,
the ratchet works; `--write-baseline` is dead by design — fix or
allowPath are the only doors):
- sdk 94 (~92 test sites G7-class + oidc-verifier, docs-pack-client prod)
- be 97 (~52 ext-json: 45 test + oauth/mcp/openapi prod; ~45 pre-existing
  i18n-key-ns composite debt unrelated to this change)
- ui 24 (G5/G6: json-code-block/editor, json-value-editor,
  payload-map-editor/viewer, DynamicIcon, numeric-input, ai service-api…)
- us 17 across ai/emailsender/job-handler/boilerplate (incl. `fe/src`
  remote surface hits)
- fe — full census incl. tests pending run of step 2 (next: `bun
  ../primebrick-v3-sdk/tools/check-standards.ts src --profile=fe`)
- dal, core, decimal, webhook, crm: CLEAN

**Commits**: sdk `e8d278f`, dal `b530548`, be `2395717`, ui `90f0144`,
us `496f7d6`, decimal `f521136`, core `0f7df0d`.

## Open questions (decide at TOC)

1. ~~G6 mechanism~~ — **resolved by user**: total ban, extJsonParse
   everywhere, no helpers/allowPaths in fe (Number() at consumption).
2. ~~`.json()` scope~~ — **resolved**: argument-less `.json()` only
   (reader pattern); `res.json(body)` senders legitimately untouched.
3. ~~e2e inclusion~~ — **resolved by user**: tests+e2e are in scope,
   enforced via `alsoTests` flag (task 8b).
4. ~~phase-2 repos~~ — **resolved empirically**: ext-json was already in
   `consumer`/`lib` — the rule landed everywhere at once; per-repo debt
   is now quantified (above) and migrates with G-groups per repo.

## Acceptance

- `check-standards` → `no-raw-json` violations listed with count; after
  migration, **0 unsuppressed** in fe (allowPaths only for documented
  G6/util files).
- No `JSON.stringify|JSON.parse|.json()` in `src/` outside allowPaths.
- ELT bulk delete/restore no longer throws `TypeError` (fixed as part of
  G1 + task-15 converge — verified by the dict-gate spec pattern on an
  ELT surface).
- e2e gate spec stays 4/4 green; touched pages smoke-verified.
