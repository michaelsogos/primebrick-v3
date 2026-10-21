# Bugfix — identity overwrite from JWT claims; single source = `/auth/me`

> Bug empiricamente riprodotto: dopo re-login via passkey l'identità visualizzata
> diventa "Micha" + avatar viola, mentre `user_profiles` resta "Prime Admin"/PA/#0AB681.
> Il DB non è mai stato toccato — è un conflitto fra due fonti di verità nell'FE.

## Status: ⚪ TODO — Plan date: 2026-10-21 02:30 UTC / 04:30 CEST

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | `userProfileStore.setSession(user)` — scrive SOLO campi sessione (`username`, `idp_code`, `expires_at`, `roles`, `organization`); se `idp_code` diverso da quello in store → reset dei campi identity (account diverso) | ⏳ not done | — | `user-profile-store.svelte.ts` |
| 2 | `PasskeyButton.svelte` / `LoginForm.svelte` / `MfaChallenge.svelte` → `setSession(data.user)` al posto di `set(data.user)` | ⏳ not done | — | 3 call-site identici |
| 3 | `session-check.ts` `refreshAccessToken` → `userProfileStore.setSession(data.user)` al posto di `sessionStorage.setItem` diretto (oggi: replace totale, bypassa merge + `$state`) | ⏳ not done | — | rimuove seconda divergenza |
| 4 | BE `buildUserFromClaims` → emette anche `idp_code` (= `claims.sub`) — serve a `hasLocalSession()` e al check "account diverso" del punto 1 | ⏳ not done | — | `auth-session.service.ts` |
| 5 | Verifica: svelte-check 0/0, tsc BE pulito, login flow E2E esistente verde (`e2e-user-creation-login-passkey` se pertinente) | ⏳ not done | — | |
| 6 | Commit FE + BE (trailer SWE-2 Max) | ⏳ not done | — | |

<!-- Status values: ✅ done · ⏳ not done · ⏳ partial · 🚫 dropped.
     Update this table every session that touches the plan. -->

---

## Root cause (verificata empiricamente)

`buildUserFromClaims(claims)` — `primebrick-be-v3/src/modules/auth/services/auth-session.service.ts:548` — costruisce `data.user` delle risposte di login **solo dai claims JWT Casdoor**:

```ts
display_name: claims.displayName || claims.name || ...,   // → "Micha"
email:        claims.email,                               // → corretta (stesso account)
// avatar_color / avatar_initials / is_admin / uuid — ASSENTI
```

Tre writer scrivono questi claims nello store come se fossero identità:

- `PasskeyButton.svelte:109` → `userProfileStore.set(data.user)` — merge → `display_name`/`username` sovrascritti con "Micha"/"micha"; i campi avatar non sono nel payload → se lo store era vuoto (sessione scaduta → `clear()` su 401/refresh-fail) l'avatar cade sul fallback hash delle iniziali → viola.
- `LoginForm.svelte:116`, `MfaChallenge.svelte:113` — identico (password login e MFA hanno lo stesso bug latente).
- `session-check.ts` `refreshAccessToken` → `sessionStorage.setItem('user', JSON.stringify(data.user))` — **replace totale**, bypassa il merge, non aggiorna `$state` → ad ogni refresh il mirror perde `avatar_*`/`is_admin`/`uuid` e diverge dalla memoria.

`user_profiles` intatta (verificato via SQL: "Prime Admin"/PA/#0AB681/`is_admin:true`, nessuna riga "Micha") → stesso `idp_code`, il drift è Casdoor-side: `displayName` IDP = "Micha" vs `display_name` locale = "Prime Admin".

## Contratto — unica fonte della verità

| Sorgente | Possiede | Viene scritta da |
|---|---|---|
| `/auth/me` → `user_profiles` | `uuid`, `display_name`, `email`, `avatar_color`, `avatar_initials`, `is_admin`, `is_verified`, `idp_*`, audit fields, `has_passkey`, `has_mfa`, `permissions` | `userProfileStore.set(...)` nel layout `(app)` — già esistente, già reattivo (`$state` + `$derived`) |
| login/refresh `data.user` (claims) | **solo sessione**: `expires_at`, `roles`, `organization`, `username`, `idp_code` | `userProfileStore.setSession(...)` — nuovo |

`setSession` merge come `set` ma filtra il payload ai soli campi sessione → i campi identity non possono più entrare da claims in nessun path. Se `data.user.idp_code` esiste e differisce dallo `idp_code` in store → i campi identity correnti vengono azzerati (account diverso → niente identità stale di un altro utente); `/auth/me` li ripopola reattivamente.

Effetto nominale al re-login dello stesso utente: store già popolato → `setSession` tocca solo `expires_at`/`roles` → **nessun cambio visivo** → `/auth/me` conferma → "non succede niente perché niente è cambiato".

## Note

- `buildUserFromClaims` guadagna `idp_code: claims.sub` — utile a `hasLocalSession()` (che preferisce `idp_code`) e al confronto account del punto 1. Nessun altro consumer toccato.
- Drift Casdoor (`displayName` "Micha") resta invariato — è IDP-internal e dopo il fix non è più autoritativo per l'UI. Il prossimo `PATCH /auth/me` spinge il `display_name` locale verso Casdoor (sync già esistente) → self-healing.
- Nessuna modifica di schema, nessun endpoint nuovo, nessuna migration.
