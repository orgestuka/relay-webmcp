import "@relay/provider-runtime/provider.css";
import { mountProvider } from "@relay/provider-runtime";
import { transitSeed } from "@relay/simulation";

void mountProvider({
  seed: transitSeed,
  relayOrigin: import.meta.env.VITE_RELAY_ORIGIN || "http://localhost:5173",
  searchToolName: "transit_find_accessible_routes",
  searchToolTitle: "Find evacuation transport",
  searchToolDescription: "Find current evacuation vehicle capacity, including accessible seats. Read-only and versioned for safe planning.",
  proposeToolName: "transit_propose_reservation",
  commitToolName: "transit_commit_reservation",
});
