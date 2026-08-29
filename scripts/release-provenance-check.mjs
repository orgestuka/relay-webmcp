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
  schema: "relay.release-provenance-source-gate.v1",
  checkedAt: new Date().toISOString(),
  pass: false,
  checks: [],
  blockers: [],
};

try {
  const [envExample, compose, dockerfile, caddy, writer, preflight, smoke, globals] = await Promise.all([
    source(".env.deploy.example"),
    source("compose.yaml"),
    source("deploy/Dockerfile"),
    source("deploy/Caddyfile"),
    source("scripts/write-release-manifests.mjs"),
    source("scripts/deploy-preflight.mjs"),
    source("scripts/deployment-smoke.mjs"),
    source("globals.d.ts"),
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
      && preflight.includes("RELAY_RELEASE_SHA")
      && preflight.includes("git rev-parse HEAD")
      && preflight.includes("write-release-manifests.mjs"),
    "Deployment preflight must reject placeholders and missing provenance inputs before Docker runs.",
  );

  record(
    report,
    "deployed_release_consistency_smoke",
    "scripts/deployment-smoke.mjs",
    smoke.includes("releaseManifestCheck")
      && smoke.includes('headers.get("x-relay-release")')
      && smoke.includes("relay.release.v1")
      && smoke.includes("manifest?.app === app")
      && smoke.includes("manifest?.sha === expectedSha"),
    "The deployed smoke must prove every origin serves the expected application from the exact same commit.",
  );

  record(
    report,
    "vite_release_environment_contract",
    "globals.d.ts",
    globals.includes("readonly VITE_RELEASE_SHA?: string;"),
    "TypeScript must model the immutable build provenance input.",
  );
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : "Release-provenance source gate failed.");
}

report.pass = report.blockers.length === 0 && report.checks.every((entry) => entry.pass);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
