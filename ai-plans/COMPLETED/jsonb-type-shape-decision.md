# jsonb family — declared-shape entity props (`prop: SomeShape` + `pgType:"jsonb"`)

> Continuation of the entity-type-drift programme (bigint → UUID → boolean → number done).
> This is the last drift family: `Record`/`unknown`/`object` annotations (~14 props) +
> the `string[]` outlier. User direction: entity props should carry the *defined shape
> type* (dedicated interface/class/graph) not anonymous `Record`/`unknown`/`object`;
> write→jsonb automatic; read hydrates to the defined shape, not a stringified blob.

## Status: ✅ DONE — Plan date: 2026-11-10 19:55 UTC

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Hydration contract: **class-instance revival** — jsonb props become dedicated classes; hydration produces real instances | ✅ done | 2026-11-10 | user decided |
| 2 | Reviver channel: **A decided** — `jsType` accepts class ctor; ctor→jsonb pin makes `pgType` redundant; `jsType` = "the runtime JS type" (builtin codec names are class-revive aliases already) | ✅ done | 2026-11-10 | user approved |
| 3 | Per-prop semantic type map — approve table below | ✅ done | 2026-11-10 | evidence-verified, Part C final |
| 4 | DAL: `jsType` accepts class ctor + revive in `pgValueToJsValue` (`fromJson`, prototype graft, array element-wise) + ctor→jsonb pin | ✅ done | 2026-11-10 | dal `8f97e90` |
| 5 | DAL: ctor pin reaches static cascade — `resolvePgTypeForSchema` shares jsType pin; snapshot/check forward jsType into hints | ✅ done | 2026-11-10 | dal `ce283c2` |
| 6 | Define/promote classes → `src/domain/jsonb-contracts.ts` per service (ai×6, emailsender×2, job-handler×1) | ✅ done | 2026-11-10 | us-v3 commit |
| 7 | Retype 14 props + consumers (docs-loader DocMetadata, embedding-pipeline PipelineStats, triggers-engine RuleFilter, docs-search-dal casts) | ✅ done | 2026-11-10 | us-v3 commit |
| 8 | `ServiceRegistryEntity.schemas` → `pgType:"text[]"` (shipped DDL is text[], not jsonb — sibling `capabilities` stays jsonb) | ✅ done | 2026-11-10 | be-v3 `d97a382` |
| 9 | Lint: jsType ctor recognized + named-annotation declaration rule (string-union aliases exempt) | ✅ done | 2026-11-10 | sdk `e8cc6e8` |
| 10 | Audit: jsonb drift = 0 all repos; lint clean; DAL 584/584; commits per repo | ✅ done | 2026-11-10 | |

---

## Part A — What exists today (verified, not assumed)

### The props (14 + 1 outlier)

| Prop | Annotation oggi | DDL reale | Shape semantics found in code |
|---|---|---|---|
| AiCerebellum.`execution_config` | `Record<string,any>` | jsonb | provider-specific blob — `z.record(z.string(),z.any())` in DTO |
| AiCerebellum.`test_scores` | `Record<string,any>` | jsonb | per-test score map — z.record |
| AiModel.`execution_config` | `Record<string,any>` | jsonb | same |
| AiModel.`test_scores` | `Record<string,any>` | jsonb | same |
| AiModel.`working_set_detail` | `Record<string,any>` | jsonb | breakdown map — z.record |
| AiMessage.`content` | `unknown` | jsonb | provider pass-through; repo type also `unknown` |
| DocsIngestLog.`stats` | `Record<string,unknown>` | jsonb | ingest counters |
| DocsKb.`metadata` | `object` | jsonb | **defined**: `DocMetadata` shape in `docs-loader.ts` (source/repo/path/title/content_type/endpoint?) |
| EmailTemplate.`variables` | `Record<string,unknown>` | jsonb | `{name: descriptor}` — descriptor shape (see entity doc comment) |
| SenderLog.`senders` | `object` | jsonb | **defined write**: `{ from: config.from_email }` (email-service.ts:116) |
| SenderLog.`recipients` | `object` | jsonb | **defined write**: `{ to, cc?, bcc? }` (email-service.ts:117) |
| JobRun.`report` | `unknown` | jsonb | run report — shape TBD |
| JobTrigger.`filter` | `unknown` | jsonb | **defined**: `RuleFilter = { field, op?, value? }` in `triggers-engine.ts:57` — local ad-hoc, NOT a shared contract |
| JobTrigger.`payload_map` | `unknown` | jsonb | `{src_key: target_key}` map |
| ServiceRegistry.`schemas` | `string[]` | jsonb (declared `pgType:"jsonb"` + `defaultSql:"'[]'"`) | already declared — verify drift actually cleared |

### Pipeline facts

- **Static**: `pgTypeFromAnnotation` maps `isObjectLike` (interfaces, Records, object literals, `unknown`/`any`) → `jsonb` automatically (`entity-ts-to-pg.ts:186`). **Arrays of objects** (`RuleFilter[]`, `EmailAddress[]`) are unmappable (element map only covers scalars) → explicit `pgType` required — which we declare anyway.
- **Compat**: `assertPgTypeCompatible` escapes unmappable annotations (line 309) → `DedicatedType` + `pgType:"jsonb"` passes clean.
- **Write**: `jsValueToPgParam` `stor==="jsonb"` branch → `JSON.stringify` with bigint→number coercion (`column-pg-io.ts:111`). Already automatic once `pgType:"jsonb"` is declared; drift-state objects bypass the branch and rely on node-pg's own stringify (works but loses the bigint coercion).
- **Read**: node-pg parses jsonb → plain JS object. `pgValueToJsValue` passes it through — no codec needed. The wire already carries a real object, not a stringified blob.
- **Meta**: `columnTypeForPg("jsonb") → "text"` — served `type` stays text widget; only `pg_type` becomes truthful (+ ILIKE cast, filter semantics, catalog/KB).
- **Lint**: `entity-type-declared` flags `Record`/`unknown`/`object` props lacking declaration. Dedicated type names (`ExecutionConfig`) — annotation regex is generic; need to verify the "non-string requires declaration" check covers arbitrary identifiers (task 6).

## Part B — Design decision needed (the user's hydration ask)

**User**: *"prop sia di type xyz … la read non dia una versione stringify del json ma hydrate all'oggetto definito"*.

Two readings:

### DECIDED — class-instance revival (Option 2)

Prop typed as a **dedicated class**; hydration produces a real instance (`instanceof` works, methods available). The class ctor is passed in the decorator — unlike the annotation, a ctor reference IS runtime-visible, so the reviver needs no registry.

**Reviver channel — two candidate designs (approval needed):**

**A — `jsType` accepts a class ctor (recommended).** Semantically literal: `jsType` is "the runtime JS type of this prop" — for a class prop the runtime type IS the constructor. Cascade: `jsType: SomeClass` → pg pin `jsonb` (class instances are jsonb storage by definition). `pgType:"jsonb"` stays explicit-legal and lint-required for discoverability. Lint match rule extends naturally: `Foo` annotation → `jsType` must be `Foo` (nothing else).

**B — separate `@Column({ shape: X })` option.** Cleaner separation (jsType = built-in codec names; shape = user class) but a third vocabulary word for the same concept.

**Revive mechanics** (either channel):
- In `pgValueToJsValue`: if `jsType`/shape is a ctor → revive. Rule: `cls.fromJson(v)` if the class exposes it (class controls own revival incl. validation/nesting), else `Object.assign(Object.create(cls.prototype), v)`.
- Array props (`RuleFilter[]`): element-wise revive.
- Write: `JSON.stringify` on the instance serializes enumerable props → jsonb — automatic, no write-side change.
- Precedent exists: `Vector.from(value)` / `dec(value)` are exactly this pattern under string codec names.

### Formerly considered — structural shape only

Plain parsed object + TS interface type. Rejected by user: the defined object must be a real instance, not just structurally compatible.

## Part C — Final per-prop map (evidence-verified 2026-11-10)

Writers/readers inspected per prop — the class vocabulary comes from real
write sites and doc comments, nothing invented.

| Prop | Final type | Channel | Evidence |
|---|---|---|---|
| `JobTrigger.filter` | `RuleFilter[]` — class promoted to `domain/jsonb-contracts.ts` | `jsType: RuleFilter` (element-wise) | `triggers-engine.ts:57` local type `{field, op?, value?}` |
| `JobTrigger.payload_map` | `PayloadMap` (type from `@primebrick/core`) | `pgType:"jsonb"` — Record type, not a class | `PayloadMap = Record<string, PayloadMapEntry>` in core |
| `SenderLog.senders` | `SenderEnvelope` | `jsType: SenderEnvelope` | write `{from: config.from_email}` / `{}` on failure |
| `SenderLog.recipients` | `RecipientEnvelope` | `jsType: RecipientEnvelope` | write `{to, cc, bcc}` — `to`/`cc`/`bcc` are `string[]` (DTO `z.array(z.string().email())`) |
| `DocsKb.metadata` | `DocMetadata` — promoted from `LoadedDoc["metadata"]` | `jsType: DocMetadata` | docs-loader inline shape (source/repo/path/title/content_type/…) |
| `DocsIngestLog.stats` | `PipelineStats` — moved to domain as class | `jsType: PipelineStats` | `embedding-pipeline.ts:26` interface (docs_loaded, chunks_*, …) |
| `EmailTemplate.variables` | `Record<string, unknown>` — honest free-form | `pgType:"jsonb"` | FE editor = raw JSON textarea; no descriptor shape pinned anywhere |
| `JobRun.report` | `unknown` — honest free-form | `pgType:"jsonb"` | `JobResultMessage.report?: unknown` — handler-defined passthrough |
| `AiMessage.content` | `MessageContent` | `jsType: MessageContent` | 3 writers: `{text}` user, `{tool_call_id,tool_name,output}` tool, `{text,tool_calls,tool_results}` assistant |
| `AiModel.execution_config` | `ExecutionConfig` | `jsType: ExecutionConfig` | FE proven: `kv_cache_reuse`, `sliding_window`, `max_history_turns`, `intent_detection`, `ort_session_options` |
| `AiCerebellum.execution_config` | `ExecutionConfig` (all-optional = partial override) | `jsType: ExecutionConfig` | same shape, partial semantics |
| `AiModel.test_scores` | `Record<string, AiTestScore>` | `pgType:"jsonb"` — map container | writer `test-scores.ts`: `{protocol, tested_at, load_ok, generation_ok, turns: E2ETurn[], history, phases, success_count, total_turns}` |
| `AiCerebellum.test_scores` | `Record<string, AiTestScore>` | `pgType:"jsonb"` | same shape |
| `AiModel.working_set_detail` | `WorkingSetDetail` | `jsType: WorkingSetDetail` | `e2e_measured` writes `{measured_vram_bytes, measured_at, measured_ctx_tokens}`; doc adds `weights_mb/kv_mb/ctx_ref` for hf_estimate |
| `ServiceRegistry.schemas` | `string[]` + existing `pgType:"jsonb"` | already declared | verify drift cleared |

New files: `src/domain/jsonb-contracts.ts` per service (ai, emailsender,
job-handler). `PipelineStats` moves from `embedding-pipeline.ts` to the
domain file (import sites updated); `DocMetadata` promoted from
`LoadedDoc["metadata"]`; `RuleFilter` promoted from `triggers-engine.ts`.

## Acceptance criteria

- Audit: jsonb-family drift → 0; lint violations drop correspondingly
- No invented channels: `pgType:"jsonb"` only; `jsType` untouched (it's the codec channel, not a shape channel)
- Dedicated types live in the repo's contract location (not ad-hoc next to the service that happens to write them — `RuleFilter` promotion is the precedent case)
- `primebrick-db check` clean on touched schemas; no DDL changes expected (all already jsonb physically)
- Tests + commit per repo
