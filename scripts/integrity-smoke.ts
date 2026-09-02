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
import { DynamicTool } from "../packages/webmcp-runtime/src/index.ts";
import type {
  ApprovalPayload,
  PlanDraft,
  ProviderProposal,
  ProviderStateSnapshot,
} from "../packages/contracts/src/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const now = Date.now();

function proposal(
  input: Partial<ProviderProposal> & Pick<
    ProviderProposal,
    | "proposalId"
    | "providerId"
    | "providerOrigin"
    | "resourceId"
    | "resourceLabel"
    | "quantity"
    | "unit"
    | "unitCost"
  >,
): ProviderProposal {
  return {
    purpose: "Riverside evacuation",
    stateVersion: 1,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 300_000).toISOString(),
    totalCost: Number((input.quantity * input.unitCost).toFixed(2)),
    ...input,
  };
}

const proposals: ProviderProposal[] = [
  proposal({
    proposalId: "s-east",
    providerId: "shelter",
    providerOrigin: "https://shelter.test",
    resourceId: "east",
    resourceLabel: "East Shelter",
    quantity: 18,
    unit: "beds",
    unitCost: 10,
  }),
  proposal({
    proposalId: "s-south",
    providerId: "shelter",
    providerOrigin: "https://shelter.test",
    resourceId: "south",
    resourceLabel: "South Shelter",
    quantity: 24,
    unit: "beds",
    unitCost: 9,
  }),
  proposal({
    proposalId: "t-bus",
    providerId: "transit",
    providerOrigin: "https://transit.test",
    resourceId: "bus-32",
    resourceLabel: "Rapid Bus 32",
    quantity: 32,
    unit: "seats",
    unitCost: 29,
  }),
  proposal({
    proposalId: "t-access",
    providerId: "transit",
    providerOrigin: "https://transit.test",
    resourceId: "accessible-10",
    resourceLabel: "Access Shuttle 10",
    quantity: 10,
    unit: "accessible seats",
    unitCost: 68,
  }),
  proposal({
    proposalId: "p-evac",
    providerId: "supply",
    providerOrigin: "https://supply.test",
    resourceId: "evac-kit",
    resourceLabel: "Evacuation Kit",
    quantity: 42,
    unit: "kits",
    unitCost: 12,
  }),
  proposal({
    proposalId: "p-med",
    providerId: "supply",
    providerOrigin: "https://supply.test",
    resourceId: "medical-kit",
    resourceLabel: "Mobility Medical Kit",
    quantity: 9,
    unit: "kits",
    unitCost: 25,
  }),
];

const plan: PlanDraft = {
  planId: "plan-smoke",
  incidentId: "FLOOD-RIVERSIDE-042",
  summary: "Canonical evacuation",
  rationale: "All deterministic constraints pass.",
  completionDeadline: "18:00",
  proposals,
  totalCost: proposals.reduce((sum, item) => sum + item.totalCost, 0),
  maxBudget: 3000,
  revision: 1,
  status: "VALIDATED",
  createdAt: new Date(now).toISOString(),
  updatedAt: new Date(now).toISOString(),
};

const signer = await createSessionSigner("smoke-session");
const payload: ApprovalPayload = {
  sessionId: signer.sessionId,
  planId: plan.planId,
  planHash: await hashPlan(plan),
  scopes: proposals.map(proposalScope),
  maximumCost: plan.maxBudget,
  issuedAt: new Date(now + 1).toISOString(),
  expiresAt: new Date(now + 120_000).toISOString(),
};
const token = await signer.sign(payload);

assert(await verifyApprovalToken(token, signer.publicKeyJwk), "signature verification failed");
assert(validateApprovalEnvelope(token, signer.sessionId, now + 2).ok, "approval envelope rejected");
assert(validateApprovalForProposal(token, proposals[0], signer.sessionId, now + 2).ok, "exact proposal rejected");
assert(
  validateApprovalForBatch(
    token,
    proposals.slice(0, 2),
    signer.sessionId,
    "shelter",
    "https://shelter.test",
    now + 2,
  ).ok,
  "complete shelter batch rejected",
);
assert(
  !validateApprovalForBatch(
    token,
    proposals.slice(0, 1),
    signer.sessionId,
    "shelter",
    "https://shelter.test",
    now + 2,
  ).ok,
  "partial shelter batch accepted",
);
assert(
  !validateApprovalForProposal(
    token,
    { ...proposals[0], quantity: 17 },
    signer.sessionId,
    now + 2,
  ).ok,
  "mutated quantity accepted",
);
assert(await hashPlan({ ...plan, revision: 2 }) !== payload.planHash, "revision did not change plan hash");

const states: ProviderStateSnapshot[] = [
  {
    providerId: "shelter",
    providerName: "Shelter Grid",
    origin: "https://shelter.test",
    stateVersion: 1,
    updatedAt: new Date(now).toISOString(),
    resources: [
      { id: "north", label: "North Shelter", available: 46, unit: "beds", unitCost: 14 },
      { id: "east", label: "East Shelter", available: 18, unit: "beds", unitCost: 10 },
      { id: "south", label: "South Shelter", available: 24, unit: "beds", unitCost: 9 },
    ],
  },
  {
    providerId: "transit",
    providerName: "Transit Ops",
    origin: "https://transit.test",
    stateVersion: 1,
    updatedAt: new Date(now).toISOString(),
    resources: [],
  },
  {
    providerId: "supply",
    providerName: "Supply Hub",
    origin: "https://supply.test",
    stateVersion: 1,
    updatedAt: new Date(now).toISOString(),
    resources: [],
  },
];

const policy = validateEvacuationPlan(proposals, states, 3000, "18:00", "18:00");
assert(policy.ok, "canonical plan failed policy");
assert(
  policy.checks.find((check) => check.id === "budget")?.actual === 2733,
  "canonical cost drifted",
);
assert(
  !validateEvacuationPlan(
    proposals.filter((item) => item.resourceId !== "accessible-10"),
    states,
    3000,
    "18:00",
    "18:00",
  ).ok,
  "inaccessible plan passed policy",
);

let registrations = 0;
let registrationSignal: AbortSignal | undefined;
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: {
    modelContext: {
      async registerTool(
        _tool: unknown,
        options?: { signal?: AbortSignal },
      ): Promise<void> {
        registrations += 1;
        registrationSignal = options?.signal;
      },
    },
  },
});
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {},
});

const dynamic = new DynamicTool({
  name: "smoke_dynamic",
  description: "Exercise dynamic capability registration.",
  execute: () => ({ ok: true }),
});
await Promise.all([dynamic.enable(), dynamic.enable(), dynamic.enable()]);
assert(registrations === 1, "dynamic tool registered more than once");
assert(dynamic.active, "dynamic tool did not activate");
dynamic.disable();
await new Promise((resolve) => globalThis.setTimeout(resolve, 1));
assert(registrationSignal?.aborted, "dynamic registration was not revoked");
assert(!dynamic.active, "dynamic tool remained active after revocation");

console.log(JSON.stringify({
  pact: "pass",
  policy: "pass",
  dynamicTool: "pass",
  canonicalTotal: plan.totalCost,
  scopes: payload.scopes.length,
}));
