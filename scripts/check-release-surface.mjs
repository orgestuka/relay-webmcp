import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  globals: "globals.d.ts",
  compose: "compose.yaml",
  dockerfile: "deploy/Dockerfile",
  caddy: "deploy/Caddyfile",
  nginx: "deploy/nginx.conf",
  commandVite: "apps/relay-command/vite.config.ts",
  shelterVite: "apps/shelter-grid/vite.config.ts",
  transitVite: "apps/transit-ops/vite.config.ts",
  supplyVite: "apps/supply-hub/vite.config.ts",
  bootstrap: "apps/relay-command/src/bootstrap.ts",
  bridge: "apps/relay-command/src/compatibility-bridge.ts",
  diagnostics: "apps/relay-command/src/release-diagnostics.ts",
  audit: "apps/relay-command/src/audit-consistency.ts",
};

const content = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

const checks = [];
function check(id, pass, file, detail) {
  checks.push({ id, pass, file, detail });
}

for (const key of ["commandVite", "shelterVite", "transitVite", "supplyVite"]) {
  check(`${key}_origin_agent_cluster`, content[key].includes('"Origin-Agent-Cluster": "?1"'), files[key], "Vite dev and preview must request an origin-keyed agent cluster.");
  check(`${key}_tools_policy`, content[key].includes('"Permissions-Policy"') && content[key].includes("tools=*"), files[key], "Local WebMCP surfaces must not silently disable the tools feature.");
  check(`${key}_preview_headers`, content[key].includes("preview:") && content[key].includes("headers: webMcpHeaders"), files[key], "Vite preview must match dev response headers.");
}

check("caddy_origin_agent_cluster", content.caddy.includes('Origin-Agent-Cluster "?1"'), files.caddy, "Public HTTPS edge must origin-key every Relay document.");
check("caddy_build_sha", content.caddy.includes('X-Relay-Build-SHA "{$RELAY_BUILD_SHA}"'), files.caddy, "Every public response must expose the deployed source SHA.");
check("caddy_command_delegation", content.caddy.includes("tools=(self") && content.caddy.includes("{$SHELTER_HOST}") && content.caddy.includes("{$TRANSIT_HOST}") && content.caddy.includes("{$SUPPLY_HOST}"), files.caddy, "Relay Command must delegate only to the exact providers.");
check("caddy_provider_self_only", content.caddy.includes("relay_provider_permissions") && content.caddy.includes("tools=(self)"), files.caddy, "Provider documents must not delegate consequential tools further.");

check("nginx_origin_agent_cluster", content.nginx.includes('Origin-Agent-Cluster "?1"'), files.nginx, "Application server must preserve origin isolation even without Caddy.");
check("nginx_tools_policy", content.nginx.includes("tools=*"), files.nginx, "Internal application policy must leave public-edge delegation effective.");
check("nginx_no_store", content.nginx.includes('Cache-Control "no-store"'), files.nginx, "HTML must not be cached across release changes.");
check("nginx_immutable_assets", content.nginx.includes("immutable"), files.nginx, "Hashed assets should be immutable.");

check("compose_build_sha_apps", content.compose.includes("VITE_RELAY_BUILD_SHA: ${RELAY_BUILD_SHA}"), files.compose, "All bundles must receive the exact checkout SHA.");
check("compose_build_sha_caddy", content.compose.includes("RELAY_BUILD_SHA: ${RELAY_BUILD_SHA}"), files.compose, "Caddy must expose the same SHA as the application bundles.");
check("compose_read_only", content.compose.includes("read_only: true"), files.compose, "Static application containers must be read-only.");
check("compose_no_new_privileges", content.compose.includes("no-new-privileges:true"), files.compose, "Application containers must block privilege escalation.");

check("docker_build_sha_arg", content.dockerfile.includes("ARG VITE_RELAY_BUILD_SHA") && content.dockerfile.includes("VITE_RELAY_BUILD_SHA=$VITE_RELAY_BUILD_SHA"), files.dockerfile, "Docker must embed release provenance.");
check("docker_verifies_before_runtime", content.dockerfile.indexOf("RUN npm run verify") < content.dockerfile.indexOf("FROM nginx:alpine"), files.dockerfile, "Unverified source must not reach the runtime image.");
check("docker_copies_deploy_before_verify", content.dockerfile.indexOf("COPY deploy ./deploy") < content.dockerfile.indexOf("RUN npm run verify"), files.dockerfile, "Source checks need deployment configuration during image build.");

check("globals_build_sha", content.globals.includes("VITE_RELAY_BUILD_SHA"), files.globals, "TypeScript must know release provenance metadata.");
check("globals_origin_agent_cluster", content.globals.includes("originAgentCluster"), files.globals, "TypeScript must model the browser isolation signal.");

check("bootstrap_secure_context", content.bootstrap.includes("window.isSecureContext"), files.bootstrap, "Production boot must fail outside a secure context.");
check("bootstrap_origin_isolation", content.bootstrap.includes("window.originAgentCluster !== true"), files.bootstrap, "Production boot must fail in a non-origin-keyed cluster.");
check("bootstrap_source_provenance", content.bootstrap.includes("assertBuildProvenance") && content.bootstrap.includes("VITE_RELAY_BUILD_SHA"), files.bootstrap, "Production boot must fail without an exact source SHA.");
check("bootstrap_distinct_origins", content.bootstrap.includes("Every WebMCP provider must run on a distinct origin"), files.bootstrap, "Provider origins cannot collapse into one trust boundary.");

check("bridge_fixed_origins", !content.bridge.includes("arbitraryOrigin") || content.bridge.includes("arbitraryOriginSelection: false"), files.bridge, "Bridge must not accept an arbitrary origin selector.");
check("bridge_approval_gate", content.bridge.includes("requiresHumanApproval") && content.bridge.includes("HUMAN_APPROVAL_REQUIRED") && content.bridge.includes('planStatus === "APPROVED"'), files.bridge, "Top-level commit wrappers must exist only after exact human approval.");
check("bridge_provider_acceptance", content.bridge.includes("providerAccepted") && content.bridge.includes("recordApprovalEvidence"), files.bridge, "Approval evidence must be recorded only after provider success.");

check("diagnostic_source_sha", content.diagnostics.includes("buildSourceSha") && content.diagnostics.includes("provenancePass"), files.diagnostics, "ChatGPT diagnostic must identify the exact deployed source.");
check("diagnostic_semantic_probes", content.diagnostics.includes("semanticSuccess") && content.diagnostics.includes("providerExecutionPass"), files.diagnostics, "Listed tools are insufficient; provider execution must return semantic success.");
check("diagnostic_audit_v2", content.diagnostics.includes('schema: "relay.audit.v2"') && content.diagnostics.includes("evaluateAuditConsistency"), files.diagnostics, "Final evidence must use exact audit equality v2.");

check("audit_exact_plan_hash", content.audit.includes("exactApprovalHash") && content.audit.includes("currentPlanHash"), files.audit, "Approval must bind the current canonical plan hash.");
check("audit_exact_scope_set", content.audit.includes("exactScopeSet") && content.audit.includes("exactScopeArguments"), files.audit, "Approved scopes must exactly match plan proposals.");
check("audit_exact_receipt_set", content.audit.includes("exactReceiptSet") && content.audit.includes("exactReceiptArguments"), files.audit, "Receipts must exactly match plan proposals and provenance.");
check("audit_aggregate_equality", content.audit.includes("planTotalConsistent") && content.audit.includes("scopeTotalConsistent") && content.audit.includes("receiptTotalConsistent"), files.audit, "Plan, scope and receipt aggregates must agree.");
check("audit_single_approval", content.audit.includes("exactly one provider-accepted approval capsule is required"), files.audit, "One scenario must resolve to one accepted human authority capsule.");

check("package_release_gate", content.package.includes('"gate:source"') && content.package.includes('"gate:release"'), files.package, "Operators need one fail-closed release command.");
check("package_script_checks", content.package.includes('"check:scripts"'), files.package, "Release scripts must be syntax-checked before build.");

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "relay.release-surface-check.v1",
  checkedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checkCount: checks.length,
  failures,
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
