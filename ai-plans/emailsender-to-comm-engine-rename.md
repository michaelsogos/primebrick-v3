# Rename `emailsender` → Transactional Communication Engine (multi-channel)

> Standalone plan. Evidence gathered empirically 2026-11-05 against the live
> dev environment (NATS/PG running, service_registry/client_shield_registry
> inspected). Scope: rename + multi-channel (email → sms → push → whatsapp)
> in ONE coherent breaking change, following the "one truth, one way to read
> it" doctrine — no compatibility shims, live data migrated by patches.

## Status: ⚪ TODO — Plan date: 2026-11-05 01:55 UTC

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| 1 | Decide final service code + channel taxonomy (see §Decisions) | ⏳ not done | — | proposal: `comm` |
| 2 | us-v3: rename service dir, package name, serviceName, UA, applicationName | ⏳ not done | — | |
| 3 | us-v3: PG schema `emailsender`→new via `ALTER SCHEMA` patch + `.env` + `@Entity` decorators | ⏳ not done | — | |
| 4 | us-v3: channel abstraction — `channel` on provider + template + sender_log; ChannelDriver port; brevo = first email driver | ⏳ not done | — | |
| 5 | us-v3: callable contract — snake_case wire fields + per-channel subjects `comm.send.<channel>` + payload_schema per channel | ⏳ not done | — | |
| 6 | us-v3: response lane `comm.response.*` (or fold into jobs.result — see §Decisions) | ⏳ not done | — | |
| 7 | us-v3: webhook consumer rename (`webhook.comm.received`, new durable) + per-channel inbound status events | ⏳ not done | — | |
| 8 | us-v3: nav-declaration — route_prefix `/system/comm`, access ns, component_url chunk rename | ⏳ not done | — | |
| 9 | us-v3: controllers/http — verify makeServiceRoutes alignment (rule 11) + entities-route/config-route/module-assets | ⏳ not done | — | |
| 10 | us-v3: standards cleanup — camelCase wire, `db/entity-repo.ts`?, `adapters/` layer audit vs current service shape (JH = reference) | ⏳ not done | — | |
| 11 | us-v3: db patches — seed config keys rename, translations table keys `emailsender.*`→`comm.*`, provider `channel` col, template/sender_log `channel` col, MANIFEST re-sign | ⏳ not done | — | |
| 12 | SDK: rename 30 `emailsender.*` Permission members → `comm.*`; send permission per channel (`comm.send.email`…) | ⏳ not done | — | |
| 13 | BE: `email-sender.ts` publisher → new subjects + snake_case payload; invitation/OTP flows; generic-tools description | ⏳ not done | — | |
| 14 | BE: db patch — `public.role_mappings.permissions` jsonb `emailsender.*`→`comm.*`; `access.system.emailsender`→new ns; translations keys; service_registry/client_shield old-row cleanup | ⏳ not done | — | |
| 15 | job-handler: trigger rows `target_subject` migration (live: 5 rows) + disarmed schedule mirror subjects; docblock examples refresh | ⏳ not done | — | |
| 16 | FE: e2e helpers (fake-brevo, global.setup `emailsender.providers` SQL, otp.ts sender_log schema, specs `emailsender.send`/`/system/emailsender` routes), fallback i18n json | ⏳ not done | — | |
| 17 | us-v3 `fe/` remote chunk: pages bundle rename `emailsender-pages.js`→`comm-pages.js`, HostLeaf/forms i18n keys | ⏳ not done | — | |
| 18 | Docs: regenerate (extract-docs, generate:docs, build-docs-pack, navigation-map) + dev-guide pages (emailsender index/providers, webhook index, us-v3 overview/architecture, SDK api-reference, BE architecture/module-navigation/rbac/translations, FE app-shell/i18n) | ⏳ not done | — | |
| 19 | Live verification: boot renamed service → registry+shield self-heal → send via new subject → webhook → sender_log → jobs.result correlation; 5s unit+E2E per repo | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Part A — Empirical evidence (what actually exists today)

### A.1 Service shape — `primebrick-us-v3/emailsender/` (package `primebrick-emailsender@3.5.0`)

```
src/
  index.ts                    createMicroservice({ serviceName:"emailsender", labelKey:"emailsender.module.name",
                              partOf:"system", nav:EMAILSENDER_NAV, events:EMAILSENDER_EVENTS,
                              endpoints:{ nats_send:"nats://emailsender.send (fire-and-forget)",
                                          nats_webhook:"nats://webhook.emailsender.received (durable)" } })
  controllers/
    http/    composite-route.ts · config-route.ts · entities-route.ts · module-assets-route.ts
    nats-sub/ email-send.ts · webhook-subscriber.ts · types.ts
  services/  email-service.ts (Handlebars + BrevoClient, provider row provider='brevo')
             webhook-service.ts
  modules/   providers/ {provider.meta.ts, providers.service.ts}
             templates/ {template.meta.ts, templates.service.ts}
  domain/entities/ registry.ts · provider_entity.ts · email_template_entity.ts
                   sender_log_entity.ts · config_entry_entity.ts
  db/        dal.ts (applicationName "primebrick-emailsender") · entity-repo.ts
  adapters/  auth-ports-adapter.ts · config-repository-adapter.ts · health-check-adapter.ts
  providers/ brevo.ts (+__tests__)
  fe/src/    HostLeaf.svelte · ProviderFormPage.svelte · TemplateFormPage.svelte
             host-contract.ts · index.ts   (vite → emailsender-pages.js chunk)
  db-meta/   15 patches · MANIFEST.json · snapshots
```

**Live PG state (verified 2026-11-05):**

- schema `emailsender` — 6 tables: `config_entries, email_templates,
  primebrick_database_patches, providers, sender_log, translations`
- `service_registry`: row `code=emailsender, part_of=system`, nav 2 leaves
- `system.client_shield_registry`: **6 UA prefixes** `primebrick-emailsender/{0.6.0,3.1.0,3.2.0,3.3.0,3.4.0,3.5.0}` (registry-sourced, enabled)
- `job.job_triggers`: **5 live rows** targeting `emailsender.send` (e2e residue)
- `public.role_mappings.permissions`: jsonb array — `emailsender.*` grants live

### A.2 NATS surface

| Subject | Direction | Notes |
|---|---|---|
| `emailsender.send` | BE→svc (fire-and-forget, queue `emailsender`) | callable, zod `SendEmailSchema`, RBAC `emailsender.send` |
| `emailsender.response.<requestId>` | svc→requester | manual publish inside handler — ad-hoc lane |
| `webhook.emailsender.received` | webhook-svc→svc (JetStream durable `webhook-emailsender-received`) | brevo delivery/status webhooks |
| `jobs.due.*.emailsender.send` | JH→svc | trigger callable targets (5 live trigger rows) |
| `jobs.result.emailsender.send` | svc→JH | result middleware (inherits via makeNatsRoutes once wired) |

### A.3 Contract violations vs current standards (empirical, not assumed)

1. **camelCase wire payload** — `SendEmailSchema`: `requestId, templateCode,
   languageIso, initiatedBy, entityTable, entityId, entityUuid` vs
   data-model-conventions (snake_case on the wire). The code *documents* the
   violation ("request fields are camelCase (NATS contract)"). Fix = rename
   fields; BE publisher + payload_map metadata + every saved trigger
   `payload_map` migrate together.
2. **Ad-hoc response lane** — handler manually publishes
   `emailsender.response.<requestId>`; not the `jobs.result.*` governed
   middleware (x-job-run-id / x-job-schedule-subject headers) introduced for
   the job fabric. Decision needed: keep response lane (it IS a public
   contract used by trigger event-chaining — a trigger listens
   `emailsender.response.*` as event_subject!) and/or additionally publish
   the governed result.
3. **`src/db/entity-repo.ts`** — likely violates "no consumer
   `*_dal.ts`/`*-repo.ts` layer" (dal-usage rule). Audit + fold into
   DomainService/svc calls.
4. **`adapters/` layer** — `AuthConfigPort`/`ConfigRepositoryAdapter`/
   `HealthCheckAdapter` pattern predates current service shape (JH/ai use
   none). Probably still required by `createMicroservice` ports — keep but
   re-verify necessity.
5. **Provider entity is email-shaped** — columns `from_email, from_name,
   reply_to`; no `channel`/`driver` discriminator; `provider` free-text.
6. **Template entity email-only** — `email_templates` (subject/html/text per
   language presumably); SMS/push/whatsapp shapes differ.
7. **Webhook durable name hardcodes service code** — rename = new durable;
   decide drain-vs-abandon of the old consumer (WEBHOOK stream retention).
8. **30 `Permission.EMAILSENDER_*` enum members in SDK** — values carry the
   service code (`emailsender.provider.*`, `emailsender.email_template.*`,
   `emailsender.send`, …); live grants in `public.role_mappings` jsonb.
9. **51 `i18n-sql-ns` check-standards violations in be-v3** (transferred from
   `fix-ui-polish-batch` closure notes, 2026-11-05) — patch
   `20261116040000_emailsender_callable_help_keys.sql` seeds `emailsender.*`
   keys into `public.translations`, violating the owning-module namespace
   rule (service-owned keys live in `{service}.translations`, not
   `public.translations`). The rename fixes this structurally: the help/label
   keys move to the `comm` schema translations and the public-seeded rows
   are dropped/relocated by the migration patches.

### A.4 Cross-repo reference inventory (empirical grep, ~90 files)

| Repo | Surface | Count/kind |
|---|---|---|
| us-v3 | the service itself (dir name, package, code, schema, subjects, UA, queue, nav, i18n ns, Dockerfile, docs, fe-chunk name, tests, e2e setup) | all |
| be-v3 | `auth/services/email-sender.ts` publisher; `invitation.service.ts`; openapi/module-nav-meta doc examples; `mcp/generic-tools.ts` description (`'emailsender'` module code); `rbac-convention.test.ts`; translations/mcp/entity-registry tests; **5 db-meta patches** (translations seeds `emailsender.*` keys, payload_map meta, help keys, evict-from-public) | ~15 files + patches |
| fe-v3 | route type-gen `/system/emailsender/providers|templates` (auto-regen), e2e helpers `fake-brevo.ts`/`otp.ts`/`db.ts`/`global.setup.ts` (SQL `emailsender.providers`, `emailsender.sender_log`), specs (`auth-password`, `collaboration-form`, `form-draft`, `module-ownership`, `payload-map-widget` — `emailsender.send` target), `en-GB-fallback.json` keys, api.ts/services-store/page-resolver tests | ~15 files |
| sdk | `permissions.ts` 30 members; docblocks/tests using `emailsender.send` as the canonical example (nats-client, job-contract, job-schedule.test, service-identity.test, service-registrar.test, service-lifecycle-subjects.test); api-reference.mdx + api.json (regen) | ~10 files |
| us-v3 JH | docblock examples `emailsender.send` in due-forwarder/run-recorder/schedule-service/job_trigger_entity + 4 test files (cosmetic but pervasive) + generated user-guide `triggers-create/edit.mdx` (regen) | ~8 files |
| us-v3 webhook | `docs/dev-guide/index.mdx` example path `/webhook/emailsender/brevo`; `test/precheck-port.test.ts` | 2 files |
| us-v3 ai | `controllers/http/config-route.ts` reference | 1 file |
| docs | us-v3 dev-guide overview/architecture/conventions, emailsender index+providers.mdx, BE dev-guide (architecture, module-navigation, rbac, translations, navigation-map.mdx generated), FE app-shell/i18n, SDK api-reference/authentication/config-tables/getting-started/http-server/nats-client/service-registration/sse-standard/docs-pack | ~18 files |

### A.5 What stays put (no action)

- `nats-server` JOBS/WEBHOOK streams — subject names change but streams are
  wildcard-captured (`jobs.>` lanes, `webhook.>`), no stream reconfig.
- `primebrick_database_patches` inside the schema — `ALTER SCHEMA RENAME`
  carries patch history verbatim; the migration engine records patch
  filenames (never renamed).
- Brevo driver code (`providers/brevo.ts`) — becomes `drivers/brevo-email.ts`
  (or similar) logic-preserving move.
- `sender_log` shape — `senders`/`recipients` jsonb + `type` column already
  channel-ready; add `channel` (or repurpose `type` — decide).

---

## Part B — Design

### B.1 Naming (§Decisions D1)

| Candidate | Subjects | Schema | Verdict |
|---|---|---|---|
| **`comm`** | `comm.send.email` / `comm.send.sms` / `comm.send.push` / `comm.send.whatsapp` | `comm` | **proposal** — short, subject-safe, reads naturally |
| `messaging` | `messaging.send.email` | `messaging` | longer, equally valid |
| `notify` | `notify.send.email` | `notify` | implies notification-only; misses OTP/invitation semantics |
| `tce`/`txn-comm` | cryptic | — | reject |

Display name: **"Communications"** / label `comm.module.name`
("Transactional Communication Engine" is the architecture description —
user-facing name should stay short per copy-tone-of-voice rule).
Package: `primebrick-comm` → UA `primebrick-comm/<version>`.

### B.2 Channel taxonomy

```ts
type CommChannel = "email" | "sms" | "push" | "whatsapp"; // closed vocab, core
```

- **Callable subjects per channel**: `comm.send.<channel>` — a channel is a
  first-class route: per-channel RBAC (`comm.send.email`), per-channel
  payload_schema (sms has no subject/cc; whatsapp needs template namespace),
  per-channel queue weight, census lists 4 callables the trigger UI picks
  natively.
- **Response lane**: `comm.response.<channel>.<requestId>` (wildcard
  `comm.response.*.*`? — decide single wildcard depth; today one level).
- **Webhook inbound**: `webhook.comm.received` single durable; envelope
  carries `channel`+`provider` for status routing (brevo delivery events
  today; twilio/F). Path `/webhook/comm/<provider>` auto-derives from
  service code — webhook service needs NO change.
- **Provider entity**: `+ channel` (closed vocab), `+ driver` (`brevo`,
  `twilio`, `fcm`, `meta`), sender identity fields stay nullable
  per-channel (`from_email`… reused for email; sms sender id etc. — decide
  explicit columns vs `channel_config` jsonb — prefer explicit snake_case
  columns per data-model conventions, `jsonb` only for provider-specific
  blobs like whatsapp `phone_number_id`/template namespace).
- **Template**: unify to `message_templates` with `channel` + per-channel
  nullable fields (email: subject/html/text; sms: text only; push:
  title/body/data; whatsapp: provider template code + params) OR keep
  per-channel entities. Proposal: **single `message_templates` +
  `channel` discriminator** — one list page with channel facet filter,
  one permissions family; channel-invalid fields rejected by shape
  validator (same closed-vocab `validators` mechanism as
  `job_trigger_shape` — `message_template_shape` predicate in core).
- **sender_log**: `+ channel`; `senders`/`recipients` jsonb already
  channel-neutral; `type` column — verify current semantics, fold into
  `channel` if redundant.
- **Dispatcher**: `ChannelDriver` port `{ send(normalized): Promise<DriverResult> }`;
  `brevo.ts` → `drivers/email/brevo.ts`. Driver registry per
  (channel, provider) pair; provider row selects driver at send time.

### B.3 Standards alignment checklist (what JH/ai already enforce)

| Standard | emailsender today | target |
|---|---|---|
| `makeNatsRoutes` + `payload_schema` | ✅ already | keep |
| queue group on work subjects | ✅ `queue:"emailsender"`→`comm` | keep |
| snake_case wire | ❌ camelCase `SendEmailSchema` | fix + BE publisher + payload_map migration |
| `jobs.result` middleware | ❌ manual response publish | inherit via makeNatsRoutes (headers) — response lane stays as PUBLIC contract only if trigger event-chaining needs it |
| `makeServiceRoutes` (rule 11) | ⚠️ composite-route.ts — verify | align |
| no `*_repo.ts` consumer layer | ⚠️ `entity-repo.ts` — audit | fold |
| `service_gateway_online`-style boot retry | n/a (no schedule arm) | — |
| nav-declaration `entityPaths` + `validateNavDeclaration` | ✅ | rename prefix only |
| db-meta patch + re-sign | ✅ | new patches only (never edit shipped) |
| i18n namespaces in check-standards | `emailsender` | `comm` |
| generate:docs pipeline | ⚠️ emailsender skips `generate-page-docs.ts` (only `build-docs-pack.ts`) — **now the engine exists on develop**: align package.json `generate:docs` to JH/ai shape | enable page-docs |

### B.4 Live-data migration map (one BE patch + one svc patch)

**BE patch (`public` schema):**
- `role_mappings.permissions` jsonb: `emailsender.*` → `comm.*`
  (`emailsender.send`→`comm.send.email`, `emailsender.provider.*`→`comm.provider.*`,
  `emailsender.email_template.*`→`comm.message_template.*`) + `access.system.emailsender`→`access.system.comm`
- `public.translations` keys `emailsender.*`→`comm.*`
- `service_registry` row: delete (re-registers as `comm` at boot) or UPDATE
  code — deleting is cleaner: endpoints re-declare verbatim.
- `system.client_shield_registry`: disable/drop `primebrick-emailsender/*`
  rows (new `primebrick-comm/*` self-enrolls at boot).

**JH data (job schema — BE patch or JH patch?):**
- `job_triggers.target_subject` `emailsender.send`→`comm.send.email`
  (5 live rows), `event_subject` `emailsender.response.*`→`comm.response.*`
- `job_schedules` disarmed mirror rows are cosmetic history — leave.

**svc patch (`comm` schema, post-`ALTER SCHEMA RENAME`):**
- `config_entries` keys renames + `translations` keys `emailsender.*`→`comm.*`
- `providers.channel`/`driver` columns + backfill (`channel='email', driver='brevo'`)
- `email_templates`→`message_templates` rename + `+ channel` backfill `'email'`
- `sender_log.+ channel` backfill `'email'`

**PG schema rename**: single patch statement
`ALTER SCHEMA emailsender RENAME TO comm` — preserves all table data and the
embedded `primebrick_database_patches` history. `.env`/`env.example`
`DATABASE_SCHEMA=comm`, `applicationName` update, all `@Entity` schema args.

### B.5 Cutover sequence (single atomic window per env)

1. Merge code (all repos, `fix/` branches → develop) — do NOT deploy yet.
2. Deploy: new service boots as `comm` (registers registry row + shield UA +
   schema already renamed by its own patch chain — order matters: the ALTER
   SCHEMA patch must run under the OLD patch-table history, so it is patch
   N inside the renamed dir; verify dbPatches records filename+sha only, not
   schema).
3. Old `emailsender` code stops → old subjects die with the process.
4. Webhook durable: new `webhook-comm-received` created; old durable left to
   expire (WEBHOOK stream retains msgs — drain check before cutover).
5. Verify: send → log → webhook → result; trigger fire → `comm.send.email`.

---

## Part C — Decisions needed (ask before implementing)

- **D1 — service code**: `comm` (proposal) vs `messaging` vs other.
- **D2 — response lane**: keep `comm.response.*` public contract (needed —
  a live trigger uses `emailsender.response.*` as event_subject for
  chaining) AND ride `jobs.result.*` middleware for observability, or fold
  entirely into result lane (breaks event-chaining ergonomics)?
- **D3 — template model**: single `message_templates` + `channel` (proposal)
  vs per-channel entities.
- **D4 — provider config**: explicit nullable columns per channel (proposal)
  vs `channel_config` jsonb blob.
- **D5 — send permissions**: `comm.send.<channel>` per channel (proposal)
  vs single `comm.send`.
- **D6 — old webhook durable**: abandon (proposal, verify stream drain) vs
  dual-consume migration window.
- **D7 — schema rename mechanics**: `ALTER SCHEMA RENAME` (proposal —
  verify dbPatches meta doesn't hash schema name) vs new schema + data copy.
- **D8 — do e2e residue triggers get cleaned** (5 live rows today) or
  migrated (they'd re-point to `comm.send.email`)?

## Part D — Acceptance criteria

- `primebrick-comm` boots: registry row `comm`, nav `/system/comm`,
  shield `primebrick-comm/<v>` enabled, schema `comm` with all history.
- `comm.send.email` (queue `comm`, snake_case payload, RBAC
  `comm.send.email`) → brevo → `comm.response.email.<requestId>` +
  `jobs.result.comm.send.email` row `executed`.
- Webhook `webhook.comm.received` durable updates `sender_log.status`.
- Old subjects/UA/schema/permissions: zero live references (DB query +
  NATS subjects audit pass clean).
- FE: providers/templates pages render under `/system/comm`; e2e
  auth-password flow extracts OTP from `comm.sender_log`.
- Every repo: unit ≤5s green, typecheck clean, standards clean,
  extract-docs/generated docs committed.
