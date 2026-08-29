import type { ProviderProposal, ProviderStateSnapshot } from "@relay/contracts";

export interface PolicyCheck {
  id: string;
  label: string;
  pass: boolean;
  actual: number;
  required: number;
  relation: ">=" | "<=";
}

export interface PolicyResult {
  ok: boolean;
  checks: PolicyCheck[];
}

function quantity(
  proposals: ProviderProposal[],
  providerId: ProviderProposal["providerId"],
  resourceId?: string,
): number {
  return proposals
    .filter((proposal) => proposal.providerId === providerId && (!resourceId || proposal.resourceId === resourceId))
    .reduce((sum, proposal) => sum + proposal.quantity, 0);
}

export function validateEvacuationPlan(
  proposals: ProviderProposal[],
  states: ProviderStateSnapshot[],
  maximumCost: number,
): PolicyResult {
  const shelterState = states.find((state) => state.providerId === "shelter");
  const northAvailability = shelterState
    ?.resources.find((resource) => resource.id === "north")?.available ?? 0;

  const totalCost = proposals.reduce((sum, proposal) => sum + proposal.totalCost, 0);
  const shelterBeds = quantity(proposals, "shelter");

  // A provider commit advances stateVersion and its live availability already
  // reflects the committed reservation. Subtract only North proposals quoted
  // against the current live version. Older-version proposals are either
  // already reflected in live state or stale and must not be counted twice.
  const northBedsPendingAtLiveVersion = shelterState
    ? proposals
      .filter((proposal) =>
        proposal.providerId === "shelter"
        && proposal.resourceId === "north"
        && proposal.stateVersion === shelterState.stateVersion)
      .reduce((sum, proposal) => sum + proposal.quantity, 0)
    : 0;
  const northReserveAfterPlan = northAvailability - northBedsPendingAtLiveVersion;

  const transitSeats = quantity(proposals, "transit");
  const accessibleSeats = quantity(proposals, "transit", "accessible-10");
  const evacuationKits = quantity(proposals, "supply", "evac-kit");
  const mobilityKits = quantity(proposals, "supply", "medical-kit");

  const checks: PolicyCheck[] = [
    { id: "shelter_capacity", label: "Shelter beds for all residents", pass: shelterBeds >= 42, actual: shelterBeds, required: 42, relation: ">=" },
    { id: "north_reserve", label: "North Shelter strategic reserve", pass: northReserveAfterPlan >= 20, actual: northReserveAfterPlan, required: 20, relation: ">=" },
    { id: "transport_capacity", label: "Transport seats for all residents", pass: transitSeats >= 42, actual: transitSeats, required: 42, relation: ">=" },
    { id: "accessible_transport", label: "Wheelchair-accessible transport", pass: accessibleSeats >= 9, actual: accessibleSeats, required: 9, relation: ">=" },
    { id: "evacuation_kits", label: "Evacuation kits", pass: evacuationKits >= 42, actual: evacuationKits, required: 42, relation: ">=" },
    { id: "mobility_kits", label: "Mobility medical kits", pass: mobilityKits >= 9, actual: mobilityKits, required: 9, relation: ">=" },
    { id: "budget", label: "Total transaction cost", pass: totalCost <= maximumCost, actual: Number(totalCost.toFixed(2)), required: maximumCost, relation: "<=" },
  ];

  return { ok: checks.every((check) => check.pass), checks };
}
