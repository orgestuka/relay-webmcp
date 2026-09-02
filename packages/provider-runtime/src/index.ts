import type {
  ApprovalToken,
  CommitReceipt,
  ProviderId,
  ProviderDisruptionMessage,
  ProviderProposal,
  ProviderRpcProbeMessage,
  ProviderRpcRequestMessage,
  ProviderStateSnapshot,
  ProviderToRelayMessage,
  RelaySessionInitMessage,
  ResourceRecord,
} from "@relay/contracts";
import { PROVIDER_RPC_PROTOCOL } from "@relay/contracts";
import {
  isExpired,
  isP256PublicJwk,
  validateApprovalForBatch,
  verifyApprovalToken,
} from "@relay/pact";
import type { ProviderSeed } from "@relay/simulation";
import {
  DynamicTool,
  executeLocalRegisteredTool,
  getLocalRegisteredToolNames,
  registerTool,
  toolOutput,
  webMcpAvailable,
} from "@relay/webmcp-runtime";

interface ProviderRuntimeOptions {
  seed: ProviderSeed;
  relayOrigin: string;
  searchToolName: string;
  searchToolTitle: string;
  searchToolDescription: string;
  proposeToolName: string;
  commitToolName: string;
}

interface SessionTrust {
  sessionId: string;
  publicKeyJwk: JsonWebKey;
  keyFingerprint: string;
}

const PROPOSAL_TTL_MS = 5 * 60_000;
const MAX_OPEN_PROPOSALS = 100;
const MAX_RPC_INPUT_BYTES = 64 * 1024;
const MAX_RPC_OUTPUT_BYTES = 1024 * 1024;
const MAX_RPC_REQUEST_IDS = 2_048;

function normalizeOrigin(value: string): string {
  const url = new URL(value, window.location.href);
  const local = url.hostname === "localhost"
    || url.hostname === "127.0.0.1"
    || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(`Relay origin must use HTTPS outside local development: ${value}`);
  }
  return url.origin;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maximumLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function keyFingerprint(jwk: JsonWebKey): string {
  return `${jwk.kty ?? ""}:${jwk.crv ?? ""}:${jwk.x ?? ""}:${jwk.y ?? ""}`;
}

function isRelaySessionInit(
  value: unknown,
  expectedCommandOrigin: string,
): value is RelaySessionInitMessage {
  if (!isRecord(value)) return false;
  return value.type === "relay_session_init"
    && cleanText(value.sessionId, 160) !== null
    && value.commandOrigin === expectedCommandOrigin
    && isP256PublicJwk(value.publicKeyJwk);
}

function isProviderRpcProbe(value: unknown, providerId: ProviderId): value is ProviderRpcProbeMessage {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 3
    && value.type === "relay_provider_rpc_probe"
    && value.protocol === PROVIDER_RPC_PROTOCOL
    && value.providerId === providerId;
}

function isProviderRpcRequest(value: unknown, providerId: ProviderId): value is ProviderRpcRequestMessage {
  if (!isRecord(value)) return false;
  if (Object.keys(value).length !== 6
    || value.type !== "relay_provider_rpc_request"
    || value.protocol !== PROVIDER_RPC_PROTOCOL
    || value.providerId !== providerId
    || typeof value.requestId !== "string"
    || !/^[a-zA-Z0-9-]{1,160}$/.test(value.requestId)
    || typeof value.toolName !== "string"
    || !isRecord(value.input)) return false;
  try {
    return JSON.stringify(value.input).length <= MAX_RPC_INPUT_BYTES;
  } catch {
    return false;
  }
}

function isProviderDisruptionMessage(
  value: unknown,
  providerId: ProviderId,
): value is ProviderDisruptionMessage {
  if (!isRecord(value)) return false;
  return Object.keys(value).length === 4
    && value.type === "relay_demo_inject_disruption"
    && value.providerId === providerId
    && cleanText(value.resourceId, 80) !== null
    && Number.isSafeInteger(value.newAvailability)
    && (value.newAvailability as number) >= 0;
}

function validateSeed(seed: ProviderSeed): void {
  if (!seed.resources.length) throw new Error(`${seed.providerName} has no resources.`);
  const ids = new Set<string>();
  for (const resource of seed.resources) {
    if (!cleanText(resource.id, 80) || ids.has(resource.id)) throw new Error(`Invalid or duplicate resource ID: ${resource.id}`);
    ids.add(resource.id);
    if (!cleanText(resource.label, 120) || !cleanText(resource.unit, 80)) throw new Error(`Invalid resource metadata: ${resource.id}`);
    if (!Number.isFinite(resource.available) || resource.available < 0 || !Number.isFinite(resource.unitCost) || resource.unitCost < 0) {
      throw new Error(`Invalid resource amount or cost: ${resource.id}`);
    }
  }
}

export async function mountProvider(options: ProviderRuntimeOptions): Promise<void> {
  const { seed } = options;
  validateSeed(seed);
  const relayOrigin = normalizeOrigin(options.relayOrigin);
  let stateVersion = 1;
  const resources = structuredClone(seed.resources);
  let trust: SessionTrust | null = null;
  let expiryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let disruptionInjected = false;
  const proposals = new Map<string, ProviderProposal>();
  const receipts: CommitReceipt[] = [];
  const seenRpcRequestIds = new Set<string>();

  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app");

  const post = (message: ProviderToRelayMessage): void => {
    if (window.parent !== window) window.parent.postMessage(message, relayOrigin);
  };

  const rpcToolNames = new Set([
    options.searchToolName,
    options.proposeToolName,
    options.commitToolName,
  ]);

  const postRpcCapabilities = (): void => {
    const tools = trust
      ? getLocalRegisteredToolNames()
        .filter((name) => rpcToolNames.has(name))
        .filter((name) => name !== options.commitToolName || validProposalCount() > 0)
        .sort()
      : [];
    post({
      type: "relay_provider_rpc_capabilities",
      protocol: PROVIDER_RPC_PROTOCOL,
      providerId: seed.providerId,
      tools,
    });
  };

  const snapshot = (): ProviderStateSnapshot => ({
    providerId: seed.providerId,
    providerName: seed.providerName,
    origin: window.location.origin,
    stateVersion,
    updatedAt: new Date().toISOString(),
    resources: structuredClone(resources),
  });

  const pruneExpiredProposals = (now = Date.now()): boolean => {
    let changed = false;
    for (const [proposalId, proposal] of proposals) {
      if (isExpired(proposal.expiresAt, now)) {
        proposals.delete(proposalId);
        changed = true;
      }
    }
    return changed;
  };

  const validProposalCount = (now = Date.now()): number =>
    [...proposals.values()].filter((proposal) =>
      proposal.stateVersion === stateVersion && !isExpired(proposal.expiresAt, now)).length;

  const render = (): void => {
    const isAgentReachable = webMcpAvailable() || Boolean(trust);
    const mcpState = webMcpAvailable()
      ? "WebMCP live"
      : trust
        ? "Relay bridge live"
        : "WebMCP unavailable";
    const trustState = trust ? "signed Relay session" : "awaiting Relay trust";
    app.innerHTML = `
      <main class="provider-shell">
        <header class="provider-header">
          <div>
            <div class="eyebrow">FEDERATED PROVIDER · ${escapeHtml(seed.providerId.toUpperCase())}</div>
            <h1>${escapeHtml(seed.providerName)}</h1>
            <p>${escapeHtml(seed.description)}</p>
          </div>
          <div class="status-stack">
            <span class="status ${isAgentReachable ? "status-live" : "status-warn"}">${mcpState}</span>
            <span class="status ${trust ? "status-live" : "status-warn"}">${trustState}</span>
            <span class="status">state v${stateVersion}</span>
          </div>
        </header>

        <section class="resource-grid">
          ${resources.map(resourceCard).join("")}
        </section>

        <section class="provider-footer">
          <div><strong>${proposals.size}</strong><span>open proposals</span></div>
          <div><strong>${validProposalCount()}</strong><span>committable</span></div>
          <div><strong>${receipts.length}</strong><span>receipts</span></div>
          <button id="inject-disruption" class="danger-button" ${disruptionInjected ? "disabled" : ""}>${disruptionInjected ? "Disruption injected" : "Inject disruption"}</button>
        </section>
      </main>`;

    app.querySelector<HTMLButtonElement>("#inject-disruption")?.addEventListener("click", () => injectDisruption());
  };

  const broadcastState = (): void => {
    post({ type: "relay_provider_state", snapshot: snapshot() });
    render();
  };

  let syncCommitTool: () => Promise<void>;

  const commitTool = new DynamicTool(
    {
      name: options.commitToolName,
      title: `Commit ${seed.providerName} reservations`,
      description: "Atomically commit every human-approved proposal for this provider. Fails closed on malformed tokens, incomplete batches, stale state, replayed IDs or changed capacity.",
      inputSchema: {
        type: "object",
        properties: {
          proposalIds: {
            type: "array",
            items: { type: "string", minLength: 1, maxLength: 160 },
            minItems: 1,
            maxItems: MAX_OPEN_PROPOSALS,
            uniqueItems: true,
            description: "Every proposal ID approved for this provider, exactly once.",
          },
          approvalToken: {
            type: "object",
            description: "Human-approved PACT token returned by relay_request_approval.",
          },
        },
        required: ["proposalIds", "approvalToken"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: { proposalIds: string[]; approvalToken: ApprovalToken }) => {
        pruneExpiredProposals();
        if (!isRecord(input) || !Array.isArray(input.proposalIds) || !isRecord(input.approvalToken)) {
          return toolOutput({ ok: false, code: "INVALID_INPUT", message: "proposalIds and approvalToken are required." });
        }
        if (!trust) return toolOutput({ ok: false, code: "NO_RELAY_SESSION", message: "Provider has not established Relay session trust." });

        const requestedIds = input.proposalIds.filter((id): id is string => cleanText(id, 160) !== null);
        if (requestedIds.length !== input.proposalIds.length || requestedIds.length === 0 || requestedIds.length > MAX_OPEN_PROPOSALS) {
          return toolOutput({ ok: false, code: "INVALID_PROPOSAL_IDS" });
        }
        if (new Set(requestedIds).size !== requestedIds.length) return toolOutput({ ok: false, code: "DUPLICATE_PROPOSAL" });

        const batch = requestedIds.map((id) => proposals.get(id));
        if (batch.some((proposal) => !proposal)) {
          await syncCommitTool();
          return toolOutput({ ok: false, code: "PROPOSAL_NOT_FOUND", message: "At least one proposal ID is unknown, expired or already committed." });
        }
        const scoped = batch as ProviderProposal[];

        const signatureValid = await verifyApprovalToken(input.approvalToken, trust.publicKeyJwk);
        if (!signatureValid) return toolOutput({ ok: false, code: "INVALID_SIGNATURE", message: "Approval signature did not verify against the trusted Relay session key." });

        const authorization = validateApprovalForBatch(
          input.approvalToken,
          scoped,
          trust.sessionId,
          seed.providerId,
          window.location.origin,
        );
        if (!authorization.ok) return toolOutput(authorization);

        if (scoped.some((proposal) => proposal.stateVersion !== stateVersion)) {
          await syncCommitTool();
          return toolOutput({ ok: false, code: "STALE_PROPOSAL", message: `Provider is v${stateVersion}. Re-propose every reservation from this origin before commit.` });
        }
        if (scoped.some((proposal) => isExpired(proposal.expiresAt))) {
          pruneExpiredProposals();
          await syncCommitTool();
          render();
          return toolOutput({ ok: false, code: "PROPOSAL_EXPIRED" });
        }

        const demand = new Map<string, number>();
        for (const proposal of scoped) {
          const total = (demand.get(proposal.resourceId) ?? 0) + proposal.quantity;
          if (!Number.isSafeInteger(total)) return toolOutput({ ok: false, code: "INVALID_DEMAND" });
          demand.set(proposal.resourceId, total);
        }
        for (const [resourceId, amount] of demand) {
          const resource = resources.find((candidate) => candidate.id === resourceId);
          if (!resource || resource.available < amount) {
            return toolOutput({ ok: false, code: "CAPACITY_CHANGED", resourceId, available: resource?.available ?? 0, requested: amount, message: "Atomic batch rejected. No capacity changed." });
          }
        }

        for (const [resourceId, amount] of demand) {
          const resource = resources.find((candidate) => candidate.id === resourceId)!;
          resource.available -= amount;
        }
        stateVersion += 1;

        const committed: CommitReceipt[] = scoped.map((proposal) => ({
          receiptId: crypto.randomUUID(),
          proposalId: proposal.proposalId,
          providerId: seed.providerId,
          providerOrigin: window.location.origin,
          committedAt: new Date().toISOString(),
          resultingStateVersion: stateVersion,
          amount: proposal.quantity,
          totalCost: proposal.totalCost,
        }));

        // Any provider state advance invalidates every outstanding quote from
        // the previous version, including quotes unrelated to this batch.
        proposals.clear();
        await syncCommitTool();
        for (const receipt of committed) {
          receipts.push(receipt);
          post({ type: "relay_provider_receipt", receipt });
        }
        broadcastState();
        return toolOutput({ ok: true, atomic: true, providerStateVersion: stateVersion, receipts: committed });
      },
    },
    [relayOrigin],
  );

  const scheduleExpiry = (): void => {
    if (expiryTimer !== null) {
      globalThis.clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    let nextExpiry = Number.POSITIVE_INFINITY;
    for (const proposal of proposals.values()) {
      const timestamp = Date.parse(proposal.expiresAt);
      if (Number.isFinite(timestamp) && timestamp < nextExpiry) nextExpiry = timestamp;
    }
    if (!Number.isFinite(nextExpiry)) return;
    expiryTimer = globalThis.setTimeout(() => {
      expiryTimer = null;
      const changed = pruneExpiredProposals();
      void syncCommitTool().finally(() => {
        if (changed) render();
      });
    }, Math.max(0, nextExpiry - Date.now() + 5));
  };

  syncCommitTool = async (): Promise<void> => {
    pruneExpiredProposals();
    if (trust && validProposalCount() > 0) await commitTool.enable();
    else commitTool.disable();
    scheduleExpiry();
    postRpcCapabilities();
  };

  function injectDisruption(request?: ProviderDisruptionMessage): void {
    if (disruptionInjected) return;
    const resourceId = request?.resourceId ?? seed.disruption.resourceId;
    const requestedAvailability = request?.newAvailability ?? seed.disruption.newAvailability;
    const target = resources.find((resource) => resource.id === resourceId);
    if (!target) return;
    const nextAvailability = Math.max(0, Math.floor(requestedAvailability));
    if (nextAvailability >= target.available) return;
    target.available = nextAvailability;
    disruptionInjected = true;
    stateVersion += 1;
    proposals.clear();
    void syncCommitTool();
    broadcastState();
  }

  await registerTool(
    {
      name: options.searchToolName,
      title: options.searchToolTitle,
      description: options.searchToolDescription,
      inputSchema: {
        type: "object",
        properties: {
          minimum: { type: "number", minimum: 0, description: "Minimum availability required. Use 0 to return all resources." },
          requiredTag: { type: "string", maxLength: 40, description: "Optional capability tag such as accessible, medical or wheelchair." },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input: { minimum?: number; requiredTag?: string }) => {
        const minimum = typeof input?.minimum === "number" && Number.isFinite(input.minimum)
          ? Math.max(0, input.minimum)
          : 0;
        const requiredTag = input?.requiredTag === undefined
          ? undefined
          : cleanText(input.requiredTag, 40)?.toLowerCase();
        if (input?.requiredTag !== undefined && !requiredTag) {
          return toolOutput({ ok: false, code: "INVALID_TAG" });
        }
        const matches = resources.filter((resource) => {
          const amountOk = resource.available >= minimum;
          const tagOk = !requiredTag || resource.tags?.some((tag) => tag.toLowerCase().includes(requiredTag));
          return amountOk && tagOk;
        });
        return toolOutput({
          ok: true,
          provider: seed.providerName,
          providerOrigin: window.location.origin,
          stateVersion,
          resources: structuredClone(matches),
        });
      },
    },
    { exposedTo: [relayOrigin] },
  );

  await registerTool(
    {
      name: options.proposeToolName,
      title: `Propose ${seed.providerName} reservation`,
      description: "Create a five-minute non-binding reservation proposal. This does not consume capacity and cannot commit without later human approval.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string", enum: resources.map((resource) => resource.id), description: "Resource ID from the provider search tool." },
          quantity: { type: "number", minimum: 1, description: "Whole-number quantity to reserve." },
          purpose: { type: "string", minLength: 1, maxLength: 180, description: "Why this reservation is needed in the current plan." },
        },
        required: ["resourceId", "quantity", "purpose"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      execute: async (input: { resourceId: string; quantity: number; purpose: string }) => {
        pruneExpiredProposals();
        if (!isRecord(input)) return toolOutput({ ok: false, code: "INVALID_INPUT" });
        const resourceId = cleanText(input.resourceId, 80);
        const purpose = cleanText(input.purpose, 180);
        if (!resourceId || !purpose || typeof input.quantity !== "number") {
          return toolOutput({ ok: false, code: "INVALID_INPUT" });
        }
        const resource = resources.find((candidate) => candidate.id === resourceId);
        if (!resource) return toolOutput({ ok: false, code: "RESOURCE_NOT_FOUND" });
        if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > resource.available) {
          return toolOutput({ ok: false, code: "INSUFFICIENT_CAPACITY", available: resource.available, requested: input.quantity });
        }
        if (proposals.size >= MAX_OPEN_PROPOSALS) {
          return toolOutput({ ok: false, code: "TOO_MANY_OPEN_PROPOSALS", maximum: MAX_OPEN_PROPOSALS });
        }

        const now = Date.now();
        const totalCost = input.quantity * resource.unitCost;
        if (!Number.isSafeInteger(Math.round(totalCost * 100))) return toolOutput({ ok: false, code: "INVALID_COST" });
        const proposal: ProviderProposal = {
          proposalId: `${seed.providerId}-${crypto.randomUUID()}`,
          providerId: seed.providerId,
          providerOrigin: window.location.origin,
          resourceId: resource.id,
          resourceLabel: resource.label,
          quantity: input.quantity,
          unit: resource.unit,
          unitCost: resource.unitCost,
          totalCost: Number(totalCost.toFixed(2)),
          purpose,
          stateVersion,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + PROPOSAL_TTL_MS).toISOString(),
        };
        proposals.set(proposal.proposalId, proposal);
        post({ type: "relay_provider_proposal", proposal });
        await syncCommitTool();
        render();
        return toolOutput({ ok: true, proposal, next: `Stage this proposal in Relay. ${options.commitToolName} requires exact human approval.` });
      },
    },
    { exposedTo: [relayOrigin] },
  );

  const executeRpcRequest = async (message: ProviderRpcRequestMessage): Promise<void> => {
    if (seenRpcRequestIds.has(message.requestId)) {
      post({
        type: "relay_provider_rpc_response",
        protocol: PROVIDER_RPC_PROTOCOL,
        requestId: message.requestId,
        providerId: seed.providerId,
        toolName: message.toolName,
        transportOk: false,
        error: {
          code: "PROVIDER_RPC_REPLAYED",
          message: "Provider RPC request IDs are single-use.",
        },
      });
      return;
    }
    seenRpcRequestIds.add(message.requestId);
    if (seenRpcRequestIds.size > MAX_RPC_REQUEST_IDS) {
      const oldest = seenRpcRequestIds.values().next().value;
      if (typeof oldest === "string") seenRpcRequestIds.delete(oldest);
    }

    try {
      const localTools = new Set(getLocalRegisteredToolNames());
      const isCommitActive = message.toolName !== options.commitToolName || validProposalCount() > 0;
      if (!trust || !rpcToolNames.has(message.toolName) || !localTools.has(message.toolName) || !isCommitActive) {
        post({
          type: "relay_provider_rpc_response",
          protocol: PROVIDER_RPC_PROTOCOL,
          requestId: message.requestId,
          providerId: seed.providerId,
          toolName: message.toolName,
          transportOk: true,
          output: toolOutput({
            ok: false,
            code: trust ? "UNDERLYING_CAPABILITY_UNAVAILABLE" : "NO_RELAY_SESSION",
            provider: seed.providerId,
            toolName: message.toolName,
          }),
        });
        return;
      }

      const result = await executeLocalRegisteredTool(
        message.toolName,
        structuredClone(message.input) as Record<string, unknown>,
      );
      if (typeof result !== "string" || result.length > MAX_RPC_OUTPUT_BYTES) {
        throw new Error("Provider tool returned an invalid or oversized response.");
      }
      post({
        type: "relay_provider_rpc_response",
        protocol: PROVIDER_RPC_PROTOCOL,
        requestId: message.requestId,
        providerId: seed.providerId,
        toolName: message.toolName,
        transportOk: true,
        output: result,
      });
    } catch (error) {
      post({
        type: "relay_provider_rpc_response",
        protocol: PROVIDER_RPC_PROTOCOL,
        requestId: message.requestId,
        providerId: seed.providerId,
        toolName: message.toolName,
        transportOk: false,
        error: {
          code: "PROVIDER_RPC_EXECUTION_FAILED",
          message: error instanceof Error ? error.message.slice(0, 240) : "Provider RPC execution failed.",
        },
      });
    } finally {
      postRpcCapabilities();
    }
  };

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent || event.origin !== relayOrigin) return;

    if (isRelaySessionInit(event.data, relayOrigin)) {
      const nextFingerprint = keyFingerprint(event.data.publicKeyJwk);
      if (trust && trust.sessionId === event.data.sessionId && trust.keyFingerprint !== nextFingerprint) {
        console.warn(`[${seed.providerName}] Rejected public-key substitution inside an active Relay session.`);
        return;
      }

      const sessionChanged = Boolean(trust && trust.sessionId !== event.data.sessionId);
      trust = {
        sessionId: event.data.sessionId,
        publicKeyJwk: structuredClone(event.data.publicKeyJwk),
        keyFingerprint: nextFingerprint,
      };
      if (sessionChanged) proposals.clear();
      void syncCommitTool();
      render();
      return;
    }

    if (isProviderDisruptionMessage(event.data, seed.providerId)) {
      if (trust) injectDisruption(event.data);
      return;
    }

    if (isProviderRpcProbe(event.data, seed.providerId)) {
      postRpcCapabilities();
      return;
    }
    if (isProviderRpcRequest(event.data, seed.providerId)) {
      void executeRpcRequest(event.data);
    }
  });

  window.addEventListener("pagehide", () => {
    if (expiryTimer !== null) globalThis.clearTimeout(expiryTimer);
    commitTool.disable();
  }, { once: true });

  post({ type: "relay_provider_ready", providerId: seed.providerId });
  broadcastState();
  render();
}

function resourceCard(resource: ResourceRecord): string {
  return `<article class="resource-card">
    <div class="resource-top"><span>${escapeHtml(resource.label)}</span><strong>${resource.available}</strong></div>
    <div class="resource-unit">${escapeHtml(resource.unit)} available · €${resource.unitCost}/${escapeHtml(resource.unit.replace(/s$/, ""))}</div>
    <p>${escapeHtml(resource.detail ?? "")}</p>
    <div class="tags">${(resource.tags ?? []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
  </article>`;
}
