import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const full = args.includes("--full");
const requireDns = args.includes("--dns") || full;
const envIndex = args.indexOf("--env");
const outputIndex = args.indexOf("--output");
const envPath = resolve(envIndex >= 0 ? args[envIndex + 1] : ".env.deploy");
const requestedOutputPath = outputIndex >= 0 ? resolve(args[outputIndex + 1]) : null;
const expectedBranch = process.env.RELAY_RELEASE_BRANCH || "build/pact-vertical-slice";
const startedAt = Date.now();
let outputPath = requestedOutputPath;

const report = {
  schema: "relay.release-gate.v2",
  startedAt: new Date(startedAt).toISOString(),
  mode: full ? "full-deploy" : "source",
  expectedBranch,
  environmentFile: full ? envPath : null,
  source: {},
  toolchain: {},
  dependencyGraph: {},
  checks: [],
  pass: false,
};

function record(id, pass, details = {}) {
  report.checks.push({ id, pass: Boolean(pass), ...details });
  return Boolean(pass);
}

function capture(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: result.status,
    stdout: result.stdout?.trim() ?? "",
    stderr: result.stderr?.trim() ?? "",
    error: result.error?.message ?? null,
  };
}

function execute(id, command, commandArgs, options = {}) {
  const started = Date.now();
  process.stderr.write(`\n[Relay release gate] ${id}\n`);
  process.stderr.write(`$ ${command} ${commandArgs.join(" ")}\n`);
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: options.env ?? process.env,
  });
  const pass = result.status === 0 && !result.error;
  record(id, pass, {
    command: [command, ...commandArgs],
    exitCode: result.status,
    durationMs: Date.now() - started,
    error: result.error?.message ?? null,
  });
  if (!pass) throw new Error(`${id} failed`);
}

function parseEnvironment(path) {
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid environment line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function finish(error = null) {
  report.completedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt;
  report.error = error instanceof Error ? error.message : error;
  report.pass = !report.error && report.checks.every((check) => check.pass);

  const shortSha = typeof report.source.head === "string"
    ? report.source.head.slice(0, 12)
    : "unknown";
  outputPath ??= resolve(
    ".relay-artifacts",
    "release",
    `${report.mode}-release-gate-${shortSha}.json`,
  );
  report.evidencePath = outputPath;

  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized, "utf8");
  } catch (writeError) {
    report.pass = false;
    report.error = report.error
      ?? `Unable to write release evidence: ${writeError instanceof Error ? writeError.message : "write failure"}`;
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
}

let failure = null;

try {
  const branchResult = capture("git", ["branch", "--show-current"]);
  const headResult = capture("git", ["rev-parse", "HEAD"]);
  const statusResult = capture("git", ["status", "--porcelain", "--untracked-files=all"]);
  const branch = branchResult.stdout;
  const head = headResult.stdout.toLowerCase();
  const clean = statusResult.status === 0 && statusResult.stdout === "";

  report.source = { branch, head, clean };
  if (!record("git_branch", branchResult.status === 0 && branch === expectedBranch, { actual: branch, expected: expectedBranch })) {
    throw new Error(`Release must run from ${expectedBranch}, not ${branch || "<detached>"}.`);
  }
  if (!record("git_head", headResult.status === 0 && /^[0-9a-f]{40}$/.test(head), { head })) {
    throw new Error("Unable to resolve an exact 40-character Git commit.");
  }
  if (!record("clean_worktree_before", clean, { dirtyEntries: statusResult.stdout ? statusResult.stdout.split("\n") : [] })) {
    throw new Error("Release gate refuses to run with uncommitted or untracked files.");
  }

  const packagePath = resolve("package.json");
  const lockPath = resolve("package-lock.json");
  if (!record("package_json_present", existsSync(packagePath), { path: packagePath })) {
    throw new Error("package.json is missing.");
  }
  if (!record("package_lock_present", existsSync(lockPath), {
    path: lockPath,
    recovery: "Generate package-lock.json with Node 22 and npm 10.9.2, review it and commit it before rerunning the gate.",
  })) {
    throw new Error("package-lock.json is missing.");
  }

  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const lockfile = JSON.parse(readFileSync(lockPath, "utf8"));
  const expectedNpm = /^npm@(.+)$/.exec(String(packageJson.packageManager ?? ""))?.[1] ?? null;
  const lockfilePass = typeof lockfile.lockfileVersion === "number" && lockfile.lockfileVersion >= 3;
  report.dependencyGraph = {
    lockfileVersion: lockfile.lockfileVersion ?? null,
    packageManager: packageJson.packageManager ?? null,
  };
  if (!record("lockfile_version", lockfilePass, { actual: lockfile.lockfileVersion ?? null, minimum: 3 })) {
    throw new Error("package-lock.json must use lockfileVersion 3 or newer.");
  }
  if (!record("npm_pin_declared", expectedNpm === "10.9.2", { actual: expectedNpm, expected: "10.9.2" })) {
    throw new Error("package.json must pin packageManager to npm@10.9.2.");
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const npmResult = capture("npm", ["--version"]);
  report.toolchain = {
    node: process.version,
    npm: npmResult.stdout || null,
    expectedNpm,
  };
  if (!record("node_22", nodeMajor === 22, { version: process.version })) {
    throw new Error(`Node 22 is required, found ${process.version}.`);
  }
  if (!record("npm_exact", npmResult.status === 0 && npmResult.stdout === expectedNpm, {
    actual: npmResult.stdout || null,
    expected: expectedNpm,
    stderr: npmResult.stderr || null,
  })) {
    throw new Error(`npm ${expectedNpm} is required, found ${npmResult.stdout || "unavailable"}.`);
  }

  execute("script_syntax", process.execPath, ["scripts/check-script-syntax.mjs"]);
  execute("release_surface", process.execPath, ["scripts/check-release-surface.mjs"]);
  execute("locked_install", "npm", ["ci", "--no-audit", "--no-fund"]);
  execute("repository_verify", "npm", ["run", "verify"]);

  if (full) {
    if (!record("deployment_environment_present", existsSync(envPath), { path: envPath })) {
      throw new Error(`Missing deployment environment: ${envPath}`);
    }

    const dockerResult = capture("docker", ["--version"]);
    const composeResult = capture("docker", ["compose", "version"]);
    if (!record("docker_available", dockerResult.status === 0, {
      version: dockerResult.stdout || null,
      stderr: dockerResult.stderr || null,
    })) {
      throw new Error("Docker is unavailable.");
    }
    if (!record("docker_compose_available", composeResult.status === 0, {
      version: composeResult.stdout || null,
      stderr: composeResult.stderr || null,
    })) {
      throw new Error("Docker Compose v2 is unavailable.");
    }

    const deploymentEnv = { ...process.env, ...parseEnvironment(envPath) };
    const preflightArgs = ["scripts/deploy-preflight.mjs", envPath];
    if (requireDns) preflightArgs.push("--dns");
    execute("deployment_preflight", process.execPath, preflightArgs);
    execute("compose_config", "docker", ["compose", "--env-file", envPath, "config", "--quiet"]);

    execute("caddy_validate", "docker", [
      "run", "--rm",
      "--env", `RELAY_HOST=${deploymentEnv.RELAY_HOST}`,
      "--env", `SHELTER_HOST=${deploymentEnv.SHELTER_HOST}`,
      "--env", `TRANSIT_HOST=${deploymentEnv.TRANSIT_HOST}`,
      "--env", `SUPPLY_HOST=${deploymentEnv.SUPPLY_HOST}`,
      "--env", `ACME_EMAIL=${deploymentEnv.ACME_EMAIL}`,
      "--env", `RELAY_RELEASE_SHA=${deploymentEnv.RELAY_RELEASE_SHA}`,
      "--volume", `${resolve("deploy/Caddyfile")}:/etc/caddy/Caddyfile:ro`,
      "caddy:2-alpine",
      "caddy", "validate", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile",
    ]);
    execute("nginx_validate", "docker", [
      "run", "--rm",
      "--volume", `${resolve("deploy/nginx.conf")}:/etc/nginx/conf.d/default.conf:ro`,
      "nginx:alpine",
      "nginx", "-t",
    ]);
    execute("compose_build", "docker", ["compose", "--env-file", envPath, "build", "--pull"]);
    execute("compose_up", "docker", ["compose", "--env-file", envPath, "up", "-d", "--remove-orphans"]);
    execute("deployment_smoke", process.execPath, ["scripts/deployment-smoke.mjs", envPath]);
    execute("compose_status", "docker", ["compose", "--env-file", envPath, "ps"]);
  }
} catch (error) {
  failure = error;
}

try {
  const dirtyAfter = capture("git", ["status", "--porcelain", "--untracked-files=all"]);
  const cleanAfter = dirtyAfter.status === 0 && dirtyAfter.stdout === "";
  if (!record("clean_worktree_after", cleanAfter, {
    dirtyEntries: dirtyAfter.stdout ? dirtyAfter.stdout.split("\n") : [],
  }) && !failure) {
    failure = new Error("Release verification changed tracked or unignored files.");
  }
} catch (error) {
  if (!failure) failure = error;
}

finish(failure);
