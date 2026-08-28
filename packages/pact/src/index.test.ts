import { describe, expect, it } from "vitest";
import type { ApprovalPayload, PlanDraft, ProviderProposal } from "@relay/contracts";
import {
  canonicalize,
  createSessionSigner,
  hashPlan,
  proposalScope,
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

const plan = (proposals: ProviderProposal[]): PlanDraft => ({
  planId: "plan-1",
  incidentId: "FLOOD-RIVERSIDE-042",
  summary: "Evacuation plan",
  rationale: "Satisfies capacity, accessibility and budget constraints.",
  proposals,
  totalCost: proposals.reduce((sum, item) => sum + item.totalCost, 0),
  maxBudget: 3000,
  revision: 1,
  status: "VALIDATED",
  createdAt: "2026-08-28T10:00:00.000Z",
  updatedAt: "2026-08-28T10:00:00.000Z",
});

describe("PACT canonical scope", () => {
  it("canonicalizes object keys deterministically", () => {
    expect(canonicalize({ z: 1, a: { d: 4, b: 2 } })).toBe(canonicalize({ a: { b: 2, d: 4 }, z: 1 }));
  });

  it("hashes the same plan independent of proposal ordering", async () => {
    const a = proposal({ proposalId: "a" });
    const b = proposal({ proposalId: "b", resourceId: "south", resourceLabel: "South Shelter", totalCost: 216 });
    expect(await hashPlan(plan([a, b]))).toBe(await hashPlan(plan([b, a])));
  });
});

describe("PACT approval token", () => {
  it("verifies a human-session signature and exact proposal scope", async () => {
    const signer = await createSessionSigner("session-good");
    const item = proposal();
    const payload: ApprovalPayload = {
      sessionId: signer.sessionId,
      planId: "plan-1",
      planHash: await hashPlan(plan([item])),
      scopes: [proposalScope(item)],
      maximumCost: 3000,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const token = await signer.sign(payload);

    expect(await verifyApprovalToken(token, signer.publicKeyJwk)).toBe(true);
    expect(validateApprovalForProposal(token, item, signer.sessionId)).toEqual({ ok: true });
  });

  it("rejects a payload modified after the human signed it", async () => {
    const signer = await createSessionSigner("session-tamper");
    const item = proposal();
    const payload: ApprovalPayload = {
      sessionId: signer.sessionId,
      planId: "plan-1",
      planHash: await hashPlan(plan([item])),
      scopes: [proposalScope(item)],
      maximumCost: 3000,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const token = await signer.sign(payload);
    const tampered = { ...token, payload: { ...token.payload, maximumCost: 5000 } };

    expect(await verifyApprovalToken(tampered, signer.publicKeyJwk)).toBe(false);
  });

  it("rejects session replay, stale state and cost escalation", async () => {
    const signer = await createSessionSigner("session-bound");
    const item = proposal();
    const payload: ApprovalPayload = {
      sessionId: signer.sessionId,
      planId: "plan-1",
      planHash: await hashPlan(plan([item])),
      scopes: [proposalScope(item)],
      maximumCost: 3000,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120_000).toISOString(),
    };
    const token = await signer.sign(payload);

    expect(validateApprovalForProposal(token, item, "another-session")).toMatchObject({ ok: false, code: "SESSION_MISMATCH" });
    expect(validateApprovalForProposal(token, { ...item, stateVersion: 8 }, signer.sessionId)).toMatchObject({ ok: false, code: "VERSION_SCOPE_MISMATCH" });
    expect(validateApprovalForProposal(token, { ...item, totalCost: 181 }, signer.sessionId)).toMatchObject({ ok: false, code: "COST_SCOPE_EXCEEDED" });
  });
});
