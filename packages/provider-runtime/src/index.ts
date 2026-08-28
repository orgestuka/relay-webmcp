import type {
  ApprovalToken,
  CommitReceipt,
  ProviderId,
  ProviderProposal,
  ProviderStateSnapshot,
  ProviderToRelayMessage,
  RelaySessionInitMessage,
  ResourceRecord,
} from "@relay/contracts";
import { isExpired, validateApprovalForProposal, verifyApprovalToken } from "@relay/pact";
import type { ProviderSeed } from "@relay/simulation";
import { DynamicTool, registerTool, toolOutput, webMcpAvailable } from "@relay/webmcp-runtime";

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
}

const PROPOSAL_TTL_MS = 5 * 60_000;

export async function mountProvider(options: ProviderRuntimeOptions): Promise<void> {
  const { seed, relayOrigin } = options;
  let stateVersion = 1;
  let resources = structuredClone(seed.resources);
  let trust: SessionTrust | null = null;
  const proposals = new Map<string, ProviderProposal>();
  const receipts: CommitReceipt[] = [];

  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("Missing #app");

  const post = (message: ProviderToRelayMessage) => {
    if (window.parent !== window) window.parent.postMessage(message, relayOrigin);
  };

  const snapshot = (): ProviderStateSnapshot => ({
    providerId: seed.providerId,
    providerName: seed.providerName,
    origin: window.location.origin,
    stateVersion,
    updatedAt: new Date().toISOString(),
    resources: structuredClone(resources),
  });

  const validProposalCount = () =>
    [...proposals.values()].filter((proposal) => proposal.stateVersion === stateVersion && !isExpired(proposal.expiresAt)).length;

  const render = () => {
    const mcpState = webMcpAvailable() ? "WebMCP live" : "WebMCP unavailable";
    app.innerHTML = `
      <main class="provider-shell">
        <header class="provider-header">
          <div>
            <div class="eyebrow">FEDERATED PROVIDER · ${seed.providerId.toUpperCase()}</div>
            <h1>${seed.providerName}</h1>
            <p>${seed.description}</p>
          </div>
          <div class="status-stack">
            <span class="status ${webMcpAvailable() ? "status-live" : "status-warn"}">${mcpState}</span>
            <span class="status">state v${stateVersion}</span>
          </div>
        </header>

        <section class="resource-grid">
          ${resources.map(resourceCard).join("")}
        </section>

        <section class="provider-footer">
          <div>
            <strong>${proposals.size}</strong>
            <span>proposals</span>
          </div>
          <div>
            <strong>${validProposalCount()}</strong>
            <span>committable</span>
          </div>
          <div>
            <strong>${receipts.length}</strong>
            <span>receipts</span>
          </div>
          <button id="inject-disruption" class="danger-button">Inject disruption</button>
        </section>
      </main>`;

    app.querySelector<HTMLButtonElement>("#inject-disruption")?.addEventListener("click", injectDisruption);
  };

  const broadcastState = () => {
    post({ type: "relay_provider_state", snapshot: snapshot() });
    render();
  };

  const commitTool = new DynamicTool(
    {
      name: options.commitToolName,
      title: `Commit ${seed.providerName} reservations`,
      description: "Atomically commit one or more proposals from this provider. Requires a valid human-signed Relay approval token and unchanged provider state.",
      inputSchema: {
        type: "object",
        properties: {
          proposalIds: { type: "array", items: { type: "string" }, minItems: 1, description: "Exact proposal IDs from this provider to commit atomically." },
          approvalToken: { type: "object", description: "Human-approved PACT token returned by relay_request_approval." },
        },
        required: ["proposalIds", "approvalToken"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: { proposalIds: string[]; approvalToken: ApprovalToken }) => {
        const requestedIds = [...new Set(input.proposalIds)];
        if (requestedIds.length === 0) return toolOutput({ ok: false, code: "NO_PROPOSALS" });
        const batch = requestedIds.map((id) => proposals.get(id));
        if (batch.some((proposal) => !proposal)) return toolOutput({ ok: false, code: "PROPOSAL_NOT_FOUND", message: "At least one proposal ID is unknown to this provider." });
        const scoped = batch as ProviderProposal[];
        if (!trust) return toolOutput({ ok: false, code: "NO_RELAY_SESSION", message: "Provider has not established Relay session trust." });

        if (scoped.some((proposal) => proposal.stateVersion !== stateVersion)) {
          await syncCommitTool();
          return toolOutput({ ok: false, code: "STALE_PROPOSAL", message: `Provider is v${stateVersion}. Re-propose every reservation from this origin before commit.` });
        }
        if (scoped.some((proposal) => isExpired(proposal.expiresAt))) {
          for (const proposal of scoped) if (isExpired(proposal.expiresAt)) proposals.delete(proposal.proposalId);
          await syncCommitTool();
          return toolOutput({ ok: false, code: "PROPOSAL_EXPIRED" });
        }

        for (const proposal of scoped) {
          const scopeCheck = validateApprovalForProposal(input.approvalToken, proposal, trust.sessionId);
          if (!scopeCheck.ok) return toolOutput(scopeCheck);
        }
        const signatureValid = await verifyApprovalToken(input.approvalToken, trust.publicKeyJwk);
        if (!signatureValid) return toolOutput({ ok: false, code: "INVALID_SIGNATURE", message: "Approval signature did not verify against the trusted Relay session key." });

        const demand = new Map<string, number>();
        for (const proposal of scoped) demand.set(proposal.resourceId, (demand.get(proposal.resourceId) ?? 0) + proposal.quantity);
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
        for (const receipt of committed) {
          receipts.push(receipt);
          proposals.delete(receipt.proposalId);
          post({ type: "relay_provider_receipt", receipt });
        }
        await syncCommitTool();
        broadcastState();
        return toolOutput({ ok: true, atomic: true, providerStateVersion: stateVersion, receipts: committed });
      },
    },
    [relayOrigin],
  );
  const syncCommitTool = async () => {
    if (validProposalCount() > 0) await commitTool.enable();
    else commitTool.disable();
  };

  function injectDisruption() {
    const target = resources.find((resource) => resource.id === seed.disruption.resourceId);
    if (!target) return;
    target.available = seed.disruption.newAvailability;
    stateVersion += 1;
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
          requiredTag: { type: "string", description: "Optional capability tag such as accessible, medical, or wheelchair." },
        },
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: async (input: { minimum?: number; requiredTag?: string }) => {
        const minimum = Math.max(0, input.minimum ?? 0);
        const requiredTag = input.requiredTag?.toLowerCase();
        const matches = resources.filter((resource) => {
          const amountOk = resource.available >= minimum;
          const tagOk = !requiredTag || resource.tags?.some((tag) => tag.toLowerCase().includes(requiredTag));
          return amountOk && tagOk;
        });
        return toolOutput({ provider: seed.providerName, stateVersion, resources: matches });
      },
    },
    { exposedTo: [relayOrigin] },
  );

  await registerTool(
    {
      name: options.proposeToolName,
      title: `Propose ${seed.providerName} reservation`,
      description: "Create a five-minute, non-binding reservation proposal. This does not consume capacity and cannot commit without later human approval.",
      inputSchema: {
        type: "object",
        properties: {
          resourceId: { type: "string", enum: resources.map((resource) => resource.id), description: "Resource ID from the provider search tool." },
          quantity: { type: "number", minimum: 1, description: "Quantity to reserve." },
          purpose: { type: "string", description: "Why this reservation is needed in the current plan." },
        },
        required: ["resourceId", "quantity", "purpose"],
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: async (input: { resourceId: string; quantity: number; purpose: string }) => {
        const resource = resources.find((candidate) => candidate.id === input.resourceId);
        const quantity = Math.floor(input.quantity);
        if (!resource) return toolOutput({ ok: false, code: "RESOURCE_NOT_FOUND" });
        if (quantity < 1 || quantity > resource.available) {
          return toolOutput({ ok: false, code: "INSUFFICIENT_CAPACITY", available: resource.available, requested: quantity });
        }
        const now = Date.now();
        const proposal: ProviderProposal = {
          proposalId: `${seed.providerId}-${crypto.randomUUID()}`,
          providerId: seed.providerId,
          providerOrigin: window.location.origin,
          resourceId: resource.id,
          resourceLabel: resource.label,
          quantity,
          unit: resource.unit,
          unitCost: resource.unitCost,
          totalCost: Number((quantity * resource.unitCost).toFixed(2)),
          purpose: input.purpose.slice(0, 180),
          stateVersion,
          createdAt: new Date(now).toISOString(),
          expiresAt: new Date(now + PROPOSAL_TTL_MS).toISOString(),
        };
        proposals.set(proposal.proposalId, proposal);
        post({ type: "relay_provider_proposal", proposal });
        await syncCommitTool();
        render();
        return toolOutput({ ok: true, proposal, next: `Stage this proposal in Relay. ${options.commitToolName} is now available but requires approval.` });
      },
    },
    { exposedTo: [relayOrigin] },
  );

  window.addEventListener("message", (event: MessageEvent<RelaySessionInitMessage>) => {
    if (event.origin !== relayOrigin || event.data?.type !== "relay_session_init") return;
    trust = { sessionId: event.data.sessionId, publicKeyJwk: event.data.publicKeyJwk };
    render();
  });

  post({ type: "relay_provider_ready", providerId: seed.providerId });
  broadcastState();
  render();
}

function resourceCard(resource: ResourceRecord): string {
  return `<article class="resource-card">
    <div class="resource-top"><span>${resource.label}</span><strong>${resource.available}</strong></div>
    <div class="resource-unit">${resource.unit} available · €${resource.unitCost}/${resource.unit.replace(/s$/, "")}</div>
    <p>${resource.detail ?? ""}</p>
    <div class="tags">${(resource.tags ?? []).map((tag) => `<span>${tag}</span>`).join("")}</div>
  </article>`;
}
