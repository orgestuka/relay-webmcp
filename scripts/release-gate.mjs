import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const full = args.includes("--full");
const requireDns = args.includes("--dns") || full;
const envIndex = args.indexOf("--env");
const outputIndex = args.indexOf("--output");
const envPath = resolve(envIndex >= 0 ? args[envIndex + 1] : ".env.deploy");
const outputPath = outputIndex >= 0 ? resolve(args[outputIndex + 1]) : null;
const expectedBranch = process.env.RELAY_RELEASE_BRANCH || "build/pact-vertical-slice";
const startedAt = Date.now();

const report = {
  schema: "relay.release-gate.v1",
  startedAt: new Date(startedAt).toISOString(),
  mode: full ? "full-deploy" : "source",
  expectedBranch,
  environmentFile: full ? envPath : null,
  source: {},
  checks: [],
  pass: false,
};

function record(id, pass, details = {}) {
  report.checks.push({ id, pass, ...details });
  return pass;
}

function capture(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: options.env ?? process.env,
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

function finish(error = null) {
  report.completedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt;
  report.error = error instanceof Error ? error.message : error;
  report.pass = !report.error && report.checks.every((check) => check.pass);
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (outputPath) writeFileSync(outputPath, serialized, "utf8");
  process.stdout.write(serialized);
  if (!report.pass) process.exitCode = 1;
}

try {
  const branchResult = capture("git", ["branch", "--show-current"]);
  const headResult = capture("git", ["rev-parse", "HEAD"]);
  const statusResult = capture("git", ["status", "--porcelain"]);
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
  if (!record("clean_worktree", clean, { dirtyEntries: statusResult.stdout ? statusResult.stdout.split("\n") : [] })) {
    throw new Error("Release gate refuses to run with uncommitted files.");
  }

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (!record("node_22", nodeMajor === 22, { version: process.version })) {
    throw new Error(`Node 22 is required, found ${process.version}.`);
  }

  execute("repository_verify", "npm", ["run", "verify"]);

  if (full) {
    if (!record("deployment_environment_present", existsSync(envPath), { path: envPath })) {
      throw new Error(`Missing deployment environment: ${envPath}`);
    }

    const preflightArgs = ["scripts/deploy-preflight.mjs", envPath];
    if (requireDns) preflightArgs.push("--dns");
    execute("deployment_preflight", "node", preflightArgs);
    execute("compose_config", "docker", ["compose", "--env-file", envPath, "config", "--quiet"]);

    const deploymentEnv = { ...process.env };
    const envText = capture("node", ["-e", `
      import { readFileSync } from 'node:fs';
      const values = {};
      for (const raw of readFileSync(${JSON.stringify(envPath)}, 'utf8').split(/\\r?\\n/)) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const index = line.indexOf('=');
        if (index < 1) continue;
        values[line.slice(0,index).trim()] = line.slice(index+1).trim().replace(/^['\"]|['\"]$/g, '');
      }
      process.stdout.write(JSON.stringify(values));
    `]);
    if (envText.status !== 0) throw new Error("Unable to parse deployment environment.");
    Object.assign(deploymentEnv, JSON.parse(envText.stdout));

    execute("caddy_validate", "docker", [
      "run", "--rm",
      "--env", `RELAY_HOST=${deploymentEnv.RELAY_HOST}`,
      "--env", `SHELTER_HOST=${deploymentEnv.SHELTER_HOST}`,
      "--env", `TRANSIT_HOST=${deploymentEnv.TRANSIT_HOST}`,
      "--env", `SUPPLY_HOST=${deploymentEnv.SUPPLY_HOST}`,
      "--env", `ACME_EMAIL=${deploymentEnv.ACME_EMAIL}`,
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
    execute("compose_up", "docker", ["compose", "--env-file", envPath, "up", "-d"]);
    execute("deployment_smoke", "node", ["scripts/deployment-smoke.mjs", envPath]);
    execute("compose_status", "docker", ["compose", "--env-file", envPath, "ps"]);
  }

  finish();
} catch (error) {
  finish(error);
}
