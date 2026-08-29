import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path) {
  return readFile(resolve(path), "utf8");
}

function record(report, id, path, pass, detail) {
  report.checks.push({ id, path, pass, detail });
  if (!pass) report.blockers.push(`${id}: ${detail}`);
}

const report = {
  schema: "relay.release-provenance-source-gate.v3",
  checkedAt: new Date().toISOString(),
  pass: false,
  checks: [],
  blockers: [],
};

try {
  const [
    envExample,
    compose,
    dockerfile,
    caddy,
    writer,
    preflight,
    smoke,
    globals,
    bootstrap,
    releaseProvenance,
    releaseIdentity,
    diagnostics,
  ] = await Promise.all([
    source(".env.deploy.example"),
    source("compose.yaml"),
    source("deploy/Dockerfile"),
    source("deploy/Caddyfile"),
    source("scripts/write-release-manifests.mjs"),
    source("scripts/deploy-preflight.mjs"),
    source("scripts/deployment-smoke.mjs"),
    source("globals.d.ts"),
    source("apps/relay-command/src/bootstrap.ts"),
    source("apps/relay-command/src/release-provenance.ts"),
    source("apps/relay-command/src/release-identity.ts"),
    source("apps/relay-command/src/release-diagnostics.ts"),
  ]);

  record(
    report,
    "deployment_input_declared",
    ".env.deploy.example",
    envExample.includes("RELAY_RELEASE_SHA=") && envExample.includes("40-character commit"),
    "The deployment contract must require the exact Git commit SHA.",
  );

  record(
    report,
    "compose_build_and_edge_propagation",
    "compose.yaml",
    compose.includes("VITE_RELEASE_SHA: ${RELAY_RELEASE_SHA}")
      && compose.includes("RELAY_RELEASE_SHA: ${RELAY_RELEASE_SHA}"),
    "The exact SHA must reach both the static build and the HTTPS edge.",
  );

  record(
    report,
    "docker_deterministic_install",
    "deploy/Dockerfile",
    dockerfile.includes("COPY package.json package-lock.json")
      && dockerfile.includes("npm install --global npm@10.9.2")
      && dockerfile.includes('test "$(npm --version)" = "10.9.2"')
      && dockerfile.includes("npm ci --no-audit --no-fund")
      && !dockerfile.includes("RUN npm install --no-audit --no-fund"),
    "The production image must be built from the committed lockfile with the pinned npm release.",
  );

  record(
    report,
    "docker_manifest_generation",
    "deploy/Dockerfile",
    dockerfile.includes("ARG VITE_RELEASE_SHA")
      && dockerfile.includes("VITE_RELEASE_SHA=$VITE_RELEASE_SHA")
      && dockerfile.includes('node scripts/write-release-manifests.mjs "$VITE_RELEASE_SHA"'),
    "The production image must generate release manifests after all four applications build.",
  );

  record(
    report,
    "edge_release_header",
    "deploy/Caddyfile",
    caddy.includes("X-Relay-Release {$RELAY_RELEASE_SHA}"),
    "Every origin must expose the same release SHA at the trusted HTTPS edge.",
  );

  record(
    report,
    "manifest_writer_validates_sha",
    "scripts/write-release-manifests.mjs",
    writer.includes("relay.release.v1")
      && writer.includes("non-zero 40-character Git commit SHA")
      && writer.includes('resolve(dist, "release.json")')
      && writer.includes('"relay-command"')
      && writer.includes('"shelter-grid"')
      && writer.includes('"transit-ops"')
      && writer.includes('"supply-hub"'),
    "Manifest generation must fail closed and write one identity-bound file per application.",
  );

  record(
    report,
    "preflight_release_validation",
    "scripts/deploy-preflight.mjs",
    preflight.includes("validReleaseSha")
      && preflight.includes("execFileSync")
      && preflight.includes("release_sha_matches_checkout")
      && preflight.includes("result.releaseSha === result.currentGitSha")
      && preflight.includes("clean_checkout")
      && preflight.includes("write-release-manifests.mjs"),
    "Deployment preflight must reject placeholders, dirty trees and a SHA that differs from the exact checkout before Docker runs.",
  );

  record(
    report,
    "deployed_root_and_manifest_identity",
    "scripts/deployment-smoke.mjs",
    smoke.includes("releaseManifestCheck")
      && smoke.includes("pageHeaderRaw")
      && smoke.includes("pageHeaderSha")
      && smoke.includes("manifestHeaderRaw")
      && smoke.includes("manifestHeaderSha")
      && smoke.includes("manifestOriginAgentCluster")
      && smoke.includes("manifest?.schema === \"relay.release.v1\"")
      && smoke.includes("manifest?.app === app")
      && smoke.includes("manifest?.sha === expectedSha"),
    "The deployed smoke must prove the root response and release manifest independently expose one consistent exact release identity.",
  );

  record(
    report,
    "deployed_conflicting_header_rejection",
    "scripts/deployment-smoke.mjs",
    smoke.includes("function consistentHeaderValue")
      && smoke.includes("new Set(values).size === 1")
      && smoke.includes("consistentHeaderValue(pageHeaderRaw)")
      && smoke.includes("consistentHeaderValue(manifestHeaderRaw)"),
    "Repeated identical proxy headers may be normalized, but conflicting release identities must fail the deployed smoke.",
  );

  record(
    report,
    "vite_release_environment_contract",
    "globals.d.ts",
    globals.includes("readonly VITE_RELEASE_SHA?: string;"),
    "TypeScript must model the immutable build provenance input.",
  );

  record(
    report,
    "shared_release_sha_validator",
    "apps/relay-command/src/release-provenance.ts",
    releaseProvenance.includes("normalizeReleaseSha")
      && releaseProvenance.includes("consistentHeaderValue")
      && releaseProvenance.includes("new Set(values)")
      && releaseProvenance.includes("validReleaseSha")
      && releaseProvenance.includes("assertCompiledReleaseSha")
      && releaseProvenance.includes("non-zero 40-character Git commit"),
    "Boot, ChatGPT identity and deployed smoke must share a fail-closed exact SHA model, including conflicting duplicate header rejection.",
  );

  record(
    report,
    "production_boot_provenance_guard",
    "apps/relay-command/src/bootstrap.ts",
    bootstrap.includes("assertCompiledReleaseSha")
      && bootstrap.includes("VITE_RELEASE_SHA")
      && bootstrap.includes("localDevelopment: commandIsLocal"),
    "A non-local Relay Command must reject a missing, placeholder or malformed compiled release SHA before registering tools.",
  );

  record(
    report,
    "chatgpt_release_identity_tool",
    "apps/relay-command/src/release-identity.ts",
    bootstrap.includes('import("./release-identity")')
      && releaseIdentity.includes('name: "relay_get_release_identity"')
      && releaseIdentity.includes('fetch("/release.json"')
      && releaseIdentity.includes('response.headers.get("x-relay-release")')
      && releaseIdentity.includes("consistentHeaderValue(edgeHeaderRaw)")
      && releaseIdentity.includes("edgeHeaderConsistent")
      && releaseIdentity.includes("conflicting X-Relay-Release response headers")
      && releaseIdentity.includes("responseOk")
      && releaseIdentity.includes("compiledSha === edgeSha")
      && releaseIdentity.includes("edgeSha === manifestSha")
      && releaseIdentity.includes('schema: "relay.release-identity.v1"'),
    "ChatGPT must prove a successful manifest response and one non-conflicting release identity across compiled application, trusted edge and manifest body.",
  );

  record(
    report,
    "diagnostic_requires_deployed_identity",
    "apps/relay-command/src/release-diagnostics.ts",
    diagnostics.includes("provenanceRequired")
      && diagnostics.includes("readDiagnosticReleaseIdentity")
      && diagnostics.includes("const provenancePass = semanticSuccess(releaseIdentity)")
      && diagnostics.includes("const overallPass = provenancePass")
      && diagnostics.includes("compiledReleaseSha"),
    "The production ChatGPT diagnostic must fail unless the deployed release identity is internally consistent.",
  );
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : "Release-provenance source gate failed.");
}

report.pass = report.blockers.length === 0 && report.checks.every((entry) => entry.pass);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
