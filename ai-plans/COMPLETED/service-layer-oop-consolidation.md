# Service Layer OOP Consolidation — DomainService base class, getDal boundary, residual cleanup

> Root cause analysis of remaining boundary leaks (dispatch→DAL, `*Dal`/`*Repo`
> files, lazy `initDal`). Target: `CONTROLLER → WORKER SERVICE → DAL lib → DB`
> with the DAL reachable ONLY through a class base (`this.dal`) or the
> bootstrap — every exit from the rails compile-blocked by check-standards.
> All findings verified empirically 2026-10-15/16 — file:line evidence inline.

## Status: 🟢 DONE — Plan date: 2026-10-16 (all 10 tasks landed; BE suite 305/305 green)

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | dal-pg: `DomainService<TEntity>` abstract base class — ctor pulls `getDal()` singleton + composes `dal.entityService(cfg)`; implements `EntityService<TEntity>` by delegation (12 methods) so subclasses satisfy the router contract and override freely | ✅ done | 2026-10-16 | `src/entity/domain-service.ts`; DESIGN CHANGE: ctor is I/O-free — `dal`/`svc` resolve lazily via protected getters + `buildConfig()` subclass seam (mfa-service test caught that eager getDal() broke best-effort insertEvent); `makeEntityService` factory UNCHANGED (entity-router internal path) |
| 2 | BE `dal-gateway.ts`: split `initDal()` → `initDal(): void` (bootstrap-only, called once in `index.ts`) + `export { getDal } from "@primebrick/dal-pg"` accessor — mirrors US `db/dal.ts` convention exactly; laziness REMOVED (getDal throws if boot hasn't run — fail-fast) | ✅ done | 2026-10-16 | ~40 call sites `initDal()` → `getDal()` (incl. test mocks); `initDal()` only in index.ts:313 bootstrap; US already correct |
| 3 | BE `BeDomainService` base — extends DomainService, injects `auditPort`/`actor:requireActor`/`userEntity:UserProfileEntity`/`debugCode` dev toggles (ports what `http/entity-service.ts:makeEntityService` does today) | ✅ done | 2026-10-16 | file is `src/db/be-domain-service.ts` (not src/http — data-access layer, not transport); injection via `buildConfig()` override (lazy, `this.dal` valid inside); debugCode handled by `list()` override |
| 3a | **RENAME `BeAuditPortAdapter` → `EntityAuditPort`** (file `db/audit-port-adapter.ts`→`db/entity-audit-port.ts`, class + 4 call sites: entity-service.ts:81, config_entries_dal:15/25/149/248, role-mapping-repo:14/90). Rationale (user): generic+meaningful name; resurrects the deleted `entityAuditPort()` naming lineage. NOTE: stays in BE (publishes Redis/NATS markers — dal-pg is leaf-dep, no sdk import) | ✅ done | 2026-10-16 | git mv + sed sweep: src/ (5 files), docs/dev-guide (2), .devin/rules/dal-usage.md — zero residual refs |
| 4 | PILOT — `AuthEventsService extends BeDomainService<AuthEventDto>`: absorbs `auth-event-logger.ts` (`insertAuthEvent` → `insertEvent` method, best-effort contract preserved) + `dispatchBeAggregate` auth_event branch → `service.aggregateEvents(params)`; dispatch.ts:115 `new UserProfilesDal()` → `new UserService()` | ✅ done | 2026-10-16 | `services/auth-events.service.ts` + `getAuthEventsService()` lazy singleton; dispatch.ts is transport-pure (DAL imports+local quoteIdent dropped — dal-pg quoteIdent used); BONUS FIX: `dispatchBeList`/`dispatchBeAggregate` got `auth_event` case (registry declared list+aggregate but dispatch threw EntityNotFoundError — pre-existing gap); `new UserProfilesDal()`→UserService deferred to task 5 (ctor arg still needed); `dispatchBeMeta` auth_event still missing (needs authEventMeta file + translation rows — reported, out of pilot scope) |
| 4b | **De-`Be` rename sweep — every `Be*` symbol gets a MEANINGFUL name** (user directive: no bare prefix drop, each rename must say what the thing IS). DECIDED NAMES: `BeDomainService`→`DomainService` + `BeDomainServiceConfig`→`DomainServiceConfig` + file `db/be-domain-service.ts`→`db/domain-service.ts` (dal-pg same-name resolved inside the file via `import { DomainService as DalDomainService }` — private alias, consumers only see `DomainService`); `BeAuthConfigPort`/`BeUserResolverPort`/`BeRoleMappingPort`/`BeApiKeyPort`→`DomainAuthConfigPort`/`DomainUserResolverPort`/`DomainRoleMappingPort`/`DomainApiKeyPort` (meaning: domain-owned impl of the SDK port — contrasts with `CachingApiKeyPort` wrapper); `BeMigrationState`/`getBeMigrationState`/`runBeMigrations` + `run-be-migrations.ts`→`ModuleMigrationState`/`getModuleMigrationState`/`runModuleMigrations`/`run-module-migrations.ts` (meaning: THIS module's own-schema migration run — same concept US services will have); `BeEntityConfig`+`registerBeEntity`→`LocalEntityConfig`+`registerLocalEntity` + `dispatchBe*`×10 fns (~76 refs)→`dispatchLocal*` (meaning: locally-handled entities — pairs with `dispatchProxy*`) | ✅ done | 2026-10-16 | user directive + sign-off 2026-10-16; sweep executed: 4 renames families across 10 files, tsc+standards clean, tests green |
| 5 | Merge 9 `*Dal`/`*Repo`/helper files into owning services (each extends DomainService) | ✅ done | 2026-10-16 | ALL 9 ABSORBED + DELETED: config_entries_dal+config-repo→ConfigEntriesService (createEntry/updateEntry/bulkSoftDelete/restoreEntry/loadAuthConfigOnly renames — signature collisions w/ EntityService); user-profiles-dal+user-profile-repo→UserService (resolveInternalUuid+Redis cache preserved, JIT sync); role-mapping-repo→RoleService (Casdoor-sync semantics intact, getRoleService() singleton); user_mfa_factors_dal+mfa_action_authorizations_dal→MfaService (12 methods); user-passkeys-dal→WebauthnService (11 Passkey* methods); user-invitations-dal→InvitationService (insertInvitation+9 privates — createInvitation public already existed); test seam = `(svc as any)._dal = mockRepo` (node_modules internals unmockable — lazy getter caches); tests ported: webauthn-passkeys 16/16, invitation-invitations 14/14; boundary-integration + role-mappings-router mocks rewired to getRoleService(); getDal() residuals in oauth-client/service-registry/translations/telemetry/http helpers = task-6 allowlist candidates (out of 9-file scope) |
| 6 | check-standards new rules: `dal-access` + `layer-repo-import` | ✅ done | 2026-10-16 | CONFIG-GATED design (US runs same tool unmigrated — rules activate only via `.devin/check-standards.json` in repo cwd, absent = off, backward-compat); tool gains Rule.allowPaths + Rule.appliesTo + config loader; BE config: dal-access allowlist 11 files (5 PERMANENT: dal-gateway/entity-service/entity-write/index/sdk-auth-ports + 6 LEGACY debt: collaboration/oauth-client/client-registry/service-registry/translations/telemetry — shrink to zero); layer-repo-import appliesTo controllers/+modules/mcp/ covers static import+dynamic import()+require() incl -repository; verified negative: 4 violations fire in scratch dir, allowlist exempts; US ai check unchanged clean; dal-usage.md rewritten to DomainService model + gated rules documented |
| 7 | Ext-json sweep | ✅ done | 2026-10-16 | EMPIRICAL re-census (plan line-numbers stale post-merge): CONVERTED 7 sites BE+US — oauth-authorize/dcr/token sendJson (extJsonStringify=byte-identical+bare-number bigint), user.service roles column, webauthn debug ×2 (also fixes latent throw: p.id IS bigint → JSON.stringify would crash), emailsender config-route+providers-route (RFC7807 ours); KEEP-EXEMPT 17 sites reason-rewritten uniformly: parse sites `external wire payload (<ctx>) — must not bigint-ify` (JWT×4/JWS/Casdoor-err×2/fetch-shim/Brevo-err/webhook/mistral.rs/OpenAPI-spec), external-stringify `— strict plain JSON, bigint must throw loudly` (Casdoor×3/Brevo/embeddings); VERIFIED extJson impl: plain-identical bytes, 42n→42 bare, parse bigint-ifies all ints; BONUS FIX: found 4 US db/dal.ts SHADOW BUG (getDal():void shadowed import + dup re-export — bulk-rename regression, initDal() name restored, all 4 US tsc clean); tsc clean BE+4US, standards clean ×5, tests 143/144 (env-only fail) |
| 8 | `client_registry` → `client_shield_registry` rename | ✅ done | 2026-10-16 | DDL patch `20261016010000_rename_client_shield_registry.sql` (ALTER TABLE + index + CHECK constraint renames, no audit table exists) + MANIFEST re-signed dev-micha (22 patches); BE: entity+service files renamed (git mv), all call sites (internal-request-routes/publisher-identity/lifecycle-subscriber/openapi-discovery/backend-identity/index) swept incl upsertClientShieldRegistry method; SDK: client-registry.ts→client-shield-registry.ts, ClientShieldRegistry/CLIENT_SHIELD_REGISTRY_SUBJECTS/ClientShieldRegistryRow, subjects system.clientShieldRegistry.get + system.client_shield_registry.changed (wire change — BE+SDK ship together, US recompiles on SDK bump), option field clientRegistry→clientShieldRegistry in createHttpServer/createMicroservice; BONUS FIX ×2: same bulk-rename regression — SDK create-microservice options.getDal()→options.initDal() restored (MicroserviceOptions has initDal); US emailsender comment updated; docs/rules swept (controller-boundary, internal-client, service-registry.mdx, api-reference/microservice-anatomy/nats-client); api.json extracted artifacts regenerate via make-docs; dal-access rule PROVED itself — caught renamed file out of allowlist → config updated |
| 9 | Test migration to service seams | ✅ done | 2026-10-16 | EMPIRICAL seam (supersedes plan note): `(svc as any)._dal = mockRepo` for repo-level stubs (dal-pg internals not vi.mock-able through package boundary) + service-level method stubs (Object.assign/vi.fn on svc) for absorbed methods — ctor DI kept for real collaborators (mockCasdoor); cleanup pass: removed vestigial mockRepo+dal-pg Repository mocks (user-service-change-password, mfa-service — stubs never reach this.dal), renamed stale wrapper-named mocks to seam-meaningful names (mfa: factorMethodMocks/actionAuthzMocks/mockConfigEntriesService/mockUserService; config-entries-router: mockDal→mockConfigEntriesService + keys realigned to real API createEntry/updateEntry/restoreEntry/getByUuid, comments DAL→service); zero test files reference deleted wrapper modules; suite **305/305 GREEN** — dev-server boot exposed REAL REGRESSION: makeEntityService called getDal() eagerly at router mount (before initDal in runStartupTasks — port binds first by design so /health survives PG-down); FIXED by making makeEntityService lazy-resolve inner on first call (same deferred fail-fast as DomainService) — verified end-to-end: dev server boots degraded, full infra stack up (postgres/nats/redis/casdoor/mistral compose), health 200, mfa-integration 10/10 |
| 10 | Docs+rules update | ✅ done | 2026-10-16 | dal-v3: NEW docs/dev-guide/migrations.mdx (primebrick-db CLI compare/apply/check/status/sign/keygen + runMigrations engine semantics: MANIFEST Ed25519-sign verify, <schema>.primebrick_database_patches registry, mandatory filename-order stop-on-fail, pb:requires-review/no-transaction pragmas, advisory lock, db_migration.mode config, status.ts admin transitions retry/approve/resolve_manual) + _order.json entry; entity-service.mdx gains DomainService section (lazy seams/buildConfig/no-wrapper contract); getting-started.mdx example rewritten to initDal()/getDal() consumer split (was pre-convention hand-rolled getDb()); connections.mdx convention callout added; docs/ai/dal-usage-guide.md §0 rewritten (initDal→getDal split, fail-fast point = first data access, DomainService consumer rule); dal-usage SKILL.md bootstrap block same fix; US .devin/rules/dal-usage.md updated (two-step convention + DomainService target shape, existing US dal/repo files flagged legacy debt — no new ones); BE AGENTS.md stale config_entries_dal.ts→service; rbac.mdx + auth-rbac.md: role-mapping-repo/user-profile-repo→owning services, BeUserResolverPort/BeRoleMappingPort→Domain*; SDK docs: api-reference+authentication BeApiKeyPort→DomainApiKeyPort, config-tables BeAuthConfigRepositoryAdapter→real ConfigRepositoryAdapter + non-generic ConfigLoader fix; US residual client_registry sweep (controller-boundary/internal-client/AGENTS.md — missed by task-8 sweep); standards clean BE+US |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Verified current state (empirical, no assumptions)

### The `*Dal`/`*Repo` files are NOT thin wrappers — they are misnamed services

`UserProfilesDal` (491 lines) holds ~30 domain methods (`getByUuid`, `getIdpIdentityByUuid`, `createProfile`, `updateProfile` with `tx?` params, display-name joins, Redis cache). Internally it does `this.repo = initDal()` — the Dal itself, not a Repository. These classes are the **worker-service layer wearing a DAL costume**. Correct shape: the domain service owns the methods AND inherits CRUD from the base.

### Why services call `initDal()` directly today

`makeEntityService` is a **factory returning an anonymous object** (`entity-service.ts:273`), used only by the generic entity-router. There is no class to inherit from — so domain services were written standalone and reach the accessor directly. US services already use the sanctioned composition: `ai-models.service.ts:34` → `this.svc = getDal().entityService(cfg)` in ctor, no args.

### `initDal` vs `getDal` — BE is the outlier

US convention (already correct — `us-v3/ai/src/db/dal.ts`):
```ts
export function initDal(): void {           // ONCE, at bootstrap
  const { url, schemas } = assertDbEnv();
  getDal({ connectionString: url, schemas, max: 10, ... });
}
export { getDal } from "@primebrick/dal-pg"; // accessor, everywhere
```
dal-pg `getDal(config?)` IS the process singleton (`dal.ts:735`): first call requires config, subsequent calls return the instance, mismatched connectionString throws. BE instead fused both roles into `initDal()` get-or-init (~40 call sites).

### `BeAuditPortAdapter` → `EntityAuditPort` — rename decided (user 2026-10-16)

`src/db/audit-port-adapter.ts` — `implements AuditPort`: writes `{table}_audit` rows AND publishes entity-changed markers (Redis `setChanged` + NATS `entity.{type}.{uuid}.changed`). 4 call sites. Naming history (empirical): the codebase once had `entityAuditPort()` factory in `db/entity-repo.ts` (BE + US consumers) — deleted 2026-10-16 when `dal.entityService` absorbed auditPort injection. User remembers that name and rules: **single implementation, generic name, `Be` prefix dropped**. File→`db/entity-audit-port.ts`, class→`EntityAuditPort`. Stays in BE (marker publishing needs SDK+Redis — dal-pg is leaf-dep).

### initDal() call-site census (BE src, ~40)

| Site | Count | Verdict |
|---|---|---|
| `index.ts` bootstrap | 2 | legal |
| `http/entity-service.ts`, `entity-write.ts` | 2 | legal — generic entity facades |
| `modules/auth/*_dal.ts`, `*-repo.ts` | ~9 | today legal; **files get deleted in task 5** |
| `modules/*/services/*.service.ts` | ~20 | legal — the singleton-accessor pattern; after task 3 they use `this.dal` instead |
| helpers (`auth-event-logger`, `sdk-auth-ports`, `telemetry`, `audit-query-helper`) | ~5 | migrate into services in task 5 |
| `modules/mcp/tools/dispatch.ts:619` | 1 | ❌ violation — fixed in task 4 |

### Memory/GC answer

Singleton already exists: 1 Dal = 1 pool(10) per process, `schemas[]` handled inside (no per-schema singletons needed). Base class = one vtable, zero per-request cost; kills per-request `new UserProfilesDal()` allocations. Not overengineering — the plumbing shrinks.

---

## Part A — the base class

```ts
// primebrick-dal-v3/src/entity/domain-service.ts  (NEW)
import { getDal } from "../dal/dal.js";
import type { Dal } from "../dal/dal.js";
import { makeEntityService } from "./entity-service.js";
import type {
  EntityService, EntityServiceConfig, EntityListQuery, EntityListResult,
  BulkItem, DuplicateResult,
} from "./entity-service.js";
import type { Repository } from "../repository/repository.js";

/**
 * DomainService<TEntity> — the sanctioned base class for every worker
 * service that owns one entity. Data access ONLY through `this.dal`
 * (the gateway singleton — initialized once at bootstrap via initDal())
 * and `this.svc` (the composed generic CRUD service).
 *
 * A subclass IS an EntityService — it can be handed to the entity-router
 * unchanged and override any method for domain rules.
 */
export abstract class DomainService<TEntity extends Record<string, unknown>>
  implements EntityService<TEntity>
{
  protected readonly dal: Dal;
  protected readonly svc: EntityService<TEntity>;

  protected constructor(cfg: EntityServiceConfig<TEntity>) {
    this.dal = getDal();            // throws if bootstrap hasn't run — fail fast
    this.svc = this.dal.entityService(cfg);
  }

  list(q: EntityListQuery) { return this.svc.list(q); }
  get(uuid: string) { return this.svc.get(uuid); }
  create(b: Record<string, unknown>, tx?: Repository) { return this.svc.create(b, tx); }
  update(uuid: string, b: Record<string, unknown> & { version: number }, tx?: Repository) {
    return this.svc.update(uuid, b, tx);
  }
  delete(uuid: string, version: number) { return this.svc.delete(uuid, version); }
  restore(uuid: string, version: number) { return this.svc.restore(uuid, version); }
  purge(uuid: string, version: number) { return this.svc.purge(uuid, version); }
  duplicate(uuids: string[]) { return this.svc.duplicate(uuids); }
  bulkDelete(items: BulkItem[]) { return this.svc.bulkDelete(items); }
  bulkRestore(items: BulkItem[]) { return this.svc.bulkRestore(items); }
  audit(uuid: string, page: number, limit: number) { return this.svc.audit(uuid, page, limit); }
  stream(q: EntityListQuery) { return this.svc.stream(q); }
}
```

```ts
// primebrick-be-v3/src/http/be-domain-service.ts  (NEW)
export abstract class BeDomainService<TEntity extends Record<string, unknown>>
  extends DomainService<TEntity>
{
  protected constructor(cfg: Omit<EntityServiceConfig<TEntity>,
    "repo" | "auditPort" | "actor" | "userEntity"> & { debugCode?: string }) {
    super({
      ...cfg,
      auditPort: new EntityAuditPort(getDal()),
      actor: requireActor,
      userEntity: UserProfileEntity,
    });
    this.debugCode = cfg.debugCode;
  }
  // list() override adds PB_<CODE>_FORCE_EMPTY/FORCE_ERROR dev toggles
  // (ports the wrapper in http/entity-service.ts:84-101 verbatim)
}
```

```ts
// migrated service — USER owns this file, no *Dal left
export class UserService extends BeDomainService<UserProfileEntity> {
  constructor(private casdoor = new CasdoorService()) {   // collaborator DI stays
    super({
      entity: UserProfileEntity,
      list: { searchableKeys: [...], filterableKeys: new Set([...]), defaultSort: {...} },
    });
  }
  async getByUuid(uuid: string) { return this.dal.find(UserProfileEntity, { uuid }); }
  async updateProfile(uuid: string, body: ..., tx?: Repository) {
    const repo = tx ?? this.dal;        // same repoFor pattern as makeEntityService
    ...
  }
}
```

```ts
// test seam — vi.mock on the gateway module, no ctor data-DI
vi.mock("../../../db/dal-gateway.js", () => ({ getDal: () => fakeDal }));
const svc = new UserService(mockCasdoor);
```

## Part B — dispatch.ts fix (pilot)

Today `dispatchBeAggregate` (dispatch.ts:546+) special-cases `entity==="auth_event"` and calls `initDal().findByPage` with `Project.expr`/`GroupBy.expr` built inline. After:

```ts
// dispatch.ts — transport only
case "auth_event":
  return authEventsService.listAggregate(params);   // service owns the query

// auth-events.service.ts — owns ALL auth_events access
export class AuthEventsService extends BeDomainService<AuthEventEntity> {
  async listAggregate(p: { aggregate: AggregateSpec; filters?; sort?; page?; page_size? }) {
    const { expr, groupBy } = this.buildAggregate(p.aggregate);   // moved verbatim from dispatch
    return this.dal.findByPage(AuthEventEntity, page, pageSize, fields, { filters, groupBy, sorting });
  }
  async logEvent(params: InsertAuthEventParams) { return this.dal.add(AuthEventEntity, …); } // from auth-event-logger.ts
}
```

`auth_events` is `@Entity("auth_events")` → `public` → **BE-owned** — the violation is layer-only, not sovereignty.

## Part C — ext-json verdicts (verified in `sdk/src/json/ext-json.ts`)

**Serialize**: `extJsonStringify` = `json-bigint` strict — plain types produce **byte-identical standard JSON**; bigint → bare JSON number. Every stringify site of OUR payloads converts safely.

**Parse**: `extJsonParse` bigint-ifies **every** safe integer (`payload.exp` → bigint → `typeof exp==="number"` false → expiry check skipped). External-payload parses MUST keep `JSON.parse` — exempt is semantically required, reason text becomes precise.

Convert list (9 sites) / keep-exempt list (13 sites) — enumerated in task 7.

## Part D — `client_shield_registry` rename

Consulted by BOTH shields: `http-server.ts` (`options.clientRegistry`) + `nats/service-shield.ts` + `client-registry.ts` (snapshot `system.clientRegistry.get` + `system.client_registry.changed` pub/sub). Impact: BE 61 refs, SDK 33, US 0, FE 0. One migration patch (`ALTER TABLE … RENAME` + `_audit` if present — verify at apply time), coordinated BE+SDK deploy (subjects are wire contract). No US/FE changes.

## Acceptance

- `grep "initDal()\|getDal()" src/**` outside allowlist → 0 (enforced by new check-standards rule)
- `ls src/modules/auth/*_dal.ts *-repo.ts` → files gone; services extend `BeDomainService`
- `dispatch.ts` contains no `initDal`/`getDal`/`*Dal` imports
- `JSON.stringify` remains ONLY inside sanctioned exempt parse sites (rewritten reasons)
- `client_registry` → `client_shield_registry` applied via signed patch; registry subjects renamed
- BE tests green (~305), US tests green, typechecks clean, live boot smoke
