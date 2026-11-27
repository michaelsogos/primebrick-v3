#!/usr/bin/env node
/**
 * stop-gate — Stop event hook. Blocks turn closure while mechanical
 * workflow obligations are undischarged. Reads the session ledger
 * written by session-ledger.mjs — exact state, no git forensics.
 *
 * Invariants (ratified DURO — no exceptions):
 *   impl edits and zero spec edits            → BLOCK "spec-first"
 *   spec edits never executed after           → BLOCK "spec non eseguita"
 *   impl edits after the last commit          → BLOCK "committa"
 *   impl edits and zero plan edits            → BLOCK "ledger del piano"
 *
 * Anti-loop: max 2 blocks per violation class per session, then the gate
 * opens but the violation stays visible. Never blocks when the runtime
 * says a stop hook is already active in this stop chain.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const BACKSLASH = String.fromCharCode(92);
const fwd = (p) => p.split(BACKSLASH).join("/");
const root = fwd(process.env.DEVIN_PROJECT_DIR ?? "D:/git/primebrick");

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return null; }
}
function pass() { process.exit(0); }
function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

const evt = readStdin();
if (!evt?.session_id) pass();
if (evt.stop_hook_active) pass();

const file = join(root, "temp", "hookstate", `${evt.session_id}.json`);
if (!existsSync(file)) pass();
const ledger = JSON.parse(readFileSync(file, "utf8"));
ledger.stop_blocks ??= {};

const implEdits = ledger.edits.filter((e) => e.class === "impl");
if (implEdits.length === 0) pass();

const specEdits = ledger.edits.filter((e) => e.class === "spec");
const planEdits = ledger.edits.filter((e) => e.class === "plan");
const lastImplTs = implEdits.at(-1).ts;
const commitsAfter = ledger.commits.filter((c) => c.ts >= lastImplTs);
const specRunsAfter = specEdits.length === 0 ? [] : ledger.test_runs.filter((r) => r.ts >= specEdits.at(-1).ts);

const violations = [];
if (specEdits.length === 0) {
  violations.push(["spec-first", "SPEC-FIRST VIOLATO — implementazione modificata senza una spec definitiva scritta prima. La spec che codifica il risultato END-USER precede l'implementazione, sempre. Scrivila ora nel suo file canonico, oppure — se la modifica non è comportamentale — spiega all'utente perché e fermati davanti a lui."]);
}
if (specEdits.length > 0 && specRunsAfter.length === 0) {
  violations.push(["spec-run", "SPEC MAI ESEGUITA — spec scritta/modificata in questa sessione e mai eseguita dopo l'ultima modifica. Esegui playwright/vitest ora e guarda l'esito prima di fermarti."]);
}
if (commitsAfter.length === 0) {
  violations.push(["commit", "COMMIT MANCANTE — implementazione modificata dopo l'ultimo commit di sessione (o nessun commit registrato). Il turno che tocca sorgenti finisce con commit+push. Committa ora."]);
}
if (planEdits.length === 0) {
  violations.push(["plan-ledger", "LEDGER DEL PIANO MANCANTE — implementazione modificata e nessun piano ai-plans/ aggiornato in questa sessione. Scrivi verdict + ledger + prossimo step nel piano governante, oppure dichiara all'utente perché questo micro-edit ne è esente."]);
}

if (violations.length === 0) pass();

const open = violations.filter(([cls]) => (ledger.stop_blocks[cls] ?? 0) < 2);
if (open.length === 0) pass();

for (const [cls] of open) ledger.stop_blocks[cls] = (ledger.stop_blocks[cls] ?? 0) + 1;
writeFileSync(file, JSON.stringify(ledger, null, 1));

const tally = open.map(([c]) => `${c}=${ledger.stop_blocks[c]}/2`).join(", ");
const reasons = open.map(([, r]) => r).join("\n\n");
block(`${reasons}\n\n[stop-gate: ${tally} — esauriti i 2 blocchi per classe il gate si apre, ma la violazione resta visibile all'utente]`);
