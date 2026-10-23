# DAL Audit Entity Capability Mixins — "cura dimagrante" entity

> Segnalazione utente 2026-10-18: audit/deletable fields ripetuti a mano in
> ogni entity — campi e column-meta definiti **una tantum**, capability
> **componibili** (auditable ≠ deletable), breaking changes permessi.
> **Design approvato: Opzione A — mixin factories + `EntityBase` radice.**

## Status: 🟢 DONE — Plan date: 2026-10-18

| # | Task | Status | When | Notes |
|---|------|--------|------|-------|
| D1 | Split gerarchia: `IAuditableEntity` smette di estendere `IDeletableEntity` (capability ortogonali) | ✅ | 2026-10-18 | types/entities.ts |
| D2 | `entity-base.ts`: `EntityBase` + mixin `Auditable()` / `Deletable()` | ✅ | 2026-10-18 | collectMetaChain merge ctor chain — invariato |
| D3 | Refactor `ConfigEntityBase`/`TranslationEntityBase` sui mixin | ✅ | 2026-10-18 | blocchi duplicati rimossi |
| D4 | Migrazione BE: 12 entity + config_entry→ConfigEntityBase | ✅ | 2026-10-18 | client_shield migrata (aveva colonne @Column manuali — ora managed); BE config_entry → ConfigEntityBase (shape identico, @AuditTrail ereditato) |
| D5 | Migrazione US: 15 entity | ✅ | 2026-10-18 | ai/emailsender/webhook/job-handler; config_entry US NON su ConfigEntityBase — no @AuditTrail e no reserved defaultSql per design |
| D6 | Doc: dal getting-started/entities/audit-trail/clone + ai/* + be architecture.mdx | ✅ | 2026-10-18 | sync site automatico via drift action |
| D7 | Test + schema pipeline | ✅ | 2026-10-18 | meta-equivalence test 4/4; **fix estrattore statico**: getPropertiesOfType + valueDeclaration copre mixin anonimi (PropertySignature in .d.ts) — `db:check` clean su BE + 4 servizi |
| D8 | Release: dal minor (breaking) + be + us | ✅ | 2026-10-18 | dal `3.1.0` (tag+npm via OIDC), be `v3.1.0`, us `3.1.0` — tutte su main, merged back su develop |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped. -->

---

## Censimento empirico (verificato)

### Il bug di gerarchia

`types/entities.ts:13`: `IAuditableEntity extends IDeletableEntity` — dichiara
che ogni entity auditabile ha `deleted_at/deleted_by`. **Falso** per 13 entity
audit-only (campi `?` → TS non si lamenta, bugia silenziosa). `dal.ts` non si
fida: `delete<T extends IAuditableEntity & IDeletableEntity>` — il `&`
esplicito rende l'extends ridondante E ingannevole. Runtime guard esiste già
(`repository.ts:1815` throw su non-deletable).

### Le 4 famiglie reali

| Famiglia | BE | US |
|---|---|---|
| **Audit + soft-delete** (5+2) | customer, organization, user_profile, config_entry (4) | ai_cerebellum, ai_model, config_entry×3, docs_ingest_log, provider, job_rule (9) |
| **Audit-only / hard-delete** (5+0) | api_key, role_mapping, mfa_action_authorization, user_invitation, user_mfa_factor, user_passkey, service_registry (7) | ai_conversation, ai_feedback, ai_message, email_template, job_run, job_schedule (6) |
| **Plain** (0+0) | auth_event (È la tabella audit — `@AuditTrailEntity`), client_shield_registry (2) | ai_telemetry, docs_kb, sender_log (3) |
| **`@AuditTrail()` assente** | api_key, auth_event, client_shield_registry, service_registry | tutti i config_entry + email_template + job_* + provider — opt-in per design, NON toccare |

**~26 entity** duplicano 5-7 righe di `@AuditableField`/`@DeletableField` —
identiche. Le 4 `config_entry` US non estendono nemmeno `ConfigEntityBase`
(base esisteva, mai adottata — caso per-caso in migrazione).

### Meccanica verificata (fattibilità)

- `META = WeakMap<Function, ClassEntityMeta>` keyed per **constructor**
  (`entity-decorators.ts:192`).
- `collectMetaChain(ctor)` (riga 227) cammina `Object.getPrototypeOf(ctor)`
  — ogni **classe anonima mixin** è un ctor nella chain con il suo META →
  merged parent-first, subclass vince. **Zero cambi al decorator system.**
- `discoverInstancePropertyKeys(new ctor())` + `useDefineForClassFields:true`
  → i campi mixin esistono come own-props dell'istanza → implicit-column
  discovery coperto comunque.
- `ConfigEntityBase`/`TranslationEntityBase` dimostrano che campi su base
  astratta ereditano (prova in produzione).

## Design — Opzione A (approvata)

### D1 — types/entities.ts

```ts
export interface IDeletableEntity {
  deleted_at?: Date;
  deleted_by?: string;
}

// NON estende più IDeletableEntity — auditable ≠ deletable
export interface IAuditableEntity {
  created_at: Date; created_by: string;
  updated_at: Date; updated_by: string; version: number;
}
// IExposableEntity / IClonableEntity invariati (pure capability contracts)
```

`IFullAuditedEntity` **scartata** — capability ortogonali, si compongono con
`&` dove serve (dal.ts già lo fa).

### D2 — src/entities/entity-base.ts (nuovo)

```ts
type EntityCtor = abstract new (...args: any[]) => object;

/** Composizione: radice vuota. `class E extends Auditable(EntityBase)`. */
export abstract class EntityBase {}

/** Audit stamps + optimistic-lock version. Hard-delete entities stop qui. */
export function Auditable<TBase extends EntityCtor>(Base: TBase) {
  abstract class AuditableEntity extends Base implements IAuditableEntity {
    @AuditableField(AuditableFieldType.CREATED_AT) created_at!: Date;
    @AuditableField(CREATED_BY)  created_by!: string;
    @AuditableField(UPDATED_AT)  updated_at!: Date;
    @AuditableField(UPDATED_BY)  updated_by!: string;
    @AuditableField(VERSION)     version!: number;
  }
  return AuditableEntity;
}

/** Soft-delete markers — compone con Auditable o da solo. */
export function Deletable<TBase extends EntityCtor>(Base: TBase) {
  abstract class DeletableEntity extends Base implements IDeletableEntity {
    @DeletableField(DELETED_AT) deleted_at?: Date;
    @DeletableField(DELETED_BY) deleted_by?: string;
  }
  return DeletableEntity;
}
```

Ogni mixin class è un ctor nella prototype chain → il suo META viene
raccolto. `abstract` interno = non istanziabile da solo.

### D3 — basi esistenti

`ConfigEntityBase`/`TranslationEntityBase` → `extends Deletable(Auditable(EntityBase))`
+ rimuovere il loro blocco audit/deletable duplicato (restano i campi domain).

### D4/D5 — migrazione entity (BE 11 + US 15)

```ts
// audit+deletable
@Entity("customers") @AuditTrail()
export class CustomerEntity
    extends Deletable(Auditable(EntityBase))
    implements IExposableEntity, IClonableEntity {
  // domain columns only — uuid/id restano (non uniformi: uuid:1-3, alcuni
  // entity hanno @Unique su campi diversi → fuori scope)
}

// audit-only
@Entity("api_keys")
export class ApiKeyEntity extends Auditable(EntityBase) { ... }
```

Per le `config_entry` US: valutare `extends ConfigEntityBase` (base dedicata
già esistente) **solo se** il field set matcha esattamente — altrimenti
mixin puri. Stesso criterio BE `config_entry`.

`implements IAuditableEntity` sulle concrete: **rimosso** — il mixin lo
dichiara; doppio implements è rumore. Capability extra (`IExposableEntity`,
`IClonableEntity`) restano implements sulla concreta (sono pure type
contracts senza campi decorati uniformi — uuid/cloned_from variano).

### D6 — doc

`dal/dev-guide/getting-started.mdx` + pagine entity/conventions con esempi
vecchi → pattern mixin. Il sync al sito è automatico (drift action).

## Acceptance criteria

- [ ] `IAuditableEntity` non include `deleted_at/deleted_by`
- [ ] ZERO `@AuditableField`/`@DeletableField` manuali nelle entity migrate
- [ ] `dal.delete(apiKey)` — il tipo non mente; runtime guard esistente resta
- [ ] Meta-equivalence: `getEntityPersistenceMeta` produce colonne identiche
      prima/dopo per un'entity migrata (test dedicato)
- [ ] `ConfigEntityBase`/`TranslationEntityBase` senza blocco audit
- [ ] dal getting-started mostra `extends Deletable(Auditable(EntityBase))`
- [ ] dal/be/us typecheck + test verdi

## Rischi

- Mixin factories + `emitDecoratorMetadata`: `design:type` sui campi anonimi
  funziona (decoratori valutati a class-definition). Verificare via test.
- `@Entity`/`@AuditTrail` restano sulla concreta — mai sulle basi.
- Entity con `@Unique` su campi non-uuid (role_mapping uuid:3) → id/uuid NON
  uniformi: EntityBase resta vuota, nessun key mixin in questa iterazione.
