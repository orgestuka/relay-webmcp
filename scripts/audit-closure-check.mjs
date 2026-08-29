import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path) {
  return readFile(resolve(path), "utf8");
}

function check(report, id, path, pass, detail) {
  report.checks.push({ id, path, pass, detail });
  if (!pass) report.blockers.push(`${id}: ${detail}`);
}

const report = {
  schema: "relay.audit-closure-source-gate.v2",
  checkedAt: new Date().toISOString(),
  pass: false,
  checks: [],
  blockers: [],
};

try {
  const [diagnostics, consistency, consistencyTests, reapprovalTests, identity] = await Promise.all([
    source("apps/relay-command/src/release-diagnostics.ts"),
    source("apps/relay-command/src/audit-consistency.ts"),
    source("apps/relay-command/src/audit-consistency.test.ts"),
    source("apps/relay-command/src/audit-reapproval.test.ts"),
    source("apps/relay-command/src/release-identity.ts"),
  ]);

  check(
    report,
    "audit_uses_independent_consistency_evaluator",
    "apps/relay-command/src/release-diagnostics.ts",
    diagnostics.includes('import { evaluateAuditConsistency } from "./audit-consistency"')
      && diagnostics.includes("await evaluateAuditConsistency(plan, approvals)"),
    "Final audit generation must use the independent exact-closure evaluator.",
  );

  check(
    report,
    "audit_binds_release_identity",
    "apps/relay-command/src/release-diagnostics.ts",
    diagnostics.includes('readLocalTool("relay_get_release_identity")')
      && diagnostics.includes("AUDIT_RELEASE_IDENTITY_FAILED")
      && diagnostics.includes("releaseIdentity,")
      && diagnostics.includes('schema: "relay.audit.v2"'),
    "The final digest must bind a successful immutable release identity alongside transaction state.",
  );

  check(
    report,
    "audit_requires_exact_final_plan_hash",
    "apps/relay-command/src/audit-consistency.ts",
    consistency.includes("expectedPlanHash = await hashPlan(plan)")
      && consistency.includes("approval.token.payload.planHash === expectedPlanHash")
      && consistency.includes("approval.token.payload.planId === plan.planId"),
    "Only provider-accepted approvals for the exact final plan hash and plan ID may satisfy the audit.",
  );

  check(
    report,
    "audit_requires_exact_scope_coverage",
    "apps/relay-command/src/audit-consistency.ts",
    consistency.includes("approvalExactlyMatchesPlan")
      && consistency.includes("approvalScopeCoverageExact")
      && consistency.includes("approvalScopesMatchPlan")
      && consistency.includes("scopeMatchesProposal"),
    "Every final proposal must be covered by an exact signed scope and no extra scope may enter a matching approval.",
  );

  check(
    report,
    "audit_requires_exact_receipt_coverage",
    "apps/relay-command/src/audit-consistency.ts",
    consistency.includes("receiptCoverageExact")
      && consistency.includes("receiptsMatchPlan")
      && consistency.includes("sameSet(planProposalIds, receiptProposalIds)")
      && consistency.includes("receipt.resultingStateVersion > proposal.stateVersion"),
    "A committed audit must contain one valid origin-bound receipt for every final proposal and no extras.",
  );

  check(
    report,
    "audit_reconciles_totals_and_authority",
    "apps/relay-command/src/audit-consistency.ts",
    consistency.includes("approvalAuthorityMatchesPlan")
      && consistency.includes("planTotalMatchesProposals")
      && consistency.includes("receiptTotalMatchesPlan")
      && consistency.includes("approval.token.payload.maximumCost"),
    "Human authority, proposal totals and receipt totals must reconcile exactly in currency cents.",
  );

  check(
    report,
    "audit_handles_exact_reapproval",
    "apps/relay-command/src/audit-reapproval.test.ts",
    reapprovalTests.includes("accepts multiple exact approvals for the same final plan in one session")
      && reapprovalTests.includes("approvalScopesMatchPlan: true")
      && reapprovalTests.includes("still rejects a reapproval whose signed scope differs"),
    "Short-lived authority may be renewed for the same plan without double-counting, but any changed scope must fail.",
  );

  const hostileTestPass = consistencyTests.includes("fails when any plan proposal lacks a receipt")
    && consistencyTests.includes("fails when a receipt changes cost quantity origin or resulting version")
    && consistencyTests.includes("fails when no provider-accepted approval matches the final plan hash")
    && consistencyTests.includes("fails when matching approval scopes do not exactly match final operations")
    && consistencyTests.includes("fails on duplicate receipts malformed receipts or non-committed state");
  check(
    report,
    "audit_hostile_regression_suite",
    "apps/relay-command/src/audit-consistency.test.ts",
    hostileTestPass,
    "The regression suite must cover missing, duplicated, malformed, mutated, unapproved and non-committed evidence.",
  );

  check(
    report,
    "release_identity_fails_closed",
    "apps/relay-command/src/release-identity.ts",
    identity.includes("responseOk")
      && identity.includes("consistentHeaderValue(edgeHeaderRaw)")
      && identity.includes("edgeHeaderConsistent")
      && identity.includes("conflicting X-Relay-Release response headers")
      && identity.includes("compiledSha === edgeSha")
      && identity.includes("edgeSha === manifestSha")
      && identity.includes("release manifest returned HTTP"),
    "The release identity entering the final audit must reject non-success responses, conflicting duplicate edge identities and every mismatched trust layer.",
  );
} catch (error) {
  report.blockers.push(error instanceof Error ? error.message : "Audit-closure source check failed.");
}

report.pass = report.blockers.length === 0 && report.checks.every((entry) => entry.pass);
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exitCode = 1;
