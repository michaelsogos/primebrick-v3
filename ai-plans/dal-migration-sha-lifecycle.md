# dal-pg migration engine — `content_sha256` lifecycle correctness (retry sha refresh, review-by-sha, sanctioned re-baseline)

> Spawned from `entity-form-archetype-pilot.md` — discovered while debugging why the
> job service booted degraded (`migration_failed`) and broke the `/system/job/rules`
> create CTA (meta 503 → `opAllowed('create.single')` false → no `entity-create-cta`).

## Status: 🟠 WIP — Plan date: 2026-10-27 22:50 UTC / 23:50 TZ

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | Engine fix applied (uncommitted): `upsertStatus` ON CONFLICT now sets `content_sha256 = EXCLUDED.content_sha256` | ✅ done | 2026-10-27 | `primebrick-dal-v3/src/migrations/engine.ts`; dist rebuilt; uncommitted pending user review |
| 2 | Registry remediation on `job.primebrick_database_patches`: `content_sha256` → sha of actually-applied file (`1080657a…`), `resolved_by='devin-remediation'` + `resolved_note` | ✅ done | 2026-10-27 | Direct UPDATE — no sanctioned tool exists for `applied` rows; task 6 may supersede |
| 3 | **DECISION**: is "failed → edit file → retry" legal? (a) keep permitted + engine fix (current), (b) forbid — failed patches are immutable too → require a new patch, engine fails fast with a clear error | ⏳ not done | — | Contract says "never edit a shipped patch" — a patch that only ever FAILED arguably isn't shipped. Engine currently permits implicitly (immutability check only guards `applied`/`resolved_manual`) |
| 4 | **DECISION**: `pending_review` flow — `approvePendingReview` approves by NAME not sha. A `requiresReview` patch approved then edited before the next run applies the NEW content (manifest-verified, but not what the reviewer saw). Record `approved_sha256` at approve time + engine refuses apply if file sha ≠ approved sha? | ⏳ not done | — | Gap exists with or without task-1 fix |
| 5 | **DECISION**: sanctioned re-baseline op — admin endpoint/CLI to re-record `content_sha256` for an `applied` row when the recorded sha is provably wrong (failed-attempt residue). `resolveManually` today covers only `failed`/`pending`/`pending_review` and doesn't touch sha | ⏳ not done | — | Would have prevented the manual UPDATE in task 2 |
| 6 | Engine tests (dal-pg): (a) failed → edited file → retry → applied → registry sha = applied file sha → next `runMigrations` passes immutability; (b) `applied` row + file edited → boot refuses (guard intact); (c) approved-review flow if task 4 accepted | ⏳ not done | — | |
| 7 | Audit ALL schema registries for sha-drift rows: `applied`/`resolved_manual` whose `content_sha256` ≠ manifest sha (the same silent state that degraded job) | ⏳ not done | — | Query below; schemas: public, job, crm, ai, emailsender, webhook |
| 8 | Doc update: `.devin/rules/db-patches.md` (+ dal dev-guide `migrations.mdx`) — explain failed-attempt semantics, retry contract, what "shipped" means, re-baseline op if task 5 accepted | ⏳ not done | — | Follows repo doc rules: propose text first, write after approval |
| 9 | Commit dal-pg fix + propagate rebuilt dist to consumers (job-handler, be-v3, other us services) | ⏳ not done | — | Only after user review of tasks 3–5 |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Incident — verified facts (the chain that broke `/system/job/rules` create)

1. Patch `job-handler/db-meta/patches/20261028140000_job_rule_semantic_labels.sql` failed its
   first apply (duplicate key on `job_translations_key_language_uidx`) → registry row inserted
   with `content_sha256 = sha(v1)`, `status='failed'`.
2. The file was edited (`ON CONFLICT … DO NOTHING` added — itself an immutability violation,
   see "Policy tension" below) → retry applied it → `ON CONFLICT DO UPDATE` set
   `status='applied'` but **kept `content_sha256 = sha(v1)`**.
3. Every subsequent `runMigrations` boot: immutability check
   `row.content_sha256 !== file.sha256 && !== file.sha256Raw` →
   *"immutable patch changed, refusing"* → **degraded boot** → `status='migration_failed'`
   → domain routes 503/502 (`/entities/job_rule/meta`, `/list`).
4. FE chain: meta 503 → `list.meta` null → `opAllowed('create.single')` false →
   `EntityListTable.effectiveOnCreateAction` undefined → `entity-create-cta` never rendered →
   E2E `context.waitForEvent('page')` 15 s timeout. Census resolution was always correct
   (probe: `moduleNav.routes` had all 5 routes, `censusCreateRoute` resolved).

### Root cause (engine bug, verified in source)

`upsertStatus` (`primebrick-dal-v3/src/migrations/engine.ts:365`) —
`INSERT … ON CONFLICT (patch_name) DO UPDATE` updated `status`, `attempts`, `error`,
`signed_key_id`, `applied_by`, `atomic`, `applied_at`, `updated_at` — **never `content_sha256`**.
The recorded sha stayed bound to the FIRST attempt, not the content that actually applied.

### Why the fix is safe (verified against engine.ts)

- `applied`/`resolved_manual` rows are skipped at the apply loop (`engine.ts:259-261`)
  **before** any `upsertStatus` — their sha can never be overwritten via the apply path.
- The immutability check (`engine.ts:222-234`) throws **before the loop** for those same
  statuses when file sha differs — the guard is preserved end-to-end.
- The upsert only runs for: no row (first attempt), `failed`, `pending`,
  `pending_review` (line 268), `approved`. For all of these, "sha of the file being
  attempted now" is always the correct recorded value.
- The manifest gate (`declared !== sha`, `engine.ts:205-207`) guarantees the applied
  content is always the signed content — independent of this fix.

### Diff applied (uncommitted — pending task 3/9)

```sql
-- engine.ts upsertStatus, ON CONFLICT clause
content_sha256 = EXCLUDED.content_sha256,  -- NEW: sha follows the file that actually ran
```

## Audit query — find sha-drift rows across schemas (task 7)

```sql
-- per schema (public, job, crm, ai, emailsender, webhook):
SELECT patch_name, status, content_sha256, applied_at, resolved_by, resolved_note
  FROM "<schema>".primebrick_database_patches
 WHERE status IN ('applied','resolved_manual');
-- compare each content_sha256 against MANIFEST.json patches.<patch_name>
-- (EOL-normalized sha — see engine.ts:198 sha256Hex(normalizePatchEol(raw)))
```

Drift rows = same latent degradation job had. Known state at plan creation:
`job` remediated (task 2); `public` last BE patch applied clean via script
(`20261028120000_seed_json_value_widget`); other schemas unverified.

## Policy tension to resolve (tasks 3–5)

- **Failed-patch editability**: the contract "never edit a shipped patch" vs the
  engine implicitly allowing failed→edit→retry. Decide what "shipped" means
  (registry status `applied`/`resolved_manual` = shipped; `failed` = not?).
- **Review integrity**: approval is name-bound not sha-bound today.
- **No sanctioned re-baseline** for `applied` rows with provably wrong sha — the only
  tool (`resolveManually`) neither covers `applied` nor updates sha. Without it, the
  only escape is a hand UPDATE (what was done) or a byte-exact file reconstruction.

## Files

- `primebrick-dal-v3/src/migrations/engine.ts` — `upsertStatus` (fix applied, uncommitted)
- `primebrick-dal-v3/src/migrations/status.ts` — `resolveManually` / `retryFailedPatches` /
  `approvePendingReview` (re-baseline would live here)
- `primebrick-be-v3/src/modules/system/db-migration.service.ts` + `controllers/http/system.router.ts` —
  admin surface (`/api/v1/system/db-migration/{status,retry,approve,resolve,drift-check}`)
- `primebrick-us-v3/job-handler/db-meta/patches/20261028140000_job_rule_semantic_labels.sql`
  (registry row remediated) + `db-meta/MANIFEST.json` (re-signed, dev-micha-2)
- Rules/docs: `primebrick-*/​.devin/rules/db-patches.md`, `primebrick-dal-v3/docs/dev-guide/migrations.mdx`

## Acceptance

- [ ] Decision recorded for tasks 3–5 and reflected in code + rules doc
- [ ] Engine test: failed→edited→retried→applied leaves `content_sha256` = applied file sha; next run clean
- [ ] Cross-schema audit returns zero drift rows (or each drift remediated via sanctioned path)
- [ ] No degraded-boot on any service after a failed→fixed patch cycle
- [ ] Docs updated (rules pointer + canonical doc) per chosen policy
