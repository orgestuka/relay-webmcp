import { describe, expect, it } from "vitest";
import type { ProviderProposal, ProviderStateSnapshot } from "@relay/contracts";
import { shelterSeed, supplySeed, transitSeed } from "./index";
import { validateEvacuationPlan } from "./policy";

const states: ProviderStateSnapshot[] = [shelterSeed, transitSeed, supplySeed].map((seed) => ({
  providerId: seed.providerId,
  providerName: seed.providerName,
  origin: `https://${seed.providerId}.example.test`,
  stateVersion: 1,
  updatedAt: new Date().toISOString(),
  resources: structuredClone(seed.resources),
}));

function proposal(providerId: ProviderProposal["providerId"], resourceId: string, quantity: number, unitCost: number): ProviderProposal {
  return {
    proposalId: `${providerId}-${resourceId}`,
    providerId,
    providerOrigin: `https://${providerId}.example.test`,
    resourceId,
    resourceLabel: resourceId,
    quantity,
    unit: "units",
    unitCost,
    totalCost: quantity * unitCost,
    purpose: "policy test",
    stateVersion: 1,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

const validPlan = (): ProviderProposal[] => [
  proposal("shelter", "east", 18, 10),
  proposal("shelter", "south", 24, 9),
  proposal("transit", "bus-32", 32, 29),
  proposal("transit", "accessible-10", 10, 68),
  proposal("supply", "evac-kit", 42, 12),
  proposal("supply", "medical-kit", 9, 25),
];

describe("Riverside deterministic policy", () => {
  it("accepts a plan that satisfies every hard constraint", () => {
    const result = validateEvacuationPlan(validPlan(), states, 3000);
    expect(result.ok).toBe(true);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it("rejects persuasive-but-incomplete plans", () => {
    const incomplete = validPlan().filter((item) => item.resourceId !== "accessible-10");
    const result = validateEvacuationPlan(incomplete, states, 3000);
    expect(result.ok).toBe(false);
    expect(result.checks.find((check) => check.id === "accessible_transport")?.pass).toBe(false);
    expect(result.checks.find((check) => check.id === "transport_capacity")?.pass).toBe(false);
  });

  it("preserves the North Shelter reserve after replanning", () => {
    const replanned = validPlan().filter((item) => item.providerId !== "shelter");
    replanned.push(proposal("shelter", "east", 18, 10));
    replanned.push(proposal("shelter", "south", 12, 9));
    replanned.push(proposal("shelter", "north", 12, 14));
    expect(validateEvacuationPlan(replanned, states, 3000).ok).toBe(true);

    replanned[replanned.length - 1] = proposal("shelter", "north", 28, 14);
    const result = validateEvacuationPlan(replanned, states, 4000);
    expect(result.checks.find((check) => check.id === "north_reserve")?.pass).toBe(false);
  });
});
