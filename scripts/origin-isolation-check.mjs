import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const viteConfigs = [
  "apps/relay-command/vite.config.ts",
  "apps/shelter-grid/vite.config.ts",
  "apps/transit-ops/vite.config.ts",
  "apps/supply-hub/vite.config.ts",
];

async function source(path) {
  return readFile(resolve(path), "utf8");
}

function record(checks, id, path, pass, detail) {
  checks.push({ id, path, pass, detail });
}

const checks = [];
const blockers = [];

try {
  const caddy = await source("deploy/Caddyfile");
  const caddyPass = caddy.includes('Origin-Agent-Cluster "?1"');
  record(checks, "production_edge_header", "deploy/Caddyfile", caddyPass, "Caddy must set Origin-Agent-Cluster: ?1 for every Relay hostname.");
  if (!caddyPass) blockers.push("Caddy does not enforce Origin-Agent-Cluster: ?1.");

  for (const path of viteConfigs) {
    const config = await source(path);
    const headerPass = config.includes('"Origin-Agent-Cluster": "?1"');
    const serverPass = /server\s*:\s*\{[\s\S]*?headers\s*:\s*originIsolationHeaders/.test(config);
    const previewPass = /preview\s*:\s*\{[\s\S]*?headers\s*:\s*originIsolationHeaders/.test(config);
    const pass = headerPass && serverPass && previewPass;
    record(checks, `vite_origin_isolation_${path.split("/")[1]}`, path, pass, "Vite dev and preview must both serve the origin-keying header.");
    if (!pass) blockers.push(`${path} does not enforce origin isolation in both dev and preview.`);
  }

  const globals = await source("globals.d.ts");
  const globalsPass = globals.includes("readonly originAgentCluster: boolean;");
  record(checks, "typescript_dom_augmentation", "globals.d.ts", globalsPass, "TypeScript 5.8 requires an explicit Window.originAgentCluster declaration.");
  if (!globalsPass) blockers.push("Window.originAgentCluster DOM augmentation is missing.");

  const bootstrap = await source("apps/relay-command/src/bootstrap.ts");
  const bootstrapPass = bootstrap.includes("assertWebMcpEnvironment")
    && bootstrap.includes("window.originAgentCluster !== true")
    && bootstrap.includes("Origin-Agent-Cluster: ?1");
  record(checks, "command_fail_closed_boot", "apps/relay-command/src/bootstrap.ts", bootstrapPass, "Relay Command must reject an explicitly non-origin-keyed browser context before presenting a false live state.");
  if (!bootstrapPass) blockers.push("Relay Command does not fail closed when origin keying is absent.");

  const diagnostics = await source("apps/relay-command/src/release-diagnostics.ts");
  const diagnosticPass = diagnostics.includes("originIsolationPass")
    && diagnostics.includes("originAgentClusterSupported")
    && diagnostics.includes('requiredHeader: "Origin-Agent-Cluster: ?1"')
    && /const overallPass = originIsolationPass/.test(diagnostics);
  record(checks, "machine_readable_origin_diagnostic", "apps/relay-command/src/release-diagnostics.ts", diagnosticPass, "The ChatGPT diagnostic must expose and enforce the runtime origin-isolation result.");
  if (!diagnosticPass) blockers.push("relay_diagnose_webmcp does not enforce origin isolation.");

  const deploymentSmoke = await source("scripts/deployment-smoke.mjs");
  const smokePass = deploymentSmoke.includes('page.headers.get("origin-agent-cluster")')
    && deploymentSmoke.includes('originAgentCluster?.trim() === "?1"');
  record(checks, "deployed_header_smoke", "scripts/deployment-smoke.mjs", smokePass, "The four-origin HTTPS smoke must reject any origin missing the exact header.");
  if (!smokePass) blockers.push("Deployment smoke does not verify Origin-Agent-Cluster: ?1.");
} catch (error) {
  blockers.push(error instanceof Error ? error.message : "Origin-isolation source check failed.");
}

const report = {
  schema: "relay.origin-isolation-source-gate.v1",
  checkedAt: new Date().toISOString(),
  specificationInvariant: "WebMCP registerTool/getTools reject non-origin-keyed non-file documents with SecurityError.",
  requiredResponseHeader: "Origin-Agent-Cluster: ?1",
  pass: blockers.length === 0 && checks.every((check) => check.pass),
  checks,
  blockers,
};

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
