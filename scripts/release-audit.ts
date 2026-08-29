import {
  createSessionSigner,
  hashPlan,
  proposalScope,
  validateApprovalEnvelope,
  validateApprovalForBatch,
  validateApprovalForProposal,
  verifyApprovalToken,
} from "../packages/pact/src/index.ts";
import { validateEvacuationPlan } from "../packages/simulation/src/policy.ts";
import { HumanAuthorityCeiling } from "../apps/relay-command/src/authority-guard.ts";
import type {
  ApprovalPayload,
  ApprovalToken,
  PlanDraft,
  ProviderProposal,
  ProviderStateSnapshot,
} from "../packages/contracts/src/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const startedAt = Date.now();
const iso = (offset: number) => new Date(startedAt + offset).toISOString();

function proposal(
  input: Partial<ProviderProposal> & Pick<
    ProviderProposal,
    "proposalId" | "providerId" | "providerOrigin" | "resourceId" | "resourceLabel" | "quantity" | "unit" | "unitCost"
  >,
): ProviderProposal {
  return {
    purpose: "Riverside evacuation",
    stateVersion: 1,
    createdAt: iso(0),
    expiresAt: iso(300_000),
    totalCost: Number((input.quantity * input.unitCost).toFixed(2)),
    ...input,
  };
}

const proposals: ProviderProposal[] = [
  proposal({ proposalId: "s-east", providerId: "shelter", providerOrigin: "https://shelter.test", resourceId: "east", resourceLabel: "East Shelter", quantity: 18, unit: "beds", unitCost: 10 }),
  proposal({ proposalId: "s-south", providerId: "shelter", providerOrigin: "https://shelter.test", resourceId: "south", resourceLabel: "South Shelter", quantity: 24, unit: "beds", unitCost: 9 }),
  proposal({ proposalId: "t-bus", providerId: "transit", providerOrigin: "https://transit.test", resourceId: "bus-32", resourceLabel: "Rapid Bus 32", quantity: 32, unit: "seats", unitCost: 29 }),
  proposal({ proposalId: "t-access", providerId: "transit", providerOrigin: "https://transit.test", resourceId: "accessible-10", resourceLabel: "Access Shuttle 10", quantity: 10, unit: "accessible seats", unitCost: 68 }),
  proposal({ proposalId: "p-evac", providerId: "supply", providerOrigin: "https://supply.test", resourceId: "evac-kit", resourceLabel: "Evacuation Kit", quantity: 42, unit: "kits", unitCost: 12 }),
  proposal({ proposalId: "p-med", providerId: "supply", providerOrigin: "https://supply.test", resourceId: "medical-kit", resourceLabel: "Mobility Medical Kit", quantity: 9, unit: "kits", unitCost: 25 }),
];

const plan: PlanDraft = {
  planId: "plan-release-audit",
  incidentId: "FLOOD-RIVERSIDE-042",
  summary: "Canonical evacuation",
  rationale: "All hard constraints pass.",
  proposals,
  totalCost: proposals.reduce((sum, item) => sum + item.totalCost, 0),
  maxBudget: 3000,
  revision: 1,
  status: "VALIDATED",
  createdAt: iso(0),
  updatedAt: iso(0),
};

const states: ProviderStateSnapshot[] = [
  {
    providerId: "shelter",
    providerName: "Shelter Grid",
    origin: "https://shelter.test",
    stateVersion: 1,
    updatedAt: iso(0),
    resources: [
      { id: "north", label: "North Shelter", available: 46, unit: "beds", unitCost: 14 },
      { id: "east", label: "East Shelter", available: 18, unit: "beds", unitCost: 10 },
      { id: "south", label: "South Shelter", available: 24, unit: "beds", unitCost: 9 },
    ],
  },
  { providerId: "transit", providerName: "Transit Ops", origin: "https://transit.test", stateVersion: 1, updatedAt: iso(0), resources: [] },
  { providerId: "supply", providerName: "Supply Hub", origin: "https://supply.test", stateVersion: 1, updatedAt: iso(0), resources: [] },
];

const signer = await createSessionSigner("release-audit-session");

async function tokenFor(maximumCost = 3000, issued = 1, expires = 120_000): Promise<ApprovalToken> {
  const scopedPlan = { ...plan, maxBudget: maximumCost };
  const payload: ApprovalPayload = {
    sessionId: signer.sessionId,
    planId: scopedPlan.planId,
    planHash: await hashPlan(scopedPlan),
    scopes: proposals.map(proposalScope),
    maximumCost,
    issuedAt: iso(issued),
    expiresAt: iso(expires),
  };
  return signer.sign(payload);
}

const results: Record<string, { pass: boolean; evidence: string }> = {};
function pass(id: string, evidence: string): void {
  results[id] = { pass: true, evidence };
}

const policy = validateEvacuationPlan(proposals, states, 3000);
assert(policy.ok && plan.totalCost === 2733, "normal plan failed");
pass("normal_canonical_policy", "7/7 deterministic checks pass at EUR 2733");

const authority = new HumanAuthorityCeiling(5000);
assert(authority.capStageInput({ maxBudget: 5000 }).maxBudget === 5000, "initial incident authority was not preserved");
assert(authority.confirmTightening(3000), "human tightening to EUR 3000 was rejected");
assert(authority.capStageInput({ maxBudget: 5000 }).maxBudget === 3000, "stale restaging restored the old EUR 5000 authority");
assert(!authority.confirmTightening(4000), "human authority was allowed to increase after tightening");
pass("human_authority_persists_across_restaging", "EUR 5000 initial ceiling -> human EUR 3000 -> recovering agent request EUR 5000 remains capped at EUR 3000");

const lowered = await tokenFor(2800);
assert(validateApprovalEnvelope(lowered, signer.sessionId, startedAt + 2).ok, "lowered authority rejected");
pass("lower_authority_valid", "EUR 2800 ceiling accepts exact EUR 2733 aggregate");

const tooLow = await tokenFor(2700);
const tooLowResult = validateApprovalEnvelope(tooLow, signer.sessionId, startedAt + 2);
assert(!tooLowResult.ok && tooLowResult.code === "AGGREGATE_COST_EXCEEDED", "too-low authority accepted");
pass("aggregate_budget_escalation_rejected", tooLowResult.code);

const valid = await tokenFor();
const tampered = { ...valid, payload: { ...valid.payload, maximumCost: 5000 } };
assert(!(await verifyApprovalToken(tampered, signer.publicKeyJwk)), "tampered payload verified");
pass("tampered_payload_rejected", "signature verification false");

const expired = await tokenFor(3000, -240_000, -120_000);
const expiredResult = validateApprovalEnvelope(expired, signer.sessionId, startedAt);
assert(!expiredResult.ok && expiredResult.code === "APPROVAL_EXPIRED", "expired token accepted");
pass("expired_token_rejected", expiredResult.code);

const sessionResult = validateApprovalEnvelope(valid, "wrong-session", startedAt + 2);
assert(!sessionResult.ok && sessionResult.code === "SESSION_MISMATCH", "wrong session accepted");
pass("wrong_session_rejected", sessionResult.code);

const originResult = validateApprovalForProposal(valid, { ...proposals[0], providerOrigin: "https://evil.test" }, signer.sessionId, startedAt + 2);
assert(!originResult.ok && originResult.code === "ORIGIN_SCOPE_MISMATCH", "wrong origin accepted");
pass("wrong_origin_rejected", originResult.code);

const versionResult = validateApprovalForProposal(valid, { ...proposals[0], stateVersion: 2 }, signer.sessionId, startedAt + 2);
assert(!versionResult.ok && versionResult.code === "VERSION_SCOPE_MISMATCH", "wrong state version accepted");
pass("wrong_state_version_rejected", versionResult.code);

const partialResult = validateApprovalForBatch(valid, [proposals[0]], signer.sessionId, "shelter", "https://shelter.test", startedAt + 2);
assert(!partialResult.ok && partialResult.code === "INCOMPLETE_PROVIDER_BATCH", "partial same-origin batch accepted");
pass("partial_same_origin_batch_rejected", partialResult.code);

const completeResult = validateApprovalForBatch(valid, proposals.slice(0, 2), signer.sessionId, "shelter", "https://shelter.test", startedAt + 2);
assert(completeResult.ok, "complete same-origin batch rejected");
pass("complete_same_origin_batch_authorized", "exact two-scope shelter batch accepted");

console.log(JSON.stringify({
  schema: "relay.release-audit.v1",
  executedAt: new Date().toISOString(),
  environment: { node: process.version },
  result: "pass",
  cases: results,
  boundary: "Pure PACT, authority and policy evidence. Browser state, provider mutation and ChatGPT compatibility require deployed end-to-end evidence.",
}, null, 2));
