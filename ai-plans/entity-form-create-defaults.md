# Plan — entity-form create defaults (DECORATOR → META → FE)

Status: ✅ DONE — all tasks complete, verified, pushed (2026-12-19).
Branch: `feature/ext-json-strict-codec` (all repos).

## Decisions locked (user)

1. **Chain**: `@Column({defaultSql})` → DDL `DEFAULT` + `MetaColumn.default`
   derived (constant literals only, typed via `pg_type`) → FE `buildInitial`.
   Decorator is the single physical source.
2. **Validator = perimeter enforcer**: provided values validated strictly
   (`step:0n`/NaN → error); **omitted → out of payload → DB default applies**
   (`add()` already drops `undefined` props — repo.ts:1532).
3. **Meta override is the legal and only override**: `*.meta.ts` authored
   `default` WINS over the decorator-derived one. Covers defaults not
   expressible as SQL literals (directives, dynamic sources).
4. **Placement `default_value`** = per-surface override, highest precedence.
   Precedence: `placement.default_value` > `*.meta.ts default` > derived.
5. **`readonly` placement key**: REMOVED (done — core/sdk/fe/us commits).
6. `default_value` values travel as **ext-json typed** values (bigint is
   `5n` in-process, survives the census codec). Dynamic-source precedent:
   `{seq:{uuid}}` directive resolved in the write path.
7. Placement on a non-widget column (`kind`/`managed`/`audited`/`uid`) →
   **fail loud** at form build (never silent dead authoring).

## Verified facts (TIC)

- `defaultSql` exists on `ColumnOptions`, emits `DEFAULT` in DDL
  (`emit-sql-patch.ts:37`), whitelisted constants recognized by
  `constantDefaultSql` (repo.ts:2027: `'str'|num|bool|null` regex).
- `withColumnConstraints` does NOT surface `defaultSql` today; `MetaColumn`
  has no `default` prop.
- `placement.default_value` exists, consumed by `buildInitial`
  (EntityFormSurface:211).
- `SequenceEntity.step`/`start`: `bigint NOT NULL`, validator `need()`
  required, `step!==0n`. `@SequenceField` decl already requires explicit
  `step`/`start` for bound rows (provisioning stays explicit — unchanged).
- Only `primebrick-us-v3/crm` owns `sequences` DDL (snapshot-entities.json).
- `BUILTIN_ENTITIES` merges `SequenceEntity` into every module scan —
  patch emitted via `primebrick-db` compare for crm.
- Expr defaults (`uuidv7()`, `now()`) are served as nothing — not
  prefillable literals; fields carrying them are `managed` anyway.

## Tasks

| # | Task | Repo | Status |
|---|------|------|--------|
| D1 | `MetaColumn.default?: unknown` + TSDoc (derived-vs-authored contract) | core | ✅ `431380d` |
| D2 | `withColumnConstraints`: derive `default` from constant `defaultSql` typed via `inferredPgType`; authored `default` wins | dal | ✅ `b9116b1` |
| D3 | `SequenceEntity.step`/`start` → `defaultSql:"1"` | dal | ✅ `b9116b1` |
| D4 | sequence-decl validators: `need("step"/"start")` → `opt()` (omission → DB default; `0n` still rejected when present) | dal | ✅ `b9116b1` |
| D5 | `buildInitial`: `placement.default_value ?? column.default ?? fallback` | fe | ✅ `e998af5` |
| D6 | DB patch `ALTER sequences step/start SET DEFAULT 1` for crm — plus direction-A scope: schema-diff default drift detection (`pg_attrdef`+`attgenerated` snapshot, `capturesDefaults` marker, `normalizeDefaultExpr` quote-aware, `defaultMismatches` in diff/drift/CLI, SET/DROP DEFAULT review SQL); patch `20261122201506` signed + applied (also sets `created_by`/`updated_by`→'system' where DB lacked) | us/dal | ✅ `b9116b1` `cd5244f` |
| D7 | Tests: withColumnConstraints (constant→typed, expr→absent, authored wins) 126; schema-default-diff 13; sequence-write-validator 6; full DAL 834/834; FE e2e 16/16 incl. update-shows-record fixture `step:"2"` | all | ✅ |
| D8 | Docs: `MetaColumn.default` row + chain (FE dev-guide mdx + ai schema, BE dev-guide + ai rules, DAL entities/migrations mdx); core + dal api.json regen | all | ✅ |

## Out of scope (recorded)

- TS-expr column defaults (`func js` hash-style): no use case today —
  write-path provisioning (`sequenceBoundUuid`, directives) covers it.
- `.meta.ts` authored `default` on `sequence.step` — legal but pointless
  (seq's own increment is physical); allowed by contract anyway.
- Dict-page convergence on `EntityFormSurface` — separate track.
