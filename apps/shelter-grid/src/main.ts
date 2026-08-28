import "@relay/provider-runtime/provider.css";
import { mountProvider } from "@relay/provider-runtime";
import { shelterSeed } from "@relay/simulation";

void mountProvider({
  seed: shelterSeed,
  relayOrigin: import.meta.env.VITE_RELAY_ORIGIN || "http://localhost:5173",
  searchToolName: "shelter_find_capacity",
  searchToolTitle: "Find shelter capacity",
  searchToolDescription: "Find current shelter bed capacity and capabilities. Read-only; returns the provider state version needed for safe proposals.",
  proposeToolName: "shelter_propose_reservation",
  commitToolName: "shelter_commit_reservation",
});
