import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path) {
  return readFile(resolve(path), "utf8");
}

function check(report, id, path, pass, detail) {
  report.checks.push({ id, path, pass, detail });
  if (!pass) report.blockers.push(`${id}: ${detail}`);
}

function between(sourceText, start, end) {
  const startIndex = sourceText.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = sourceText.indexOf(end, startIndex + start.length);
  return endIndex < 0 ? sourceText.slice(startIndex) : sourceText.slice(startIndex, endIndex);
}

const report = {
  schema: "relay.security-headers-source-gate.v1",
  checkedAt: new Date().toISOString(),
  pass: false,
  checks: [],
  blockers: [],
};

try {
  const [caddy, nginx, commandApp, providerRuntime, deploymentSmoke] = await Promise.all([
    source("deploy/Caddyfile"),
    source("deploy/nginx.conf"),
    source("apps/relay-command/src/command-app.ts"),
    source("packages/provider-runtime/src/index.ts"),
    source("scripts/deployment-smoke.mjs"),
  ]);

  const commandPolicy = between(caddy, "(relay_command_security)", "(relay_provider_security)");
  const providerPolicy = between(caddy, "(relay_provider_security)", "\n{$RELAY_HOST} {");

  check(
    report,
    "hsts_at_https_edge",
    "deploy/Caddyfile",
    caddy.includes('Strict-Transport-Security "max-age=31536000"'),
    "The HTTPS edge must pin a one-year transport-security policy without relying on the inner HTTP containers.",
  );

  const commandCspPass = commandPolicy.includes("Content-Security-Policy")
    && commandPolicy.includes("default-src 'self'")
    && commandPolicy.includes("script-src 'self'")
    && commandPolicy.includes("style-src 'self'")
    && commandPolicy.includes("frame-src https://{$SHELTER_HOST} https://{$TRANSIT_HOST} https://{$SUPPLY_HOST}")
    && commandPolicy.includes("object-src 'none'")
    && commandPolicy.includes("base-uri 'none'")
    && commandPolicy.includes("form-action 'none'")
    && !commandPolicy.includes("unsafe-inline")
    && !commandPolicy.includes("unsafe-eval");
  check(
    report,
    "command_content_security_policy",
    "deploy/Caddyfile",
    commandCspPass,
    "Relay Command must load code only from itself and frame only the three configured provider origins.",
  );

  const providerCspPass = providerPolicy.includes("Content-Security-Policy")
    && providerPolicy.includes("default-src 'self'")
    && providerPolicy.includes("script-src 'self'")
    && providerPolicy.includes("style-src 'self'")
    && providerPolicy.includes("frame-ancestors https://{$RELAY_HOST}")
    && providerPolicy.includes("object-src 'none'")
    && providerPolicy.includes("base-uri 'none'")
    && providerPolicy.includes("form-action 'none'")
    && !providerPolicy.includes("unsafe-inline")
    && !providerPolicy.includes("unsafe-eval");
  check(
    report,
    "provider_content_security_policy",
    "deploy/Caddyfile",
    providerCspPass,
    "Provider documents must be frameable only by the configured Relay origin and execute only same-origin assets.",
  );

  const commandToolsPolicyPass = commandPolicy.includes("Permissions-Policy")
    && commandPolicy.includes('tools=(self \\"https://{$SHELTER_HOST}\\" \\"https://{$TRANSIT_HOST}\\" \\"https://{$SUPPLY_HOST}\\")')
    && !commandPolicy.includes("tools=(*)");
  check(
    report,
    "command_tools_permissions_policy",
    "deploy/Caddyfile",
    commandToolsPolicyPass,
    "Relay Command must delegate the tools feature only to itself and the three exact provider origins.",
  );

  const providerToolsPolicyPass = providerPolicy.includes('Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=(), tools=(self)"')
    && !providerPolicy.includes("tools=(*)");
  check(
    report,
    "provider_tools_permissions_policy",
    "deploy/Caddyfile",
    providerToolsPolicyPass,
    "Each provider must permit WebMCP only for its own document after delegation by Relay.",
  );

  check(
    report,
    "single_permissions_policy_owner",
    "deploy/nginx.conf",
    !nginx.includes("Permissions-Policy") && !nginx.includes("Content-Security-Policy"),
    "Only Caddy may emit dynamic origin-aware CSP and Permissions-Policy headers; duplicate inner policies can intersect and break delegation.",
  );

  check(
    report,
    "iframe_tools_delegation",
    "apps/relay-command/src/command-app.ts",
    commandApp.includes('allow="tools"') && commandApp.includes("data-provider"),
    "Every provider iframe must explicitly delegate the tools permission.",
  );

  check(
    report,
    "provider_origin_exposure",
    "packages/provider-runtime/src/index.ts",
    providerRuntime.includes("{ exposedTo: [relayOrigin] }")
      && providerRuntime.includes("new DynamicTool(")
      && providerRuntime.includes("[relayOrigin],"),
    "Provider tools must be exposed only to the exact Relay origin, including dynamic commit tools.",
  );

  const deployedSmokePass = deploymentSmoke.includes('headers.get("content-security-policy")')
    && deploymentSmoke.includes('headers.get("permissions-policy")')
    && deploymentSmoke.includes('headers.get("strict-transport-security")')
    && deploymentSmoke.includes("security_headers");
  check(
    report,
    "deployed_security_header_smoke",
    "scripts/deployment-smoke.mjs",
    deployedSmokePass,
    "The four-origin HTTPS smoke must verify CSP, Permissions-Policy and HSTS from the real edge.",
  );
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : "Security-header source check failed.");
}

report.pass = report.blockers.length === 0 && report.checks.every((entry) => entry.pass);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
