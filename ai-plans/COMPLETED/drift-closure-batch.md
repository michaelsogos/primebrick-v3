# Drift-closure batch — close all residual plan drift

**STATUS: DONE — archived 2026-11-18.** Every inventory item landed in
reality or was dead-by-decision; the last open item (D3 live
degraded-boot rehearsal) was staged and passed on both paths
(pending_review admin-approve + failed-patch heartbeat auto-recovery)
on 2026-11-18 — see D3 section.

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
| ~~—~~ | ELT phases 3-5 | elt-ref-cell-sheet-plan | **DONE** — verified 2026-11-13 in the plan itself (EntityRecordSheet + CellAffordance + EntityFormSurface landed, E2E green). Stale inventory line corrected 2026-11-16. |

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
- **REHEARSED LIVE 2026-11-18** — both paths verified on job-handler :3006:
  - Path A (`pending_review`): signed patch `-- pb:requires-review` →
    boot DEGRADED, domain 502/503 via gateway, `status` showed
    `pendingReview:[...]` → ephemeral E2E admin minted via
    `test-users.createE2eAdminActor` → `POST /svc/job/.../approve` →
    applied → `degraded:false` → **deferred onReady ran** (triggers
    bound, schedules armed, reconcile) → domain traffic reopened.
  - Path B (failed patch): signed broken SQL → boot DEGRADED
    (`failed: relation does not exist`), auto-remediation reset
    failed→pending → file fixed + re-signed → **one heartbeat (~30s)
    later**: `applied` + `auto-remediation cleared degraded state —
    completing boot init` — zero manual calls.
  - Cleanup: both patch files removed, registry rows deleted,
    MANIFEST restored to original signature, ephemeral actor
    destroyed. No artifacts left.

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
- **Pre-existing finding — RESOLVED 2026-11-16**: release `ci.yml` publish
  lanes died at `pnpm install` (`workspace:*` unresolvable on standalone
  checkout) — had failed silently for ~10 releases/package since 2026-10-16.
  Root cause chain and fixes, all landed:
  1. **Workspace reconstruction** — each publish lane checks out required
     sibling repos at `main` + a synthetic root `package.json` +
     `pnpm-workspace.yaml` (same pattern as `check-standards.yml`), then
     installs from the workspace root. `workspace:*` stays the canonical
     manifest convention (link: overrides were removed in `ad65720` on
     purpose — they break `pnpm deploy` injection).
  2. **`pnpm pack` before publish** — rewrites `workspace:*` to concrete
     versions inside the tarball; `npm publish ./*.tgz --provenance` does
     the OIDC exchange + Sigstore attestation (pnpm 9.15.9 cannot).
  3. **Deterministic extract-docs** — TypeDoc output normalized for
     cross-platform determinism: `\r\n?`→`\n` inside string values and
     `fileName` paths stripped to `node_modules/…` suffix (both leaked
     the local dev layout into committed docs → freshness gate
     unpassable). Propagated to core/dal/sdk/decimal/ui extractors.
  4. **Docs-gate diagnostics** — the freshness check now prints the real
     `git diff -- docs/` on failure instead of just the porcelain marker.
  5. **npm Trusted Publisher** — `@primebrick/core`'s config was expired;
     recreated on npmjs.com (`michaelsogos/primebrick-v3-core` + `ci.yml`).
  6. **ui type-check** — release lane uses `pnpm check` (svelte-check);
     plain `tsc --noEmit` cannot resolve `*.svelte` modules.
  Published: decimal `3.1.3`, core `3.4.6`, dal-pg `3.6.2` (manifest pins
  `@primebrick/core@3.4.6` — workspace dep correctly resolved), sdk
  `3.5.1`, ui `3.4.4`. Burnt tags left on origin as honest history:
  core `3.4.1`–`3.4.5`, dal `3.6.1`, ui `3.4.2`/`3.4.3`.
  Debt swept along the way: `pluralize`/`@types/pluralize` `^` ranges
  pinned to exact versions in sdk (next publish carries the fix).

## Order

1. D3 registry self-heal (active thread — decided + scoped)
2. D1 P2+P3 lint permanence all repos
3. D2 dict-page batch
4. D5 IPv4 bind (decided contract)
5. D4 W6 docs (propose → approve → write)
6. Close plans → move to completed/ as each reaches zero drift
7. ~~ELT phases 3-5~~ — already landed (see inventory)

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
