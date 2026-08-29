import { describe, expect, it } from "vitest";
import type { ProviderProposal, ProviderStateSnapshot } from "@relay/contracts";
import { shelterSeed, supplySeed, transitSeed, validateEvacuationPlan } from "./index";

function snapshot(seed: typeof shelterSeed, origin: string): ProviderStateSnapshot {
  return {
    providerId: seed.providerId,
    providerName: seed.providerName,
    origin,
    stateVersion: 1,
    updatedAt: "2026-08-28T10:00:00.000Z",
    resources: structuredClone(seed.resources),
  };
}

const states: ProviderStateSnapshot[] = [
  snapshot(shelterSeed, "https://shelter.example.test"),
  snapshot(transitSeed, "https://transit.example.test"),
  snapshot(supplySeed, "https://supply.example.test"),
];

function proposal(
  providerId: ProviderProposal["providerId"],
  providerOrigin: string,
  resourceId: string,
  resourceLabel: string,
  quantity: number,
  unit: string,
  unitCost: number,
): ProviderProposal {
  return {
    proposalId: `${providerId}-${resourceId}`,
    providerId,
    providerOrigin,
    resourceId,
    resourceLabel,
    quantity,
    unit,
    unitCost,
    totalCost: quantity * unitCost,
    purpose: "Deterministic policy test",
    stateVersion: 1,
    createdAt: "2026-08-28T10:00:00.000Z",
    expiresAt: "2026-08-28T10:05:00.000Z",
  };
}

function validPlan(): ProviderProposal[] {
  return [
    proposal("shelter", states[0].origin, "east", "East Shelter", 18, "beds", 10),
    proposal("shelter", states[0].origin, "south", "South Shelter", 24, "beds", 9),
    proposal("transit", states[1].origin, "bus-32", "Rapid Bus 32", 32, "seats", 29),
    proposal("transit", states[1].origin, "accessible-10", "Access Shuttle 10", 10, "accessible seats", 68),
    proposal("supply", states[2].origin, "evac-kit", "Evacuation Kit", 42, "kits", 12),
    proposal("supply", states[2].origin, "medical-kit", "Mobility Medical Kit", 9, "kits", 25),
  ];
}

function check(result: ReturnType<typeof validateEvacuationPlan>, id: string) {
  const value = result.checks.find((candidate) => candidate.id === id);
  if (!value) throw new Error(`Missing policy check ${id}`);
  return value;
}

describe("Riverside evacuation policy", () => {
  it("accepts the canonical six-operation plan", () => {
    const result = validateEvacuationPlan(validPlan(), states, 3000);

    expect(result.ok).toBe(true);
    expect(result.checks.every((candidate) => candidate.pass)).toBe(true);
    expect(check(result, "budget").actual).toBe(2733);
  });

  it("rejects superficially sufficient transport with no accessible seats", () => {
    const plan = validPlan().filter((candidate) => candidate.resourceId !== "accessible-10");
    plan.push(proposal("transit", states[1].origin, "minibus-14", "Minibus 14", 10, "seats", 37));
    const result = validateEvacuationPlan(plan, states, 3000);

    expect(check(result, "transport_capacity").pass).toBe(true);
    expect(check(result, "accessible_transport").pass).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("rejects a plan that consumes the protected North Shelter reserve", () => {
    const plan = validPlan().filter((candidate) => candidate.providerId !== "shelter");
    plan.push(proposal("shelter", states[0].origin, "north", "North Shelter", 27, "beds", 14));
    plan.push(proposal("shelter", states[0].origin, "east", "East Shelter", 15, "beds", 10));
    const result = validateEvacuationPlan(plan, states, 3000);

    expect(check(result, "shelter_capacity").pass).toBe(true);
    expect(check(result, "north_reserve").actual).toBe(19);
    expect(check(result, "north_reserve").pass).toBe(false);
  });

  it("does not subtract North Shelter beds twice after provider commit", () => {
    const plan = validPlan().filter((candidate) => candidate.providerId !== "shelter");
    const north = proposal("shelter", states[0].origin, "north", "North Shelter", 12, "beds", 14);
    const east = proposal("shelter", states[0].origin, "east", "East Shelter", 18, "beds", 10);
    const south = proposal("shelter", states[0].origin, "south", "South Shelter", 12, "beds", 9);
    plan.push(north, east, south);

    const beforeCommit = validateEvacuationPlan(plan, states, 3000);
    expect(check(beforeCommit, "north_reserve").actual).toBe(34);

    const afterCommitStates = structuredClone(states);
    const shelter = afterCommitStates.find((state) => state.providerId === "shelter")!;
    shelter.stateVersion = 2;
    shelter.resources.find((resource) => resource.id === "north")!.available = 34;
    shelter.resources.find((resource) => resource.id === "east")!.available = 0;
    shelter.resources.find((resource) => resource.id === "south")!.available = 12;

    const afterCommit = validateEvacuationPlan(plan, afterCommitStates, 3000);
    expect(check(afterCommit, "north_reserve").actual).toBe(34);
    expect(check(afterCommit, "north_reserve").pass).toBe(true);
  });

  it("rejects missing mobility support even when general kits are complete", () => {
    const plan = validPlan().filter((candidate) => candidate.resourceId !== "medical-kit");
    const result = validateEvacuationPlan(plan, states, 3000);

    expect(check(result, "evacuation_kits").pass).toBe(true);
    expect(check(result, "mobility_kits").pass).toBe(false);
  });

  it("enforces the human authority ceiling independently of resource feasibility", () => {
    const result = validateEvacuationPlan(validPlan(), states, 2700);

    expect(result.checks.filter((candidate) => candidate.id !== "budget").every((candidate) => candidate.pass)).toBe(true);
    expect(check(result, "budget").pass).toBe(false);
    expect(result.ok).toBe(false);
  });
});
