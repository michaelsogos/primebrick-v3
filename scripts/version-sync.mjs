import { execSync } from "node:child_process";
import fs from "node:fs";

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8").trim();
}

function getBranchName() {
  try {
    return sh("git rev-parse --abbrev-ref HEAD");
  } catch {
    return null;
  }
}

function parseTag(tag) {
  // v0.1.2
  const m = /^v(0)\.(\d+)\.(\d+)$/.exec(tag);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function cmp(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

function format(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

function latestTagVersion() {
  let tags = [];
  try {
    const out = sh('git tag --list "v0.*.*"');
    tags = out ? out.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    tags = [];
  }

  const versions = tags.map(parseTag).filter(Boolean);
  if (versions.length === 0) return { major: 0, minor: 0, patch: 0 };
  versions.sort(cmp);
  return versions[versions.length - 1];
}

function nextVersion(kind, latest) {
  if (kind === "release") return { major: 0, minor: latest.minor + 1, patch: 0 };
  if (kind === "hotfix") return { major: 0, minor: latest.minor, patch: latest.patch + 1 };
  throw new Error(`Unknown kind: ${kind}`);
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function writeJson(path, obj) {
  fs.writeFileSync(path, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

const args = new Set(process.argv.slice(2));
const branch = getBranchName();

if (!branch || branch === "HEAD") {
  process.exit(0);
}

const kind = branch.startsWith("release/")
  ? "release"
  : branch.startsWith("hotfix/")
    ? "hotfix"
    : null;

if (!kind) process.exit(0);

const latest = latestTagVersion();
const expected = nextVersion(kind, latest);
const expectedBranch = `${kind}/${format(expected)}`;

if (branch !== expectedBranch) {
  console.error(
    [
      `Branch name must match the next ${kind} version.`,
      `- Latest tag: v${format(latest)}`,
      `- Expected branch: ${expectedBranch}`,
      `- Current branch:  ${branch}`,
    ].join("\n"),
  );
  process.exit(1);
}

const pkgPath = "package.json";
const pkg = readJson(pkgPath);
const expectedVersion = format(expected);

if (pkg.version !== expectedVersion) {
  if (args.has("--check")) {
    console.error(`package.json version mismatch: expected ${expectedVersion}, got ${pkg.version ?? "<missing>"}`);
    process.exit(1);
  }
  pkg.version = expectedVersion;
  writeJson(pkgPath, pkg);
  console.log(`Updated package.json version to ${expectedVersion}`);
} else {
  console.log(`package.json version already ${expectedVersion}`);
}
