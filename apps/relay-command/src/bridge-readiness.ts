import { getLocalRegisteredToolNames } from "@relay/webmcp-runtime";

export const expectedInitialBridgeTools = [
  "relay_bridge_status",
  "relay_bridge_shelter_find_capacity",
  "relay_bridge_shelter_propose_reservation",
  "relay_bridge_transit_find_accessible_routes",
  "relay_bridge_transit_propose_reservation",
  "relay_bridge_supply_check_stock",
  "relay_bridge_supply_propose_reservation",
] as const;

export function missingInitialBridgeTools(registered: readonly string[]): string[] {
  const active = new Set(registered);
  return expectedInitialBridgeTools.filter((name) => !active.has(name));
}

export async function waitForInitialBridgeSurface(options: {
  timeoutMs?: number;
  intervalMs?: number;
} = {}): Promise<{
  pass: boolean;
  waitedMs: number;
  registeredTools: string[];
  missingTools: string[];
}> {
  // A cold four-origin HTTPS load can spend meaningful time in DNS, TLS and
  // iframe startup before provider tools enter the shared ModelContext. Keep
  // the wait bounded, but do not make the first ChatGPT diagnostic race a
  // normal cold start.
  const timeoutMs = Math.max(0, options.timeoutMs ?? 5_000);
  const intervalMs = Math.max(10, options.intervalMs ?? 50);
  const startedAt = Date.now();

  while (true) {
    const registeredTools = getLocalRegisteredToolNames();
    const missingTools = missingInitialBridgeTools(registeredTools);
    if (missingTools.length === 0) {
      return {
        pass: true,
        waitedMs: Date.now() - startedAt,
        registeredTools,
        missingTools,
      };
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed >= timeoutMs) {
      return {
        pass: false,
        waitedMs: elapsed,
        registeredTools,
        missingTools,
      };
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, Math.min(intervalMs, timeoutMs - elapsed)));
  }
}
