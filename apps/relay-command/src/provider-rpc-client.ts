import {
  PROVIDER_RPC_PROTOCOL,
  type ProviderId,
  type ProviderRpcCapabilitiesMessage,
  type ProviderRpcRequestMessage,
  type ProviderRpcResponseMessage,
} from "@relay/contracts";

const RPC_TIMEOUT_MS = 5_000;
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;
export const PROVIDER_RPC_TOOLCHANGE_EVENT = "relay-provider-rpc-toolchange";

const providerIds: readonly ProviderId[] = ["shelter", "transit", "supply"];
const origins: Record<ProviderId, string> = {
  shelter: new URL(import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174", window.location.href).origin,
  transit: new URL(import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175", window.location.href).origin,
  supply: new URL(import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176", window.location.href).origin,
};

const allowedTools: Record<ProviderId, ReadonlySet<string>> = {
  shelter: new Set(["shelter_find_capacity", "shelter_propose_reservation", "shelter_commit_reservation"]),
  transit: new Set(["transit_find_accessible_routes", "transit_propose_reservation", "transit_commit_reservation"]),
  supply: new Set(["supply_check_stock", "supply_propose_reservation", "supply_commit_reservation"]),
};

interface PendingRequest {
  providerId: ProviderId;
  origin: string;
  toolName: string;
  timer: ReturnType<typeof globalThis.setTimeout>;
  resolve: (output: string) => void;
  reject: (error: Error) => void;
}

const capabilities = new Map<ProviderId, Set<string>>();
const pending = new Map<string, PendingRequest>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function providerForOrigin(origin: string): ProviderId | null {
  return providerIds.find((providerId) => origins[providerId] === origin) ?? null;
}

function frameForProvider(providerId: ProviderId): HTMLIFrameElement | null {
  if (typeof document.querySelector !== "function") return null;
  const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-provider="${providerId}"]`);
  if (!frame?.contentWindow) return null;
  try {
    if (new URL(frame.src, window.location.href).origin !== origins[providerId]) return null;
  } catch {
    return null;
  }
  return frame;
}

function isExpectedSource(event: MessageEvent<unknown>, providerId: ProviderId): boolean {
  const frame = frameForProvider(providerId);
  return Boolean(frame && event.origin === origins[providerId] && event.source === frame.contentWindow);
}

function parseCapabilities(
  value: unknown,
  providerId: ProviderId,
): ProviderRpcCapabilitiesMessage | null {
  if (!isRecord(value)
    || value.type !== "relay_provider_rpc_capabilities"
    || value.protocol !== PROVIDER_RPC_PROTOCOL
    || value.providerId !== providerId
    || !Array.isArray(value.tools)
    || value.tools.length > allowedTools[providerId].size
    || value.tools.some((tool) => typeof tool !== "string" || !allowedTools[providerId].has(tool))
    || new Set(value.tools).size !== value.tools.length) return null;
  return value as unknown as ProviderRpcCapabilitiesMessage;
}

function parseResponse(
  value: unknown,
  pendingRequest: PendingRequest,
): ProviderRpcResponseMessage | null {
  if (!isRecord(value)
    || value.type !== "relay_provider_rpc_response"
    || value.protocol !== PROVIDER_RPC_PROTOCOL
    || value.providerId !== pendingRequest.providerId
    || value.toolName !== pendingRequest.toolName
    || typeof value.requestId !== "string"
    || typeof value.transportOk !== "boolean") return null;
  if (value.transportOk) {
    if (typeof value.output !== "string" || value.output.length > MAX_OUTPUT_BYTES) return null;
  } else if (!isRecord(value.error)
    || typeof value.error.code !== "string"
    || typeof value.error.message !== "string") return null;
  return value as unknown as ProviderRpcResponseMessage;
}

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const providerId = providerForOrigin(event.origin);
  if (!providerId || !isExpectedSource(event, providerId) || !isRecord(event.data)) return;

  if (event.data.type === "relay_provider_rpc_capabilities") {
    const message = parseCapabilities(event.data, providerId);
    if (!message) return;
    const previous = capabilities.get(providerId);
    const next = new Set(message.tools);
    capabilities.set(providerId, next);
    const changed = !previous
      || previous.size !== next.size
      || [...previous].some((tool) => !next.has(tool));
    if (changed) window.dispatchEvent(new Event(PROVIDER_RPC_TOOLCHANGE_EVENT));
    return;
  }

  if (event.data.type !== "relay_provider_rpc_response") return;
  const requestId = typeof event.data.requestId === "string" ? event.data.requestId : "";
  const pendingRequest = pending.get(requestId);
  if (!pendingRequest || !isExpectedSource(event, pendingRequest.providerId)) return;
  const message = parseResponse(event.data, pendingRequest);
  if (!message) return;

  globalThis.clearTimeout(pendingRequest.timer);
  pending.delete(requestId);
  if (message.transportOk && message.output !== undefined) {
    pendingRequest.resolve(message.output);
  } else {
    pendingRequest.reject(new Error(message.error?.message ?? "Provider RPC failed"));
  }
});

export function providerRpcSupports(providerId: ProviderId, toolName: string): boolean {
  return capabilities.get(providerId)?.has(toolName) ?? false;
}

export function providerRpcSnapshot(): Record<ProviderId, string[]> {
  return Object.fromEntries(providerIds.map((providerId) => [
    providerId,
    [...(capabilities.get(providerId) ?? [])].sort(),
  ])) as Record<ProviderId, string[]>;
}

export function refreshProviderRpcCapabilities(): void {
  for (const providerId of providerIds) {
    const frame = frameForProvider(providerId);
    if (!frame) continue;
    frame.contentWindow?.postMessage({
      type: "relay_provider_rpc_probe",
      protocol: PROVIDER_RPC_PROTOCOL,
      providerId,
    }, origins[providerId]);
  }
}

export async function executeProviderRpc(
  providerId: ProviderId,
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (!allowedTools[providerId].has(toolName) || !providerRpcSupports(providerId, toolName)) {
    throw new Error(`Provider RPC capability ${providerId}::${toolName} is unavailable.`);
  }
  const frame = frameForProvider(providerId);
  if (!frame?.contentWindow) throw new Error(`Provider frame ${providerId} is unavailable.`);

  const serialized = JSON.stringify(input ?? {});
  if (serialized.length > MAX_INPUT_BYTES) throw new Error("Provider RPC input exceeds the 64 KiB limit.");
  const requestId = crypto.randomUUID();
  const request: ProviderRpcRequestMessage = {
    type: "relay_provider_rpc_request",
    protocol: PROVIDER_RPC_PROTOCOL,
    requestId,
    providerId,
    toolName,
    input: structuredClone(input ?? {}),
  };

  return new Promise<string>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Provider RPC ${providerId}::${toolName} timed out.`));
    }, RPC_TIMEOUT_MS);
    pending.set(requestId, {
      providerId,
      origin: origins[providerId],
      toolName,
      timer,
      resolve,
      reject,
    });
    frame.contentWindow!.postMessage(request, origins[providerId]);
  });
}

window.addEventListener("pagehide", () => {
  for (const request of pending.values()) {
    globalThis.clearTimeout(request.timer);
    request.reject(new Error("Relay page closed before provider RPC completed."));
  }
  pending.clear();
  capabilities.clear();
}, { once: true });
