import {
  DynamicTool,
  getModelContext,
  registerTool,
  toolOutput,
  type RegisteredTool,
  type ToolAnnotations,
} from "@relay/webmcp-runtime";

interface BridgeSpec {
  provider: "shelter" | "transit" | "supply";
  origin: string;
  remoteName: string;
  wrapperName: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: ToolAnnotations;
}

const commandOrigin = window.location.origin;
const origins = {
  shelter: new URL(import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174", window.location.href).origin,
  transit: new URL(import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175", window.location.href).origin,
  supply: new URL(import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176", window.location.href).origin,
};

const searchSchema = (tagDescription: string): Record<string, unknown> => ({
  type: "object",
  properties: {
    minimum: { type: "number", minimum: 0, description: "Minimum current availability. Use 0 to return all resources." },
    requiredTag: { type: "string", maxLength: 40, description: tagDescription },
  },
  additionalProperties: false,
});

const proposalSchema = (resourceIds: string[]): Record<string, unknown> => ({
  type: "object",
  properties: {
    resourceId: { type: "string", enum: resourceIds, description: "Exact resource ID returned by the bridged provider discovery tool." },
    quantity: { type: "number", minimum: 1, description: "Whole-number quantity to include in the non-binding proposal." },
    purpose: { type: "string", minLength: 1, maxLength: 180, description: "Why the exact resource is needed for the staged plan." },
  },
  required: ["resourceId", "quantity", "purpose"],
  additionalProperties: false,
});

const commitSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    proposalIds: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 160 },
      minItems: 1,
      uniqueItems: true,
      description: "Every human-approved proposal ID for this exact provider origin, exactly once.",
    },
    approvalToken: {
      type: "object",
      description: "The exact PACT approval token returned by relay_request_approval after the human approved.",
    },
  },
  required: ["proposalIds", "approvalToken"],
  additionalProperties: false,
};

const specs: BridgeSpec[] = [
  {
    provider: "shelter",
    origin: origins.shelter,
    remoteName: "shelter_find_capacity",
    wrapperName: "relay_bridge_shelter_find_capacity",
    title: "Discover Shelter Grid capacity",
    description: `Strict top-level bridge to ${origins.shelter}::shelter_find_capacity. Read-only. The wrapper cannot select another origin or tool.`,
    inputSchema: searchSchema("Optional shelter capability tag such as accessible, medical or family."),
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
  {
    provider: "shelter",
    origin: origins.shelter,
    remoteName: "shelter_propose_reservation",
    wrapperName: "relay_bridge_shelter_propose_reservation",
    title: "Create Shelter Grid proposal",
    description: `Strict top-level bridge to ${origins.shelter}::shelter_propose_reservation. Creates a non-binding proposal and cannot commit capacity.`,
    inputSchema: proposalSchema(["north", "east", "south"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  {
    provider: "shelter",
    origin: origins.shelter,
    remoteName: "shelter_commit_reservation",
    wrapperName: "relay_bridge_shelter_commit_reservation",
    title: "Commit approved Shelter Grid batch",
    description: `Strict top-level bridge to ${origins.shelter}::shelter_commit_reservation. The provider independently verifies the human-signed PACT token, exact scope and live state.`,
    inputSchema: commitSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  {
    provider: "transit",
    origin: origins.transit,
    remoteName: "transit_find_accessible_routes",
    wrapperName: "relay_bridge_transit_find_accessible_routes",
    title: "Discover Transit Ops capacity",
    description: `Strict top-level bridge to ${origins.transit}::transit_find_accessible_routes. Read-only. The wrapper cannot select another origin or tool.`,
    inputSchema: searchSchema("Optional transport capability tag such as accessible or wheelchair."),
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
  {
    provider: "transit",
    origin: origins.transit,
    remoteName: "transit_propose_reservation",
    wrapperName: "relay_bridge_transit_propose_reservation",
    title: "Create Transit Ops proposal",
    description: `Strict top-level bridge to ${origins.transit}::transit_propose_reservation. Creates a non-binding proposal and cannot commit capacity.`,
    inputSchema: proposalSchema(["bus-32", "accessible-10", "minibus-14"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  {
    provider: "transit",
    origin: origins.transit,
    remoteName: "transit_commit_reservation",
    wrapperName: "relay_bridge_transit_commit_reservation",
    title: "Commit approved Transit Ops batch",
    description: `Strict top-level bridge to ${origins.transit}::transit_commit_reservation. The provider independently verifies the human-signed PACT token, exact scope and live state.`,
    inputSchema: commitSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
  {
    provider: "supply",
    origin: origins.supply,
    remoteName: "supply_check_stock",
    wrapperName: "relay_bridge_supply_check_stock",
    title: "Discover Supply Hub stock",
    description: `Strict top-level bridge to ${origins.supply}::supply_check_stock. Read-only. The wrapper cannot select another origin or tool.`,
    inputSchema: searchSchema("Optional supply capability tag such as medical, mobility or water."),
    annotations: { readOnlyHint: true, untrustedContentHint: false },
  },
  {
    provider: "supply",
    origin: origins.supply,
    remoteName: "supply_propose_reservation",
    wrapperName: "relay_bridge_supply_propose_reservation",
    title: "Create Supply Hub proposal",
    description: `Strict top-level bridge to ${origins.supply}::supply_propose_reservation. Creates a non-binding proposal and cannot commit capacity.`,
    inputSchema: proposalSchema(["evac-kit", "medical-kit", "water-crate"]),
    annotations: { readOnlyHint: false, untrustedContentHint: true },
  },
  {
    provider: "supply",
    origin: origins.supply,
    remoteName: "supply_commit_reservation",
    wrapperName: "relay_bridge_supply_commit_reservation",
    title: "Commit approved Supply Hub batch",
    description: `Strict top-level bridge to ${origins.supply}::supply_commit_reservation. The provider independently verifies the human-signed PACT token, exact scope and live state.`,
    inputSchema: commitSchema,
    annotations: { readOnlyHint: false, untrustedContentHint: false },
  },
];

const wrappers = new Map<string, DynamicTool>();
let syncTimer: number | null = null;
let syncRunning = false;
let syncRequested = false;
let lastSyncAt: string | null = null;
let lastError: string | null = null;

function exactRemoteTool(tools: RegisteredTool[], spec: BridgeSpec): RegisteredTool | undefined {
  return tools.find((tool) => tool.origin === spec.origin && tool.name === spec.remoteName);
}

async function discoverRemoteTools(): Promise<RegisteredTool[]> {
  const context = getModelContext();
  if (!context?.getTools) return [];
  const tools = await context.getTools({ fromOrigins: Object.values(origins) });
  return tools.filter((tool) => Object.values(origins).includes(tool.origin));
}

function wrapperFor(spec: BridgeSpec): DynamicTool {
  const existing = wrappers.get(spec.wrapperName);
  if (existing) return existing;

  const wrapper = new DynamicTool({
    name: spec.wrapperName,
    title: spec.title,
    description: spec.description,
    inputSchema: spec.inputSchema,
    annotations: spec.annotations,
    execute: async (input: Record<string, unknown>) => {
      const context = getModelContext();
      if (!context?.getTools || !context.executeTool) {
        return toolOutput({
          ok: false,
          code: "BRIDGE_API_UNAVAILABLE",
          origin: spec.origin,
          remoteTool: spec.remoteName,
        });
      }

      const remote = exactRemoteTool(
        await context.getTools({ fromOrigins: [spec.origin] }),
        spec,
      );
      if (!remote) {
        scheduleSync();
        return toolOutput({
          ok: false,
          code: "UNDERLYING_CAPABILITY_UNAVAILABLE",
          origin: spec.origin,
          remoteTool: spec.remoteName,
          message: "The provider capability is absent, stale, expired or not yet registered.",
        });
      }

      try {
        const result = await context.executeTool(remote, JSON.stringify(input ?? {}));
        if (result === null) {
          return toolOutput({
            ok: false,
            code: "UNDERLYING_TOOL_RETURNED_NULL",
            origin: spec.origin,
            remoteTool: spec.remoteName,
          });
        }
        return result;
      } catch (error) {
        return toolOutput({
          ok: false,
          code: "BRIDGED_EXECUTION_FAILED",
          origin: spec.origin,
          remoteTool: spec.remoteName,
          message: error instanceof Error ? error.message : "Provider executeTool failed",
        });
      } finally {
        scheduleSync();
      }
    },
  });
  wrappers.set(spec.wrapperName, wrapper);
  return wrapper;
}

async function synchronizeWrappers(): Promise<void> {
  if (syncRunning) {
    syncRequested = true;
    return;
  }
  syncRunning = true;
  try {
    const remoteTools = await discoverRemoteTools();
    for (const spec of specs) {
      const wrapper = wrapperFor(spec);
      if (exactRemoteTool(remoteTools, spec)) await wrapper.enable();
      else wrapper.disable();
    }
    lastSyncAt = new Date().toISOString();
    lastError = null;
  } catch (error) {
    lastError = error instanceof Error ? error.message : "Bridge synchronization failed";
    console.error("[Relay bridge] synchronization failed", error);
  } finally {
    syncRunning = false;
    if (syncRequested) {
      syncRequested = false;
      scheduleSync(0);
    }
  }
}

function scheduleSync(delay = 40): void {
  if (syncTimer !== null) globalThis.clearTimeout(syncTimer);
  syncTimer = globalThis.setTimeout(() => {
    syncTimer = null;
    void synchronizeWrappers();
  }, delay);
}

async function bootBridge(): Promise<void> {
  const context = getModelContext();
  if (!context) return;

  await registerTool({
    name: "relay_bridge_status",
    title: "Read strict provider bridge status",
    description: "Return the fixed origin-and-tool mapping used to expose provider capabilities at Relay's top level. Read-only; no arbitrary execution input exists.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput({
      ok: !lastError,
      mode: "fixed-top-level-capability-bridge",
      commandOrigin,
      lastSyncAt,
      lastError,
      mappings: specs.map((spec) => ({
        provider: spec.provider,
        origin: spec.origin,
        remoteTool: spec.remoteName,
        wrapperTool: spec.wrapperName,
        active: wrappers.get(spec.wrapperName)?.active ?? false,
      })),
      security: {
        arbitraryOriginSelection: false,
        arbitraryToolSelection: false,
        providerAuthorizationBypassed: false,
        dynamicCapabilityMirroring: true,
      },
    }),
  });

  context.addEventListener("toolchange", () => scheduleSync());
  scheduleSync(0);
  globalThis.setTimeout(() => scheduleSync(0), 300);
  globalThis.setTimeout(() => scheduleSync(0), 900);

  window.addEventListener("pagehide", () => {
    if (syncTimer !== null) globalThis.clearTimeout(syncTimer);
    for (const wrapper of wrappers.values()) wrapper.disable();
  }, { once: true });
}

void bootBridge().catch((error) => {
  lastError = error instanceof Error ? error.message : "Bridge boot failed";
  console.error("[Relay bridge] boot failed", error);
});
