#!/usr/bin/env node
/**
 * dev-stack — governed lifecycle for the Primebrick dev stack.
 *
 * The old dev-stack.ps1 spawned `cmd /c pnpm run dev` detached and forgot
 * the PID: its only "idempotency" was a non-atomic port check, so repeated
 * invocations accumulated zombie cmd→pnpm→node→bun trees that never died.
 *
 * This manager is actually idempotent:
 *   - every started service records a state file (pid + port + cmdline)
 *     in temp/dev/<name>.json — re-running `start` REUSES a live service,
 *     never spawns a duplicate;
 *   - a serialized lockfile prevents two concurrent invocations from
 *     racing the port check;
 *   - `stop` kills the whole process TREE (taskkill /T /F on Windows,
 *     killpg on posix) — no orphan grandchildren;
 *   - `status` shows tracked vs untracked; `reap` kills untracked
 *     primebrick dev processes (zombies from the old script).
 *
 * Usage:
 *   node dev-stack.mjs start [name...]   start all or named services
 *   node dev-stack.mjs stop [name...]    tree-kill tracked services
 *   node dev-stack.mjs restart [name...] stop + start
 *   node dev-stack.mjs status            table of tracked/untracked/ports
 *   node dev-stack.mjs reap [--dry]      kill untracked primebrick dev procs
 *
 * Contract: docs/ai/dev-server.md — never duplicate, never kill
 * user-started processes, stack must survive the agent shell (detached).
 */
import { spawn, execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STATE_DIR = resolve(ROOT, 'temp', 'dev');
const LOG_DIR = resolve(ROOT, 'temp', 'logs');
const LOCK = resolve(STATE_DIR, 'dev-stack.lock');
const isWin = process.platform === 'win32';

const SERVICES = [
  { name: 'be',          dir: resolve(ROOT, 'primebrick-be-v3'),             port: 3001 },
  { name: 'fe',          dir: resolve(ROOT, 'primebrick-fe-v3'),             port: 5173 },
  { name: 'emailsender', dir: resolve(ROOT, 'primebrick-us-v3/emailsender'), port: 3003 },
  { name: 'ai',          dir: resolve(ROOT, 'primebrick-us-v3/ai'),          port: 3004 },
  { name: 'webhook',     dir: resolve(ROOT, 'primebrick-us-v3/webhook'),     port: 3005 },
  { name: 'job-handler', dir: resolve(ROOT, 'primebrick-us-v3/job-handler'), port: 3006 },
  { name: 'crm',         dir: resolve(ROOT, 'primebrick-us-v3/crm'),         port: 3007 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (s, n) => String(s).padEnd(n).slice(0, n);

function stateFile(name) { return resolve(STATE_DIR, `${name}.json`); }
function readState(name) {
  try { return JSON.parse(readFileSync(stateFile(name), 'utf8')); } catch { return null; }
}
function writeState(name, st) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(stateFile(name), JSON.stringify(st, null, 2));
}
function clearState(name) { try { unlinkSync(stateFile(name)); } catch {} }

/** Whole live process table, one shot: [{pid,ppid,name,cmdline}] */
function processTable() {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress`],
      { encoding: 'utf8', timeout: 20000, windowsHide: true });
    const rows = JSON.parse(out || '[]');
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      pid: r.ProcessId, ppid: r.ParentProcessId, name: r.Name, cmd: r.CommandLine || '',
    }));
  } catch {
    return [];
  }
}

/** PID of the process LISTENING on a TCP port, or null */
function portOwner(port) {
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command',
      `$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess }`],
      { encoding: 'utf8', timeout: 15000, windowsHide: true }).trim();
    const pid = parseInt(out, 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch { return null; }
}

/** Is the TCP port accepting connections right now? */
function portOpen(port) {
  return new Promise((res) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); res(true); });
    s.once('error', () => res(false));
    s.setTimeout(1500, () => { s.destroy(); res(false); });
  });
}

function pidAlive(pid, procs) {
  return procs ? procs.some((p) => p.pid === pid) : processTable().some((p) => p.pid === pid);
}

/** Kill a whole process tree rooted at pid. */
function killTree(pid) {
  try {
    if (isWin) execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 15000 });
    else process.kill(-pid, 'SIGKILL'); // detached spawn = own pgid on posix
    return true;
  } catch { return false; }
}

/** Serialized section — stale locks (dead holder) are stolen. */
async function withLock(fn) {
  mkdirSync(STATE_DIR, { recursive: true });
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeFileSync(fd, String(process.pid)); closeSync(fd);
      break;
    } catch {
      // Lock held — steal it if the holder is dead or older than 2 min.
      try {
        const holder = parseInt(readFileSync(LOCK, 'utf8'), 10);
        const stale = !Number.isFinite(holder) || !pidAlive(holder) ||
          Date.now() - (await import('node:fs')).statSync(LOCK).mtimeMs > 120000;
        if (stale) { try { unlinkSync(LOCK); } catch {} continue; }
      } catch { continue; }
      if (Date.now() > deadline) throw new Error('dev-stack: lock wait timeout');
      await sleep(250);
    }
  }
  try { return await fn(); } finally { try { unlinkSync(LOCK); } catch {} }
}

/** One tracked service start — assumes lock held. Returns a status line. */
async function startOne(svc, procs) {
  const st = readState(svc.name);
  if (st && pidAlive(st.pid, procs)) {
    return `${pad(svc.name, 12)} already running (pid ${st.pid}, :${svc.port})`;
  }
  if (st) clearState(svc.name); // stale record — dead pid

  const owner = portOwner(svc.port);
  if (owner) {
    return `${pad(svc.name, 12)} port ${svc.port} held by FOREIGN pid ${owner} — not started (resolve owner per dev-server.md)`;
  }

  mkdirSync(LOG_DIR, { recursive: true });
  const log = resolve(LOG_DIR, `${svc.name}.log`);
  // windowsVerbatimArguments + no inner quotes: Node's own escaping of
  // embedded quotes makes `cmd /c` exit instantly and silently (verified
  // empirically). Stack paths contain no spaces — fail loudly if that
  // ever changes instead of quoting around it.
  if (/[\s"]/.test(svc.dir) || /[\s"]/.test(log)) {
    return `${pad(svc.name, 12)} path contains spaces/quotes — not started (fix paths, quoting unsupported)`;
  }
  const child = isWin
    ? spawn('cmd.exe', ['/c', `cd /d ${svc.dir} && pnpm run dev > ${log} 2>&1`],
        { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true })
    : spawn('sh', ['-c', `cd "${svc.dir}" && pnpm run dev > "${log}" 2>&1`],
        { detached: true, stdio: 'ignore' });
  child.unref();

  writeState(svc.name, {
    pid: child.pid, port: svc.port, dir: svc.dir,
    cmd: 'pnpm run dev', started_at: new Date().toISOString(), log,
  });

  // Wait for the port (up to 30s) — report honest boot state.
  for (let i = 0; i < 60; i++) {
    if (await portOpen(svc.port)) {
      return `${pad(svc.name, 12)} started pid ${child.pid} — :${svc.port} UP  (log: ${log})`;
    }
    if (!pidAlive(child.pid)) {
      clearState(svc.name);
      return `${pad(svc.name, 12)} FAILED — spawned pid ${child.pid} exited early (see ${log})`;
    }
    await sleep(500);
  }
  return `${pad(svc.name, 12)} started pid ${child.pid} — :${svc.port} not listening yet after 30s (booting? see ${log})`;
}

async function stopOne(svc) {
  const st = readState(svc.name);
  if (!st) return `${pad(svc.name, 12)} no state — not managed (nothing to stop)`;
  if (!pidAlive(st.pid)) { clearState(svc.name); return `${pad(svc.name, 12)} pid ${st.pid} already dead — state cleared`; }
  killTree(st.pid);
  clearState(svc.name);
  for (let i = 0; i < 20 && await portOpen(svc.port); i++) await sleep(300);
  return `${pad(svc.name, 12)} stopped (tree pid ${st.pid} killed)`;
}

async function cmdStatus() {
  const procs = processTable();
  for (const s of SERVICES) {
    const st = readState(s.name);
    const alive = st && pidAlive(st.pid, procs);
    const owner = portOwner(s.port);
    const ownerP = owner ? procs.find((p) => p.pid === owner) : null;
    const tag = st && alive ? `TRACKED pid ${st.pid}` : st ? 'STALE state' : owner ? `UNTRACKED pid ${owner}` : 'down';
    const who = ownerP ? ` (${ownerP.name}: ${ownerP.cmd.slice(0, 60)})` : '';
    console.log(`  ${pad(s.name, 12)} :${s.port}  ${pad(tag, 22)}${who}`);
  }
}

/**
 * Ancestor classification, per docs/ai/dev-server.md: a chain that reaches
 * a live terminal under the IDE means USER-STARTED — never reaped.
 */
function ownerClass(pid, procs) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const DEV = /^(cmd|node|bun|sh|bash|pnpm|deno)\.exe$/i;
  const IDE = /code|windsurf|devin|windowsterminal|wt\.exe|ptyhost/i;
  let cur = byPid.get(pid);
  let root = cur && DEV.test(cur.name) ? cur : null;
  const seen = new Set();
  const chain = new Set([pid]);
  while (cur && !seen.has(cur.ppid)) {
    seen.add(cur.ppid);
    const p = byPid.get(cur.ppid);
    if (!p) break;                     // parent dead/exited → detached orphan
    chain.add(p.pid);
    if (IDE.test(p.name) || IDE.test(p.cmd)) return { klass: 'user', root, chain };
    if (DEV.test(p.name)) root = p;    // keep walking: highest dev-chain root
    cur = p;
  }
  return { klass: 'orphan', root: root || cur, chain };
}

/** Zombies: dev processes we have no state file for — cmdline-matched,
 *  plus whatever holds a service port (bun --hot uses a relative cmdline
 *  with no repo path, so ports are the reliable key). */
function findZombies(procs) {
  const tracked = new Set(SERVICES.map((s) => readState(s.name)?.pid).filter(Boolean));
  const byCmd = new Set();
  const pat = /primebrick[\\/].*(pnpm[^\n]*\bdev|dev-hot\.mjs|--hot\s|tsx[^\n]*watch|vite\b)|pnpm[^\n]*\bdev\b/i;
  const candidates = procs.filter((p) => pat.test(p.cmd) && !tracked.has(p.pid));
  const classified = new Map();
  for (const p of candidates) {
    const c = ownerClass(p.pid, procs);
    if (c.chain && [...c.chain].some((q) => tracked.has(q))) continue; // inside a tracked tree
    if (c.klass === 'orphan' && c.root) byCmd.add(c.root.pid);
    if (c.klass === 'user') classified.set(p.pid, 'user');
  }
  // Port owners of managed ports — untracked → walk to their dev root.
  // The listener (bun/node) is never the tracked root itself — the
  // tracked cmd.exe root is an ANCESTOR: skip only if the chain hits it.
  for (const s of SERVICES) {
    const owner = portOwner(s.port);
    if (!owner || tracked.has(owner)) continue;
    const c = ownerClass(owner, procs);
    if (c.chain && [...c.chain].some((p) => tracked.has(p))) continue; // ours
    if (c.klass === 'user') { classified.set(owner, 'user'); continue; }
    if (c.root) byCmd.add(c.root.pid);
  }
  const roots = procs.filter((p) => byCmd.has(p.pid));
  const users = procs.filter((p) => classified.has(p.pid));
  return { roots, users };
}

async function cmdReap(dry) {
  const procs = processTable();
  const { roots, users } = findZombies(procs);
  for (const u of users) console.log(`  USER-STARTED pid ${u.pid} ${u.name} — kept (chain reaches IDE terminal)`);
  if (!roots.length) { if (!users.length) console.log('  no untracked primebrick dev processes'); return; }
  console.log(`  ${roots.length} zombie root tree(s):`);
  for (const r of roots) console.log(`    pid ${r.pid}  ${r.name}  ${r.cmd.slice(0, 90)}`);
  if (dry) { console.log('  --dry: nothing killed'); return; }
  for (const r of roots) {
    killTree(r.pid);
    console.log(`  killed tree pid ${r.pid}`);
  }
}

const [cmd = 'status', ...rawArgs] = process.argv.slice(2);
const flags = new Set(rawArgs.filter((a) => a.startsWith('--')));
const args = rawArgs.filter((a) => !a.startsWith('--'));
const names = args.length ? SERVICES.filter((s) => args.includes(s.name)) : SERVICES;
if (args.length && names.length !== args.length) {
  console.error(`unknown service(s): ${args.filter((a) => !SERVICES.some((s) => s.name === a)).join(', ')}`);
  console.error(`known: ${SERVICES.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

if (cmd === 'status') { await cmdStatus(); process.exit(0); }
if (cmd === 'reap') { await cmdReap(flags.has('--dry')); process.exit(0); }
if (cmd === 'stop' || cmd === 'start' || cmd === 'restart') {
  await withLock(async () => {
    const procs = processTable();
    if (cmd !== 'start') for (const s of names) console.log(await stopOne(s));
    if (cmd !== 'stop') for (const s of names) console.log(await startOne(s, procs));
  });
  process.exit(0);
}
console.error(`unknown command '${cmd}' — start|stop|restart|status|reap`);
process.exit(1);
