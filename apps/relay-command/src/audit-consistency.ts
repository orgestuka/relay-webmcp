import type {
  CommitReceipt,
  PlanDraft,
  ProposalScope,
  ProviderProposal,
} from "@relay/contracts";
import { hashPlan } from "@relay/pact";
import type { ApprovalEvidence } from "./release-state";

export interface AuditConsistencyResult {
  planStatus: string | null;
  planId: string | null;
  planProposalCount: number;
  approvalCount: number;
  matchingApprovalCount: number;
  matchingScopeCount: number;
  receiptCount: number;
  uniquePlanProposalCount: number;
  uniqueMatchingScopeCount: number;
  uniqueReceiptProposalCount: number;
  expectedPlanHash: string | null;
  planHashError: string | null;
  planShapeValid: boolean;
  proposalIdsUnique: boolean;
  matchingApprovalSessionCount: number;
  approvalScopeCoverageExact: boolean;
  approvalScopesMatchPlan: boolean;
  approvalAuthorityMatchesPlan: boolean;
  receiptCoverageExact: boolean;
  receiptsMatchPlan: boolean;
  planTotalMatchesProposals: boolean;
  receiptTotalMatchesPlan: boolean;
  committed: boolean;
  pass: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validClock(value: unknown): value is string {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function sameMoney(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function isProviderProposal(value: unknown): value is ProviderProposal {
  if (!isRecord(value)) return false;
  return validText(value.proposalId)
    && (value.providerId === "shelter" || value.providerId === "transit" || value.providerId === "supply")
    && validText(value.providerOrigin)
    && validText(value.resourceId)
    && validText(value.resourceLabel)
    && positiveInteger(value.quantity)
    && validText(value.unit)
    && finiteNonNegative(value.unitCost)
    && finiteNonNegative(value.totalCost)
    && validText(value.purpose)
    && positiveInteger(value.stateVersion)
    && validText(value.createdAt)
    && validText(value.expiresAt)
    && sameMoney(value.totalCost, value.quantity * value.unitCost);
}

function isCommitReceipt(value: unknown): value is CommitReceipt {
  if (!isRecord(value)) return false;
  return validText(value.receiptId)
    && validText(value.proposalId)
    && (value.providerId === "shelter" || value.providerId === "transit" || value.providerId === "supply")
    && validText(value.providerOrigin)
    && validText(value.committedAt)
    && positiveInteger(value.resultingStateVersion)
    && positiveInteger(value.amount)
    && finiteNonNegative(value.totalCost);
}

function isPlanDraft(value: unknown): value is PlanDraft {
  if (!isRecord(value) || !Array.isArray(value.proposals)) return false;
  return validText(value.planId)
    && validText(value.incidentId)
    && validText(value.summary)
    && validText(value.rationale)
    && validClock(value.completionDeadline)
    && value.proposals.length > 0
    && value.proposals.every(isProviderProposal)
    && finiteNonNegative(value.totalCost)
    && finiteNonNegative(value.maxBudget)
    && positiveInteger(value.revision)
    && validText(value.status)
    && validText(value.createdAt)
    && validText(value.updatedAt);
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function scopeMatchesProposal(scope: ProposalScope, proposal: ProviderProposal): boolean {
  return scope.proposalId === proposal.proposalId
    && scope.providerId === proposal.providerId
    && scope.providerOrigin === proposal.providerOrigin
    && scope.resourceId === proposal.resourceId
    && scope.resourceLabel === proposal.resourceLabel
    && scope.quantity === proposal.quantity
    && scope.unit === proposal.unit
    && sameMoney(scope.unitCost, proposal.unitCost)
    && scope.purpose === proposal.purpose
    && scope.stateVersion === proposal.stateVersion
    && scope.expiresAt === proposal.expiresAt
    && sameMoney(scope.maxCost, proposal.totalCost);
}

function receiptMatchesProposal(receipt: CommitReceipt, proposal: ProviderProposal): boolean {
  return receipt.proposalId === proposal.proposalId
    && receipt.providerId === proposal.providerId
    && receipt.providerOrigin === proposal.providerOrigin
    && receipt.amount === proposal.quantity
    && sameMoney(receipt.totalCost, proposal.totalCost)
    && receipt.resultingStateVersion > proposal.stateVersion
    && Number.isFinite(Date.parse(receipt.committedAt));
}

function approvalExactlyMatchesPlan(
  approval: ApprovalEvidence,
  plan: PlanDraft,
  planProposalIds: Set<string>,
): boolean {
  const scopes = approval.token.payload.scopes;
  const scopeIds = new Set(scopes.map((scope) => scope.proposalId));
  if (scopes.length !== scopeIds.size || !sameSet(scopeIds, planProposalIds)) return false;
  return scopes.every((scope) => {
    const proposal = plan.proposals.find((candidate) => candidate.proposalId === scope.proposalId);
    return Boolean(proposal && scopeMatchesProposal(scope, proposal));
  });
}

export async function evaluateAuditConsistency(
  planOutput: unknown,
  approvals: ApprovalEvidence[],
): Promise<AuditConsistencyResult> {
  const envelope = isRecord(planOutput) ? planOutput : {};
  const plan = isPlanDraft(envelope.plan) ? envelope.plan : null;
  const rawReceipts = Array.isArray(envelope.receipts) ? envelope.receipts : [];
  const receipts = rawReceipts.filter(isCommitReceipt);
  const proposals = plan?.proposals ?? [];
  const planProposalIds = new Set(proposals.map((proposal) => proposal.proposalId));
  const receiptProposalIds = new Set(receipts.map((receipt) => receipt.proposalId));

  let expectedPlanHash: string | null = null;
  let planHashError: string | null = null;
  if (plan) {
    try {
      expectedPlanHash = await hashPlan(plan);
    } catch (error) {
      planHashError = error instanceof Error ? error.message : "plan hash failed";
    }
  }

  const matchingApprovals = plan && expectedPlanHash
    ? approvals.filter((approval) =>
      approval.token.payload.planId === plan.planId
      && approval.token.payload.planHash === expectedPlanHash)
    : [];
  const matchingScopes = matchingApprovals.flatMap((approval) => approval.token.payload.scopes);
  const matchingScopeIds = new Set(matchingScopes.map((scope) => scope.proposalId));
  const matchingSessions = new Set(matchingApprovals.map((approval) => approval.token.payload.sessionId));

  const proposalIdsUnique = proposals.length === planProposalIds.size;
  const receiptIdsUnique = receipts.length === receiptProposalIds.size;
  const approvalScopeCoverageExact = Boolean(plan)
    && proposals.length > 0
    && matchingApprovals.length > 0
    && matchingApprovals.every((approval) => {
      const scopes = approval.token.payload.scopes;
      return scopes.length === plan!.proposals.length
        && sameSet(new Set(scopes.map((scope) => scope.proposalId)), planProposalIds);
    });
  const approvalScopesMatchPlan = Boolean(plan)
    && approvalScopeCoverageExact
    && matchingApprovals.every((approval) => approvalExactlyMatchesPlan(approval, plan!, planProposalIds));
  const approvalAuthorityMatchesPlan = Boolean(plan)
    && matchingApprovals.length > 0
    && matchingApprovals.every((approval) =>
      sameMoney(approval.token.payload.maximumCost, plan!.maxBudget)
      && sameMoney(
        approval.token.payload.scopes.reduce((sum, scope) => sum + scope.maxCost, 0),
        plan!.totalCost,
      ));
  const receiptCoverageExact = proposals.length > 0
    && rawReceipts.length === receipts.length
    && receiptIdsUnique
    && sameSet(planProposalIds, receiptProposalIds);
  const receiptsMatchPlan = receiptCoverageExact
    && receipts.every((receipt) => {
      const proposal = proposals.find((candidate) => candidate.proposalId === receipt.proposalId);
      return Boolean(proposal && receiptMatchesProposal(receipt, proposal));
    });
  const planTotalFromProposals = proposals.reduce((sum, proposal) => sum + proposal.totalCost, 0);
  const receiptTotal = receipts.reduce((sum, receipt) => sum + receipt.totalCost, 0);
  const planTotalMatchesProposals = Boolean(plan) && sameMoney(plan!.totalCost, planTotalFromProposals);
  const receiptTotalMatchesPlan = Boolean(plan) && sameMoney(plan!.totalCost, receiptTotal);
  const committed = plan?.status === "COMMITTED";
  const planShapeValid = Boolean(plan) && rawReceipts.length === receipts.length;

  const pass = committed
    && planShapeValid
    && proposalIdsUnique
    && expectedPlanHash !== null
    && planHashError === null
    && matchingApprovals.length > 0
    && matchingSessions.size === 1
    && approvalScopeCoverageExact
    && approvalScopesMatchPlan
    && approvalAuthorityMatchesPlan
    && receiptCoverageExact
    && receiptsMatchPlan
    && planTotalMatchesProposals
    && receiptTotalMatchesPlan;

  return {
    planStatus: plan?.status ?? null,
    planId: plan?.planId ?? null,
    planProposalCount: proposals.length,
    approvalCount: approvals.length,
    matchingApprovalCount: matchingApprovals.length,
    matchingScopeCount: matchingScopes.length,
    receiptCount: receipts.length,
    uniquePlanProposalCount: planProposalIds.size,
    uniqueMatchingScopeCount: matchingScopeIds.size,
    uniqueReceiptProposalCount: receiptProposalIds.size,
    expectedPlanHash,
    planHashError,
    planShapeValid,
    proposalIdsUnique,
    matchingApprovalSessionCount: matchingSessions.size,
    approvalScopeCoverageExact,
    approvalScopesMatchPlan,
    approvalAuthorityMatchesPlan,
    receiptCoverageExact,
    receiptsMatchPlan,
    planTotalMatchesProposals,
    receiptTotalMatchesPlan,
    committed,
    pass,
  };
}
