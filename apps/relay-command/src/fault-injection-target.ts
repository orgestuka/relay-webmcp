import type { PlanDraft, ProviderDisruptionMessage } from "@relay/contracts";

export interface ShelterDisruptionTarget {
  message: ProviderDisruptionMessage;
  resourceLabel: string;
  allocated: number;
}

export function shelterDisruptionForPlan(plan: PlanDraft | null): ShelterDisruptionTarget | null {
  if (!plan || (plan.status !== "VALIDATED" && plan.status !== "AWAITING_APPROVAL")) return null;

  const allocations = new Map<string, { resourceLabel: string; quantity: number }>();
  for (const proposal of plan.proposals) {
    if (proposal.providerId !== "shelter") continue;
    const current = allocations.get(proposal.resourceId);
    allocations.set(proposal.resourceId, {
      resourceLabel: proposal.resourceLabel,
      quantity: (current?.quantity ?? 0) + proposal.quantity,
    });
  }

  const target = [...allocations.entries()]
    .sort(([leftId, left], [rightId, right]) =>
      right.quantity - left.quantity || leftId.localeCompare(rightId))[0];
  if (!target) return null;

  const [resourceId, allocation] = target;
  return {
    message: {
      type: "relay_demo_inject_disruption",
      providerId: "shelter",
      resourceId,
      newAvailability: Math.max(0, allocation.quantity - 1),
    },
    resourceLabel: allocation.resourceLabel,
    allocated: allocation.quantity,
  };
}
