import { describe, expect, it } from "vitest";
import type { ApprovalPayload, PlanDraft, ProviderProposal } from "@relay/contracts";
import { hashPlan, proposalScope, sha256 } from "@relay/pact";
import type { ApprovalEvidence } from "./release-state";
import { evaluateAuditConsistency } from "./audit-consistency";

const proposal: ProviderProposal = {
  proposalId: "shelter-east",
  providerId: "shelter",
  providerOrigin: "https://shelter.example.test",
  resourceId: "east",
  resourceLabel: "East Shelter",
  quantity: 1,
  unit: "beds",
  unitCost: 10,
  totalCost: 10,
  purpose: "Reapproval regression",
  stateVersion: 1,
  createdAt: "2026-08-29T10:00:00.000Z",
  expiresAt: "2026-08-29T10:10:00.000Z",
};

const plan: PlanDraft = {
  planId: "plan-reapproval",
  incidentId: "FLOOD-RIVERSIDE-042",
  summary: "Reapproval regression",
  rationale: "Same exact plan approved again after the first short-lived token expired.",
  proposals: [proposal],
  totalCost: 10,
  maxBudget: 20,
  revision: 1,
  status: "COMMITTED",
  createdAt: "2026-08-29T10:00:00.000Z",
  updatedAt: "2026-08-29T10:06:00.000Z",
};

async function evidence(issuedAt: string, expiresAt: string): Promise<ApprovalEvidence> {
  const payload: ApprovalPayload = {
    sessionId: "session-reapproval",
    planId: plan.planId,
    planHash: await hashPlan(plan),
    scopes: [proposalScope(proposal)],
    maximumCost: plan.maxBudget,
    issuedAt,
    expiresAt,
  };
  return {
    capturedAt: issuedAt,
    payloadDigest: await sha256(payload),
    token: {
      algorithm: "ECDSA_P256_SHA256",
      payload,
      signature: `test-${issuedAt}`,
    },
  };
}

describe("audit reapproval handling", () => {
  it("accepts multiple exact approvals for the same final plan in one session", async () => {
    const approvals = [
      await evidence("2026-08-29T10:00:00.000Z", "2026-08-29T10:02:00.000Z"),
      await evidence("2026-08-29T10:03:00.000Z", "2026-08-29T10:05:00.000Z"),
    ];
    const result = await evaluateAuditConsistency({
      plan,
      receipts: [{
        receiptId: "receipt-reapproval",
        proposalId: proposal.proposalId,
        providerId: proposal.providerId,
        providerOrigin: proposal.providerOrigin,
        committedAt: "2026-08-29T10:04:00.000Z",
        resultingStateVersion: 2,
        amount: proposal.quantity,
        totalCost: proposal.totalCost,
      }],
    }, approvals);

    expect(result).toMatchObject({
      matchingApprovalCount: 2,
      matchingScopeCount: 2,
      uniqueMatchingScopeCount: 1,
      matchingApprovalSessionCount: 1,
      approvalScopeCoverageExact: true,
      approvalScopesMatchPlan: true,
      approvalAuthorityMatchesPlan: true,
      pass: true,
    });
  });

  it("still rejects a reapproval whose signed scope differs from the final plan", async () => {
    const first = await evidence("2026-08-29T10:00:00.000Z", "2026-08-29T10:02:00.000Z");
    const second = await evidence("2026-08-29T10:03:00.000Z", "2026-08-29T10:05:00.000Z");
    second.token.payload.scopes[0].quantity = 2;

    const result = await evaluateAuditConsistency({
      plan,
      receipts: [{
        receiptId: "receipt-reapproval",
        proposalId: proposal.proposalId,
        providerId: proposal.providerId,
        providerOrigin: proposal.providerOrigin,
        committedAt: "2026-08-29T10:04:00.000Z",
        resultingStateVersion: 2,
        amount: proposal.quantity,
        totalCost: proposal.totalCost,
      }],
    }, [first, second]);

    expect(result).toMatchObject({
      approvalScopeCoverageExact: true,
      approvalScopesMatchPlan: false,
      pass: false,
    });
  });
});
