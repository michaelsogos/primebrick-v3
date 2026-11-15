# Feature: Chat-as-answer — model-driven action resolution for pending choices

## Obiettivo

La chat dell'assistente diventa un canale di risposta completo: quando l'ultimo
messaggio assistant ha **choice irrisolte**, il testo digitato dall'utente viene
arricchito con la pending list e il MODELLO decide se risolverla
(`{"action":...}`) o trattarla come nuova richiesta. Il FE esegue l'azione in
modo deterministico — nessun click obbligatorio, nessun parser lessicale,
nessun RAG.

## Contratto modello (design)

Quando esiste una pending choice, lo user message viene wrappato:

```
[Pending actions — if the user's reply resolves one, respond ONLY with
{"action":"apply"|"discard"|"pick","index":<n>}:
 1 = apply config card
 2 = discard
 3 = pick "validation.rules.regex.pattern"]
User: quella con la i
```

- Il wrap va in **coda allo user message**, MAI nel system prompt → KV cache
  invalidata solo dal nuovo turno (byte-identico prefix preservato).
- Se il modello risponde `{"action":...}` valido → FE esegue
  (`applyChoice`/`resolveChoice`/pick), condensa il messaggio come farebbe il
  click.
- JSON malformato o action fuori range → trattato come messaggio normale
  (fail-safe, comportamento attuale).
- Il `key_picker` smette di essere un'intercettazione speciale: diventa una
  pending action come le altre (pick = chiave scelta; testo libero = ancora
  deviato a `on_key_picker_free_text` — quel ramo resta).

## Superficie coperta

| Assistente | Choice kind | Azione chat equivalente |
|---|---|---|
| json | `topic` (cascade/leaf) | pick per titolo/indice |
| json | `value` | pick del valore ("true", "il primo") |
| json | `key_picker` | pick chiave; testo libero → flusso traduzioni (esistente) |
| json | `translations_preview` | apply (accept) / discard (reject) |
| json | `config` | apply / discard |
| regex | pattern choices (1-3) | pick per indice/ordinal |

## File impattati

- `src/lib/components/ui/smart-ai/use-ai-assistant.svelte.ts` — hook punto
  centrale: pending-choice detection + wrap + action parsing in
  `process_response`/`sendMessage` (condiviso da TUTTI gli assistenti).
- `src/lib/components/ui/smart-json-assistant/use-json-schema-ai.svelte.ts` —
  la pending detection esiste già per `key_picker`; generalizzata via hook
  condiviso. `sendModelMessage` (bypass) resta per i prompt programmatici.
- `src/lib/components/ui/smart-json-assistant/json-schema-choice-card.svelte` —
  rimozione input+bottone `key-message`/`key-generate` (in-card input
  ridondante: la chat è il canale).
- `src/lib/components/ui/smart-regex-input/use-regex-ai.svelte.ts` — stessa
  pending resolution per le pattern choices.
- Traduzioni: nuova copy `key_picker.intro` ×7 lingue (en-US ora seeded) +
  eventuali chiavi per condensed_content delle azioni risolte via chat.

## Esecuzione azione risolta via chat

- Messaggio assistant → `resolveChoice(uuid, 'applied'|'discarded',
  condensed_content)` — stessa semantica del click.
- `pick` su `topic` → replay del click: `sendModelMessage` con lo stesso
  prompt generato dalla card, oppure `addLocalAssistantMessage` cascade per
  topic espandibili (valutare quale riusa meglio la logica esistente).
- `pick` su `value` → stesso prompt `Set "path" to V...` via sendModelMessage.

## Test

- Estendere `ai-json-schema-navigation.spec.ts` con fase `"chat"`: rispondere
  via chat input alle pending choices ("2", "applica", "scarta",
  "quella con la i") e verificare che la risoluzione sia identica al click.
- Turni chat mergiano nello stesso `json_editor_with_schema_test_score` via
  `mergeTestScoreTurns` (phase "chat").

## Acceptance criteria

- [ ] "applica" / "scarta" / "1|2|3" / "a|b|c" / titolo topic / valore
      risolvono la pending choice esattamente come il click
- [ ] Testo non-azione ("aggiungi min 3") passa al modello come prima
- [ ] Action JSON invalida → nessuna esecuzione, messaggio normale
- [ ] KV cache: system prompt byte-identico, wrap solo nello user message
- [ ] Input in-card rimosso; `key_picker.intro` aggiornato ×7
- [ ] Regex assistant: "la seconda" applica il pattern 2
- [ ] E2E fase "chat" verde, merged nel caso condiviso
