import "@relay/provider-runtime/provider.css";
import { mountProvider } from "@relay/provider-runtime";
import { shelterSeed } from "@relay/simulation";

const relayOrigin = new URL(
  import.meta.env.VITE_RELAY_ORIGIN || "http://localhost:5173",
  window.location.href,
).origin;

function isDemoDisruptionMessage(value: unknown): value is { type: "relay_demo_inject_disruption" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 1 && record.type === "relay_demo_inject_disruption";
}

// This is a transparent human demo control, not an agent capability. It routes
// through Shelter Grid's real one-shot disruption button so provider state,
// proposal invalidation and dynamic WebMCP revocation follow the same path.
window.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || event.origin !== relayOrigin) return;
  if (!isDemoDisruptionMessage(event.data)) return;
  document.querySelector<HTMLButtonElement>("#inject-disruption")?.click();
});

void mountProvider({
  seed: shelterSeed,
  relayOrigin,
  searchToolName: "shelter_find_capacity",
  searchToolTitle: "Find shelter capacity",
  searchToolDescription: "Find current shelter bed capacity and capabilities. Read-only; returns the provider state version needed for safe proposals.",
  proposeToolName: "shelter_propose_reservation",
  commitToolName: "shelter_commit_reservation",
});
