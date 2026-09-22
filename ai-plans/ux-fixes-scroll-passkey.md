# UX Fixes: sticky-scroll chat AI + error handling passkey

> **STATUS: IMPLEMENTED** — 2026-09-22. Scroll sticky ≤50px + pill arrow-down verificati live; passkey deadlock fix + preservazione `webauthnCredentials` deployati; key-picker tradotto come /create.

Piano unico — sostituisce `ux-chat-sticky-scroll.md` e
`bugfix-passkey-signin-401-deadlock.md` (da eliminare).

---

## A) Sticky-scroll nella chat degli assistenti AI

### Problema
`src/lib/components/ui/smart-ai/ai-chat-panel.svelte` — l'`$effect` di
auto-scroll forza `scrollTop = scrollHeight` a OGNI variazione di
`messages.length` / `streaming_text`. Mentre il modello pensa/streama,
lo scroll dell'utente viene annullato. Panel condiviso → fix singolo.

### Regole accettate
| Condizione | Comportamento |
|---|---|
| ≤ 50px dal fondo | auto-scroll a ogni update |
| > 50px dal fondo | scrollbar ferma; i callout crescono in background |
| Azione utente (msg, CTA, choice) | sempre scroll-to-bottom |

### Implementazione
```ts
let stickToBottom = $state(true);
function handleScroll() {
  if (!scrollContainer) return;
  const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
  stickToBottom = scrollHeight - scrollTop - clientHeight <= 50;
}
```
- `onscroll={handleScroll}` sul div messaggi.
- Effect scrolla solo `if (stickToBottom)`.
- `handleSend()` → `stickToBottom = true` prima di `sendMessage`.
- `onclick` **capture** sullo scrollContainer:
  `target.closest('button, a, [role="button"]')` → `stickToBottom = true`
  (copre card/CTA/choice; click su testo no).

### Pill "torna in fondo" (confermata)
- Visibile solo con `!stickToBottom` e messaggi presenti.
- Solo icona `ArrowDown` (lucide), nessun label.
- Centrata orizzontalmente, posizionata a metà sopra il footer del composer:
  `absolute -top-… left-1/2 -translate-x-1/2`, `rounded-full border
  bg-background shadow-md`, z sopra il footer.
- Click → `stickToBottom = true` + scroll immediato a fondo.

### File
Solo `ai-chat-panel.svelte`. Nessuna modifica ai wrapper.

---

## B) Error handling passkey signin (deadlock + messaggi deboli)

### Sintomo verificato
Passkey con credential non più censita in Casdoor → finish risponde
401 `{detail: "Failed to lookup Client-side Discoverable Credential:
user not exist", internal_code: "webauthn_ceremony_failed"}` → la dialog
resta bloccata con spinner eterno, ZERO errore mostrato.

### Root cause FE (verificata)
`apiFetch` (~r.152): su 401, se URL non è `/auth/login` o `/auth/refresh`:
- `hasLocalSession()` false → `sessionExpiredStore.enqueue()` → Promise che
  si risolve SOLO via `drainPending()` dopo login riuscito → la dialog
  aspetta la stessa request → **deadlock**, spinner eterno.
- Righe ~159 e ~229: stessa esclusione mancante sul path RFC7807.

### Fix FE (`src/lib/api.ts`)
Escludere `/api/v1/auth/webauthn/signin` da:
1. skip-refresh 401 → enqueue (riga ~159)
2. auto-handle RFC7807 (riga ~229 — `PasskeyButton` già chiama
   `pushNotification` con l'err: evita doppia notifica)

### Messaggio specifico (BE + i18n)
- `webauthn.service.ts` (~r.316): quando `data.msg` contiene
  "user not exist" / "Discoverable Credential" → `internal_code:
  "webauthn_credential_not_found"` (invece del generico
  `webauthn_ceremony_failed`).
- FE `PasskeyButton`: mappa `webauthn_credential_not_found` →
  `t('app.auth.login.passkey.credentialNotFound')`.
- Nuova chiave ×7 lingue (SQL fire-and-forget, seguendo il pattern
  `add_*_translations.sql` + Redis invalidate). Bozza:
  - it-IT: "Nessuna passkey registrata per questo account. Registra di
    nuovo la passkey o accedi con password."
  - en-GB/en-US: "No passkey registered for this account. Re-register
    your passkey or sign in with password."
  - fr/es/de/pt: traduzioni equivalenti.
- `webauthn_session_expired` (cookie Redis scaduto/perso) → chiave
  dedicata `app.auth.login.passkey.sessionExpired`: "Cerimonia scaduta,
  riprova." (già esiste? verificare le chiavi `app.auth.login.passkey.*`).

### Accettazione
- Passkey non censita → errore visibile subito + dialog sbloccata
  (niente spinner eterno; bottone riutilizzabile / "Go to login page").
- Passkey valida → login ok (già verificato dall'utente).
- `pnpm check` pulito.

---

## C) Indagine: perdita dati Casdoor (ricorrente)

### Evidenze raccolte
- `primebrick-postgres-18` creato 2026-07-27, volume `primebrick_pg18_data`.
- Utenti Casdoor `created_time` maggio 2026 → DB migrato nel cluster PG18.
- `webauthnCredentials` = null su TUTTI gli utenti → le credential sono
  andate perse, gli utenti no.
- `acme/admin.updated_time` = oggi (re-enroll utente OK).

### Ipotesi da verificare
1. **Migrazione dump/restore**: se fatta via export JSON/import API Casdoor
   (non pg_dump), i campi bytea/JSONB sensibili possono essere stati
   omessi → cercare lo script di migrazione PG17→PG18 usato.
2. **Update full-record Casdoor**: un update utente via API che non
   ripassa `webauthnCredentials` potrebbe azzerarlo → cercare call site
   BE che fanno `UpdateUser` Casdoor (user-profile sync, org sync,
   admin endpoints) e verificare se preservano il campo.
3. **Reset container casdoor**: `primebrick-casdoor` ricreato con DB
   puntato altrove? Verificare `docker inspect primebrick-casdoor`
   env `dataSourceName` + history del container.

### Deliverable
Report causa + fix di prevenzione (es. doc operativa o assertion nel
path update che logga warning se `webauthnCredentials` sta per essere
sovrascritto con null).

---

## Fuori scope
- DynamicIcon resta com'è: placeholder invisibile = segnale di icona
  mancante (decisione utente). `building-2`→`building-complex` già fatto.
- Nessun refactor di sessionExpiredStore/PasskeyButton oltre al punto B.
