import { describe, expect, it } from "vitest";
import type {
  ApprovalPayload,
  CommitReceipt,
  PlanDraft,
  ProviderProposal,
} from "@relay/contracts";
import { hashPlan, proposalScope, sha256 } from "@relay/pact";
import type { ApprovalEvidence } from "./release-state";
import { evaluateAuditConsistency } from "./audit-consistency";

const now = "2026-08-29T10:00:00.000Z";
const expiry = "2026-08-29T10:05:00.000Z";

function proposal(overrides: Partial<ProviderProposal> = {}): ProviderProposal {
  return {
    proposalId: "shelter-east",
    providerId: "shelter",
    providerOrigin: "https://shelter.example.test",
    resourceId: "east",
    resourceLabel: "East Shelter",
    quantity: 18,
    unit: "beds",
    unitCost: 10,
    totalCost: 180,
    purpose: "Riverside evacuation",
    stateVersion: 1,
    createdAt: now,
    expiresAt: expiry,
    ...overrides,
  };
}

function canonicalProposals(): ProviderProposal[] {
  return [
    proposal(),
    proposal({
      proposalId: "shelter-south",
      resourceId: "south",
      resourceLabel: "South Shelter",
      quantity: 24,
      unitCost: 9,
      totalCost: 216,
    }),
    proposal({
      proposalId: "transit-bus",
      providerId: "transit",
      providerOrigin: "https://transit.example.test",
      resourceId: "bus-32",
      resourceLabel: "Rapid Bus 32",
      quantity: 32,
      unit: "seats",
      unitCost: 29,
      totalCost: 928,
    }),
    proposal({
      proposalId: "transit-access",
      providerId: "transit",
      providerOrigin: "https://transit.example.test",
      resourceId: "accessible-10",
      resourceLabel: "Access Shuttle 10",
      quantity: 10,
      unit: "accessible seats",
      unitCost: 68,
      totalCost: 680,
    }),
    proposal({
      proposalId: "supply-evac",
      providerId: "supply",
      providerOrigin: "https://supply.example.test",
      resourceId: "evac-kit",
      resourceLabel: "Evacuation Kit",
      quantity: 42,
      unit: "kits",
      unitCost: 12,
      totalCost: 504,
    }),
    proposal({
      proposalId: "supply-medical",
      providerId: "supply",
      providerOrigin: "https://supply.example.test",
      resourceId: "medical-kit",
      resourceLabel: "Mobility Medical Kit",
      quantity: 9,
      unit: "kits",
      unitCost: 25,
      totalCost: 225,
    }),
  ];
}

function plan(proposals = canonicalProposals()): PlanDraft {
  return {
    planId: "plan-final",
    incidentId: "FLOOD-RIVERSIDE-042",
    summary: "Canonical evacuation",
    rationale: "All deterministic constraints pass.",
    proposals,
    totalCost: proposals.reduce((sum, item) => sum + item.totalCost, 0),
    maxBudget: 3000,
    revision: 2,
    status: "COMMITTED",
    createdAt: now,
    updatedAt: now,
  };
}

function receipts(proposals: ProviderProposal[]): CommitReceipt[] {
  return proposals.map((item, index) => ({
    receiptId: `receipt-${index}`,
    proposalId: item.proposalId,
    providerId: item.providerId,
    providerOrigin: item.providerOrigin,
    committedAt: now,
    resultingStateVersion: item.stateVersion + 1,
    amount: item.quantity,
    totalCost: item.totalCost,
  }));
}

async function approvalEvidence(
  value: PlanDraft,
  overrides: Partial<ApprovalPayload> = {},
): Promise<ApprovalEvidence> {
  const payload: ApprovalPayload = {
    sessionId: "session-final",
    planId: value.planId,
    planHash: await hashPlan(value),
    scopes: value.proposals.map(proposalScope),
    maximumCost: value.maxBudget,
    issuedAt: now,
    expiresAt: expiry,
    ...overrides,
  };
  return {
    capturedAt: now,
    payloadDigest: await sha256(payload),
    token: {
      algorithm: "ECDSA_P256_SHA256",
      payload,
      signature: "test-signature-not-used-by-audit-consistency",
    },
  };
}

async function canonicalFixture() {
  const value = plan();
  return {
    plan: value,
    approvals: [await approvalEvidence(value)],
    output: { plan: value, receipts: receipts(value.proposals) },
  };
}

describe("evaluateAuditConsistency", () => {
  it("passes only for a committed plan with exact approval and receipt closure", async () => {
    const fixture = await canonicalFixture();
    const result = await evaluateAuditConsistency(fixture.output, fixture.approvals);

    expect(result).toMatchObject({
      planStatus: "COMMITTED",
      planProposalCount: 6,
      matchingApprovalCount: 1,
      matchingScopeCount: 6,
      receiptCount: 6,
      approvalScopeCoverageExact: true,
      approvalScopesMatchPlan: true,
      approvalAuthorityMatchesPlan: true,
      receiptCoverageExact: true,
      receiptsMatchPlan: true,
      planTotalMatchesProposals: true,
      receiptTotalMatchesPlan: true,
      committed: true,
      pass: true,
    });
  });

  it("fails when any plan proposal lacks a receipt", async () => {
    const fixture = await canonicalFixture();
    const result = await evaluateAuditConsistency({
      ...fixture.output,
      receipts: fixture.output.receipts.slice(0, -1),
    }, fixture.approvals);

    expect(result).toMatchObject({
      receiptCount: 5,
      receiptCoverageExact: false,
      receiptTotalMatchesPlan: false,
      pass: false,
    });
  });

  it("fails when a receipt changes cost quantity origin or resulting version", async () => {
    const fixture = await canonicalFixture();
    const [first, ...rest] = fixture.output.receipts;
    const mutations: Partial<CommitReceipt>[] = [
      { totalCost: first.totalCost + 1 },
      { amount: first.amount + 1 },
      { providerOrigin: "https://evil.example.test" },
      { resultingStateVersion: fixture.plan.proposals[0].stateVersion },
    ];

    for (const mutation of mutations) {
      const result = await evaluateAuditConsistency({
        plan: fixture.plan,
        receipts: [{ ...first, ...mutation }, ...rest],
      }, fixture.approvals);
      expect(result.receiptsMatchPlan).toBe(false);
      expect(result.pass).toBe(false);
    }
  });

  it("fails when no provider-accepted approval matches the final plan hash", async () => {
    const fixture = await canonicalFixture();
    const wrongApproval = await approvalEvidence(fixture.plan, {
      planHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const result = await evaluateAuditConsistency(fixture.output, [wrongApproval]);

    expect(result).toMatchObject({
      matchingApprovalCount: 0,
      approvalScopeCoverageExact: false,
      pass: false,
    });
  });

  it("fails when matching approval scopes do not exactly match final operations", async () => {
    const fixture = await canonicalFixture();
    const [approval] = fixture.approvals;
    const mutated: ApprovalEvidence = structuredClone(approval);
    mutated.token.payload.scopes[0].quantity += 1;

    const result = await evaluateAuditConsistency(fixture.output, [mutated]);
    expect(result).toMatchObject({
      approvalScopeCoverageExact: true,
      approvalScopesMatchPlan: false,
      approvalAuthorityMatchesPlan: true,
      pass: false,
    });
  });

  it("fails on duplicate receipts malformed receipts or non-committed state", async () => {
    const fixture = await canonicalFixture();
    const duplicate = await evaluateAuditConsistency({
      plan: fixture.plan,
      receipts: [...fixture.output.receipts, fixture.output.receipts[0]],
    }, fixture.approvals);
    expect(duplicate).toMatchObject({ receiptCoverageExact: false, pass: false });

    const malformed = await evaluateAuditConsistency({
      plan: fixture.plan,
      receipts: [...fixture.output.receipts.slice(0, -1), { nope: true }],
    }, fixture.approvals);
    expect(malformed).toMatchObject({ planShapeValid: false, pass: false });

    const pendingPlan = { ...fixture.plan, status: "APPROVED" as const };
    const pendingApproval = await approvalEvidence(pendingPlan);
    const pending = await evaluateAuditConsistency({
      plan: pendingPlan,
      receipts: fixture.output.receipts,
    }, [pendingApproval]);
    expect(pending).toMatchObject({ committed: false, pass: false });
  });
});
