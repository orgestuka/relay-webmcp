export { validateEvacuationPlan, type PolicyCheck, type PolicyResult } from "./policy.ts";

import type { ProviderId, ResourceRecord } from "@relay/contracts";

export const incident = {
  id: "FLOOD-RIVERSIDE-042",
  title: "Riverside flash-flood evacuation",
  location: "Riverside District",
  residents: 42,
  wheelchairUsers: 9,
  deadline: "18:00",
  maximumBudget: 5000,
  hardConstraints: [
    "Evacuate all 42 residents before 18:00.",
    "Provide at least 9 wheelchair-accessible transport seats.",
    "Keep at least 20 beds unallocated at North Shelter.",
    "Do not exceed €5,000 total committed cost.",
    "Provide one evacuation kit per resident and one mobility medical kit per wheelchair user.",
    "No reservation may commit without explicit human approval.",
  ],
};

export interface ProviderSeed {
  providerId: ProviderId;
  providerName: string;
  description: string;
  resources: ResourceRecord[];
  disruption: { resourceId: string; newAvailability: number; label: string };
}

export const shelterSeed: ProviderSeed = {
  providerId: "shelter",
  providerName: "Shelter Grid",
  description: "Emergency bed capacity across municipal shelters.",
  resources: [
    { id: "north", label: "North Shelter", available: 46, unit: "beds", unitCost: 14, tags: ["medical", "accessible"], detail: "Must retain 20-bed strategic reserve." },
    { id: "east", label: "East Shelter", available: 18, unit: "beds", unitCost: 10, tags: ["family"], detail: "Closest to Riverside east bank." },
    { id: "south", label: "South Shelter", available: 24, unit: "beds", unitCost: 9, tags: ["pet-friendly"], detail: "Capacity exposed to downstream flooding." },
  ],
  disruption: { resourceId: "south", newAvailability: 12, label: "South Shelter loses 12 beds" },
};

export const transitSeed: ProviderSeed = {
  providerId: "transit",
  providerName: "Transit Ops",
  description: "Evacuation vehicles and accessible transport inventory.",
  resources: [
    { id: "bus-32", label: "Rapid Bus 32", available: 32, unit: "seats", unitCost: 29, tags: ["standard"], detail: "32-seat rapid deployment bus." },
    { id: "accessible-10", label: "Access Shuttle 10", available: 10, unit: "accessible seats", unitCost: 68, tags: ["wheelchair", "accessible"], detail: "Lift-equipped shuttle with 10 wheelchair positions." },
    { id: "minibus-14", label: "Minibus 14", available: 14, unit: "seats", unitCost: 37, tags: ["standard"], detail: "Flexible secondary route vehicle." },
  ],
  disruption: { resourceId: "bus-32", newAvailability: 20, label: "Rapid Bus loses 12 seats" },
};

export const supplySeed: ProviderSeed = {
  providerId: "supply",
  providerName: "Supply Hub",
  description: "Emergency kits and medical support inventory.",
  resources: [
    { id: "evac-kit", label: "Evacuation Kit", available: 80, unit: "kits", unitCost: 12, tags: ["water", "blanket", "food"], detail: "One 12-hour kit per evacuee." },
    { id: "medical-kit", label: "Mobility Medical Kit", available: 16, unit: "kits", unitCost: 25, tags: ["medical", "mobility"], detail: "Additional care pack for mobility-constrained residents." },
    { id: "water-crate", label: "Water Crate", available: 20, unit: "crates", unitCost: 18, tags: ["water"], detail: "24 x 500ml emergency water." },
  ],
  disruption: { resourceId: "medical-kit", newAvailability: 7, label: "Medical kits fall below required 9" },
};
