# Drift-closure batch — close all residual plan drift

2026-11-11. Goal: zero drift left behind across the 5 recent plans.
Commit after every turn of changes. No workarounds.

## Inventory (deduplicated)

| # | Item | Source plan | Decision |
|---|---|---|---|
| ~~D1~~ | check-standards permanence: P2 baseline + P3 CI, extended to ALL repos | lint-red-openapi-format / i18n | **DONE** — see below |
| ~~D2~~ | dict-page batch | i18n-key-snake-case | **DONE** — recon: TableFooter = documented composition (same sub-components, no dup logic); i18n `app.common.move_*` seeded; TranslationKeyCell/save gate/read-only code badge/bulkRevert already landed. Real gap = aria labels on icon controls → fe `056f2fe` |
| ~~D3~~ | registry migration_failed→online stale state | i18n + metadata-driven-page-system | **DONE** sdk `5b4b2da` — A+B+C landed (see below) |
| ~~D4~~ | W6 docs batch | i18n | **DONE** — sdk migrations.mdx live-recovery section, env-policy NODE_ENV note, new check-standards-gate.md canon + rule pointer; us degraded-migration-recovery.md operator doc |
| ~~D5~~ | bind address | i18n | **DONE** sdk `6719174` — `resolveHttpBindHost()` param-free (0.0.0.0 prod / 127.0.0.1 dev); `hostname` option + unseeded `http_bind_host` row removed — no opt-in exists |
| — | translate-all preview | i18n | abandoned — superseded by V3 sheet anatomy |
| — | login auto-refresh hang | session | user: skip |
| — | ELT phases 3-5 | elt-ref-cell-sheet-plan | AFTER drift closure (user chose "a") |

## D3 — "reboot without shutdown" (self-healing migration recovery)

### Empirical findings (verified 2026-11-11, sdk source)

- Admin remediation surface ALREADY EXISTS: `makeDbMigrationRouteHandler` →
  `GET /api/v1/system/db-migration/status`, `POST .../retry`, `.../approve`,
  `.../resolve`, `.../drift-check` (migration-routes.ts). Mounted always when
  `dbPatches` configured; in degraded it is the ONLY reachable surface.
- `rerun()` (migration-routes.ts:35-50) mutates shared `MigrationBootState`
  live → heartbeat healthCheckFn reads `migrationState.degraded` live
  (create-microservice.ts:684-690) → 30s heartbeat → BE derives `online`.
  Registry side self-heals without restart already.
- **Bug A**: the 503 domain gate (create-microservice.ts:795-811) wraps
  routeHandler ONCE at boot with `if (migrationState.degraded)` — the flag is
  never re-read per request. A successful retry flips state but traffic stays
  walled forever. The "without restart" documented at :684 does not deliver.
- **Bug B**: `onReady` is skipped on degraded boot (:869) and never re-run —
  after unlatch the service would serve traffic with zero subscribers/init.
- Turn-log claim "re-register requires respawn — no admin transition route"
  (i18n-key-snake-case-cleanup.md) was WRONG: the route exists; the missing
  pieces were our awareness + bugs A/B.

### Implementation (user-approved scope A+B+C)

- **A**: 503 gate reads `migrationState.degraded` per-request (wrap whenever
  `dbPatches` configured, cheap boolean check) — any unlatch path reopens
  traffic immediately.
- **B**: deferred onReady — when recovery flips degraded→false, run the
  skipped `onReady(ctx)` exactly once (guarded). Shared by admin routes and
  auto-recovery via `onRecovered` callback.
- **C**: auto-recovery on heartbeat cadence (30s, user chose): when degraded
  → `retryFailedPatches` + `runMigrations` (same trust gating — pending_review
  stays human), in-flight guard against overlapping ticks; on success →
  unlatch + deferred onReady. Reuses existing mechanisms only; no new routes.

### Files — LANDED sdk `5b4b2da` (2026-11-11)

- `src/microservice/db-migration-step.ts` — `rerunMigrations` shared core
  + `makeRunOnceInit` memoized deferred init
- `src/http/migration-routes.ts` — routes funnel through rerunMigrations;
  `onRecovered` hook on degraded→clean flip
- `src/microservice/create-microservice.ts` — live-read 503 gate;
  `attemptMigrationRecovery` on every heartbeat while degraded;
  deferred init = onReady + callable census re-register
- Tests: 9 new, 516/516 + check-standards clean
- **Residual**: dev-guide docs for remediation surface + auto-recovery
  (propose text per doc rules — folded into D4 W6 docs batch);
  live degraded-boot rehearsal not staged (would need an injected failing
  patch — mechanics covered by unit tests)

## D1 — lint permanence — LANDED 2026-11-11

- **Tool zero-dep** (sdk `5f7549c`): `HONEST_FORMAT_HINTS` extracted to
  `core/src/honest-format-hints.ts` (core `59e1e6c`, re-exported from
  field-validation); check-standards imports it by sibling-relative path —
  runs on bare checkouts, no install.
- **Baseline mode**: `.devin/check-standards-baseline.json` — identity
  file+rule+line-text (line numbers excluded), count-aware; declared
  suppressed, new fails, stale warns. `--write-baseline` regenerates.
- **Vendored drift killed**: stale 404-line copies in dal + core deleted
  (dal `30dd3c2`, core commit same) — scripts repointed to canonical.
- **Extended coverage us**: dal-access + layer-repo-import activated on
  all 5 services → 48 pre-existing violations declared in baselines
  (us `878b378`: crm 1, ai 11+4 layer-repo, job 29, emailsender 7).
- **fe**: 31 sheet-panel violations declared (`1db3aaa`).
- **decimal**: wired script+exempts (`47df878`) — leaf package, extJson*
  structurally unavailable → 3 standards-exempt comments.
- **P3 CI**: `check-standards.yml` on all 8 repos — push/PR to
  develop+main; zero-install layout (self + sdk@develop + core@develop
  siblings + setup-bun); us = matrix ×5 services; core self-checkout
  doubles as hints source.
- **Caveat**: workflows go green once `feature/elt-keyboard-legend`
  merges to develop (the baseline-capable tool lives there until then).
- **Pre-existing finding (out of scope)**: dal/core/sdk/ui release
  `ci.yml` publish lanes die at `pnpm install` — `workspace:*` deps
  unresolvable on standalone checkout (empirically verified). Publish-
  version pinning strategy is a separate decision.

## Order

1. D3 registry self-heal (active thread — decided + scoped)
2. D1 P2+P3 lint permanence all repos
3. D2 dict-page batch
4. D5 IPv4 bind (decided contract)
5. D4 W6 docs (propose → approve → write)
6. Close plans → move to completed/ as each reaches zero drift
7. ELT phases 3-5 (after drift zero)

## Acceptance

- Degraded service self-heals within one heartbeat after the DB is fixed
  (CLI-applied patch or signed manifest): registry → online AND domain
  traffic served AND onReady init ran — without process restart.
- No auto-approval of pending_review patches (human gate preserved).
- check-standards: new violations fail, declared baseline doesn't; gate
  present on every repo CI.
- All dict-page batch items implemented or verified already-done.
- `server.listen` binds 127.0.0.1 in dev / 0.0.0.0 in prod — deterministic.
- W6 docs landed after user text approval.
