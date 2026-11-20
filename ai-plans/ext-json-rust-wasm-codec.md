# ext-json Rust→WASM codec — strict validator as native module

> **Prerequisite:** strictFast JS codec (validate + native parse + flag-walk)
> migrated everywhere — see `no-raw-json-lint.md`. This plan is the perf
> headroom phase AFTER that migration; do not start it before.

## Status: ⚪ FUTURE — recorded 2026-11-20

## Cosa

Replace the JS `validateStrict` tokenizer (the only JS-side work left in
strictFastParse) with a Rust crate compiled to WASM. Same interface, same
flags contract — a drop-in swap, not a redesign.

## Perché (why it exists as a plan at all)

Measured architecture (JS variant, shipped as strictFast):

```
validateStrict(text, flags, unsafe)  ← 1.39ms @180KB — the ONLY JS cost
JSON.parse(text)                     ← 0.30ms — native, can't improve
bigintWalk(obj, flags, unsafe)       ← ~0.4ms — inherent walk cost
```

The validator scan is the bottleneck. A Rust tokenizer compiled to
wasm32-unknown-unknown does the same single-pass scan at native speed:
~0.1-0.3ms @180KB including the TextEncoder encode + wasm-call boundary.
Expected total: **~0.8-1.0ms vs 2.2ms strictFast-JS vs 2.65ms json-bigint
ext** — roughly 2.5x over the current codec while staying fully strict
(dup-key rejection, trailing-comma rejection, exact bigint on any digit
count).

## Come (interface contract — pinned, swap-safe)

The Rust validator MUST preserve this exact contract (the walk and every
consumer depend on it):

- Input: UTF-8 JSON text in wasm linear memory (caller TextEncoder-encodes
  into a caller-allocated buffer; wasm never allocates JS objects).
- Output:
  - `flags: Uint8Array` — one entry per number token in SOURCE ORDER:
    `1` = integer token (`^-?\d+$`) OR integer-valued float token
    (`Number.isSafeInteger(Number(lit))` — codec value-parity), `0` else.
  - `unsafe_digits: string[]` — digit strings of integer tokens whose
    parsed double is NOT a safe integer (checked the same way the walk
    does: `lit.length > 15 && !Number.isSafeInteger(Number(lit))`).
    **Hazard pinned in tests:** a 16-digit-but-safe int must NOT be
    pushed — the walk consumes `unsafe[ui]` only when
    `!Number.isSafeInteger(v)`; a blind push desyncs every later value.
  - throws/returns error-with-offset on: grammar violation, duplicate
    key (any depth), trailing comma, unterminated string, bad literal.
- Correctness contract beyond flags: DFS walk order ≡ token source order
  (reviver-free flag consumption depends on it — property order in the
  parsed object is insertion order ≡ source order on all engines).

## Cosa NOTA / alternative rifiutate

- `context.source`+reviver path (non-strict): rejected — silent last-wins
  on dup keys is fail-open (user ruling, non-negotiable).
- serde_json / simd-json inside wasm: they don't dup-key-check either —
  the Rust side is a hand-rolled tokenizer with per-scope key sets
  (~150-250 lines Rust, no deps).
- napi native addon: unnecessary — one wasm32 artifact serves browser,
  Bun, and Node identically; no dual build, no platform matrix.
- Full wasm parse (materialize in wasm): rejected — JS object
  materialization through the boundary is the documented loser.

## Acceptance

- Same test suite as `ext-json.test.ts` candidates: dup-key throw at all
  depths, trailing comma, string-embedded fake keys, unsafe-int exact,
  21+ digit ints exact, 16-digit-safe desync guard, `1e3`→`1000n`.
- `EXT_BENCH=1` matrix shows validate+parse+walk ≥2× faster than
  strictFast-JS at 180KB on Bun (BE target) — else don't ship the wasm,
  the JS variant already wins.

## Deliverables

- `core/` (or sibling crate repo): `ext-json-validate` Rust crate +
  wasm-pack build + CI artifact (`wasm32-unknown-unknown`, ~10-30KB).
- `ext-json.ts`: strictFast gains a wasm path — `loadValidator()` async
  init with the JS validator as fallback (envs without wasm or before
  init resolves → JS path, byte-identical semantics).
- Keep `bigintWalk` in JS — it IS the per-value application step; moving
  it into wasm reintroduces per-value boundary cost (measured loser).
