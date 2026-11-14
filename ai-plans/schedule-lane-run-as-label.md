# Debt — `job_schedule.lane` label: "Corsia" → "Run As" family

## Problem

`fields.lane` is labeled "Corsia" — wire-format jargon for the
`jobs.due.<lane>.*` subject segment. The semantic is the execution
identity the run fires under (`user` = originator's auth headers,
`system` = module privileges) — the same concept as
`job_trigger.execution_context` ("Esecutore del processo",
values user/me/system). One concept, two jargons.

## Doc findings (gate — cited)

| Doc | Finding |
|---|---|
| `job_trigger_entity.ts:20-24` | `execution_context` doc: user=originator auth, me=author resolved at arm, system=module privileges |
| `schedule-service.ts:170,276` | `lane` derived from `TARGET_RE` `jobs.due.(user\|system).*` — the materialized context |
| `job.meta.ts` | `lane` has NO authored column on schedule meta — label surfaces via derived field (detail sheet/picker) |
| copy rules (`copy-tone-of-voice`) | wire-format jargon forbidden in user-facing text |

## Change — patch `0016` (translations ×7, audit triple)

| Lang | `fields.lane` new value |
|---|---|
| en-GB/en-US | Run As |
| it-IT | Eseguito Come |
| fr-FR | Exécuté En Tant Que |
| es-ES | Ejecutado Como |
| de-DE | Ausführen Als |
| pt-PT | Executado Como |

Values `status.user`/`status.system` unchanged (already "Utente"/"Sistema" family).

## Optional (sign-off needed)

- `job_trigger.fields.execution_context` currently "Esecutore del
  processo" — same concept; rename to the Run As family for full
  coherence, or leave as-is?

## Verification

- patch signed+applied; live: `fields.lane` value + `max(updated_at)` bump
- e2e unaffected (no lane assertion exists)
