import { describe, expect, it } from "vitest";
import type { ApprovalPayload, PlanDraft, ProviderProposal } from "@relay/contracts";
import {
  canonicalize,
  createSessionSigner,
  hashPlan,
  isP256PublicJwk,
  proposalScope,
  validateApprovalEnvelope,
  validateApprovalForBatch,
  validateApprovalForProposal,
  verifyApprovalToken,
} from "./index";

const proposal = (overrides: Partial<ProviderProposal> = {}): ProviderProposal => ({
  proposalId: "shelter-proposal-1",
  providerId: "shelter",
  providerOrigin: "https://shelter.example.test",
  resourceId: "east",
  resourceLabel: "East Shelter",
  quantity: 18,
  unit: "beds",
  unitCost: 10,
  totalCost: 180,
  purpose: "Evacuate Riverside residents",
  stateVersion: 7,
  createdAt: "2026-08-28T10:00:00.000Z",
  expiresAt: "2099-08-28T10:05:00.000Z",
  ...overrides,
});

const southProposal = (overrides: Partial<ProviderProposal> = {}) => proposal({
  proposalId: "b",
  resourceId: "south",
  resourceLabel: "South Shelter",
  quantity: 24,
  unitCost: 9,
  totalCost: 216,
  ...overrides,
});

const plan = (proposals: ProviderProposal[]): PlanDraft => ({
  planId: "plan-1",
  incidentId: "FLOOD-RIVERSIDE-042",
  summary: "Evacuation plan",
  rationale: "Satisfies capacity, accessibility and budget constraints.",
  completionDeadline: "18:00",
  proposals,
  totalCost: proposals.reduce((sum, item) => sum + item.totalCost, 0),
  maxBudget: 3000,
  revision: 1,
  status: "VALIDATED",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
});

async function signedToken(items: ProviderProposal[], maximumCost = 3000, sessionId = "session-good") {
  const signer = await createSessionSigner(sessionId);
  const payload: ApprovalPayload = {
    sessionId: signer.sessionId,
    planId: "plan-1",
    planHash: await hashPlan(plan(items)),
    scopes: items.map(proposalScope),
    maximumCost,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
  };
  return { signer, payload, token: await signer.sign(payload) };
}

describe("PACT canonical scope", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(canonicalize({ z: 1, a: { d: 4, b: 2 } })).toBe(canonicalize({ a: { b: 2, d: 4 }, z: 1 }));
  });

  it("rejects unsupported canonical values instead of signing ambiguous data", () => {
    expect(() => canonicalize({ value: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalize(new Date())).toThrow(/plain objects/);
    const sparse = new Array(2);
    sparse[1] = "value";
    expect(() => canonicalize(sparse)).toThrow(/sparse/);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalize(cyclic)).toThrow(/cycles/);
  });

  it("hashes the same plan independent of proposal ordering", async () => {
    const a = proposal({ proposalId: "a" });
    const b = southProposal();
    expect(await hashPlan(plan([a, b]))).toBe(await hashPlan(plan([b, a])));
  });

  it("binds the human-visible summary rationale and revision", async () => {
    const base = plan([proposal()]);
    const baseHash = await hashPlan(base);

    expect(await hashPlan({ ...base, summary: "Changed summary" })).not.toBe(baseHash);
    expect(await hashPlan({ ...base, rationale: "Changed rationale" })).not.toBe(baseHash);
    expect(await hashPlan({ ...base, completionDeadline: "18:01" })).not.toBe(baseHash);
    expect(await hashPlan({ ...base, revision: 2 })).not.toBe(baseHash);
  });
});

describe("PACT approval token", () => {
  it("verifies a human-session signature and exact proposal scope", async () => {
    const item = proposal();
    const { signer, token } = await signedToken([item]);

    expect(isP256PublicJwk(signer.publicKeyJwk)).toBe(true);
    expect(await verifyApprovalToken(token, signer.publicKeyJwk)).toBe(true);
    expect(validateApprovalForProposal(token, item, signer.sessionId)).toEqual({ ok: true });
  });

  it("rejects a payload modified after the human signed it", async () => {
    const item = proposal();
    const { signer, token } = await signedToken([item], 3000, "session-tamper");
    const tampered = { ...token, payload: { ...token.payload, maximumCost: 5000 } };

    expect(await verifyApprovalToken(tampered, signer.publicKeyJwk)).toBe(false);
  });

  it("rejects malformed token and key input without throwing", async () => {
    const { signer, token } = await signedToken([proposal()]);
    expect(await verifyApprovalToken(null, signer.publicKeyJwk)).toBe(false);
    expect(validateApprovalEnvelope({ nope: true }, signer.sessionId)).toMatchObject({ ok: false, code: "MALFORMED_APPROVAL" });
    expect(await verifyApprovalToken(token, { ...signer.publicKeyJwk, d: "private-material" })).toBe(false);
  });

  it("rejects session replay stale state and cost escalation", async () => {
    const item = proposal();
    const { signer, token } = await signedToken([item], 3000, "session-bound");

    expect(validateApprovalForProposal(token, item, "another-session")).toMatchObject({ ok: false, code: "SESSION_MISMATCH" });
    expect(validateApprovalForProposal(token, { ...item, stateVersion: 8 }, signer.sessionId)).toMatchObject({ ok: false, code: "VERSION_SCOPE_MISMATCH" });
    expect(validateApprovalForProposal(token, { ...item, totalCost: 181 }, signer.sessionId)).toMatchObject({ ok: false, code: "COST_SCOPE_MISMATCH" });
  });

  it("binds the full operation not only proposal ID and price", async () => {
    const item = proposal();
    const { signer, token } = await signedToken([item]);

    expect(validateApprovalForProposal(token, { ...item, resourceId: "south", resourceLabel: "South Shelter" }, signer.sessionId))
      .toMatchObject({ ok: false, code: "OPERATION_SCOPE_MISMATCH" });
    expect(validateApprovalForProposal(token, { ...item, purpose: "Different operation" }, signer.sessionId))
      .toMatchObject({ ok: false, code: "OPERATION_SCOPE_MISMATCH" });
  });

  it("rejects inconsistent scope arithmetic before signature authority is used", async () => {
    const item = proposal();
    const { signer, token } = await signedToken([item]);
    const inconsistent = {
      ...token,
      payload: {
        ...token.payload,
        scopes: token.payload.scopes.map((scope) => ({ ...scope, maxCost: scope.maxCost + 1 })),
      },
    };
    const resigned = await signer.sign(inconsistent.payload);

    expect(validateApprovalEnvelope(resigned, signer.sessionId)).toMatchObject({ ok: false, code: "SCOPE_COST_INCONSISTENT" });
  });

  it("rejects a signed scope set whose aggregate exceeds the human ceiling", async () => {
    const a = proposal({ proposalId: "a" });
    const b = southProposal();
    const { signer, token } = await signedToken([a, b], 300);

    expect(validateApprovalEnvelope(token, signer.sessionId)).toMatchObject({ ok: false, code: "AGGREGATE_COST_EXCEEDED" });
  });

  it("requires the complete approved same-origin batch", async () => {
    const a = proposal({ proposalId: "a" });
    const b = southProposal();
    const { signer, token } = await signedToken([a, b]);

    expect(validateApprovalForBatch(token, [a], signer.sessionId, "shelter", a.providerOrigin))
      .toMatchObject({ ok: false, code: "INCOMPLETE_PROVIDER_BATCH" });
    expect(validateApprovalForBatch(token, [a, b], signer.sessionId, "shelter", a.providerOrigin)).toEqual({ ok: true });
  });
});
