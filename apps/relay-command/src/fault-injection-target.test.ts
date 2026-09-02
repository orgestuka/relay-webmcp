import { describe, expect, it } from "vitest";
import type { PlanDraft, ProviderProposal } from "@relay/contracts";
import { shelterDisruptionForPlan } from "./fault-injection-target";

function proposal(resourceId: string, resourceLabel: string, quantity: number): ProviderProposal {
  return {
    proposalId: `shelter-${resourceId}`,
    providerId: "shelter",
    providerOrigin: "https://relay-shelter.example.test",
    resourceId,
    resourceLabel,
    quantity,
    unit: "beds",
    unitCost: 10,
    totalCost: quantity * 10,
    purpose: "Evacuation",
    stateVersion: 1,
    createdAt: "2026-09-02T20:00:00.000Z",
    expiresAt: "2026-09-02T21:00:00.000Z",
  };
}

function plan(proposals: ProviderProposal[], status: PlanDraft["status"] = "AWAITING_APPROVAL"): PlanDraft {
  return {
    planId: "plan-demo",
    incidentId: "FLOOD-RIVERSIDE-042",
    summary: "Adaptive evacuation",
    rationale: "Use the safest live allocation.",
    completionDeadline: "18:00",
    proposals,
    totalCost: proposals.reduce((total, item) => total + item.totalCost, 0),
    maxBudget: 3000,
    revision: 1,
    status,
    createdAt: "2026-09-02T20:00:00.000Z",
    updatedAt: "2026-09-02T20:00:00.000Z",
  };
}

describe("plan-aware shelter disruption", () => {
  it("targets the largest active shelter allocation and makes it insufficient", () => {
    const target = shelterDisruptionForPlan(plan([
      proposal("north", "North Shelter", 26),
      proposal("east", "East Shelter", 16),
    ]));

    expect(target).toEqual({
      message: {
        type: "relay_demo_inject_disruption",
        providerId: "shelter",
        resourceId: "north",
        newAvailability: 25,
      },
      resourceLabel: "North Shelter",
      allocated: 26,
    });
  });

  it("does not create a disruption without a staged, approvable shelter plan", () => {
    expect(shelterDisruptionForPlan(null)).toBeNull();
    expect(shelterDisruptionForPlan(plan([proposal("east", "East Shelter", 18)], "DRAFT"))).toBeNull();
    expect(shelterDisruptionForPlan(plan([], "AWAITING_APPROVAL"))).toBeNull();
  });
});
