# Standard: `{entity, translations?}` write payload for ALL entity CUD endpoints

## Status
Empirical plan, user decisions applied. All facts verified in code.

## User decisions (this session)

1. **Scope**: single-row writes only — `POST /entities/:entity` (create) and
   `PUT /entities/:entity/:uuid` (update). **Bulk ops stay flat**: bulk-update
   / bulk-delete / bulk-restore / duplicate already run atomic via streams +
   temp tables — `{uuids}` / `{updates}` bodies are NOT entity payloads.
2. **`/entities/translation` admin CRUD IS wrapped too**: `{entity: {key,
   language, value}}` — piggybacked `translations` forbidden on it (a
   translation row has no translations). Uniformity of the envelope, not of
   the sibling.
3. **US microservices adopt the same wrapper**: `POST/PUT
   /entities/provider`, `PUT /entities/config_entry` (emailsender) →
   `{entity: ...}`. US has no zod and no translations table — validate the
   envelope by hand (`body.entity` must be an object; `body.translations`
   rejected with 400).
4. **Hard break**: flat bodies rejected with 400 everywhere. No dual-accept.
   FE + MCP updated in the same pass.
5. (Implied) `/auth/users` POST stays flat — it is an auth RPC, not an
   `/entities/` endpoint. Out of scope.

## Verified current state

### BE (`primebrick-be-v3`)

| Endpoint | File | Body today |
|---|---|---|
| `POST /entities/config_entry` | `auth/routers/config-entries.router.ts:157` | ✅ `{entity, translations?}` already |
| `PUT /entities/config_entry/:uuid` | same file `:110` | flat `UpdateBodySchema` — **not aligned** |
| `POST/PUT /entities/organization` | `auth/routers/organizations.router.ts:39,46` | flat |
| `PUT /entities/user_profile/:uuid` | `auth/routers/user-profiles.router.ts` + `auth/dto.ts:105` (`UserUpdateBodySchema`) | flat |
| `POST /entities/role_mapping`, `PUT .../role_mapping` + `.../:uuid` | `auth/routers/role-mappings.router.ts:64,74` | flat |
| `POST/PUT /entities/customer` + `POST /customer/duplicate` | `customers/router.ts` + `customers/dto.ts:116,146` | flat |
| `POST/PUT /entities/ai_model` | `ai-models/router.ts` + `ai-models/dto.ts:124,128` | flat |
| `POST/PUT /entities/ai_cerebellum` | `ai-cerebellum/router.ts` + `ai-cerebellum/dto.ts:118,122` | flat |
| `POST/PUT /entities/translation` | `system/translations-router.ts:165,188` (`TranslationCreateSchema`/`TranslationUpdateSchema`, inline) | flat `{key,language,value}` |

- `validateBody(schema)` (`src/http/validation.ts:35`) — safeParse →
  `req.body = r.data`. Zod issues surface as `extra.issues[].path` in the
  RFC7807 400. With the wrapper, paths become `entity.<field>` — **check FE
  form field-mapping during impl** (superforms pages show generic errors;
  verify no consumer maps `issues[].path` to form fields).
- Schemas are per-module (some in `dto.ts`, some inline in routers). Wrap
  strategy must NOT touch the inner schemas: existing validation rules,
  superRefine, partial() all preserved verbatim.

### MCP dispatch (`src/modules/mcp/tools/dispatch.ts`)

- BE entities: `dispatchBeCreate/Update` call **service layer directly** with
  flat field args → unaffected by the HTTP envelope.
- Microservices: `proxyToMicroservice` forwards `body` verbatim over HTTP →
  **must wrap**: dispatch wraps `args` into `{entity: args}` for create/update
  ops toward `/ws/...` paths, so MCP tool callers keep sending flat fields
  (no MCP breaking change).

### US (`primebrick-us-v3/emailsender`)

- `server/providers-route.ts`: `POST /entities/provider`, `PUT
  /entities/provider/:uuid` — raw `readBody()` + manual field extraction, no
  zod.
- `server/config-route.ts:161`: `PUT /entities/config_entry` — reads
  `body.value` raw.
- Both must read `body.entity.*` and 400 on missing `entity` or stray
  `translations`.

### FE (`primebrick-fe-v3`) — write callers to migrate

| Caller | Endpoint | Today |
|---|---|---|
| `api.ts:412 createConfigEntry` | POST config_entry | ✅ already `{entity, translations}` |
| `api.ts:422 updateConfigEntry` | PUT config_entry/:uuid | flat `{...patch, version}` |
| `api.ts:517 createTranslation` / `:532 updateTranslation` | translation CRUD | flat `{key,language,value}` |
| `api.ts:327 updateModuleConfigKey` | `PUT /ws/:code/entities/config_entry/:uuid` (US!) | flat `{value}` |
| `organizations/create/+page.svelte:75` | POST organization | flat |
| `organizations/[uuid]/+page.svelte:105` | PUT organization | flat |
| `users/[uuid]/+page.svelte:145` | PUT user_profile | flat |
| `useRoleMappings.svelte.ts:100,123` | POST/PUT role_mapping | flat |
| `email-providers/+page.svelte:151,162` | POST/PUT provider (US via `/ws`) | flat |
| `useAiModels.svelte.ts:126` + cerebellum composable | POST ai_model / ai_cerebellum | flat (verify PUT sites too) |

Generic EntityListTable composables only do delete/restore/duplicate/bulk —
no generic create/update → untouched (correct per decision 1).

## Design

### BE shared helper — `src/http/entity-write.ts` (new)

```ts
export const PendingTranslationSchema = z.object({
  key: z.string().min(1).max(255),
  language: z.string().min(1).max(10),
  value: z.string(),
});
export type PendingTranslation = z.infer<typeof PendingTranslationSchema>;

/** Wrap an existing entity body schema into the {entity, translations?}
 *  write-payload standard. Inner schema untouched — all Zod rules preserved. */
export function entityWriteBody<S extends z.ZodTypeAny>(entitySchema: S) {
  return z.object({
    entity: entitySchema,
    translations: z.array(PendingTranslationSchema).optional(),
  }).strict();
}

/** Same, for entities that may never carry piggybacked translations
 *  (the translation entity itself). */
export function entityOnlyWriteBody<S extends z.ZodTypeAny>(entitySchema: S) {
  return z.object({ entity: entitySchema }).strict();
}
```

`.strict()` rejects unknown root keys → a flat legacy body fails with
`unrecognized_keys` (400, hard break — decision 4).

Shared tx helper — extract from config-entries.router.ts into
`src/http/entity-write.ts` or a small service util:

```ts
export async function persistPendingTranslations(
  translationsDal: TranslationsDal,
  rows: PendingTranslation[],
  tx: PoolClient,
) {
  for (const t of rows) {
    await translationsDal.create(t.key.split(".")[0], t, {
      tx, createIfAbsent: false,
    });
  }
}

export function assertTranslationsPermission(req: Request, count: number) {
  if (count === 0) return;
  const rbac = checkRbac(req.user!, [Permission.TRANSLATIONS_MANAGE]);
  if (!rbac.allowed) throw new ForbiddenError(/* translations.manage */);
}
```

### Per-router changes (BE)

For each of the 8 routers × (create|update):
`validateBody(XSchema)` → `validateBody(entityWriteBody(XSchema))` (or
`entityOnlyWriteBody` for translations-router). Handler reads
`body.entity` instead of `body`. Where `translations?.length`:
`assertTranslationsPermission` → `runInTransaction` (entity write +
`persistPendingTranslations`) → post-commit invalidate entity cache +
`invalidateModuleCache` per touched module (same pattern as
config-entries.router.ts:271-299).

- `config_entry PUT`: wrap `UpdateBodySchema`; decide at impl whether
  update accepts piggybacked translations (yes — same standard; tx path
  identical, entity op = `dal.update` inside tx).
- `role_mapping`: two update routes (by `idp_role` and by `:uuid`) — both
  wrapped.
- `translation` CRUD: `entityOnlyWriteBody` — translations sibling rejected
  by `.strict()`.
- `dto.ts` files stay untouched (inner schemas); the wrapper lives in the
  router or in a `dto.write.ts` per module if the router file grows.

### US (`emailsender`)

- `providers-route.ts` POST/PUT: `const body = await readBody(req);
  const e = body?.entity;` → 400 if not object; 400 if `body.translations`
  present. Field extraction unchanged on `e`.
- `config-route.ts` PUT: `body.entity.value`.

### MCP dispatch

- `proxyToMicroservice` create/update: wrap before send —
  `body: { entity: args }`. BE-service dispatch unchanged (flat args).
- Document in dispatch.ts comment: HTTP envelope is a transport concern,
  MCP callers always send flat fields.

### FE shared type — `api-types.ts`

```ts
export type PendingTranslation = { key: string; language: string; value: string };
export type EntityWritePayload<E> = { entity: E; translations?: PendingTranslation[] };
```

All migrated callers build `{ entity: <existingPayload> }` (+ `translations`
where the pending queue applies — today only config_entry create; update
callers may also `takePendingTranslations()` if the pending queue is ever
populated on edit pages — check `pending-translations.svelte.ts` consumers;
default: send `entity` only).

### Docs

- `primebrick-be-v3/AGENTS.md` + `.devin/rules/api-path-conventions.md`:
  document the write-payload standard (envelope, permissions, tx pattern,
  bulk ops exempt + why, translation-entity exception).
- FE `.devin/rules/` + `docs/ai/` i18n doc: `EntityWritePayload` convention.
- `docs/user-guide/` MDX where entity API is documented.
- Update `be-endpoint-anatomy-taxonomy-standard.md` §standard to reference
  this payload rule.

## Out of scope (explicit)

- Bulk ops (`bulk-update`, `bulk-delete`, `bulk-restore`, `duplicate`) —
  already transactional (streams + temp tables), `{uuids}`/`{updates}` stay.
- Delete/restore GET-verb-like ops — no entity body.
- `POST /auth/users` — auth RPC, not entity path.
- MCP tool arg shapes (flat stays; dispatch wraps for US proxying).
- `GET` endpoints — read path unchanged.

## Verify

- BE `tsc` clean; per-router: flat body → 400 `unrecognized_keys`;
  `{entity:{...valid}}` → 200/201; `{entity, translations}` without
  TRANSLATIONS_MANAGE → 403; forced mid-tx failure → no orphan rows.
- Zod parity: for one entity, feed every previously-invalid body inside
  `entity` → same issue codes/messages (paths gain `entity.` prefix —
  acceptable, document).
- US: provider create flat → 400; `{entity:{...}}` → 200.
- FE: `pnpm check`; live smoke: org create, user update, role create,
  config update, provider create (US path), translation admin create.
- MCP: create via tool toward US entity still works (dispatch wraps).
