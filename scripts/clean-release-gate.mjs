import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REQUIRED_BRANCH = "build/pact-vertical-slice";
const MAX_CAPTURE = 20_000;

function run(command, args, options = {}) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
    ...options,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    command: [command, ...args].join(" "),
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - startedAt,
    stdout: stdout.slice(-MAX_CAPTURE),
    stderr: stderr.slice(-MAX_CAPTURE),
    pass: result.status === 0,
  };
}

function value(command, args) {
  const result = run(command, args);
  if (!result.pass) throw new Error(`${result.command} failed: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function major(value) {
  const match = String(value).match(/^(?:v)?(\d+)/);
  return match ? Number(match[1]) : Number.NaN;
}

const report = {
  schema: "relay.clean-release-gate.v2",
  startedAt: new Date().toISOString(),
  branch: null,
  sha: null,
  node: process.version,
  npm: null,
  lockfileVersion: null,
  pass: false,
  blockers: [],
  checks: [],
  evidenceBoundary: "Clean local checkout, deterministic tests and production-build evidence. This is not deployed four-origin or actual ChatGPT browser evidence.",
};

try {
  report.branch = value("git", ["branch", "--show-current"]);
  report.sha = value("git", ["rev-parse", "HEAD"]);
  report.npm = value("npm", ["--version"]);

  if (report.branch !== REQUIRED_BRANCH) {
    report.blockers.push(`Expected branch ${REQUIRED_BRANCH}, found ${report.branch || "detached HEAD"}.`);
  }
  if (major(process.version) !== 22) {
    report.blockers.push(`Node 22 is required, found ${process.version}.`);
  }
  if (major(report.npm) !== 10) {
    report.blockers.push(`npm 10 is required, found ${report.npm}.`);
  }

  const dirtyBefore = run("git", ["status", "--porcelain", "--untracked-files=all"]);
  report.checks.push({ id: "clean_worktree_before", ...dirtyBefore });
  if (!dirtyBefore.pass || dirtyBefore.stdout.trim()) {
    report.blockers.push("Working tree must be clean before the release gate runs.");
  }

  const diffCheck = run("git", ["diff", "--check"]);
  report.checks.push({ id: "git_diff_check", ...diffCheck });
  if (!diffCheck.pass) report.blockers.push("git diff --check reported whitespace or conflict-marker defects.");

  const lockPath = resolve(ROOT, "package-lock.json");
  if (!existsSync(lockPath)) {
    report.blockers.push("package-lock.json is missing. Generate it with Node 22/npm 10, review it, commit it and rerun this gate.");
  } else {
    try {
      const lock = JSON.parse(await readFile(lockPath, "utf8"));
      report.lockfileVersion = lock.lockfileVersion ?? null;
      if (typeof report.lockfileVersion !== "number" || report.lockfileVersion < 3) {
        report.blockers.push(`Expected npm lockfileVersion >= 3, found ${String(report.lockfileVersion)}.`);
      }
    } catch (error) {
      report.blockers.push(`package-lock.json is invalid JSON: ${error instanceof Error ? error.message : "parse failure"}.`);
    }
  }

  if (report.blockers.length === 0) {
    const commands = [
      ["npm", ["ci", "--no-audit", "--no-fund"]],
      ["npm", ["run", "verify"]],
    ];

    for (const [command, args] of commands) {
      const result = run(command, args);
      report.checks.push(result);
      if (!result.pass) {
        report.blockers.push(`${result.command} failed.`);
        break;
      }
    }
  }

  const dirtyAfter = run("git", ["status", "--porcelain", "--untracked-files=all"]);
  report.checks.push({ id: "clean_worktree_after", ...dirtyAfter });
  if (!dirtyAfter.pass || dirtyAfter.stdout.trim()) {
    report.blockers.push("Release verification changed tracked or unignored files. Build and test commands must be reproducible and side-effect free.");
  }
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : "Unknown clean-release failure.");
}

report.pass = report.blockers.length === 0 && report.checks.every((entry) => entry.pass);
report.finishedAt = new Date().toISOString();

const evidenceDir = resolve(ROOT, ".relay-artifacts", "clean-release");
await mkdir(evidenceDir, { recursive: true });
const shortSha = typeof report.sha === "string" ? report.sha.slice(0, 12) : "unknown";
const evidencePath = resolve(evidenceDir, `clean-release-gate-${shortSha}.json`);
await writeFile(evidencePath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  pass: report.pass,
  branch: report.branch,
  sha: report.sha,
  evidencePath,
  blockers: report.blockers,
}, null, 2));

if (!report.pass) process.exitCode = 1;
