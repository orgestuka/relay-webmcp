import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const files = {
  package: "package.json",
  lockfile: "package-lock.json",
  nvmrc: ".nvmrc",
  ci: ".github/workflows/ci.yml",
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
  bridgeReadiness: "apps/relay-command/src/bridge-readiness.ts",
  releaseProvenance: "apps/relay-command/src/release-provenance.ts",
  releaseIdentity: "apps/relay-command/src/release-identity.ts",
  bridge: "apps/relay-command/src/compatibility-bridge.ts",
  providerRpcClient: "apps/relay-command/src/provider-rpc-client.ts",
  capabilitySurface: "apps/relay-command/src/capability-surface.ts",
  diagnostics: "apps/relay-command/src/release-diagnostics.ts",
  providerRuntime: "packages/provider-runtime/src/index.ts",
  webmcpRuntime: "packages/webmcp-runtime/src/index.ts",
  contracts: "packages/contracts/src/index.ts",
  audit: "apps/relay-command/src/audit-consistency.ts",
  releaseGate: "scripts/release-gate.mjs",
  deploymentSmoke: "scripts/deployment-smoke.mjs",
  scriptSyntax: "scripts/check-script-syntax.mjs",
};

const content = {};
for (const [key, path] of Object.entries(files)) {
  content[key] = existsSync(path) ? await readFile(path, "utf8") : null;
}

const checks = [];
function check(id, pass, file, detail) {
  checks.push({ id, pass: Boolean(pass), file, detail });
}

let packageJson = null;
try {
  packageJson = JSON.parse(content.package ?? "null");
} catch {
  packageJson = null;
}

let lockfile = null;
try {
  lockfile = JSON.parse(content.lockfile ?? "null");
} catch {
  lockfile = null;
}

check(
  "package_json_valid",
  packageJson && typeof packageJson === "object",
  files.package,
  "package.json must be valid JSON.",
);
check(
  "package_lock_committed",
  content.lockfile !== null && lockfile?.lockfileVersion >= 3,
  files.lockfile,
  "A committed npm lockfileVersion 3 dependency graph is required for npm ci, CI and Docker reproducibility.",
);
check(
  "exact_toolchain_declared",
  packageJson?.packageManager === "npm@10.9.2"
    && packageJson?.engines?.node === "22.16.0"
    && packageJson?.engines?.npm === "10.9.2"
    && content.nvmrc?.trim() === "22.16.0",
  `${files.package}, ${files.nvmrc}`,
  "packageManager, engines and .nvmrc must agree on Node 22.16.0 and npm 10.9.2.",
);

const ci = content.ci ?? "";
check("ci_uses_nvmrc", ci.includes("node-version-file: .nvmrc"), files.ci, "GitHub Actions must consume the same exact Node pin as local validation.");
check("ci_locked_install", ci.includes("npm ci --no-audit --no-fund") && !ci.includes("npm install --no-audit --no-fund"), files.ci, "CI must install the committed lockfile rather than resolve a new dependency graph.");
check("ci_runs_full_verify", ci.includes("npm run verify"), files.ci, "CI must execute the complete repository verification graph.");
check(
  "ci_embeds_exact_commit",
  ci.includes('sha=$(git rev-parse HEAD)')
    && ci.includes("RELAY_RELEASE_SHA=${RELEASE_SHA}")
    && ci.includes('--build-arg VITE_RELEASE_SHA="${RELEASE_SHA}"'),
  files.ci,
  "CI preflight and image build must identify the exact checked-out commit.",
);

for (const key of ["commandVite", "shelterVite", "transitVite", "supplyVite"]) {
  const source = content[key] ?? "";
  check(`${key}_origin_agent_cluster`, source.includes('"Origin-Agent-Cluster": "?1"'), files[key], "Vite dev and preview must request an origin-keyed agent cluster.");
  check(`${key}_tools_policy`, source.includes('"Permissions-Policy"') && source.includes("tools=*"), files[key], "Local WebMCP surfaces must not silently disable the tools feature.");
  check(`${key}_server_headers`, source.includes("server:") && source.includes("headers: webMcpHeaders"), files[key], "Vite dev must use the shared WebMCP response headers.");
  check(`${key}_preview_headers`, source.includes("preview:") && source.includes("headers: webMcpHeaders"), files[key], "Vite preview must match dev response headers.");
}

const caddy = content.caddy ?? "";
check("caddy_origin_agent_cluster", caddy.includes('Origin-Agent-Cluster "?1"'), files.caddy, "Public HTTPS edge must origin-key every Relay document.");
check("caddy_release_sha", caddy.includes("X-Relay-Release {$RELAY_RELEASE_SHA}"), files.caddy, "Every public response must expose the exact deployed release SHA.");
check("caddy_command_delegation", caddy.includes("(relay_command_security)") && caddy.includes("tools=(self") && caddy.includes("{$SHELTER_HOST}") && caddy.includes("{$TRANSIT_HOST}") && caddy.includes("{$SUPPLY_HOST}"), files.caddy, "Relay Command must delegate tools only to the exact providers.");
check("caddy_provider_self_only", caddy.includes("(relay_provider_security)") && caddy.includes("tools=(self)"), files.caddy, "Provider documents must not delegate consequential tools further.");
check("caddy_hsts", caddy.includes('Strict-Transport-Security "max-age=31536000"'), files.caddy, "The HTTPS edge must emit HSTS.");

const nginx = content.nginx ?? "";
const nginxOacCount = (nginx.match(/add_header Origin-Agent-Cluster "\?1" always;/g) ?? []).length;
check("nginx_origin_agent_cluster", nginxOacCount >= 4, files.nginx, "Nginx must repeat Origin-Agent-Cluster inside every location that owns an add_header set.");
check("nginx_nosniff", (nginx.match(/add_header X-Content-Type-Options "nosniff" always;/g) ?? []).length >= 4, files.nginx, "Nginx must preserve nosniff through header-owning locations.");
check("nginx_referrer_policy", (nginx.match(/add_header Referrer-Policy "no-referrer" always;/g) ?? []).length >= 4, files.nginx, "Nginx must preserve the referrer policy through header-owning locations.");
check("nginx_no_dynamic_policy_collision", !nginx.includes("Content-Security-Policy") && !nginx.includes("Permissions-Policy"), files.nginx, "Dynamic origin-aware CSP and Permissions-Policy must have one owner at Caddy.");
check("nginx_no_store", nginx.includes('Cache-Control "no-store"'), files.nginx, "HTML and health responses must not be cached across release changes.");
check("nginx_immutable_assets", nginx.includes("immutable"), files.nginx, "Hashed assets should be immutable.");

const compose = content.compose ?? "";
check("compose_release_sha_apps", compose.includes("VITE_RELEASE_SHA: ${RELAY_RELEASE_SHA}"), files.compose, "All bundles must receive the exact checkout SHA.");
check("compose_release_sha_caddy", compose.includes("RELAY_RELEASE_SHA: ${RELAY_RELEASE_SHA}"), files.compose, "Caddy must expose the same SHA as the application bundles.");
check("compose_read_only", compose.includes("read_only: true"), files.compose, "Static application containers must be read-only.");
check("compose_no_new_privileges", compose.includes("no-new-privileges:true"), files.compose, "Application containers must block privilege escalation.");

const dockerfile = content.dockerfile ?? "";
check("docker_exact_node_image", dockerfile.startsWith("FROM node:22.16.0-alpine AS build") && dockerfile.includes('test "$(node --version)" = "v22.16.0"'), files.dockerfile, "The production build must use and verify Node 22.16.0 exactly.");
check("docker_release_sha_arg", dockerfile.includes("ARG VITE_RELEASE_SHA") && dockerfile.includes("VITE_RELEASE_SHA=$VITE_RELEASE_SHA"), files.dockerfile, "Docker must embed release provenance.");
check("docker_locked_install", dockerfile.includes("COPY package.json package-lock.json") && dockerfile.includes("npm ci --no-audit --no-fund") && dockerfile.includes("npm@10.9.2"), files.dockerfile, "Docker must install the committed lockfile with the pinned npm version.");
check(
  "docker_verification_inputs",
  dockerfile.includes("vitest.config.ts vitest.setup.ts")
    && dockerfile.includes("COPY compose.yaml .env.deploy.example ./")
    && dockerfile.includes("COPY .github/workflows/ci.yml ./.github/workflows/ci.yml"),
  files.dockerfile,
  "The Docker build must include every repository-level input consumed by the full verification graph.",
);
check("docker_verifies_before_runtime", dockerfile.indexOf("RUN npm run verify") >= 0 && dockerfile.indexOf("RUN npm run verify") < dockerfile.indexOf("FROM nginx:alpine"), files.dockerfile, "Unverified source must not reach the runtime image.");
check("docker_release_manifests", dockerfile.includes('node scripts/write-release-manifests.mjs "$VITE_RELEASE_SHA"'), files.dockerfile, "Every built application must receive a release manifest bound to the exact SHA.");

const globals = content.globals ?? "";
check("globals_release_sha", globals.includes("VITE_RELEASE_SHA"), files.globals, "TypeScript must know release provenance metadata.");
check("globals_origin_agent_cluster", globals.includes("originAgentCluster"), files.globals, "TypeScript must model the browser isolation signal.");

const bootstrap = content.bootstrap ?? "";
check("bootstrap_secure_context", bootstrap.includes("window.isSecureContext"), files.bootstrap, "Relay boot must fail outside a secure context.");
check("bootstrap_origin_isolation", bootstrap.includes("window.originAgentCluster !== true"), files.bootstrap, "Relay boot must fail in a non-origin-keyed cluster.");
check("bootstrap_release_provenance", bootstrap.includes("assertCompiledReleaseSha") && bootstrap.includes("VITE_RELEASE_SHA") && bootstrap.includes("localDevelopment: commandIsLocal"), files.bootstrap, "A non-local Relay boot must fail without an exact source SHA.");
check("bootstrap_distinct_origins", bootstrap.includes("Every WebMCP provider must run on a distinct origin"), files.bootstrap, "Provider origins cannot collapse into one trust boundary.");
check("bootstrap_bounded_bridge_readiness", bootstrap.includes('import("./bridge-readiness")') && bootstrap.includes("waitForInitialBridgeSurface") && bootstrap.includes("if (!readiness.pass)"), files.bootstrap, "Diagnostics must not become callable before a bounded initial fixed-bridge readiness check completes.");

const bridgeReadiness = content.bridgeReadiness ?? "";
check("bridge_readiness_exact_surface", bridgeReadiness.includes("expectedInitialBridgeTools") && bridgeReadiness.includes("relay_bridge_status") && bridgeReadiness.includes("relay_bridge_supply_propose_reservation") && bridgeReadiness.includes("missingInitialBridgeTools"), files.bridgeReadiness, "Initial readiness must require every permanent read/proposal bridge wrapper and no consequential wrapper.");
check("bridge_readiness_bounded_wait", bridgeReadiness.includes("timeoutMs ?? 5_000") && bridgeReadiness.includes("intervalMs ?? 50") && bridgeReadiness.includes("elapsed >= timeoutMs"), files.bridgeReadiness, "Initial bridge readiness must permit a cold four-origin TLS load while remaining bounded.");

const releaseProvenance = content.releaseProvenance ?? "";
check("release_sha_validator", releaseProvenance.includes("validReleaseSha") && releaseProvenance.includes("assertCompiledReleaseSha") && releaseProvenance.includes("non-zero 40-character Git commit"), files.releaseProvenance, "All browser release checks must share one exact SHA validator.");
check("release_header_conflict_rejection", releaseProvenance.includes("consistentHeaderValue") && releaseProvenance.includes("new Set(values)") && releaseProvenance.includes("unique.size === 1"), files.releaseProvenance, "Identical repeated edge headers may normalize, but conflicting identity values must fail closed.");

const releaseIdentity = content.releaseIdentity ?? "";
check("release_identity_tool", releaseIdentity.includes('name: "relay_get_release_identity"') && releaseIdentity.includes('fetch("/release.json"') && releaseIdentity.includes('response.headers.get("x-relay-release")') && releaseIdentity.includes("consistentHeaderValue(edgeHeaderRaw)") && releaseIdentity.includes("edgeHeaderConsistent") && releaseIdentity.includes("compiledSha === edgeSha") && releaseIdentity.includes("edgeSha === manifestSha"), files.releaseIdentity, "ChatGPT needs a conflict-safe read-only proof that compiled, edge and manifest identities match.");

const bridge = content.bridge ?? "";
const diagnostics = content.diagnostics ?? "";
check("bridge_fixed_origins", bridge.includes("exactRemoteTool") && bridge.includes("fromOrigins: [spec.origin]") && bridge.includes("arbitraryOriginSelection: false"), files.bridge, "Bridge execution must remain fixed to exact provider origin and tool pairs.");
check("bridge_approval_gate", bridge.includes("bridgeCapabilityAllowed") && bridge.includes("requiresHumanApproval") && bridge.includes("readPlanStatus") && bridge.includes("HUMAN_APPROVAL_REQUIRED"), files.bridge, "Top-level commit wrappers must be registration-time and invocation-time gated by exact human approval.");
check("bridge_provider_acceptance", bridge.includes("providerAccepted") && bridge.includes("recordApprovalEvidence"), files.bridge, "Approval evidence must be recorded only after provider success.");
check(
  "bridge_origin_locked_rpc_fallback",
  bridge.includes('"native-webmcp" | "origin-locked-provider-rpc"')
    && bridge.includes("providerRpcSupports(spec.provider, spec.remoteName)")
    && bridge.includes("executeProviderRpc(spec.provider, spec.remoteName"),
  files.bridge,
  "The fixed bridge must prefer native cross-origin WebMCP and fall back only to the exact provider/tool RPC pair.",
);

const providerRpcClient = content.providerRpcClient ?? "";
check(
  "provider_rpc_parent_boundary",
  providerRpcClient.includes("event.source === frame.contentWindow")
    && providerRpcClient.includes("event.origin === origins[providerId]")
    && providerRpcClient.includes("postMessage(request, origins[providerId])")
    && providerRpcClient.includes("RPC_TIMEOUT_MS = 5_000")
    && providerRpcClient.includes("MAX_INPUT_BYTES = 64 * 1024"),
  files.providerRpcClient,
  "Parent-side provider RPC must pin source, origin, destination, request size and timeout.",
);

const providerRuntime = content.providerRuntime ?? "";
const webmcpRuntime = content.webmcpRuntime ?? "";
const contracts = content.contracts ?? "";
check(
  "provider_rpc_provider_boundary",
  providerRuntime.includes("event.source !== window.parent || event.origin !== relayOrigin")
    && providerRuntime.includes("PROVIDER_RPC_REPLAYED")
    && providerRuntime.includes("executeLocalRegisteredTool")
    && providerRuntime.includes("MAX_RPC_OUTPUT_BYTES = 1024 * 1024"),
  files.providerRuntime,
  "Provider-side RPC must enforce its trusted parent, prevent request replay and execute the provider's own guarded tool definition.",
);
check(
  "provider_rpc_single_business_logic",
  webmcpRuntime.includes("retained ${tool.name} for local provider transport")
    && webmcpRuntime.includes("trackLocalRegistration()")
    && contracts.includes('PROVIDER_RPC_PROTOCOL = "relay.provider-rpc.v1"'),
  `${files.webmcpRuntime}, ${files.contracts}`,
  "Native WebMCP and iframe fallback must share one provider-owned tool implementation and one versioned protocol.",
);
check(
  "diagnostic_effective_provider_transport",
  diagnostics.includes("nativeDiscoveryPass || bridgeVisibilityPass")
    && diagnostics.includes('effectiveTransport: nativeDiscoveryPass ? "native-cross-origin-webmcp"')
    && diagnostics.includes('compatibilityMode = bridgeTools.length ? "origin-locked-provider-bridge-active"'),
  files.diagnostics,
  "Live diagnostics must distinguish native cross-origin discovery from the explicit Relay provider bridge.",
);
check(
  "webmcp_execute_input_compatibility",
  webmcpRuntime.includes("executeDiscoveredTool")
    && webmcpRuntime.includes("inputContractMismatch")
    && webmcpRuntime.includes("JSON.stringify(input)")
    && diagnostics.includes('if (typeof parsed === "string")')
    && diagnostics.includes("JSON.parse(parsed)"),
  `${files.webmcpRuntime}, ${files.diagnostics}`,
  "Tool execution must adapt between JSON-string and object-input WebMCP clients and normalize one nested result encoding.",
);

const capabilitySurface = content.capabilitySurface ?? "";
check(
  "optional_toolchange_event_fallback",
  bridge.includes('typeof context.addEventListener === "function"')
    && capabilitySurface.includes('typeof capabilityContext?.addEventListener === "function"')
    && capabilitySurface.includes("setInterval(() => scheduleRefresh(), 500)")
    && diagnostics.includes('typeof context.addEventListener === "function"'),
  `${files.bridge}, ${files.capabilitySurface}, ${files.diagnostics}`,
  "Clients without the optional toolchange event surface must remain operational through bounded polling.",
);

check("diagnostic_release_identity", diagnostics.includes("compiledReleaseSha") && diagnostics.includes("readDiagnosticReleaseIdentity") && diagnostics.includes("provenancePass") && diagnostics.includes("const overallPass = provenancePass"), files.diagnostics, "The production ChatGPT diagnostic must identify and enforce the exact deployed release.");
check("diagnostic_semantic_probes", diagnostics.includes("semanticSuccess") && diagnostics.includes("providerExecutionPass"), files.diagnostics, "Listed tools are insufficient; provider execution must return semantic success.");
check("diagnostic_audit_v2", diagnostics.includes('schema: "relay.audit.v2"') && diagnostics.includes("evaluateAuditConsistency"), files.diagnostics, "Final evidence must use exact audit equality v2.");

const audit = content.audit ?? "";
check("audit_exact_plan_hash", audit.includes("expectedPlanHash") && audit.includes("hashPlan(plan)"), files.audit, "Approval must bind the current canonical plan hash.");
check("audit_exact_scope_set", audit.includes("approvalScopeCoverageExact") && audit.includes("approvalScopesMatchPlan") && audit.includes("approvalExactlyMatchesPlan"), files.audit, "Every matching approval scope must exactly match the final plan proposal set and arguments.");
check("audit_exact_authority", audit.includes("approvalAuthorityMatchesPlan"), files.audit, "Approved maximum authority and scoped aggregate must equal the final plan.");
check("audit_exact_receipt_set", audit.includes("receiptCoverageExact") && audit.includes("receiptsMatchPlan"), files.audit, "Receipts must exactly cover and match final plan proposals and provenance.");
check("audit_aggregate_equality", audit.includes("planTotalMatchesProposals") && audit.includes("receiptTotalMatchesPlan"), files.audit, "Plan, proposal and receipt aggregates must agree.");
check("audit_safe_reapproval", audit.includes("matchingApprovals.every") && audit.includes("matchingSessions.size === 1"), files.audit, "Safe exact reapproval may be tolerated only when every matching capsule is exact and remains in one session.");

const deploymentSmoke = content.deploymentSmoke ?? "";
check("smoke_root_and_manifest_identity", deploymentSmoke.includes("pageHeaderRaw") && deploymentSmoke.includes("manifestHeaderRaw") && deploymentSmoke.includes("pageHeaderSha === expectedSha") && deploymentSmoke.includes("manifestHeaderSha === expectedSha"), files.deploymentSmoke, "The deployed root and manifest responses must independently identify the expected release.");
check("smoke_conflicting_header_rejection", deploymentSmoke.includes("function consistentHeaderValue") && deploymentSmoke.includes("new Set(values).size === 1") && deploymentSmoke.includes("consistentHeaderValue(pageHeaderRaw)") && deploymentSmoke.includes("consistentHeaderValue(manifestHeaderRaw)"), files.deploymentSmoke, "Deployment smoke must reject conflicting duplicate security or release headers.");
check("smoke_manifest_oac_and_cache", deploymentSmoke.includes("manifestOriginAgentCluster === \"?1\"") && deploymentSmoke.includes("noStore(manifestCacheControl)"), files.deploymentSmoke, "The release manifest itself must preserve origin isolation and no-store semantics.");

const scripts = packageJson?.scripts ?? {};
check("package_release_gate", scripts["gate:source"] === "node scripts/release-gate.mjs" && scripts["gate:release"] === "node scripts/release-gate.mjs --full --dns", files.package, "Operators need one source gate and one full fail-closed release command.");
check("package_script_checks", scripts["check:scripts"] === "node scripts/check-script-syntax.mjs", files.package, "Every release script must be syntax-checked before build.");
check("package_surface_check", scripts["check:release-surface"] === "node scripts/check-release-surface.mjs", files.package, "The release contract itself must be audited.");
check("verify_includes_meta_gates", typeof scripts.verify === "string" && scripts.verify.includes("check:scripts") && scripts.verify.includes("check:release-surface"), files.package, "Normal verification must include the release script and surface gates.");

const releaseGate = content.releaseGate ?? "";
check(
  "release_gate_locked_install",
  releaseGate.includes('resolve("package-lock.json")')
    && releaseGate.includes("lockfile.lockfileVersion")
    && releaseGate.includes('execute("locked_install", "npm", ["ci", "--no-audit", "--no-fund"])')
    && releaseGate.includes('expectedNpm === "10.9.2"'),
  files.releaseGate,
  "The operator gate must enforce and install the exact locked dependency graph.",
);
check("release_gate_exact_toolchain", releaseGate.includes("node_pin_declared") && releaseGate.includes("nvm_pin_matches") && releaseGate.includes("node_exact") && releaseGate.includes("npm_exact") && releaseGate.includes("22.16.0"), files.releaseGate, "The operator gate must prove that package metadata, .nvmrc and the running process use one exact Node/npm toolchain.");
check("release_gate_clean_after", releaseGate.includes("clean_worktree_after"), files.releaseGate, "Verification must leave the checkout unchanged.");
check("release_gate_output_directory", releaseGate.includes("mkdirSync") && releaseGate.includes(".relay-artifacts"), files.releaseGate, "Machine-readable release evidence must have a safe ignored default location.");
check("release_gate_caddy_sha", releaseGate.includes("RELAY_RELEASE_SHA") && releaseGate.includes("caddy_validate"), files.releaseGate, "Caddy validation must receive the exact release SHA used by production.");

check("script_syntax_gate", (content.scriptSyntax ?? "").includes('process.execPath, ["--check"') && (content.scriptSyntax ?? "").includes("relay.script-syntax-gate.v1"), files.scriptSyntax, "Every .mjs release script must be parsed before expensive work begins.");

const failures = checks.filter((entry) => !entry.pass);
const report = {
  schema: "relay.release-surface-check.v4",
  checkedAt: new Date().toISOString(),
  pass: failures.length === 0,
  checkCount: checks.length,
  failures,
  checks,
};

console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exitCode = 1;
