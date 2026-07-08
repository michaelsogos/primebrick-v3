# Plan: Native BigInt Adoption — Remove `::text` Cast, JSON-Bigint Wire Format

**Version:** 0.1.0
**Status:** DRAFT — awaiting user approval (PROCEED keyword).
**Date:** 2026-07-08
**Scope:** `primebrick-dal-v3`, `primebrick-v3-sdk` (BE/US/DAL only), `primebrick-be-v3`, `primebrick-fe-v3`

> **Architettura:** `@primebrick/sdk` è una lib **BE/US/DAL only** — non è mai consumata dal FE. Se in futuro servirà un SDK per FE, sarà una lib separata con nome specifico (es. `@primebrick/fe-sdk`). Il FE installa `json-bigint` direttamente e implementa il suo wrapper.

---

## 1. Objective

Eliminare il cast `COUNT(*)::text` (e qualsiasi `::text` su colonne bigint) da tutto il codice Primebrick, adottando `bigint` nativo JavaScript in modo end-to-end, dalla colonna PostgreSQL al tipo TypeScript, attraverso il wire JSON.

**Cosa cambia:**
- PostgreSQL `bigint` (OID 20) → JS `bigint` nativo (già gestito dal type parser di DAL-pg)
- Rimozione del cast `::text` da `count()` e `findByPage()` in DAL-pg
- Tipi TypeScript entity: `id: number` → `id: bigint`
- Serializzazione JSON: `json-bigint` library per preservare `bigint` attraverso il wire
- FE: parse JSON con `json-bigint` per ricevere `bigint` nativo

**Perché:**
1. Il cast `::text` bypassa il type parser INT8→bigint che abbiamo già registrato in DAL-pg
2. `Number()` perde precisione sopra 2^53 (anche se improbabile per `id`, è principialmente sbagliato)
3. Il tipo TS `number` mente — il valore PG è `bigint`, il runtime è `string` (per via del cast), il TS dice `number`
4. Inconsistenza: entity columns usano il type parser, COUNT no

---

## 2. Analisi empirica — stato attuale

### 2.1 Chi usa `::text` cast oggi?

| File | Metodo | SQL | Note |
|------|--------|-----|------|
| `primebrick-dal-v3/src/repository/repository.ts:301` | `count()` | `SELECT COUNT(*)::text AS n` | Cast inutile — bypassa type parser |
| `primebrick-dal-v3/src/repository/repository.ts:288-289` | `findByPage()` | `COUNT(*) OVER() AS _total_records` | **Niente cast** — ma il codice fa `Number(totalRaw)` assumendo string |
| `primebrick-be-v3/src/db/repository/repository.ts:37` | `count()` | `SELECT COUNT(*)::text AS n` | Stesso pattern del DAL-pg |

### 2.2 Chi usa `repo.count()` in BE?

| File | Metodo | Uso |
|------|--------|-----|
| `primebrick-be-v3/src/modules/customers/customers_dal.ts:217` | `seedIfEmpty()` | `if (count > 0) return;` — skip seed se tabella non vuota |

**Solo 1 sito.** Tutti gli altri "count" usano `pool.query()` raw SQL (audit count, user count per org).

### 2.3 Chi usa `total_records` in BE?

`findByPage()` in tutte le entity DALs — ritorna `PaginatedEntity<TEntity>` con `total_records: number`.

### 2.4 Come gestisce il FE `id` e `total`?

| Tipo FE | Campo | Tipo attuale | Note |
|---------|-------|--------------|------|
| `CustomerListRow` | (nessun `id`) | — | Il FE usa solo `uuid`, mai `id` (PK) |
| `OrganizationListRow` | (nessun `id`) | — | Stesso |
| `UserProfileListRow` | (nessun `id`) | — | Stesso |
| `ListResponse` | `total: number` | number | Paginazione |
| `UserProfile` | `version: number` | number | Audit field |
| Audit UI | `auditInfo.version` | number | Display versione |
| Audit UI | `auditInfo.uuid` | string | Display UUID (non id) |

**Il FE non usa mai `id` (PK bigint) delle entity.** Usa `uuid` (string). L'`id` compare solo nei tipi audit dove il BE già fa `row.id.toString()`.

### 2.5 Cosa serializza il BE oggi?

Il BE usa `res.json(data)` di Express, che chiama `JSON.stringify(data)`. Oggi:
- `id` arriva come string (pg default per INT8 senza parser) → `JSON.stringify` funziona → FE riceve `"42"`
- `total_records` arriva come string (per via del cast `::text`) → `Number()` converte → `JSON.stringify(42)` → FE riceve `42`
- `version` è `integer` (INT4, OID 23) → pg restituisce `number` → `JSON.stringify(42)` → FE riceve `42`

### 2.6 Cosa cambia con il type parser INT8→bigint?

Con `ensureTypeParsers()` di DAL-pg registrato:
- `id` (bigint) → arriva come `bigint` → `JSON.stringify(42n)` **THROWA** `TypeError: Do not know how to serialize a BigInt`
- `COUNT(*)` (bigint) → arriva come `bigint` → stesso problema
- `version` (integer/INT4) → arriva come `number` → **nessun problema**

**Il problema è solo su `bigint` (INT8), non su `integer` (INT4).**

---

## 3. Strategia — `json-bigint` library

### 3.1 Perché `json-bigint` e non `BigInt.prototype.toJSON` + suffisso `n`

| Criterio | `json-bigint` | `toJSON` + suffisso `n` |
|----------|---------------|--------------------------|
| Wire format | JSON standard (`"id": 42`) | Non-standard (`"id": "42n"`) |
| Tooling compat (Postman, curl) | Sì | No (vede stringhe strane) |
| Punti di fallimento | Centralizzati (middleware/wrapper) | Distribuiti (ogni parse deve avere reviver) |
| NATS compatibility | `JSONbig.stringify`/`parse` | Reviver custom ovunque |
| Dipendenza esterna | Sì (`json-bigint`, 13M+ downloads/week) | No |
| Performance | `parse` più lento di nativo | `JSON.parse` nativo + reviver |
| Mutazione prototype | No | Sì (`BigInt.prototype.toJSON`) |
| Standard JSON | Sì | No |

**Verdetto:** `json-bigint` è la scelta corretta. Il wire format è JSON standard, i punti di fallimento sono centralizzati, e la lib è consolidata (usata da AWS SDK, Google API).

### 3.2 Architettura

```
PostgreSQL bigint (OID 20)
    ↓ pg wire protocol (string "42")
    ↓ ensureTypeParsers() → BigInt("42") → 42n
    ↓
TypeScript entity: id: bigint
    ↓
BE res.json(data)
    ↓ json-bigint middleware → JSONbig.stringify(data)
    ↓
Wire: {"id": 42, "uuid": "abc-123", "total": 100}
    ↓ HTTP response body (JSON standard con numeri veri)
    ↓
FE apiFetch() → response.text() → JSONbig.parse(text)
    ↓
TypeScript FE: id: bigint
```

### 3.3 Dove mettere le utility — SDK per BE/US, FE standalone

`@primebrick/sdk` è una lib **BE/US/DAL only**. Non è mai consumata dal FE (è una regola architetturale del workspace). Se in futuro servirà un SDK per FE, sarà una lib separata con nome specifico.

**Divisione delle responsibility:**

| Progetto | Cosa fa | Come |
|----------|---------|------|
| `@primebrick/sdk` (BE/US/DAL) | Espone `extJsonMiddleware` (BE), `NatsClient.publish/subscribe/subscribeRequest` con extJson automatico (US), `extJsonStringify`/`extJsonParse` per uso diretto | Installa `json-bigint` come dipendenza, wrappa con API thin |
| `primebrick-be-v3` | Usa `extJsonMiddleware()` da `@primebrick/sdk` | Installa `@primebrick/sdk` (già previsto nel piano principale) |
| `primebrick-us-v3` | Usa `NatsClient.publish()`/`subscribe()`/`subscribeRequest()` da `@primebrick/sdk` — extJson è automatico, il US non lo vede | Installa `@primebrick/sdk` |
| `primebrick-fe-v3` | Implementa il suo wrapper standalone | Installa `json-bigint` direttamente, crea `src/lib/api-ext.ts` proprio |

Il SDK esporta le factory per BE/US. Il FE non dipende dal SDK — ha la sua implementazione thin di `json-bigint` wrapper in `src/lib/api-ext.ts`. Questo rispetta l'architettura: il SDK non ha dipendenze verso il FE, e il FE non ha dipendenze verso il SDK.

---

## 4. Implementazione

### Phase 1 — SDK: bigint JSON utilities per BE/US (`primebrick-v3-sdk`)

> **Nota:** Il SDK è BE/US/DAL only. Nessuna utility FE qui. Il FE avrà la sua implementazione standalone (Phase 4).

#### 4.1.1 Installa `json-bigint`

```bash
cd primebrick-v3-sdk
pnpm add json-bigint
pnpm add -D @types/json-bigint
```

#### 4.1.2 Crea `src/json/ext-json.ts`

```typescript
/**
 * BigInt-safe JSON serialization/deserialization for BE/US.
 *
 * Uses `json-bigint` with `useNativeBigInt: true` + `alwaysParseAsBig: true` to
 * force ALL integers to native bigint (not just large ones). This makes types
 * predictable: every integer is always `bigint`, every float is always `number`.
 * No `number | bigint` ambiguity — the type is always `bigint` for integers.
 *
 * Usage:
 * - BE: Express middleware via `extJsonMiddleware()`
 * - US: NATS message codec via `extJsonStringify()` / `extJsonParse()`
 *
 * NOT for FE — the FE has its own standalone wrapper (src/lib/api-ext.ts).
 */

import JSONBig from "json-bigint";

const jsonBigInstance = JSONBig({ useNativeBigInt: true, alwaysParseAsBig: true, strict: true });

/**
 * Serialize a value to a BigInt-safe JSON string.
 * BigInt values are serialized as JSON numbers (e.g. 42n → "42").
 */
export function extJsonStringify(data: unknown): string {
  return jsonBigInstance.stringify(data);
}

/**
 * Parse a JSON string, converting large numbers to native bigint.
 * Numbers that fit in Number.MAX_SAFE_INTEGER are returned as number;
 * numbers that exceed it are returned as bigint.
 */
export function extJsonParse<T = unknown>(text: string): T {
  return jsonBigInstance.parse(text) as T;
}

/**
 * Express middleware that replaces `res.json()` with BigInt-safe serialization.
 * Install once in the Express app, before any routes.
 *
 * Example:
 *   app.use(extJsonMiddleware());
 *
 * Wire format: standard JSON with numbers (not strings) for bigint values.
 */
export function extJsonMiddleware() {
  return (req: unknown, res: { json: (data: unknown) => void; setHeader: (name: string, value: string) => void; send: (body: string) => void }, next: () => void) => {
    const originalJson = res.json.bind(res);
    res.json = (data: unknown) => {
      const body = extJsonStringify(data);
      res.setHeader("Content-Type", "application/json");
      res.send(body);
    };
    next();
  };
}
```

#### 4.1.3 Esporta da `src/index.ts`

```typescript
// BigInt JSON utilities (BE/US only — NOT for FE)
export {
  extJsonStringify,
  extJsonParse,
  extJsonMiddleware,
} from "./json/ext-json.js";
```

#### 4.1.4 Test

```typescript
// src/json/__tests__/ext-json.test.ts
import { describe, it, expect } from "vitest";
import { extJsonStringify, extJsonParse } from "../ext-json.js";

describe("ext-json", () => {
  it("serializes bigint as JSON number", () => {
    const result = extJsonStringify({ id: 42n, name: "test" });
    expect(result).toBe('{"id":42,"name":"test"}');
  });

  it("parses large number as bigint", () => {
    const result = extJsonParse<{ id: bigint }>('{"id":99999999999999999999}');
    expect(result.id).toBe(99999999999999999999n);
    expect(typeof result.id).toBe("bigint");
  });

  it("parses small integer as bigint (alwaysParseAsBig)", () => {
    const result = extJsonParse<{ count: bigint }>('{"count":42}');
    expect(result.count).toBe(42n);
    expect(typeof result.count).toBe("bigint");
  });

  it("parses float as number (not bigint)", () => {
    const result = extJsonParse<{ price: number }>('{"price":3.14}');
    expect(result.price).toBe(3.14);
    expect(typeof result.price).toBe("number");
  });

  it("round-trips bigint through serialize/parse", () => {
    const original = { id: 1234567890123456789n, name: "test" };
    const json = extJsonStringify(original);
    const parsed = extJsonParse<{ id: bigint; name: string }>(json);
    expect(parsed.id).toBe(original.id);
    expect(typeof parsed.id).toBe("bigint");
  });
});
```

### Phase 2 — DAL-pg: rimuovi `::text` cast, cambia tipi (`primebrick-dal-v3`)

#### 4.2.1 Modifica `count()` — rimuovi cast, ritorna `bigint`

```typescript
// PRIMA:
async count(entity: EntityClass): Promise<number> {
  const table = getQualifiedTableName(entity);
  const r = await this.db.query<{ n: string }>(`SELECT COUNT(*)::text AS n FROM ${table}`, []);
  return Number(r.rows?.[0]?.n ?? 0);
}

// DOPO:
async count(entity: EntityClass): Promise<bigint> {
  const table = getQualifiedTableName(entity);
  const r = await this.db.query<{ n: bigint }>(`SELECT COUNT(*) AS n FROM ${table}`, []);
  return r.rows?.[0]?.n ?? 0n;
}
```

#### 4.2.2 Modifica `findByPage()` — rimuovi cast, cambia `total_records` a `bigint`

```typescript
// PRIMA:
const totalRaw = rows[0]?._total_records ?? 0;
const total_records = typeof totalRaw === "string" ? Number(totalRaw) : Number(totalRaw ?? 0);

// DOPO:
const total_records = rows[0]?._total_records ?? 0n;
```

E il tipo `PaginatedEntity`:

```typescript
// PRIMA:
export type PaginatedEntity<TEntity> = {
  entities: TEntity[];
  total_records: number;
};

// DOPO:
export type PaginatedEntity<TEntity> = {
  entities: TEntity[];
  total_records: bigint;
};
```

#### 4.2.3 Aggiorna `count(entity, options?)` (dal piano principale §4.3)

Se l'enhancement `count(entity, options?)` con filters viene implementato (vedi piano principale), anche quello ritorna `bigint`:

```typescript
async count(entity: EntityClass, options?: CountOptions): Promise<bigint> {
  // ... stessa logica di build della query ...
  const r = await this.db.query<{ n: bigint }>(sql, w.values);
  return r.rows?.[0]?.n ?? 0n;
}
```

#### 4.2.4 Test

```typescript
describe("count() returns bigint", () => {
  it("returns bigint, not number", async () => {
    const result = await repo.count(CustomerEntity);
    expect(typeof result).toBe("bigint");
    expect(result).toBe(BigInt(expectedCount));
  });

  it("returns 0n for empty table", async () => {
    await repo.hardDelete(...); // svuota
    const result = await repo.count(CustomerEntity);
    expect(result).toBe(0n);
  });
});

describe("findByPage() total_records is bigint", () => {
  it("returns total_records as bigint", async () => {
    const result = await repo.findByPage(CustomerEntity, 1, 10);
    expect(typeof result.total_records).toBe("bigint");
  });
});
```

### Phase 3 — BE: adotta `extJsonMiddleware` + aggiorna tipi (`primebrick-be-v3`)

#### 4.3.1 Installa `json-bigint` + `@primebrick/sdk`

```bash
cd primebrick-be-v3
pnpm add json-bigint
pnpm add -D @types/json-bigint
pnpm add @primebrick/sdk@workspace:@primebrick/sdk
```

#### 4.3.2 Installa il middleware in Express

```typescript
// src/index.ts (o src/app.ts dove viene creato l'app Express)
import { extJsonMiddleware } from "@primebrick/sdk";

const app = express();
app.use(express.json()); // body parser per request
app.use(extJsonMiddleware()); // BigInt-safe response serialization
```

**Importante:** `extJsonMiddleware()` deve essere installato **dopo** `express.json()` (body parser) e **prima** delle routes. Il body parser del request non è affected (i request body non contengono bigint — sono stringhe/number dal FE).

#### 4.3.3 Aggiorna `seedIfEmpty()` in `CustomersDal`

```typescript
// PRIMA:
const count = await this.repo.count(CustomerEntity);
if (count > 0) return;

// DOPO:
const count = await this.repo.count(CustomerEntity);
if (count > 0n) return;
```

#### 4.3.4 Aggiorna tipi entity — `id: number` → `id: bigint`

Per ogni entity con PK `bigint`:

```typescript
// CustomerEntity
@Key()
id: bigint;  // era: number

// OrganizationEntity
@Key()
id: bigint;  // era: number

// UserProfileEntity
@Key()
id: bigint;  // era: number

// RoleMappingEntity
@Key()
id: bigint;  // era: string (era già sbagliato — bigint PK tipizzato come string)
```

#### 4.3.5 Aggiorna `AuditService.writeAudit()` — `entityId` a `bigint`

```typescript
// PRIMA:
async writeAudit<T extends object>(
  entityClass: EntityClass,
  entityId: number,  // era number, ma riceveva string da pg
  ...
)

// DOPO:
async writeAudit<T extends object>(
  entityClass: EntityClass,
  entityId: bigint,  // ora riceve bigint dal type parser
  ...
)
```

#### 4.3.6 Aggiorna `findByPage` callers — `total_records` a `bigint`

Tutti i DAL che usano `findByPage` e ritornano `total` al router:

```typescript
// PRIMA:
return { entities, total_records: result.total_records };

// DOPO (total_records è bigint, il middleware lo serializza correttamente):
return { entities, total_records: result.total_records };
// Nessun cambiamento — il middleware gestisce la serializzazione
```

**Ma** se il BE fa aritmetica con `total_records` (es. `hasMore: offset + limit < total`), bisogna gestire il mixed-type:

```typescript
// PRIMA:
hasMore: offset + limit < total  // number + number < number

// DOPO:
hasMore: BigInt(offset + limit) < total  // bigint comparison
// oppure:
hasMore: offset + limit < Number(total)  // ok se total < 2^53
```

**Raccomandazione:** Usare `Number(total)` per i confronti di paginazione — `total` non supererà mai 2^53 in un'app reale. Per coerenza, possiamo anche cambiare il tipo del campo `total` nella risposta API a `bigint` e lasciare che il FE lo gestisca.

#### 4.3.7 Aggiorna audit query helpers — `row.id.toString()`

I siti audit che già fanno `row.id.toString()` (R14, R16, R22 nel piano principale) continuano a funzionare — `bigint.toString()` restituisce la stringa del numero senza suffisso `n`:

```typescript
// Già corretto — bigint.toString() restituisce "42", non "42n"
id: row.id.toString()
```

### Phase 4 — FE: wrapper standalone con `json-bigint` (`primebrick-fe-v3`)

> **Architettura:** Il FE **non** dipende da `@primebrick/sdk`. Il SDK è BE/US/DAL only. Il FE installa `json-bigint` direttamente e implementa il suo wrapper in `src/lib/api-ext.ts`.

#### 4.4.1 Installa `json-bigint` (standalone, senza SDK)

```bash
cd primebrick-fe-v3
pnpm add json-bigint
pnpm add -D @types/json-bigint
```

#### 4.4.2 Crea `src/lib/api-ext.ts` — wrapper FE standalone

```typescript
/**
 * Ext-JSON parsing for the Primebrick frontend.
 *
 * The BE serializes responses with `json-bigint` (via @primebrick/sdk middleware),
 * producing standard JSON where bigint values are JSON numbers. This wrapper
 * parses those responses with `json-bigint` using `alwaysParseAsBig: true` —
 * ALL integers are forced to native `bigint`, making types predictable.
 * No `number | bigint` ambiguity: every integer is always `bigint`.
 *
 * This is a FE standalone implementation — it does NOT depend on @primebrick/sdk
 * (which is BE/US/DAL only). It installs `json-bigint` directly.
 */

import JSONBig from "json-bigint";
import { apiFetch } from "./api";

const jsonBigInstance = JSONBig({ useNativeBigInt: true, alwaysParseAsBig: true, strict: true });

/**
 * Parse a JSON string with BigInt support.
 * Large numbers (> MAX_SAFE_INTEGER) are returned as native bigint.
 */
export function extJsonParse<T = unknown>(text: string): T {
  return jsonBigInstance.parse(text) as T;
}

/**
 * Fetch a resource and parse the response as JSON with BigInt support.
 * Use this instead of `apiFetch().then(r => r.json())` for any endpoint
 * that may return bigint values (entity IDs, counts, total_records).
 */
export async function apiFetchExt<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const response = await apiFetch(input, init);
  const text = await response.text();
  if (!text) return undefined as T; // 204 No Content or empty body
  return extJsonParse<T>(text);
}

/**
 * Fetch a resource and return both the response (for status/headers) and parsed body.
 * Use when you need to check response status AND parse the body.
 */
export async function apiFetchExtWithResponse<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ response: Response; data: T }> {
  const response = await apiFetch(input, init);
  const text = await response.text();
  const data = text ? extJsonParse<T>(text) : (undefined as T);
  return { response, data };
}
```

#### 4.4.3 Aggiorna i tipi FE — `total: number` → `total: bigint`, `version` resta `number`

```typescript
// PRIMA:
type ListResponse = {
  rows: CustomerListRow[];
  page: number;
  page_size: number;
  total: number;  // era number
};

// DOPO:
type ListResponse = {
  rows: CustomerListRow[];
  page: number;
  page_size: number;
  total: bigint;  // ora bigint
};
```

**`version` resta `number`** — è `integer` (INT4) in PG, non `bigint`. Il type parser INT8 non lo affecta.

**`id` nelle entity FE** — il FE non usa `id` (PK) nelle entity list row types. Usa solo `uuid`. Quindi **nessun cambiamento** ai tipi list row. Se in futuro il FE usa `id`, sarà `bigint`.

#### 4.4.4 Aggiorna i call sites — `res.json()` → `apiFetchExt()`

Per ogni endpoint che ritorna dati con `total` o `id`:

```typescript
// PRIMA:
const res = await apiFetchWithTimeout(`/api/v1/entities/customer/list?${params}`);
const data = await res.json() as ListResponse;

// DOPO (usando il wrapper standalone FE):
import { apiFetchExtWithResponse } from "$lib/api-ext";
const { data } = await apiFetchExtWithResponse<ListResponse>(`/api/v1/entities/customer/list?${params}`);
```

**Approccio più pulito:** Aggiornare `apiFetchWithTimeout` per usare `extJsonParse` (importato da `$lib/api-ext`) internamente, così tutti i call sites esistenti non hanno bisogno di modifiche:

```typescript
// src/lib/api.ts — modifica apiFetchWithTimeout per usare bigint parse
import { extJsonParse } from "./api-ext";

// Aggiungi un metodo .jsonExt() al response wrapper
// oppure cambia tutti i .json() in .text() + extJsonParse()
```

**Decisione:** Modificare `apiFetch` per esporre un metodo `.jsonExt()` sulla response, lasciando `.json()` intatto per compatibilità. I call sites vengono migrati gradualmente.

#### 4.4.5 Aggiorna UI components — paginazione con `bigint`

```typescript
// PRIMA:
let total = $state(0);
// ...
total = data.total;

// DOPO:
let total = $state(0n);
// ...
total = data.total;
// Per display: Number(total) o total.toString()
```

Nei componenti che mostrano `total` (es. "Showing 1-25 of 100"):

```svelte
<!-- PRIMA: -->
<span>of {total}</span>

<!-- DOPO: -->
<span>of {Number(total)}</span>
<!-- oppure: -->
<span>of {total.toString()}</span>
```

### Phase 5 — SDK: NATS publish/subscribe con extJson automatico (`primebrick-v3-sdk` + `primebrick-us-v3`)

> **Principio:** Il US **non deve mai** chiamare `extJsonStringify`/`extJsonParse` manualmente. Il SDK espone `publish(subject, data)` e `subscribe(subject, handler)` che gestiscono automaticamente encode/decode + extJson. Il US passa solo oggetti TS e riceve solo oggetti TS.

#### 5.1 Analisi — stato attuale del US

Oggi il US (`emailsender/src/nats/handlers.ts`) fa manualmente:

```typescript
// Serializzazione (publish)
await nc.publish(
  `${EMAIL_RESPONSE_SUBJECT}.${request.requestId}`,
  new TextEncoder().encode(JSON.stringify(response))
);

// Deserializzazione (subscribe)
const request: SendEmailRequest = JSON.parse(new TextDecoder().decode(msg.data));
```

**Problemi attuali:**
1. `JSON.stringify`/`JSON.parse` nativi — throwa su bigint
2. `TextEncoder`/`TextDecoder` manuale — verboso, ripetuto in ogni handler
3. `entityId?: number` e `logId?: number` in `types.ts` — bug latente, sono bigint in PG
4. Nessuna gestione errori di parse centralizzata — ogni handler fa try/catch proprio

#### 5.2 Implementazione SDK — `NatsClient.publish()` e `NatsClient.subscribe()`

Il SDK estende `NatsClient` con metodi `publish()` e `subscribe()` che wrappano automaticamente extJson:

```typescript
// primebrick-v3-sdk/src/nats/nats-client.ts (extended)

import { connect, type NatsConnection, type JetStreamClient, type Subscription, type Msg } from "nats";
import { extJsonStringify, extJsonParse } from "../json/ext-json.js";

export class NatsClient {
  private static nc: NatsConnection | null = null;
  private static js: JetStreamClient | null = null;

  // ... getConnection(), getJetStream(), close() esistenti ...

  /**
   * Publish a message with automatic extJson serialization.
   * The data object is serialized with extJsonStringify (BigInt-safe)
   * and encoded as UTF-8 before publishing.
   *
   * @param subject - NATS subject (e.g. "emailsender.send", "customer.created")
   * @param data - Any serializable object (bigint values are preserved)
   *
   * Example:
   *   await NatsClient.publish("customer.created", { entity_id: 42n, action: "CREATED" });
   */
  static async publish(subject: string, data: unknown): Promise<void> {
    const nc = await NatsClient.getConnection();
    const payload = new TextEncoder().encode(extJsonStringify(data));
    nc.publish(subject, payload);
  }

  /**
   * Subscribe to a NATS subject with automatic extJson deserialization.
   * Each incoming message is decoded from UTF-8 and parsed with extJsonParse
   * (BigInt-safe). The handler receives a typed object — no manual decode/parse.
   *
   * @param subject - NATS subject to subscribe to
   * @param handler - Async function receiving the parsed message data
   * @returns The NATS Subscription (can be unsubscribed or iterated)
   *
   * Example:
   *   await NatsClient.subscribe<SendEmailRequest>(
   *     "emailsender.send",
   *     async (request) => {
   *       console.log(`Received: ${request.requestId}`);
   *       // request.entity_id è bigint se presente
   *     }
   *   );
   */
  static async subscribe<T = unknown>(
    subject: string,
    handler: (data: T, raw: Msg) => Promise<void>
  ): Promise<Subscription> {
    const nc = await NatsClient.getConnection();
    const sub = nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const text = new TextDecoder().decode(msg.data);
          const data = extJsonParse<T>(text);
          await handler(data, msg);
        } catch (error) {
          console.error(`[NATS] Error processing message on "${subject}":`, error);
        }
      }
    })();

    return sub;
  }

  /**
   * Subscribe to a NATS subject with request-reply pattern.
   * The handler receives the parsed request and returns a response that is
   * automatically serialized with extJsonStringify and published back.
   *
   * @param subject - NATS subject to subscribe to
   * @param handler - Async function receiving parsed request, returning response
   *
   * Example:
   *   await NatsClient.subscribeRequest<SendEmailRequest, SendEmailResponse>(
   *     "emailsender.send",
   *     async (request) => {
   *       return { requestId: request.requestId, success: true };
   *     }
   *   );
   */
  static async subscribeRequest<TRequest = unknown, TResponse = unknown>(
    subject: string,
    handler: (request: TRequest, raw: Msg) => Promise<TResponse>
  ): Promise<Subscription> {
    const nc = await NatsClient.getConnection();
    const sub = nc.subscribe(subject);

    (async () => {
      for await (const msg of sub) {
        try {
          const text = new TextDecoder().decode(msg.data);
          const request = extJsonParse<TRequest>(text);
          const response = await handler(request, msg);
          if (msg.reply) {
            const payload = new TextEncoder().encode(extJsonStringify(response));
            nc.publish(msg.reply, payload);
          }
        } catch (error) {
          console.error(`[NATS] Error processing request on "${subject}":`, error);
          // Send error response if reply-to is set
          if (msg.reply) {
            const errorResponse = { success: false, error: error instanceof Error ? error.message : "Unknown error" };
            const payload = new TextEncoder().encode(extJsonStringify(errorResponse));
            nc.publish(msg.reply, payload);
          }
        }
      }
    })();

    return sub;
  }
}
```

#### 5.3 Export dal SDK

```typescript
// src/index.ts
export { NatsClient } from "./nats/nats-client.js";
// extJson* sono esportati separatamente per chi vuole usarli direttamente,
// ma NatsClient.publish/subscribe li usa internamente — il US non li vede.
export { extJsonStringify, extJsonParse, extJsonMiddleware } from "./json/ext-json.js";
```

#### 5.4 Migrazione US — `emailsender/src/nats/handlers.ts`

```typescript
// PRIMA (manuale, verboso, non bigint-safe):
import type { Msg } from "nats";
import { NatsClient } from "@primebrick/sdk";

export async function subscribeToEmailSendRequests(
  handleSendEmail: (request: SendEmailRequest) => Promise<SendEmailResponse>
): Promise<void> {
  const nc = await NatsClient.getConnection();
  const sub = nc.subscribe(EMAIL_SEND_SUBJECT);

  for await (const msg of sub) {
    try {
      const request: SendEmailRequest = JSON.parse(new TextDecoder().decode(msg.data));
      const response = await handleSendEmail(request);
      await nc.publish(
        `${EMAIL_RESPONSE_SUBJECT}.${request.requestId}`,
        new TextEncoder().encode(JSON.stringify(response))
      );
    } catch (error) {
      // ... 15 righe di error handling manuale ...
    }
  }
}

// DOPO (delegato al SDK, bigint-safe, 3 righe):
import { NatsClient } from "@primebrick/sdk";

export async function subscribeToEmailSendRequests(
  handleSendEmail: (request: SendEmailRequest) => Promise<SendEmailResponse>
): Promise<void> {
  await NatsClient.subscribeRequest<SendEmailRequest, SendEmailResponse>(
    EMAIL_SEND_SUBJECT,
    async (request) => {
      console.log(`Received email send request: ${request.requestId}`);
      const response = await handleSendEmail(request);
      console.log(`Processed: ${request.requestId} - ${response.success ? 'SUCCESS' : 'FAILED'}`);
      return response;
    }
  );
}
```

**Riduzione:** da ~50 righe a ~10 righe per handler. Tutta la logica di encode/decode/parse/error-handling è nel SDK.

#### 5.5 Migrazione US — `publishEmailResponse()`

```typescript
// PRIMA:
export async function publishEmailResponse(requestId: string, response: SendEmailResponse): Promise<void> {
  const nc = await NatsClient.getConnection();
  await nc.publish(
    `${EMAIL_RESPONSE_SUBJECT}.${requestId}`,
    new TextEncoder().encode(JSON.stringify(response))
  );
}

// DOPO:
export async function publishEmailResponse(requestId: string, response: SendEmailResponse): Promise<void> {
  await NatsClient.publish(`${EMAIL_RESPONSE_SUBJECT}.${requestId}`, response);
}
```

#### 5.6 Aggiornamento tipi US — `entityId` e `logId` a `bigint`

```typescript
// primebrick-us-v3/emailsender/src/nats/types.ts
export interface SendEmailRequest {
  requestId: string;
  templateCode: string;
  languageIso: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  variables?: Record<string, unknown>;
  entityTable?: string;
  entityId?: bigint;   // era: number — bug latente, è bigint in PG
  entityUuid?: string;
}

export interface SendEmailResponse {
  requestId: string;
  success: boolean;
  providerMessageId?: string;
  error?: string;
  logId?: bigint;      // era: number — bug latente, è bigint in PG
}
```

#### 5.7 Architettura — cosa sa il US

```
US code                    SDK (nascosto al US)
─────                     ─────────────────────
NatsClient.publish(       → extJsonStringify(data)
  "customer.created",    → new TextEncoder().encode(...)
  { entity_id: 42n }     → nc.publish(subject, payload)
)

NatsClient.subscribe(     → nc.subscribe(subject)
  "customer.created",    → for await (msg of sub)
  async (data) => {       →   text = new TextDecoder().decode(msg.data)
    // data.entity_id     →   data = extJsonParse<T>(text)
    // è bigint ✓         →   handler(data, msg)
  }                       → catch → log error
)
```

**Il US non sa nulla di:**
- `extJsonStringify` / `extJsonParse`
- `TextEncoder` / `TextDecoder`
- `json-bigint`
- `JSON.stringify` / `JSON.parse`

**Il US sa solo:**
- `NatsClient.publish(subject, data)` — passa un oggetto, il SDK fa il resto
- `NatsClient.subscribe<T>(subject, handler)` — riceve un oggetto tipizzato
- `NatsClient.subscribeRequest<Req, Res>(subject, handler)` — request-reply pattern

#### 5.8 Test SDK — NATS publish/subscribe con extJson

```typescript
// primebrick-v3-sdk/src/nats/__tests__/nats-client-extjson.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("nats", () => {
  const publishedMessages: { subject: string; data: Uint8Array }[] = [];
  const publish = vi.fn((subject: string, data: Uint8Array) => {
    publishedMessages.push({ subject, data });
  });
  const subscribe = vi.fn((subject: string) => ({
    [Symbol.asyncIterator]: () => ({
      next: async () => ({ value: { data: new TextEncoder().encode('{"entity_id":42,"action":"CREATED"}'), reply: "" }, done: false }),
    }),
  }));
  const close = vi.fn(async () => {});
  const jetstream = vi.fn(() => ({}));
  const nc = { publish, subscribe, close, jetstream };
  const connect = vi.fn(async () => nc);
  return { connect, NatsConnection: {}, JetStreamClient: {} };
});

import { NatsClient } from "../nats-client.js";

describe("NatsClient.publish with extJson", () => {
  it("serializes bigint in published payload", async () => {
    await NatsClient.getConnection();
    await NatsClient.publish("test.subject", { entity_id: 42n, action: "CREATED" });
    // Verify the published payload contains "42" (not "42n" or string)
    // ... assertion on publishedMessages[0].data ...
  });
});

describe("NatsClient.subscribe with extJson", () => {
  it("deserializes bigint in received payload", async () => {
    await NatsClient.getConnection();
    await NatsClient.subscribe<{ entity_id: bigint }>("test.subject", async (data) => {
      expect(data.entity_id).toBe(42n);
      expect(typeof data.entity_id).toBe("bigint");
    });
  });
});
```

**Nota:** Il US è **già un consumer attivo di `@primebrick/sdk`** (verificato empiricamente: `emailsender/package.json` ha `"@primebrick/sdk": "workspace:*"`, e il codice importa `NatsClient`, `ServiceRegistryPort`, `ConfigRepositoryPort`, `HealthCheckPort`, `DatabasePort`, `applyPatches`, `GracefulShutdown`, `ServiceRegistrar`). La migrazione a `NatsClient.publish()`/`subscribe()` è quindi immediata — non richiede nuova integrazione SDK, solo l'upgrade del SDK con i nuovi metodi e l'aggiornamento degli handler US.

---

## 5. Files impacted

### `primebrick-v3-sdk` (Phase 1 + Phase 5 — vedi sezione dedicata sotto)

### `primebrick-dal-v3` (Phase 2)
| File | Action |
|------|--------|
| `src/repository/repository.ts` | Remove `::text` from `count()`, change return to `bigint`; update `findByPage()` `total_records` to `bigint` |
| `src/types/types.ts` | Change `PaginatedEntity.total_records` from `number` to `bigint` |
| `test/` | Update tests — `count()` returns `bigint`, `total_records` is `bigint` |

### `primebrick-be-v3` (Phase 3)
| File | Action |
|------|--------|
| `package.json` | Add `json-bigint`, `@types/json-bigint`, `@primebrick/sdk` |
| `src/index.ts` (or app setup) | Install `extJsonMiddleware()` in Express |
| `src/modules/customers/customer_entity.ts` | `id: number` → `id: bigint` |
| `src/modules/auth/organization_entity.ts` | `id: number` → `id: bigint` |
| `src/modules/auth/user_profile_entity.ts` | `id: number` → `id: bigint` |
| `src/modules/auth/role_mapping_entity.ts` | `id: string` → `id: bigint` (fix type bug) |
| `src/modules/customers/customers_dal.ts` | `count > 0` → `count > 0n` in `seedIfEmpty()` |
| `src/lib/audit/audit-service.ts` | `entityId: number` → `entityId: bigint` |
| `src/modules/customers/customers_dal.ts` | Audit query `row.id.toString()` — already works with bigint |
| `src/modules/auth/organizations_dal.ts` | Audit query `row.id.toString()` — already works |
| `src/modules/auth/user-profiles-dal.ts` | Audit query `row.id.toString()` — already works |
| All DAL `findByPage` callers | `total_records` is now `bigint` — update arithmetic if any |

### `primebrick-fe-v3` (Phase 4)
| File | Action |
|------|--------|
| `package.json` | Add `json-bigint` + `@types/json-bigint` (**NO `@primebrick/sdk`** — FE is standalone) |
| `src/lib/api-ext.ts` | New — `extJsonParse`, `apiFetchExt`, `apiFetchExtWithResponse` (standalone, no SDK import) |
| `src/lib/api.ts` | Optionally update `apiFetch` to expose `.jsonExt()` using local `extJsonParse` |
| `src/routes/(app)/customers/+page.svelte` | `total: number` → `total: bigint` in `ListResponse` type |
| `src/routes/(app)/system/settings/users/+page.svelte` | `total: number` → `total: bigint` |
| `src/routes/(app)/system/settings/organizations/+page.svelte` | `total: number` → `total: bigint` |
| `src/lib/components/entity-list-table/types.ts` | `total: number` → `total: bigint` |
| All call sites using `total` | Update display: `{Number(total)}` or `{total.toString()}` |
| All `res.json()` call sites | Replace with `apiFetchExt` or `extJsonParse(await res.text())` |

### `primebrick-v3-sdk` (Phase 1 + Phase 5)
| File | Action |
|------|--------|
| `package.json` | Add `json-bigint` + `@types/json-bigint` |
| `src/json/ext-json.ts` | New — `extJsonStringify`, `extJsonParse`, `extJsonMiddleware` (NO `extFetch` — FE is standalone) |
| `src/json/__tests__/ext-json.test.ts` | New — unit tests |
| `src/index.ts` | Export ext JSON utilities |
| `src/nats/nats-client.ts` | **Extend** — add `publish(subject, data)`, `subscribe<T>(subject, handler)`, `subscribeRequest<Req,Res>(subject, handler)` with automatic extJson encode/decode |
| `src/nats/__tests__/nats-client-extjson.test.ts` | New — tests for publish/subscribe with extJson (bigint round-trip) |
| `test/` | Update existing NatsClient tests for new methods |

### `primebrick-us-v3` (Phase 5 — US già consumer SDK, migrazione immediata)
| File | Action |
|------|--------|
| `emailsender/package.json` | Già ha `"@primebrick/sdk": "workspace:*"` + `nats` — nessun nuovo dep necessario |
| `emailsender/src/nats/handlers.ts` | **Simplify** — replace manual `JSON.parse`/`JSON.stringify`/`TextEncoder`/`TextDecoder` with `NatsClient.publish()` and `NatsClient.subscribeRequest()` |
| `emailsender/src/nats/types.ts` | `entityId?: number` → `entityId?: bigint`, `logId?: number` → `logId?: bigint` (fix latent bug) |
| `emailsender/src/index.ts` | Update `subscribeToEmailSendRequests()` call if signature changes |

---

## 6. Acceptance criteria

### Phase 1 (SDK)
- [ ] `json-bigint` installato in `primebrick-v3-sdk`
- [ ] `extJsonStringify({ id: 42n })` produce `'{"id":42}'` (JSON standard, non stringa)
- [ ] `extJsonParse('{"id":99999999999999999999}')` restituisce `{ id: 99999999999999999999n }` (bigint nativo)
- [ ] `extJsonParse('{"count":42}')` restituisce `{ count: 42n }` (bigint — `alwaysParseAsBig` forza tutti gli interi a bigint)
- [ ] `extJsonParse('{"price":3.14}')` restituisce `{ price: 3.14 }` (number — i float restano number)
- [ ] Round-trip: `parse(stringify({ id: 123n }))` → `{ id: 123n }` (tipo preservato)
- [ ] `extJsonMiddleware()` Express middleware funziona — `res.json({ id: 42n })` produce body `{"id":42}`
- [ ] SDK esporta solo `extJsonStringify`, `extJsonParse`, `extJsonMiddleware` (NO `extFetch` — quello è FE)
- [ ] SDK build passa
- [ ] SDK test passa

### Phase 2 (DAL-pg)
- [ ] `count()` non ha `::text` cast nel SQL
- [ ] `count()` ritorna `bigint`, non `number`
- [ ] `count()` su tabella vuota ritorna `0n`
- [ ] `findByPage()` `total_records` è `bigint`
- [ ] `PaginatedEntity.total_records` tipo è `bigint`
- [ ] Tutti i test DAL-pg esistenti aggiornati e passano

### Phase 3 (BE)
- [ ] `extJsonMiddleware()` installato in Express app
- [ ] `res.json({ id: 42n })` produce response body `{"id":42}` (JSON standard)
- [ ] Tutte le entity hanno `id: bigint` (non `number` o `string`)
- [ ] `seedIfEmpty()` usa `count > 0n`
- [ ] `AuditService.writeAudit` accetta `entityId: bigint`
- [ ] Audit query `row.id.toString()` funziona con bigint (produce "42" non "42n")
- [ ] BE build passa
- [ ] BE dev server si avvia
- [ ] Endpoint `/api/v1/entities/customer/list` ritorna `total` come numero JSON (non stringa)
- [ ] Endpoint audit ritorna `id` come stringa (via `.toString()`)

### Phase 4 (FE)
- [ ] `json-bigint` installato in FE (**senza `@primebrick/sdk`** — FE è standalone)
- [ ] `src/lib/api-ext.ts` creato con `extJsonParse`, `apiFetchExt`, `apiFetchExtWithResponse`
- [ ] `apiFetchExt` wrapper funziona — parse response con bigint support
- [ ] `ListResponse.total` tipizzato come `bigint`
- [ ] UI mostra `total` correttamente (`Number(total)` o `total.toString()`)
- [ ] FE typecheck passa
- [ ] FE build passa
- [ ] Customer list page funziona — total visualizzato correttamente
- [ ] Organization list page funziona
- [ ] User list page funziona

### Phase 5 (SDK NATS + US — US già consumer SDK, migrazione immediata)
- [ ] `NatsClient.publish(subject, data)` esiste nel SDK e serializza con extJson automaticamente
- [ ] `NatsClient.subscribe<T>(subject, handler)` esiste nel SDK e deserializza con extJson automaticamente
- [ ] `NatsClient.subscribeRequest<Req, Res>(subject, handler)` esiste nel SDK (request-reply pattern)
- [ ] `NatsClient.publish("test", { id: 42n })` produce payload `{"id":42}` (JSON standard)
- [ ] `NatsClient.subscribe` handler riceve `{ id: 42n }` (bigint nativo, non string)
- [ ] US `emailsender/src/nats/handlers.ts` non contiene più `JSON.parse`/`JSON.stringify`/`TextEncoder`/`TextDecoder` manuali
- [ ] US `emailsender/src/nats/types.ts` ha `entityId?: bigint` e `logId?: bigint` (fix latent bug)
- [ ] US build passa
- [ ] US emailsender NATS handler funziona con bigint nel payload

---

## 7. Edge cases e rischi

### 7.1 `JSON.stringify` nativo vs `json-bigint` stringify

**Problema:** Se un codice BE usa `JSON.stringify(data)` direttamente (non tramite `res.json()`), i `bigint` throweranno `TypeError`.

**Mitigazione:** Il middleware intercetta `res.json()`. Per codice che usa `JSON.stringify` direttamente (es. NATS, sessionStorage nel FE), usare `extJsonStringify` esplicitamente.

**Verifica:** Grep per `JSON.stringify` in BE e FE, identificare i siti che potrebbero ricevere bigint.

### 7.2 `sessionStorage.setItem('user', JSON.stringify(next))` nel FE

```typescript
// src/lib/user-profile-store.svelte.ts:55
sessionStorage.setItem('user', JSON.stringify(next));
```

Se `next` contiene bigint (es. `version` è number, ma se in futuro ha `id: bigint`), `JSON.stringify` throwa.

**Oggi:** `UserProfile` non ha `id` (usa `uuid`). `version` è `number` (INT4). **Nessun problema attuale.**

**Futuro:** Se `UserProfile` include `id: bigint`, cambiare a `extJsonStringify(next)`.

### 7.3 Mixed-type arithmetic

```typescript
// offset + limit < total
// offset e limit sono number (input utente), total è bigint
// number + number < bigint → OK (JS confronta number con bigint)
0 + 25 < 100n  // true — funziona
```

JS supporta confronti `number < bigint` nativamente. L'aritmetica `number + bigint` throwa, ma non la facciamo mai.

### 7.4 `json-bigint` strict mode

`json-bigint({ strict: true })` richiede JSON valido. Se il BE manda una response non-JSON (es. 204 No Content), il FE non deve fare `extJsonParse` su body vuoto.

**Mitigazione:** `apiFetchExt` controlla `response.status === 204` o `Content-Length: 0` prima di fare parse.

### 7.5 Performance su payload grandi

`json-bigint.parse` è più lento di `JSON.parse` nativo (parsa a mano i numeri). Per export con 10k+ righe:

**Oggi:** Il BE usa streaming (SSE/chunked) per export, non un singolo JSON gigante. Il bottleneck è il DB.

**Se misurabile:** Per payload > 1MB, considerare `JSON.parse` nativo + reviver selettivo (solo per campi noti come bigint). Ma è ottimizzazione prematura.

### 7.6 `json-bigint` e `Number` vs `bigint` ambiguità — RISOLTO con `alwaysParseAsBig: true`

**Problema originale:** `json-bigint` con solo `useNativeBigInt: true` converte numeri > `Number.MAX_SAFE_INTEGER` a `bigint`, e numeri <= a `number`. Lo stesso campo `id` potrebbe essere `number` (per `id: 42`) o `bigint` (per `id: 99999999999999999999`) a seconda del valore. Tipo non predicibile.

**Soluzione adottata:** `alwaysParseAsBig: true` — opzione built-in di `json-bigint` che forza **tutti** gli interi a `bigint`, indipendentemente dalla dimensione.

```typescript
const jsonBigInstance = JSONBig({
  useNativeBigInt: true,    // usa BigInt nativo JS, non BigNumber
  alwaysParseAsBig: true,   // FORZA tutti gli interi a bigint (non solo grandi)
  strict: true,             // richiede JSON valido
});
```

Comportamento risultante:

```json
{"id": 42, "big_id": 99999999999999999999, "price": 3.14, "name": "test", "active": true}
```

```typescript
const data = extJsonParse(text);
// data.id        → 42n          (bigint — sempre, anche se piccolo)
// data.big_id    → 99999999999999999999n  (bigint)
// data.price     → 3.14         (number — ha il punto decimale, non è intero)
// data.name      → "test"       (string)
// data.active    → true         (boolean)
```

**Regola semplice e predicibile:**
- Ogni **intero** JSON → `bigint` in JS
- Ogni **float** JSON → `number` in JS
- String, boolean, null → unaffected

**Conseguenze sui tipi TS:**

| Campo | Tipo PG | Tipo JSON | Tipo TS dopo parse | Prima |
|-------|---------|-----------|---------------------|-------|
| `id` (PK) | bigint | number | `bigint` | `number` (bug) |
| `total_records` | bigint | number | `bigint` | `number` |
| `version` | integer (INT4) | number | `bigint` | `number` |
| `page` | (FE state) | number | `bigint` (se parsed da response) | `number` |
| `price` | numeric | number | `number` (float) | `number` |
| `name` | varchar | string | `string` | `string` |

**`version` diventa `bigint`** anche se è INT4 in PG. Questo è semantically impreciso ma praticamente innocuo:
- Display: `v{version}` → Svelte chiama `String(1n)` → "v1" ✓
- Confronti: `version > 0n` ✓ (invece di `version > 0`)
- Arithetic: `version + 1n` ✓ (invece di `version + 1`)

**`page` e `page_size`** nel FE sono `$state<number>` (input utente, non parsed da JSON). Il BE li echo nella response ma il FE non li usa dal parse — usa il proprio state. Quindi **nessun impatto pratico**.

**Arithmetic con bigint:**

```typescript
// PRIMA (number):
hasMore: offset + limit < total

// DOPO (total è bigint, offset/limit sono number dal FE state):
hasMore: BigInt(offset + limit) < total
// oppure:
hasMore: offset + limit < Number(total)  // ok se total < 2^53
```

**Raccomandazione:** Usare `Number(total)` per confronti di paginazione — `total` non supererà mai 2^53 in un'app reale. Per coerenza con il tipo `bigint`, si può anche usare `BigInt(offset + limit) < total`.

**Verifica empirica — `alwaysParseAsBig` esiste in `json-bigint`:**

Dal codice sorgente (`lib/parse.js`):
```javascript
if (Number.isSafeInteger(number))
  return !_options.alwaysParseAsBig
    ? number                          // default: piccolo intero → number
    : _options.useNativeBigInt
    ? BigInt(number)                  // alwaysParseAsBig + useNativeBigInt → BigInt
    : new BigNumber(number);
```

Con `alwaysParseAsBig: true` + `useNativeBigInt: true`, ogni `Number.isSafeInteger(number)` restituisce `BigInt(number)`. I float (hanno `.` o `e`/`E`) passano per l'altro branch e restano `number`.

**Niente reviver custom necessario.** È un'opzione built-in, documentata, testata.

---

## 8. Out of scope

- **Migrare tutti i `JSON.stringify` diretti a `extJsonStringify`** — solo i siti che possono ricevere bigint. Grep e verifica caso per caso.
- **US NATS implementation** — Phase 5, US già consumer SDK (migrazione immediata dopo upgrade SDK)
- **FE `sessionStorage` bigint handling** — non necessario oggi (UserProfile non ha bigint)
- ~~**Custom reviver per forzare tutti gli interi a bigint**~~ — RISOLTO con `alwaysParseAsBig: true` (opzione built-in di `json-bigint`), vedi §7.6
- **Qualsiasi `git commit`** — wait for explicit user instruction

---

## 9. Dipendenze tra piani

Questo piano è **prerequisito** del piano principale `be-dal-sdk-adoption-plan.md` (§8 Type parser migration). L'attuale §8 di quel piano proponeva di **override** il type parser INT8 per tornare al vecchio comportamento (`number`). Questo piano **sostituisce** quella sezione — invece di fare override, adottiamo `bigint` nativo end-to-end.

**Ordine di esecuzione:**
1. Questo piano (bigint native + json-bigint) — Phase 1-4
2. Piano principale (BE DAL adoption) — Phase 0-5, con §8 rimosso (sostituito da questo piano)
