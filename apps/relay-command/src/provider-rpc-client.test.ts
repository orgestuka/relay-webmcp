import { afterEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_RPC_PROTOCOL, type ProviderId } from "@relay/contracts";

const commandOrigin = "https://relay.test";
const providerOrigins: Record<ProviderId, string> = {
  shelter: "https://shelter.test",
  transit: "https://transit.test",
  supply: "https://supply.test",
};

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;

function messageEvent(data: unknown, origin: string, source: MessageEventSource | null): Event {
  const event = new Event("message");
  Object.defineProperties(event, {
    data: { value: data },
    origin: { value: origin },
    source: { value: source },
  });
  return event;
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("origin-locked provider RPC client", () => {
  it("pins probes and executions to the configured origin and exact iframe source", async () => {
    vi.stubEnv("VITE_SHELTER_ORIGIN", providerOrigins.shelter);
    vi.stubEnv("VITE_TRANSIT_ORIGIN", providerOrigins.transit);
    vi.stubEnv("VITE_SUPPLY_ORIGIN", providerOrigins.supply);

    const posted = new Map<ProviderId, Array<{ message: unknown; targetOrigin: string }>>();
    const frameWindows = Object.fromEntries((Object.keys(providerOrigins) as ProviderId[]).map((providerId) => {
      posted.set(providerId, []);
      return [providerId, {
        postMessage(message: unknown, targetOrigin: string) {
          posted.get(providerId)!.push({ message: structuredClone(message), targetOrigin });
        },
      }];
    })) as Record<ProviderId, Window>;

    const fakeWindow = new EventTarget() as EventTarget & {
      location: { origin: string; href: string };
    };
    fakeWindow.location = { origin: commandOrigin, href: `${commandOrigin}/` };
    const fakeDocument = {
      querySelector(selector: string) {
        const providerId = (Object.keys(providerOrigins) as ProviderId[])
          .find((id) => selector === `iframe[data-provider="${id}"]`);
        if (!providerId) return null;
        return {
          src: `${providerOrigins[providerId]}/`,
          contentWindow: frameWindows[providerId],
        };
      },
    };

    Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
    Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

    const client = await import("./provider-rpc-client");
    client.refreshProviderRpcCapabilities();
    for (const providerId of Object.keys(providerOrigins) as ProviderId[]) {
      expect(posted.get(providerId)).toEqual([{
        message: {
          type: "relay_provider_rpc_probe",
          protocol: PROVIDER_RPC_PROTOCOL,
          providerId,
        },
        targetOrigin: providerOrigins[providerId],
      }]);
    }

    fakeWindow.dispatchEvent(messageEvent({
      type: "relay_provider_rpc_capabilities",
      protocol: PROVIDER_RPC_PROTOCOL,
      providerId: "shelter",
      tools: ["shelter_find_capacity"],
    }, providerOrigins.shelter, {} as Window));
    expect(client.providerRpcSupports("shelter", "shelter_find_capacity")).toBe(false);

    fakeWindow.dispatchEvent(messageEvent({
      type: "relay_provider_rpc_capabilities",
      protocol: PROVIDER_RPC_PROTOCOL,
      providerId: "shelter",
      tools: ["shelter_find_capacity"],
    }, providerOrigins.shelter, frameWindows.shelter));
    expect(client.providerRpcSupports("shelter", "shelter_find_capacity")).toBe(true);

    const call = client.executeProviderRpc("shelter", "shelter_find_capacity", { minimum: 0 });
    const request = posted.get("shelter")!.at(-1)!;
    expect(request.targetOrigin).toBe(providerOrigins.shelter);
    expect(request.message).toMatchObject({
      type: "relay_provider_rpc_request",
      protocol: PROVIDER_RPC_PROTOCOL,
      providerId: "shelter",
      toolName: "shelter_find_capacity",
      input: { minimum: 0 },
    });
    const requestId = (request.message as { requestId: string }).requestId;

    fakeWindow.dispatchEvent(messageEvent({
      type: "relay_provider_rpc_response",
      protocol: PROVIDER_RPC_PROTOCOL,
      requestId,
      providerId: "shelter",
      toolName: "shelter_find_capacity",
      transportOk: true,
      output: JSON.stringify({ ok: true, providerOrigin: providerOrigins.shelter }),
    }, providerOrigins.shelter, frameWindows.shelter));
    await expect(call).resolves.toContain('"ok":true');

    fakeWindow.dispatchEvent(new Event("pagehide"));
  });
});
