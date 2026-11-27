#!/usr/bin/env node
/**
 * session-ledger — PostToolUse observer. Never blocks, never speaks.
 * Records every relevant agent action into a per-session mechanical
 * ledger: temp/hookstate/<session_id>.json — the stop-gate reads it.
 * No git forensics: the ledger is exact by construction because the
 * events pass through here before anywhere else.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const BACKSLASH = String.fromCharCode(92);
const fwd = (p) => p.split(BACKSLASH).join("/");

const root = fwd(process.env.DEVIN_PROJECT_DIR ?? "D:/git/primebrick");
const stateDir = join(root, "temp", "hookstate");

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return null; }
}

function classifyPath(p) {
  const n = fwd(p);
  if (n.includes("/ai-plans/")) return "plan";
  if (/\.(spec|test)\.(ts|js|mts|mjs)$/.test(n) || n.includes("/e2e/") || n.includes("/__tests__/")) return "spec";
  if (/primebrick-[^/]+\/[^/]*src\//.test(n) && /\.(ts|svelte|js|mts|mjs)$/.test(n)) return "impl";
  return "other";
}

const evt = readStdin();
if (!evt?.session_id) process.exit(0);

mkdirSync(stateDir, { recursive: true });
const file = join(stateDir, `${evt.session_id}.json`);
const ledger = existsSync(file)
  ? JSON.parse(readFileSync(file, "utf8"))
  : { edits: [], test_runs: [], commits: [], stop_blocks: {} };
ledger.stop_blocks ??= {};

const ts = new Date().toISOString();

if (evt.tool_name === "edit" || evt.tool_name === "write" || evt.tool_name === "notebook_edit") {
  const p = evt.tool_input?.file_path ?? evt.tool_input?.notebook_path ?? "";
  if (p) ledger.edits.push({ path: fwd(p), class: classifyPath(p), ts });
}

if (evt.tool_name === "exec") {
  const cmd = evt.tool_input?.command ?? "";
  const ok = evt.tool_response?.success !== false;
  if (/playwright\s+test|vitest(\s+run)?/.test(cmd)) {
    ledger.test_runs.push({ command: cmd.slice(0, 200), success: ok, ts });
  }
  if (/git\s+(-C\s+\S+\s+)?commit\b/.test(cmd) && ok) {
    ledger.commits.push({ command: cmd.slice(0, 120), ts });
  }
}

writeFileSync(file, JSON.stringify(ledger, null, 1));
process.exit(0);
