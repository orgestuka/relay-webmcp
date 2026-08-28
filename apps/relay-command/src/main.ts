import "./style.css";
import type {
  ApprovalPayload,
  ApprovalToken,
  CommitReceipt,
  PlanDraft,
  PlanStatus,
  ProviderId,
  ProviderProposal,
  ProviderStateSnapshot,
  ProviderToRelayMessage,
} from "@relay/contracts";
import { createSessionSigner, hashPlan, proposalScope, type SessionSigner } from "@relay/pact";
import { incident } from "@relay/simulation";
import { DynamicTool, registerTool, toolOutput, webMcpAvailable } from "@relay/webmcp-runtime";

const origins: Record<ProviderId, string> = {
  shelter: import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174",
  transit: import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175",
  supply: import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176",
};

const app = document.querySelector<HTMLDivElement>("#app")!;
if (!app) throw new Error("Missing #app");

let signer: SessionSigner;
let currentPlan: PlanDraft | null = null;
let pendingApproval: null | {
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
  payload: ApprovalPayload;
} = null;
let planStatus: PlanStatus = "DRAFT";
const providerStates = new Map<ProviderId, ProviderStateSnapshot>();
const knownProposals = new Map<string, ProviderProposal>();
const receipts = new Map<string, CommitReceipt>();
const eventLog: { time: string; kind: string; text: string }[] = [];

const approvalTool = new DynamicTool({
  name: "relay_request_approval",
  title: "Request human approval",
  description: "Pause agent execution and ask the human to approve the exact staged plan. Returns a signed, short-lived PACT token only after explicit approval.",
  inputSchema: {
    type: "object",
    properties: {
      planId: { type: "string", description: "Exact staged Relay plan ID." },
      note: { type: "string", description: "Short explanation of why the plan is ready for commitment." },
    },
    required: ["planId"],
  },
  annotations: { readOnlyHint: false, untrustedContentHint: false },
  execute: async (input: { planId: string; note?: string }, options?: { signal?: AbortSignal }) => {
    if (!currentPlan || currentPlan.planId !== input.planId) {
      return toolOutput({ ok: false, code: "PLAN_NOT_FOUND", message: "Stage or restage a valid plan first." });
    }
    const stale = staleReasons(currentPlan);
    if (stale.length) {
      markPlanStale(stale.join(" "));
      return toolOutput({ ok: false, code: "PLAN_STALE", reasons: stale });
    }
    if (currentPlan.totalCost > currentPlan.maxBudget) {
      return toolOutput({ ok: false, code: "BUDGET_EXCEEDED", totalCost: currentPlan.totalCost, maxBudget: currentPlan.maxBudget });
    }
    if (pendingApproval) return toolOutput({ ok: false, code: "APPROVAL_ALREADY_PENDING" });

    const planHash = await hashPlan(currentPlan);
    const issuedAt = new Date();
    const payload: ApprovalPayload = {
      sessionId: signer.sessionId,
      planId: currentPlan.planId,
      planHash,
      scopes: currentPlan.proposals.map(proposalScope),
      maximumCost: currentPlan.maxBudget,
      issuedAt: issuedAt.toISOString(),
      expiresAt: new Date(issuedAt.getTime() + 2 * 60_000).toISOString(),
    };

    currentPlan.status = "AWAITING_APPROVAL";
    planStatus = "AWAITING_APPROVAL";
    logEvent("approval", "Agent requested human consent. Tool execution is suspended until the user decides.");
    render();

    return new Promise<string>((resolve, reject) => {
      pendingApproval = { resolve, reject, payload };
      const abort = () => {
        if (!pendingApproval) return;
        pendingApproval = null;
        currentPlan!.status = "VALIDATED";
        planStatus = "VALIDATED";
        logEvent("approval", "Approval request cancelled by the agent or browser.");
        render();
        resolve(toolOutput({ ok: false, code: "APPROVAL_CANCELLED" }));
      };
      options?.signal?.addEventListener("abort", abort, { once: true });
      render();
    });
  },
});

function logEvent(kind: string, text: string) {
  eventLog.unshift({ time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }), kind, text });
  if (eventLog.length > 18) eventLog.length = 18;
}

function isProviderId(value: string): value is ProviderId {
  return value === "shelter" || value === "transit" || value === "supply";
}

function postSessionInit(providerId?: ProviderId) {
  const ids = providerId ? [providerId] : (["shelter", "transit", "supply"] as ProviderId[]);
  for (const id of ids) {
    const frame = document.querySelector<HTMLIFrameElement>(`iframe[data-provider="${id}"]`);
    frame?.contentWindow?.postMessage(
      {
        type: "relay_session_init",
        sessionId: signer.sessionId,
        publicKeyJwk: signer.publicKeyJwk,
        commandOrigin: window.location.origin,
      },
      origins[id],
    );
  }
}

window.addEventListener("message", (event: MessageEvent<ProviderToRelayMessage>) => {
  const sourceProvider = (Object.entries(origins).find(([, origin]) => origin === event.origin)?.[0] ?? "") as string;
  if (!isProviderId(sourceProvider)) return;
  const data = event.data;
  if (!data || typeof data !== "object" || !("type" in data)) return;

  if (data.type === "relay_provider_ready") {
    postSessionInit(data.providerId);
    logEvent("mesh", `${labelForProvider(data.providerId)} joined the signed Relay session.`);
  }
  if (data.type === "relay_provider_state") {
    const previous = providerStates.get(data.snapshot.providerId);
    providerStates.set(data.snapshot.providerId, data.snapshot);
    if (previous && previous.stateVersion !== data.snapshot.stateVersion) {
      logEvent("state", `${data.snapshot.providerName} advanced v${previous.stateVersion} → v${data.snapshot.stateVersion}.`);
      if (currentPlan && staleReasons(currentPlan).length) markPlanStale("A provider changed after plan validation.");
    }
  }
  if (data.type === "relay_provider_proposal") {
    knownProposals.set(data.proposal.proposalId, data.proposal);
    logEvent("proposal", `${labelForProvider(data.proposal.providerId)} proposed ${data.proposal.quantity} ${data.proposal.unit}: ${data.proposal.resourceLabel}.`);
  }
  if (data.type === "relay_provider_receipt") {
    receipts.set(data.receipt.receiptId, data.receipt);
    logEvent("commit", `${labelForProvider(data.receipt.providerId)} committed proposal ${shortId(data.receipt.proposalId)}.`);
    maybeMarkCommitted();
  }
  render();
});

function staleReasons(plan: PlanDraft): string[] {
  const reasons: string[] = [];
  const committedProposalIds = new Set([...receipts.values()].map((receipt) => receipt.proposalId));
  for (const proposal of plan.proposals) {
    if (committedProposalIds.has(proposal.proposalId)) continue;
    const state = providerStates.get(proposal.providerId);
    if (!state) reasons.push(`${proposal.providerId} provider is offline.`);
    else if (state.stateVersion !== proposal.stateVersion) reasons.push(`${state.providerName} is now v${state.stateVersion}; proposal ${shortId(proposal.proposalId)} was v${proposal.stateVersion}.`);
    if (Date.parse(proposal.expiresAt) <= Date.now()) reasons.push(`Proposal ${shortId(proposal.proposalId)} expired.`);
  }
  return reasons;
}

function markPlanStale(reason: string) {
  if (!currentPlan || currentPlan.status === "COMMITTED") return;
  currentPlan.status = "STALE";
  planStatus = "STALE";
  approvalTool.disable();
  if (pendingApproval) {
    pendingApproval.resolve(toolOutput({ ok: false, code: "PLAN_STALE_DURING_APPROVAL", message: reason }));
    pendingApproval = null;
  }
  logEvent("stale", reason);
}

function maybeMarkCommitted() {
  if (!currentPlan) return;
  const committedProposalIds = new Set([...receipts.values()].map((receipt) => receipt.proposalId));
  if (currentPlan.proposals.every((proposal) => committedProposalIds.has(proposal.proposalId))) {
    currentPlan.status = "COMMITTED";
    planStatus = "COMMITTED";
    approvalTool.disable();
    logEvent("complete", "All human-approved operations committed. The plan is complete.");
  }
}

async function stagePlan(input: { summary: string; rationale: string; proposalIds: string[]; maxBudget?: number }): Promise<string> {
  const proposals = input.proposalIds.map((id) => knownProposals.get(id)).filter(Boolean) as ProviderProposal[];
  if (proposals.length !== input.proposalIds.length || proposals.length === 0) {
    return toolOutput({ ok: false, code: "UNKNOWN_PROPOSAL", message: "Every proposal ID must come from a provider proposal tool in this live Relay session." });
  }
  const unique = new Set(proposals.map((proposal) => proposal.proposalId));
  if (unique.size !== proposals.length) return toolOutput({ ok: false, code: "DUPLICATE_PROPOSAL" });

  const maxBudget = Math.min(input.maxBudget ?? incident.maximumBudget, incident.maximumBudget);
  const totalCost = proposals.reduce((sum, proposal) => sum + proposal.totalCost, 0);
  currentPlan = {
    planId: `plan-${crypto.randomUUID()}`,
    incidentId: incident.id,
    summary: input.summary.slice(0, 180),
    rationale: input.rationale.slice(0, 500),
    proposals,
    totalCost: Number(totalCost.toFixed(2)),
    maxBudget,
    revision: (currentPlan?.revision ?? 0) + 1,
    status: "VALIDATED",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const stale = staleReasons(currentPlan);
  if (stale.length) {
    currentPlan.status = "STALE";
    planStatus = "STALE";
    approvalTool.disable();
    render();
    return toolOutput({ ok: false, code: "PLAN_STALE", planId: currentPlan.planId, reasons: stale });
  }
  if (currentPlan.totalCost > maxBudget) {
    currentPlan.status = "DRAFT";
    planStatus = "DRAFT";
    approvalTool.disable();
    render();
    return toolOutput({ ok: false, code: "BUDGET_EXCEEDED", planId: currentPlan.planId, totalCost: currentPlan.totalCost, maxBudget });
  }

  planStatus = "VALIDATED";
  await approvalTool.enable();
  logEvent("plan", `Plan ${shortId(currentPlan.planId)} validated across ${proposals.length} scoped proposals. Approval tool is now available.`);
  render();
  return toolOutput({
    ok: true,
    planId: currentPlan.planId,
    status: currentPlan.status,
    totalCost: currentPlan.totalCost,
    maxBudget: currentPlan.maxBudget,
    proposalCount: proposals.length,
    next: "Call relay_request_approval. That tool pauses until the human explicitly approves or rejects this exact plan.",
  });
}

async function approvePending() {
  if (!pendingApproval || !currentPlan) return;
  const stale = staleReasons(currentPlan);
  if (stale.length) {
    markPlanStale(stale.join(" "));
    render();
    return;
  }
  const token: ApprovalToken = await signer.sign(pendingApproval.payload);
  currentPlan.status = "APPROVED";
  planStatus = "APPROVED";
  logEvent("approval", `Human approved ${currentPlan.proposals.length} exact operations. Signed PACT token expires in two minutes.`);
  pendingApproval.resolve(toolOutput({ ok: true, status: "APPROVED", approvalToken: token, next: "Commit only the proposal IDs contained in approvalToken.payload.scopes." }));
  pendingApproval = null;
  approvalTool.disable();
  render();
}

function rejectPending() {
  if (!pendingApproval || !currentPlan) return;
  currentPlan.status = "REJECTED";
  planStatus = "REJECTED";
  logEvent("approval", "Human rejected the proposed transaction. No provider capacity changed.");
  pendingApproval.resolve(toolOutput({ ok: false, status: "REJECTED", code: "HUMAN_REJECTED" }));
  pendingApproval = null;
  approvalTool.disable();
  render();
}

function applyBudgetAmendment() {
  if (!currentPlan || pendingApproval) return;
  const input = document.querySelector<HTMLInputElement>("#authority-cap");
  if (!input) return;
  const requested = Math.floor(Number(input.value));
  if (!Number.isFinite(requested) || requested < currentPlan.totalCost || requested > incident.maximumBudget) {
    logEvent("amend", `Amendment rejected. Authority cap must be between ${money(currentPlan.totalCost)} and ${money(incident.maximumBudget)}.`);
    render();
    return;
  }
  currentPlan.maxBudget = requested;
  currentPlan.revision += 1;
  currentPlan.updatedAt = new Date().toISOString();
  currentPlan.status = "VALIDATED";
  planStatus = "VALIDATED";
  void approvalTool.enable();
  logEvent("amend", `Human tightened transaction authority to ${money(requested)}. Plan revision is now ${currentPlan.revision}.`);
  render();
}

function resetPlan() {
  if (pendingApproval) pendingApproval.resolve(toolOutput({ ok: false, code: "PLAN_RESET" }));
  pendingApproval = null;
  currentPlan = null;
  planStatus = "DRAFT";
  approvalTool.disable();
  logEvent("plan", "Staged plan cleared. Provider proposals remain non-binding until they expire.");
  render();
}

function labelForProvider(id: ProviderId) {
  return id === "shelter" ? "Shelter Grid" : id === "transit" ? "Transit Ops" : "Supply Hub";
}

function shortId(id: string) {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-5)}` : id;
}

function money(value: number) {
  return new Intl.NumberFormat("en-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function render() {
  const connected = providerStates.size;
  const stale = currentPlan ? staleReasons(currentPlan) : [];
  const statusClass = `status-${planStatus.toLowerCase()}`;
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">R</span><div><strong>RELAY</strong><small>Human-governed operations for the agentic web</small></div></div>
        <div class="top-status">
          <span class="pill ${webMcpAvailable() ? "pill-live" : "pill-warn"}">${webMcpAvailable() ? "● WebMCP LIVE" : "○ WebMCP NOT DETECTED"}</span>
          <span class="pill">${connected}/3 PROVIDERS</span>
          <span class="pill">SESSION ${signer ? shortId(signer.sessionId) : "booting"}</span>
        </div>
      </header>

      <section class="hero-grid">
        <article class="incident-card panel">
          <div class="panel-kicker">ACTIVE INCIDENT · ${incident.id}</div>
          <div class="incident-title-row"><h1>${incident.title}</h1><span class="deadline">DEADLINE ${incident.deadline}</span></div>
          <p class="lede">Coordinate independent web providers without surrendering human authority. Agents discover and compose. Humans consent. Providers verify.</p>
          <div class="metrics">
            <div><strong>${incident.residents}</strong><span>residents</span></div>
            <div><strong>${incident.wheelchairUsers}</strong><span>accessible seats</span></div>
            <div><strong>${money(incident.maximumBudget)}</strong><span>hard budget</span></div>
            <div><strong>20</strong><span>North beds reserved</span></div>
          </div>
          <div class="constraints">${incident.hardConstraints.map((constraint) => `<div><span>◆</span>${constraint}</div>`).join("")}</div>
        </article>

        <article class="map-card panel">
          <div class="panel-head"><span>LIVE OPERATIONS MAP</span><span class="map-state">${planStatus}</span></div>
          ${renderMap()}
        </article>
      </section>

      <section class="main-grid">
        <article class="plan-panel panel">
          <div class="panel-head"><span>PACT TRANSACTION</span><span class="plan-status ${statusClass}">${planStatus.replaceAll("_", " ")}</span></div>
          ${currentPlan ? renderPlan(currentPlan, stale) : renderEmptyPlan()}
        </article>
        <article class="activity-panel panel">
          <div class="panel-head"><span>PROVENANCE STREAM</span><span>${eventLog.length} EVENTS</span></div>
          <div class="activity-list">${eventLog.length ? eventLog.map(renderEvent).join("") : `<div class="empty-mini">Waiting for provider/tool activity…</div>`}</div>
        </article>
      </section>

      <section class="mesh panel">
        <div class="panel-head"><span>FEDERATED PROVIDER MESH</span><span>Each frame is an independent WebMCP origin</span></div>
        <div class="frame-grid">
          ${providerFrame("shelter")}
          ${providerFrame("transit")}
          ${providerFrame("supply")}
        </div>
      </section>
    </main>
    ${pendingApproval ? renderApprovalModal() : ""}
  `;

  app.querySelector<HTMLButtonElement>("#approve-plan")?.addEventListener("click", () => void approvePending());
  app.querySelector<HTMLButtonElement>("#reject-plan")?.addEventListener("click", rejectPending);
  app.querySelector<HTMLButtonElement>("#reset-plan")?.addEventListener("click", resetPlan);
  app.querySelector<HTMLButtonElement>("#apply-amendment")?.addEventListener("click", applyBudgetAmendment);
  app.querySelectorAll<HTMLIFrameElement>("iframe[data-provider]").forEach((frame) => {
    frame.addEventListener("load", () => {
      const id = frame.dataset.provider;
      if (id && isProviderId(id)) postSessionInit(id);
    }, { once: true });
  });
}

function renderMap() {
  const southState = providerStates.get("shelter")?.resources.find((resource) => resource.id === "south");
  const southAlert = southState && southState.available <= 12;
  return `<svg class="ops-map" viewBox="0 0 680 330" role="img" aria-label="Riverside emergency operations map">
    <defs>
      <linearGradient id="water" x1="0" x2="1"><stop stop-color="#0d3b47"/><stop offset="1" stop-color="#0a232e"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="680" height="330" fill="#071014" rx="18"/>
    <path d="M260 -20 C330 55 292 110 365 162 C430 208 399 275 487 350" stroke="url(#water)" stroke-width="72" fill="none" opacity=".9"/>
    <g stroke="#163039" stroke-width="1" opacity=".8"><path d="M40 60H620"/><path d="M60 145H640"/><path d="M25 245H610"/><path d="M120 20V305"/><path d="M535 25V300"/></g>
    <g class="route" stroke="#5ed5db" stroke-width="2" fill="none" stroke-dasharray="7 7" opacity=".8"><path d="M185 200 C250 160 285 152 338 170"/><path d="M338 170 C420 150 458 112 540 91"/><path d="M338 170 C418 205 461 236 555 250"/></g>
    <g transform="translate(153 178)"><circle r="35" fill="#321a1d" stroke="#ff737f"/><circle r="7" fill="#ff737f" filter="url(#glow)"/><text y="54" text-anchor="middle" fill="#ffb4ba" font-size="11">RIVERSIDE · 42</text></g>
    ${mapNode(540, 91, "NORTH", providerStates.get("shelter")?.resources.find((r) => r.id === "north")?.available ?? 46, false)}
    ${mapNode(454, 220, "EAST", providerStates.get("shelter")?.resources.find((r) => r.id === "east")?.available ?? 18, false)}
    ${mapNode(555, 250, "SOUTH", southState?.available ?? 24, Boolean(southAlert))}
    <g transform="translate(42 35)"><rect width="182" height="62" rx="10" fill="#0b181d" stroke="#1c3941"/><text x="14" y="22" fill="#729198" font-size="9">CURRENT PLAN</text><text x="14" y="43" fill="#e9f6f7" font-size="13">${currentPlan ? `${currentPlan.proposals.length} scoped operations` : "Awaiting agent proposal"}</text></g>
  </svg>`;
}

function mapNode(x: number, y: number, label: string, available: number, alert: boolean) {
  return `<g transform="translate(${x} ${y})"><circle r="23" fill="${alert ? "#341b1c" : "#0d262b"}" stroke="${alert ? "#ff737f" : "#46d5ba"}"/><text y="4" text-anchor="middle" fill="#f4fbfc" font-size="12" font-weight="700">${available}</text><text y="39" text-anchor="middle" fill="${alert ? "#ff9ba4" : "#83b8b9"}" font-size="9">${label}</text></g>`;
}

function renderEmptyPlan() {
  return `<div class="empty-plan">
    <div class="protocol-rail"><span class="active">1</span><i></i><span>2</span><i></i><span>3</span><i></i><span>4</span></div>
    <h2>Propose → Amend → Consent → Transact</h2>
    <p>The agent should query provider tools, create non-binding proposals, then call <code>relay_stage_plan</code> with the returned proposal IDs.</p>
    <div class="tool-callout"><span>START PROMPT</span><code>Evacuate all 42 residents before 18:00. Preserve 20 North beds, cover 9 accessible passengers, stay under €5,000. Prepare everything, but do not commit until I approve.</code></div>
  </div>`;
}

function renderPlan(plan: PlanDraft, stale: string[]) {
  return `<div class="plan-body">
    <div class="plan-summary"><div><span>PLAN ${shortId(plan.planId)}</span><h2>${plan.summary}</h2><p>${plan.rationale}</p></div><div class="plan-cost"><strong>${money(plan.totalCost)}</strong><span>of ${money(plan.maxBudget)}</span></div></div>
    ${stale.length ? `<div class="stale-banner"><strong>STATE INVALIDATED</strong>${stale.join(" ")}</div>` : ""}
    <div class="proposal-table">
      <div class="proposal-row proposal-head"><span>Origin</span><span>Operation</span><span>Version</span><span>Cost</span></div>
      ${plan.proposals.map((proposal) => `<div class="proposal-row"><span><b>${labelForProvider(proposal.providerId)}</b><small>${proposal.providerOrigin}</small></span><span>${proposal.quantity} ${proposal.unit} · ${proposal.resourceLabel}<small>${proposal.purpose}</small></span><span>v${proposal.stateVersion}</span><span>${money(proposal.totalCost)}</span></div>`).join("")}
    </div>
    <div class="amendment-row"><div><span>HUMAN AMENDMENT</span><strong>Tighten the maximum authority before consent</strong></div><div class="amendment-control"><span>€</span><input id="authority-cap" type="number" min="${Math.ceil(plan.totalCost)}" max="${incident.maximumBudget}" value="${Math.floor(plan.maxBudget)}"><button id="apply-amendment">Apply</button></div></div>
    <div class="protocol-state">
      ${protocolStep("PROPOSE", true, `${plan.proposals.length} provider quotes`)}
      ${protocolStep("AMEND", true, `revision ${plan.revision}`)}
      ${protocolStep("CONSENT", plan.status === "AWAITING_APPROVAL" || plan.status === "APPROVED" || plan.status === "COMMITTED", plan.status === "APPROVED" || plan.status === "COMMITTED" ? "signed" : "human required")}
      ${protocolStep("TRANSACT", plan.status === "COMMITTED", `${receipts.size}/${plan.proposals.length} receipts`)}
    </div>
    <button id="reset-plan" class="ghost-button">Clear staged plan</button>
  </div>`;
}

function protocolStep(label: string, active: boolean, detail: string) {
  return `<div class="p-step ${active ? "on" : ""}"><span>${active ? "✓" : "○"}</span><div><b>${label}</b><small>${detail}</small></div></div>`;
}

function renderEvent(event: { time: string; kind: string; text: string }) {
  return `<div class="event event-${event.kind}"><time>${event.time}</time><span class="event-dot"></span><p>${event.text}</p></div>`;
}

function providerFrame(id: ProviderId) {
  const state = providerStates.get(id);
  return `<div class="frame-card"><div class="frame-title"><span>${labelForProvider(id)}</span><small>${state ? `v${state.stateVersion} · connected` : "connecting…"}</small></div><iframe data-provider="${id}" src="${origins[id]}" allow="tools" title="${labelForProvider(id)} WebMCP provider"></iframe></div>`;
}

function renderApprovalModal() {
  if (!pendingApproval || !currentPlan) return "";
  return `<div class="modal-backdrop">
    <section class="approval-sheet" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <div class="approval-icon">◈</div>
      <div class="eyebrow">HUMAN AUTHORITY REQUIRED</div>
      <h2 id="approval-title">Approve exact transaction?</h2>
      <p>The agent is paused. Approving signs only these proposal IDs, provider versions and cost ceilings for two minutes.</p>
      <div class="approval-hash"><span>PLAN HASH</span><code>${pendingApproval.payload.planHash}</code></div>
      <div class="approval-lines">${currentPlan.proposals.map((p) => `<div><span>${labelForProvider(p.providerId)} · ${p.resourceLabel}</span><b>${p.quantity} ${p.unit} · ${money(p.totalCost)}</b><small>${shortId(p.proposalId)} · state v${p.stateVersion}</small></div>`).join("")}</div>
      <div class="approval-total"><span>Maximum authority</span><strong>${money(pendingApproval.payload.maximumCost)}</strong></div>
      <div class="approval-actions"><button id="reject-plan" class="reject-button">Reject</button><button id="approve-plan" class="approve-button">Approve & sign PACT token</button></div>
      <small class="approval-footnote">No provider capacity changes until the agent presents this signed token back to each scoped origin.</small>
    </section>
  </div>`;
}

async function registerRelayTools() {
  await registerTool({
    name: "relay_get_incident",
    title: "Read active emergency brief",
    description: "Return the active Riverside evacuation objective, hard constraints, budget and deadline. Read this before proposing operations.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput({ ...incident, providerOrigins: origins, rule: "Prepare proposals first. Do not commit any provider reservation before human approval." }),
  });

  await registerTool({
    name: "relay_get_mesh_state",
    title: "Read provider mesh state",
    description: "Return current provider versions and resources known to Relay. Use this to detect whether a previously proposed plan became stale.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput({ providers: [...providerStates.values()], stagedPlan: currentPlan ? { planId: currentPlan.planId, status: currentPlan.status, totalCost: currentPlan.totalCost } : null }),
  });

  await registerTool({
    name: "relay_stage_plan",
    title: "Stage a federated plan",
    description: "Stage exact non-binding provider proposal IDs as one Relay transaction. Validates live provider versions and budget, then unlocks human approval.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "Concise plan summary." },
        rationale: { type: "string", description: "How the plan satisfies the incident constraints." },
        proposalIds: { type: "array", items: { type: "string" }, minItems: 1, description: "Exact proposal IDs returned by provider proposal tools." },
        maxBudget: { type: "number", maximum: incident.maximumBudget, description: "Plan cost ceiling, never above €5,000." },
      },
      required: ["summary", "rationale", "proposalIds"],
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: stagePlan,
  });

  await registerTool({
    name: "relay_get_plan",
    title: "Read staged Relay plan",
    description: "Return the exact staged proposal scopes, current status and stale-state reasons without changing anything.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput(currentPlan ? { plan: currentPlan, staleReasons: staleReasons(currentPlan), receipts: [...receipts.values()] } : { plan: null }),
  });
}

async function boot() {
  signer = await createSessionSigner();
  logEvent("boot", "Relay created an ephemeral P-256 signing key. The private key never leaves this browser session.");
  await registerRelayTools();
  render();
  window.setTimeout(() => postSessionInit(), 350);
}

void boot();
