# Form draft persistence + reset — internal, anti-stale, collab-aware

## Status: ⚪ TODO — Plan date: 2026-11-03 14:30 UTC / 15:30 CET

| # | Task (detail level — one row per task, not per topic) | Status | When | Notes |
|---|--------------------------------------------------------|--------|------|-------|
| 1 | TIC: architecture vs collab/merge machinery | ✅ done | 2026-11-03 | part A |
| 2 | `useFormDraft` composable in EntityFormPage (universal wiring) | ⏳ not done | — | |
| 3 | Restore = mergeDelta semantics (tainted-only apply, version conflicts) | ⏳ not done | — | |
| 4 | Reset button: create=defaults / update=fresh fetch | ⏳ not done | — | |
| 5 | E2E: refresh keeps draft, stale version → conflicts, reset both modes | ⏳ not done | — | |

---

## Part A — The insight: draft restore IS `mergeDelta`

`useCollaborativeForm` already solved this exact problem for remote deltas:

- `mergeDelta({delta, isTainted, getField, setField, untaint, toFormValue})` — untouched fields adopt the new value silently, **tainted fields become `FieldConflict`** (`merge-delta.ts`).
- `handleVersionConflict` — PUT 409 path: fetch FRESH record → untouched adopt, tainted → conflicts.
- `resolveConflict('keep_mine'|'use_remote')`, `isConflicted`, `isStale` latch, `defaultToFormValue(col, raw)` for record→form conversion.

A browser-refresh draft is the SAME shape from a different source: **"your past self" is just another writer**. The draft stores *tainted edits on a base version*; restore = replay them onto a fresh base with the identical tainted/conflict semantics. No new merge logic — the draft feeds the machinery that exists.

## Part B — Design

### B1. What persists (the anti-stale core)

```ts
// localStorage["pb:draft:{org_uuid}:{actor_uuid}:{entity}:{detail|create}:{recordUuid|new}"]
{
  v: 1,                        // format version
  data: $form,                 // full snapshot (needed for create; detail uses tainted subset)
  tainted: $tainted,           // the honest map — RESTORE APPLIES ONLY THESE KEYS
  base_version: number|null,   // record.version the edits were made against (detail)
  saved_at: epoch_ms
}
```

- **Scoped key** — org+actor+entity+mode+uuid: no cross-user/cross-org leak on shared browsers.
- **Write**: debounced (~400ms) subscription on `$form`/`$tainted` — only while `isTainted`; when the form returns to pristine the slot is **deleted** (user undid everything → no stale draft haunting next visit).
- **Best-effort**: try/catch quota/serialization — persistence never breaks the form.
- **Submit success / reset / entity change** → delete slot.

### B2. Restore (the merge)

- **CREATE**: fresh `defaults` base → apply `data` values ONLY for keys still present in `formDecl` AND marked tainted in the draft (meta may have evolved — stale keys die silently) → mark those keys tainted. No conflicts possible (no server truth).
- **UPDATE**: fetch the record fresh (the normal load path already does) → rebuild `initial`:
  - `record.version === draft.base_version` → apply draft-tainted values onto fresh fields, mark tainted, banner "bozza ripristinata" (dismissable, informational).
  - `version ≠` → the draft's tainted fields become **conflicts** through the existing `conflicts` map + resolution UI — `keep_mine` restores the draft value, `use_remote` takes the server value. Nothing new to build, nothing new to learn for the user.
- **Untainted draft values are NEVER applied** — they were not user edits; the fresh base covers them. This is THE anti-stale rule: a remote collab merge, an `x_options` inject, a computed default that landed after the draft was saved all stay fresh because restore touches only what the user personally edited.

### B3. Programmatic-edit impact (the requirement)

Every writer flows through `setField`/`untaint` → `tainted` stays the single honest ledger:

| Writer | Effect on draft |
|--------|-----------------|
| User types | field tainted → persisted, restored |
| Collab remote delta | untainted field set → snapshot updates, but restore never applies it (not tainted) — fresh base covers it anyway |
| Collab conflict `keep_mine` | field stays tainted → draft keeps user's choice |
| `x_options`/`inject` default | untainted → not restored, re-derived fresh on load |
| `reset()` | untaint-all → slot deleted |

Restore runs ONCE at mount after the initial data build, before collab attaches (channel effect already gates on `isDetail`) — no interleaving.

### B4. Reset button

- CREATE → `reset({ data: defaults(initial) })` + untaint-all + delete draft.
- UPDATE → `GET /entities/:e/:uuid` **fresh, cache-bypassed** → rebuild initial → `reset` + delete draft. (`reset` preserves tainted for keys in `data` — the rebuild is a NEW initial object, then untaint.)
- Placement: form footer next to Salva/Annulla. Icon `rotate-ccw` (restore-original semantics per icon-conventions-audit), label i18n `app.common.reset` — new key.
- Disabled while `!isTainted` (nothing to reset) — keeps the surface honest.

### B5. Where it lives

- `src/lib/entity-form/use-form-draft.svelte.ts` — composable; `EntityFormPage` wires it unconditionally → **every metadata-driven entity form inherits it, zero per-page opt-in** (the requirement: "lo eredita per forza").
- FE-local (couples to superForm instance + EntityFormPage plumbing — not a remote-consumable component).

## Acceptance criteria

1. Type in a field, F5 → value back, field tainted, Save enabled.
2. Update-mode draft + record changed meanwhile → conflicts UI with per-field keep_mine/use_remote.
3. Untouched-by-user fields always show the FRESH value after restore (collab merge landed in between included).
4. Undo everything → draft slot gone.
5. Reset: create → first-load defaults; update → fresh DB row, no cache.
6. Collab live: draft re-persists merged state; restore still applies only tainted keys.
7. E2E covering all six.
