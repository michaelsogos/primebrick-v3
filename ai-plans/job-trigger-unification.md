# Job Trigger unification — `job_rule` → `job_trigger`, trigger matrix, `me` lane, auth-freshness checkpoint

> Status: 📋 PLAN (2026-11-07) — evidence-gathered; decisions taken with user
> Repos: `primebrick-us-v3` (job-handler), `primebrick-be-v3` (auth resolve + invalidation), `primebrick-v3-sdk` (nothing expected — helpers exist), `primebrick-fe-v3` (entity-form conditional requiredness), translations everywhere.

## Goal

Unify all trigger intents under ONE declaration entity — `job_trigger` —
with `target_subject` always required and `event_subject`/`schedule_spec`
mutually-mandatory (≥1). Absorb today's `kind:"manual"` schedules into the
declaration table; `job_schedules` returns to its native role of pure
JetStream armed-state mirror. Add the `me` execution lane and a Redis
auth-freshness checkpoint at fire time.

## Verified current state (empirical)

- `job_rules` columns: `name`, `event_subject NOT NULL`, `filter?`,
  `schedule_spec NOT NULL`, `target_subject NOT NULL`, `payload_map?`,
  `execution_context ∈ {user, system}` NOT NULL, `enabled`, audit+delete.
  (`job_rule_entity.ts`, patch 0001)
- `job_schedules`: armed-state mirror — `schedule_subject` UNIQUE,
  `service_code`, `job_name`, `kind ∈ {infra_derived|rule|manual}`,
  `lane`, `schedule_spec`, `schedule_type`, `target_subject`,
  `status armed|disarmed`, `initiator`, `rule_uuid`, `armed_at/disarmed_at`.
  Sole writer `schedule-service.ts` ("every arm/disarm is mirrored in
  job.job_schedules (observability)").
- Rules engine (`rules-engine.ts`): ONE shielded subscription per
  `event_subject` (dedup map); event matches filter → `declareSchedule`
  (kind `rule`, target `jobs.due.<lane>.job.forward.<uuid>`,
  `JobForwardEnvelope` payload, `mirror_target` = real callable);
  event NOT matching → `disarmSchedule` (fail-closed gate).
  user lane requires `forwardAuthHeaders(msg)` non-empty else refuse.
- `due-forwarder.ts`: single choke point — consumes `jobs.due.*`,
  unwraps `JobForwardEnvelope`, republishes verbatim payload to the real
  callable subject (`emailsender.send`…), preserving lane semantics.
- Manual arms: `POST /api/v1/actions/schedule-job` + custom
  `schedules-create` page — compose `schedule_subject`/`target` directly,
  `kind:"manual"`, admin-only.
- `infra_derived`: services self-declare via callNats
  `jobs.ctl.schedule.request` (owner must equal caller service_code).
- Auth model (`auth-user-serializer.ts` / `verify-nats.ts`): BE resolves
  full AuthUser → serializes into headers (`x-user-id`,
  `x-user-permissions` already expanded, roles, locale…)
  + `secret_header_name` = client-shield shared secret (no expiry).
  GATEWAY-RESOLVED services deserialize verbatim — no re-auth.
  ⇒ The snapshot IS the authentication; the ONLY staleness is
  authorization drift (roles/permissions changed after arm).
- `jobs.ctl.rules.changed` published fire-and-forget from
  `jobs.service.ts:23` on rule writes — carries `{rule_uuid}` only,
  NO auth headers today.
- BE auth cache precedent: `role.service.ts` caches `role_mappings` in
  Redis (TTL 5min) + post-commit `invalidateCache` hook on `runEntityWrite`.
- Auth headers config: `config.gateway.headers` map +
  `secret_header_name`; `forwardAuthHeaders(msg)` copies exactly those.

## Decisions (user-confirmed)

- Rename entity/table/everything `job_rule` → `job_trigger`.
- Matrix: `target_subject` required always; `event_subject` and
  `schedule_spec` ≥1 required (form + BE validation; DB columns nullable).
- `execution_context` gains `"me"` = snapshot of the arming user.
  Options for every trigger kind; badge color **info**.
  For schedule-only triggers: `me` is the DEFAULT, `user` DISABLED
  (no event headers exist to forward).
- Auth freshness: Redis checkpoint in due-forwarder (below).

## Semantics per trigger kind

| event_subject | schedule_spec | Behavior | Engine path |
|---|---|---|---|
| ✓ | ✓ | event-gated timer (today's rule: match→arm, non-match→disarm) | existing |
| ✓ | — | **immediate**: matching event → publish envelope direct to callable lane (no JetStream schedule, no disarm state) | NEW |
| — | ✓ | **pure timer**: arm at boot/reload, always armed | NEW (absorbs manual) |

Gate semantics note (verified): non-matching event on a subscribed
subject disarms — fail-closed by design; unchanged for source triggers.

## Implementation state (2026-11-02 — verified green)

- Items 1–8 implemented; item 9 partially (builds/checks/docs green;
  engine+checkpoint unit tests still open).
- Snapshot key is `auth:snap:<uuid>` (impl.), TTL 6h safety-net.
- `job_schedules.kind` decided: `infra_derived` | `trigger`; legacy
  `rule`/`manual` rows migrate/remain display-only (badge keeps `manual`
  for old rows; `rule` rows UPDATEd to `trigger`).
- `jobs.ctl.schedule.request` now accepts `infra_derived` only —
  `manual`/`trigger` arms are JH-internal paths.
- `auth.ctl.resolve_user` implemented in BE `internal-request-routes.ts`
  (uuid → UserProfileDetailDto → expandPermissions → buildAuthUser;
  `null` for missing/inactive). Epochs: `auth:epoch` on role writes,
  `auth:user_epoch:<uuid>` on user writes (update/delete/restore).
- FE: `job_trigger_shape` closed-vocab validator (zod + BE
  `assertTriggerShape` mirror), `user` badge option disabled live with
  no source, coerce `user`→`me`, `ComboSelect.isOptionDisabled` reused.
- DB: patches `20261107120000` (rename+nulls+key renames+kind rows),
  `…130000` (manual-surface label cleanup), `…140000` (trigger label
  values ×7), `…150000` (desc anatomy fix) — all signed+applied, db:check clean.
- Renames verified zero-residue: `job_rule|JobRule|rules.changed|nav_rules|
  ruleForm|rule_id` absent from all sources; FE route dir `rules/`→`triggers/`;
  e2e+unit fixtures updated; `jobs-page.js` chunk 13.2→6.8kB (sheet-only).
- Docs: `docs/dev-guide/index.mdx` rewritten to trigger model + auth
  checkpoint section; generated `triggers*.mdx` emitted, `rules*.mdx` and
  `job-schedules-create.mdx` deleted.

## Work items

1. **Entity + DB**: `JobTriggerEntity` (`job_triggers`, schema `job`) +
   `_audit` rename; `event_subject`/`schedule_spec` nullable;
   new db-meta patch (rename table + audit + drop NOT NULLs) + sign.
2. **`execution_context` += `me`**: entity zod/enum, meta badge
   `{me: info, user: primary, system: #000000}`.
3. **Engine** (`rules-engine.ts` → triggers-engine):
   - `source+schedule` → existing gate path
   - `source-only` → on match, publish `JobForwardEnvelope` straight to
     `jobs.due.<lane>.job.forward.<uuid>`… wait — the forward trampoline
     exists because callable subjects aren't in the JOBS stream capture;
     immediate mode publishes the envelope to the SAME due subject via
     direct NatsClient publish (not JetStream schedule arm) — the
     due-forwarder consumes it identically.
   - `schedule-only` → `declareSchedule` at boot + on `triggers.changed`
     reload; `rule_uuid` link as today.
   - `me` lane on any kind: `forwardHeaders` captured at save time.
4. **`me` lane plumbing — no header storage needed** (simpler than
   headers-on-changed): `me` resolves `trigger.created_by` (the author)
   through `auth.ctl.resolve_user` AT ARM TIME →
   `serializeAuthUserToHeaders` → `declareSchedule(forwardHeaders)`.
   `Session` exposes only `actor`/roles (verified — no full AuthUser
   reaches the hook), so resolving via the new BE route is BOTH the
   me-arm path AND the fire-time freshness path — one mechanism.
   `triggers.changed` stays `{trigger_uuid}`-only.
5. **Auth-freshness checkpoint** (due-forwarder, before republish,
   `x-user-id` present only):
   - `GET auth:resolved:<uuid>` → HIT → rebuild headers via
     `serializeAuthUserToHeaders(cached)`
   - MISS or epoch stale → `callNats("auth.ctl.resolve_user", {uuid})`
     → SET cache (TTL e.g. 1h) → rebuild
   - Policies: user deleted/disabled → refuse fire (fail-closed);
     BE down → fallback to message headers + warn (bounds staleness).
   - Epoch model: `auth:epoch` global bump on role/permission writes;
     `auth:user_epoch:<uuid>` on user/grant writes. Snapshot stores
     `max()` at write time; compare at fire.
   - **NEW on BE**: `auth.ctl.resolve_user` callNats route (wraps
     `resolveInternalUuid` + `expandPermissions` → AuthUser), plus
     invalidation hooks extended from the role_mappings pattern
     (role.service.ts `invalidateCache`).
6. **Form** (`TRIGGER_FORM` in nav-declaration + FE entity-form):
   - `event_subject`/`schedule_spec` required-ness conditional
     (at-least-one) — needs archetype support for a cross-field
     required rule (or server-side validation + form hint)
   - `execution_context`: `user` option disabled when no
     `event_subject`; `me` default for schedule-only — FE disables
     options per field state (needs a small decl extension or
     form-side logic — decide placement vs. FE rule)
7. **Renames sweep** (breaking, all declared):
   - routes `/system/job/rules*` → `/system/job/triggers*`
   - nav id `rules` → `triggers`, entity `job_rule` → `job_trigger`
   - permission keys `access.system.job.rules*` → `…triggers*`
     (permission seed patch)
   - event `jobs.ctl.rules.changed` → `jobs.ctl.triggers.changed`
     (events-declaration + publisher + reload tap)
   - translations `job.entities.job_rule.*` → `job_trigger.*`
     (7 langs — rename patch; nav/form/tooltips all move)
   - audit marker `"job_rule"` → `"job_trigger"`; entity-meta
     `entity`/`translation_key`/`display_field`
8. **Manual absorption**: `POST /api/v1/actions/schedule-job` +
   `schedules-create` page — retire in favor of trigger create
   (schedule-only); `job_schedules.kind` keeps
   `{infra_derived, rule}` (rename `rule`→`trigger`? keep `rule` for
   legacy rows; new rows write `trigger`) — decide label.
   "Schedules" nav page stays as armed-state registry.
9. **Verify**: jh build + db:check + docs regen (triggers pages emit);
   `check:standards` all repos; FE entity-form check; engine unit test
   for the three kinds + me-lane header plumbing + checkpoint
   (hit/miss/stale/refuse paths).

## Out of scope (flagged)

- resolve-at-fire RE-AUTH (re-running full verify per fire) — the
  epoch cache is the mechanical middle ground the user chose.
- `job_run` linkage: runs already carry `schedule_subject` — works
  unchanged.
- emailsender/crm/webhook `infra_derived` flows — untouched.

## Risks

- Big-bang rename touches permission seeds — existing grants
  `access.system.job.rules.*` must be renamed in the same patch or
  admins lose access until re-granted.
- `jobs.ctl.rules.changed` subject rename breaks any external
  subscriber — registry search says only JH subscribes (verify
  service_registry declared emits vs subscribers at impl time).
- `me` lane security: snapshot of the SAVING user — same trust model
  as `user` lane (event snapshot); epoch checkpoint mitigates drift.
