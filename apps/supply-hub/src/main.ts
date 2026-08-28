import "@relay/provider-runtime/provider.css";
import { mountProvider } from "@relay/provider-runtime";
import { supplySeed } from "@relay/simulation";

void mountProvider({
  seed: supplySeed,
  relayOrigin: import.meta.env.VITE_RELAY_ORIGIN || "http://localhost:5173",
  searchToolName: "supply_check_stock",
  searchToolTitle: "Check emergency stock",
  searchToolDescription: "Check current emergency supply inventory and unit costs. Read-only and versioned for safe planning.",
  proposeToolName: "supply_propose_reservation",
  commitToolName: "supply_commit_reservation",
});
