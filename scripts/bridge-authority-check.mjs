import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const files = {
  bridge: "apps/relay-command/src/compatibility-bridge.ts",
  authority: "apps/relay-command/src/bridge-authority.ts",
  integrationTest: "apps/relay-command/src/compatibility-bridge.test.ts",
  authorityTest: "apps/relay-command/src/bridge-authority.test.ts",
};

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function count(source, fragment) {
  return source.split(fragment).length - 1;
}

function check(id, pass, detail) {
  return { id, pass, detail };
}

const report = {
  schema: "relay.bridge-authority-source-gate.v1",
  checkedAt: new Date().toISOString(),
  pass: false,
  sourceDigests: {},
  checks: [],
  blockers: [],
};

try {
  const [bridge, authority, integrationTest, authorityTest] = await Promise.all([
    readFile(files.bridge, "utf8"),
    readFile(files.authority, "utf8"),
    readFile(files.integrationTest, "utf8"),
    readFile(files.authorityTest, "utf8"),
  ]);

  report.sourceDigests = {
    [files.bridge]: sha256(bridge),
    [files.authority]: sha256(authority),
    [files.integrationTest]: sha256(integrationTest),
    [files.authorityTest]: sha256(authorityTest),
  };

  const commitRemoteNames = [
    "shelter_commit_reservation",
    "transit_commit_reservation",
    "supply_commit_reservation",
  ];
  const proposalRemoteNames = [
    "shelter_propose_reservation",
    "transit_propose_reservation",
    "supply_propose_reservation",
  ];
  const readRemoteNames = [
    "shelter_find_capacity",
    "transit_find_accessible_routes",
    "supply_check_stock",
  ];

  const requiredFragments = [
    'executeLocalRegisteredTool("relay_get_plan", {})',
    'code: "HUMAN_APPROVAL_REQUIRED"',
    'requiredPlanStatus: "APPROVED"',
    "humanApprovalRequiredForCommitWrappers: true",
    "invocationTimeAuthorityRecheck: true",
  ];

  report.checks.push(check(
    "live_bridge_imports_authority_gate",
    bridge.includes('import { bridgeCapabilityAllowed } from "./bridge-authority";'),
    "The live compatibility bridge must import the centralized authority predicate.",
  ));
  report.checks.push(check(
    "live_bridge_reads_local_plan_state",
    bridge.includes(requiredFragments[0]),
    "Bridge authorization must read Relay's locally registered plan state without recursive WebMCP invocation.",
  ));

  for (const remoteName of commitRemoteNames) {
    const start = bridge.indexOf(`remoteName: "${remoteName}"`);
    const end = start >= 0 ? bridge.indexOf("\n  },", start) : -1;
    const block = start >= 0 && end > start ? bridge.slice(start, end) : "";
    report.checks.push(check(
      `commit_scope_${remoteName}`,
      Boolean(block) && block.includes("requiresHumanApproval: true"),
      `${remoteName} must be explicitly classified as consequential.`,
    ));
  }

  for (const remoteName of [...proposalRemoteNames, ...readRemoteNames]) {
    const start = bridge.indexOf(`remoteName: "${remoteName}"`);
    const end = start >= 0 ? bridge.indexOf("\n  },", start) : -1;
    const block = start >= 0 && end > start ? bridge.slice(start, end) : "";
    report.checks.push(check(
      `non_commit_scope_${remoteName}`,
      Boolean(block) && block.includes("requiresHumanApproval: false"),
      `${remoteName} must remain available when its exact provider capability exists.`,
    ));
  }

  report.checks.push(check(
    "exact_consequential_scope_count",
    count(bridge, "requiresHumanApproval: true") === 3,
    "Exactly the three provider commit mappings may require human approval.",
  ));
  report.checks.push(check(
    "exact_non_consequential_scope_count",
    count(bridge, "requiresHumanApproval: false") === 6,
    "Exactly the three read and three proposal mappings must remain non-consequential.",
  ));

  const wrapperStart = bridge.indexOf("function wrapperFor(");
  const wrapperAuthority = bridge.indexOf("bridgeCapabilityAllowed({", wrapperStart);
  const nativeProviderExecution = bridge.indexOf("executeDiscoveredTool(remote", wrapperStart);
  const fallbackProviderExecution = bridge.indexOf("executeProviderRpc(", wrapperStart);
  report.checks.push(check(
    "invocation_time_authority_precedes_provider_execution",
    wrapperStart >= 0
      && wrapperAuthority > wrapperStart
      && nativeProviderExecution > wrapperAuthority
      && fallbackProviderExecution > wrapperAuthority,
    "A captured wrapper reference must re-check current human authority before either provider transport executes.",
  ));

  const syncStart = bridge.indexOf("async function synchronizeWrappers(");
  const syncAuthority = bridge.indexOf("bridgeCapabilityAllowed({", syncStart);
  const wrapperEnable = bridge.indexOf("await wrapper.enable()", syncStart);
  report.checks.push(check(
    "registration_authority_precedes_wrapper_enable",
    syncStart >= 0
      && syncAuthority > syncStart
      && wrapperEnable > syncAuthority,
    "Dynamic wrapper registration must be gated by current Relay plan state.",
  ));

  for (const fragment of requiredFragments.slice(1)) {
    report.checks.push(check(
      `bridge_fragment_${fragment.replaceAll(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      bridge.includes(fragment),
      `Missing fail-closed bridge evidence fragment: ${fragment}`,
    ));
  }

  report.checks.push(check(
    "central_predicate_is_exact",
    authority.includes('return input.planStatus === "APPROVED";')
      && authority.includes("if (!input.remoteAvailable) return false;")
      && authority.includes("if (!input.requiresHumanApproval) return true;"),
    "The centralized predicate must fail closed for absent remote capability and permit commits only in APPROVED state.",
  ));

  const integrationFragments = [
    'planStatus: string | null = "DRAFT"',
    'code: "HUMAN_APPROVAL_REQUIRED"',
    'currentPlanStatus: "STALE"',
    "remoteCallsBeforeStaleAttempt",
    'planStatus = "APPROVED"',
    'planStatus = "COMMITTED"',
  ];
  for (const fragment of integrationFragments) {
    report.checks.push(check(
      `integration_test_${fragment.replaceAll(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      integrationTest.includes(fragment),
      `Integration test must prove ${fragment}.`,
    ));
  }

  report.checks.push(check(
    "pure_authority_matrix_tested",
    authorityTest.includes('expect(bridgeCapabilityAllowed({ remoteAvailable: true, requiresHumanApproval: true, planStatus: "APPROVED" })).toBe(true)')
      && authorityTest.includes('for (const planStatus of [null, "DRAFT", "VALIDATED", "AWAITING_APPROVAL", "STALE", "REJECTED", "COMMITTED"])'),
    "The pure authority matrix must cover every non-approved plan state.",
  ));

  report.blockers = report.checks
    .filter((entry) => !entry.pass)
    .map((entry) => `${entry.id}: ${entry.detail}`);
  report.pass = report.blockers.length === 0;
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : "Bridge authority source gate failed.");
}

console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
