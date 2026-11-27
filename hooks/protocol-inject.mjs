#!/usr/bin/env node
/**
 * protocol-inject — UserPromptSubmit + PostCompaction. Injects the compact
 * operative protocol into the agent context on EVERY user prompt, and
 * re-injects it after compaction (long sessions decay — this is the cure).
 * Never blocks.
 */
import { readFileSync } from "node:fs";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return null; }
}

const PROTOCOLLO = `PROTOCOLLO OPERATIVO — ogni task governed segue il wrapper, niente eccezioni:
1. doc receipts nel piano (doc:line) prima di agire
2. spec definitiva RED che codifica il risultato END-USER — prima dell'implementazione
3. implementazione (il task vero)
4. spec GREEN eseguita in questa sessione
5. prova del 9 end-user sullo stack reale — il risultato come lo vede l'utente
   (browser/HTTP/DB), mai il meccanismo, mai le tue assunzioni
6. ledger del piano + commit + push
Lo stop-gate verifica 2/4/6 meccanicamente: edit implementativi senza spec,
spec non eseguite, commit mancanti, piano non aggiornato BLOCCANO la chiusura
del turno. Domande aperte → l'utente decide, mai indovinare. Anomalia → STOP → report.`;

const evt = readStdin();
if (!evt) process.exit(0);

const name = evt.hook_event_name;
if (name !== "UserPromptSubmit" && name !== "PostCompaction") process.exit(0);

const suffix = name === "PostCompaction" ? "\n[re-iniettato dopo compaction — la memoria decade, il protocollo no]" : "";
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: name, additionalContext: PROTOCOLLO + suffix },
}));
process.exit(0);
