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
  ResourceRecord,
} from "@relay/contracts";
import { createSessionSigner, hashPlan, proposalScope, type SessionSigner } from "@relay/pact";
import { incident, validateEvacuationPlan } from "@relay/simulation";
import { DynamicTool, registerTool, toolOutput, webMcpAvailable } from "@relay/webmcp-runtime";
import { stageLockedStatus } from "./authority-guard";

const providerIds: readonly ProviderId[] = ["shelter", "transit", "supply"];

function normalizeOrigin(value: string): string {
  const url = new URL(value, window.location.href);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error(`Unsupported provider origin: ${value}`);
  return url.origin;
}

const origins: Record<ProviderId, string> = {
  shelter: normalizeOrigin(import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174"),
  transit: normalizeOrigin(import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175"),
  supply: normalizeOrigin(import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176"),
};

const app = document.querySelector<HTMLDivElement>("#app")!;
if (!app) throw new Error("Missing #app");

interface PendingApproval {
  resolve: (value: string) => void;
  payload: ApprovalPayload;
  signal?: AbortSignal;
  abortListener?: () => void;
}

interface EventRecord {
  time: string;
  kind: string;
  text: string;
}

let signer: SessionSigner | null = null;
let currentPlan: PlanDraft | null = null;
let pendingApproval: PendingApproval | null = null;
let planStatus: PlanStatus = "DRAFT";
const providerStates = new Map<ProviderId, ProviderStateSnapshot>();
const knownProposals = new Map<string, ProviderProposal>();
const receipts = new Map<string, CommitReceipt>();
const eventLog: EventRecord[] = [];
const providerFrames = new Map<ProviderId, HTMLIFrameElement>();

export function readCurrentPlanSnapshot(): PlanDraft | null {
  return currentPlan ? structuredClone(currentPlan) : null;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function plainText(value: unknown, maximumLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maximumLength);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function moneyEquals(left: number, right: number): boolean {
  return Math.round(left * 100) === Math.round(right * 100);
}

function providerForOrigin(origin: string): ProviderId | null {
  return providerIds.find((id) => origins[id] === origin) ?? null;
}

function labelForProvider(id: ProviderId): string {
  return id === "shelter" ? "Shelter Grid" : id === "transit" ? "Transit Ops" : "Supply Hub";
}

function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-5)}` : id;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function logEvent(kind: string, text: string): void {
  eventLog.unshift({
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    kind,
    text,
  });
  if (eventLog.length > 24) eventLog.length = 24;
}

function securityReject(providerId: ProviderId | null, reason: string): void {
  console.warn("[Relay security boundary]", reason);
  logEvent("security", `${providerId ? labelForProvider(providerId) : "Unknown origin"}: ${reason}`);
  renderDynamic();
}

function validateResource(value: unknown): value is ResourceRecord {
  if (!isRecord(value)) return false;
  return plainText(value.id, 80) !== null
    && plainText(value.label, 120) !== null
    && finiteNonNegative(value.available)
    && plainText(value.unit, 80) !== null
    && finiteNonNegative(value.unitCost)
    && (value.tags === undefined || (Array.isArray(value.tags) && value.tags.every((tag) => plainText(tag, 60) !== null)))
    && (value.detail === undefined || plainText(value.detail, 240) !== null);
}

function validateSnapshot(value: unknown, providerId: ProviderId, origin: string): value is ProviderStateSnapshot {
  if (!isRecord(value)) return false;
  if (value.providerId !== providerId || value.origin !== origin) return false;
  if (plainText(value.providerName, 120) === null || !positiveInteger(value.stateVersion) || !validDate(value.updatedAt)) return false;
  return Array.isArray(value.resources) && value.resources.length > 0 && value.resources.every(validateResource);
}

function validateProposal(value: unknown, providerId: ProviderId, origin: string): value is ProviderProposal {
  if (!isRecord(value)) return false;
  if (value.providerId !== providerId || value.providerOrigin !== origin) return false;
  if (
    plainText(value.proposalId, 160) === null
    || plainText(value.resourceId, 80) === null
    || plainText(value.resourceLabel, 120) === null
    || plainText(value.unit, 80) === null
    || plainText(value.purpose, 180) === null
    || !positiveInteger(value.quantity)
    || !finiteNonNegative(value.unitCost)
    || !finiteNonNegative(value.totalCost)
    || !positiveInteger(value.stateVersion)
    || !validDate(value.createdAt)
    || !validDate(value.expiresAt)
  ) return false;
  if (!moneyEquals(value.totalCost, value.quantity * value.unitCost)) return false;
  return Date.parse(value.expiresAt) > Date.parse(value.createdAt);
}

function validateReceipt(value: unknown, providerId: ProviderId, origin: string): value is CommitReceipt {
  if (!isRecord(value)) return false;
  if (value.providerId !== providerId || value.providerOrigin !== origin) return false;
  if (
    plainText(value.receiptId, 160) === null
    || plainText(value.proposalId, 160) === null
    || !validDate(value.committedAt)
    || !positiveInteger(value.resultingStateVersion)
    || !positiveInteger(value.amount)
    || !finiteNonNegative(value.totalCost)
  ) return false;

  const proposalId = value.proposalId as string;
  const proposal = knownProposals.get(proposalId);
  if (!proposal || proposal.providerId !== providerId) return false;
  if (proposal.quantity !== value.amount || !moneyEquals(proposal.totalCost, value.totalCost)) return false;
  if (value.resultingStateVersion <= proposal.stateVersion) return false;
  return ![...receipts.values()].some((receipt) => receipt.proposalId === proposalId);
}

function mountShell(): void {
  app.innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand"><span class="brand-mark">R</span><div><strong>RELAY</strong><small>Human-governed operations for the agentic web</small></div></div>
        <div class="top-status">
          <span id="webmcp-pill" class="pill">○ WebMCP</span>
          <span id="provider-pill" class="pill">0/3 PROVIDERS</span>
          <span id="session-pill" class="pill">SESSION BOOTING</span>
        </div>
      </header>

      <section class="hero-grid">
        <article class="incident-card panel">
          <div class="panel-kicker">ACTIVE INCIDENT · ${escapeHtml(incident.id)}</div>
          <div class="incident-title-row"><h1>${escapeHtml(incident.title)}</h1><span class="deadline">DEADLINE ${escapeHtml(incident.deadline)}</span></div>
          <p class="lede">Coordinate independent web providers without surrendering human authority. Agents discover and compose. Humans consent. Providers verify.</p>
          <div class="metrics">
            <div><strong>${incident.residents}</strong><span>residents</span></div>
            <div><strong>${incident.wheelchairUsers}</strong><span>accessible seats</span></div>
            <div><strong>${money(incident.maximumBudget)}</strong><span>hard budget</span></div>
            <div><strong>20</strong><span>North beds reserved</span></div>
          </div>
          <div class="constraints">${incident.hardConstraints.map((constraint) => `<div><span>◆</span>${escapeHtml(constraint)}</div>`).join("")}</div>
        </article>

        <article class="map-card panel">
          <div class="panel-head"><span>LIVE OPERATIONS MAP</span><span id="map-state" class="map-state">DRAFT</span></div>
          <div id="map-content"></div>
        </article>
      </section>

      <section class="main-grid">
        <article class="plan-panel panel">
          <div class="panel-head"><span>PACT TRANSACTION</span><span id="plan-status" class="plan-status status-draft">DRAFT</span></div>
          <div id="plan-content"></div>
        </article>
        <article class="activity-panel panel">
          <div class="panel-head"><span>PROVENANCE STREAM</span><span id="event-count">0 EVENTS</span></div>
          <div id="activity-list" class="activity-list"></div>
        </article>
      </section>

      <section class="mesh panel">
        <div class="panel-head"><span>FEDERATED PROVIDER MESH</span><span>Persistent independent origins · never remounted during planning</span></div>
        <div class="frame-grid">
          ${providerIds.map(providerFrameMarkup).join("")}
        </div>
      </section>
    </main>
    <div id="modal-root"></div>`;

  for (const id of providerIds) {
    const frame = app.querySelector<HTMLIFrameElement>(`iframe[data-provider="${id}"]`);
    if (!frame) throw new Error(`Missing ${id} provider iframe`);
    providerFrames.set(id, frame);
    frame.addEventListener("load", () => postSessionInit(id));
  }

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("#approve-plan")) void approvePending();
    else if (target.closest("#reject-plan")) rejectPending();
    else if (target.closest("#reset-plan")) resetPlan();
    else if (target.closest("#apply-amendment")) applyBudgetAmendment();
  });
}

function providerFrameMarkup(id: ProviderId): string {
  return `<div class="frame-card">
    <div class="frame-title"><span>${labelForProvider(id)}</span><small id="frame-state-${id}">connecting…</small></div>
    <iframe data-provider="${id}" src="${escapeHtml(origins[id])}" allow="tools" title="${labelForProvider(id)} WebMCP provider"></iframe>
  </div>`;
}

function postSessionInit(providerId?: ProviderId): void {
  if (!signer) return;
  const ids = providerId ? [providerId] : providerIds;
  for (const id of ids) {
    providerFrames.get(id)?.contentWindow?.postMessage(
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

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const sourceProvider = providerForOrigin(event.origin);
  if (!sourceProvider) return;
  const expectedFrame = providerFrames.get(sourceProvider);
  if (!expectedFrame || event.source !== expectedFrame.contentWindow) {
    securityReject(sourceProvider, "Rejected message from an unexpected browsing context.");
    return;
  }
  if (!isRecord(event.data) || typeof event.data.type !== "string") {
    securityReject(sourceProvider, "Rejected malformed provider message.");
    return;
  }

  const data = event.data as unknown as ProviderToRelayMessage;
  // Origin-locked provider RPC messages are validated and consumed by the
  // dedicated compatibility transport. They still pass this handler's exact
  // origin/frame boundary before being ignored here.
  if (data.type === "relay_provider_rpc_capabilities" || data.type === "relay_provider_rpc_response") {
    return;
  }
  if (data.type === "relay_provider_ready") {
    if (data.providerId !== sourceProvider) {
      securityReject(sourceProvider, "Provider ready identity did not match its origin.");
      return;
    }
    postSessionInit(sourceProvider);
    logEvent("mesh", `${labelForProvider(sourceProvider)} joined the signed Relay session.`);
  } else if (data.type === "relay_provider_state") {
    if (!validateSnapshot(data.snapshot, sourceProvider, event.origin)) {
      securityReject(sourceProvider, "Rejected invalid or origin-spoofed state snapshot.");
      return;
    }
    const previous = providerStates.get(sourceProvider);
    if (previous && data.snapshot.stateVersion < previous.stateVersion) {
      securityReject(sourceProvider, `Rejected state rollback v${previous.stateVersion} → v${data.snapshot.stateVersion}.`);
      return;
    }
    providerStates.set(sourceProvider, structuredClone(data.snapshot));
    if (previous && previous.stateVersion !== data.snapshot.stateVersion) {
      logEvent("state", `${data.snapshot.providerName} advanced v${previous.stateVersion} → v${data.snapshot.stateVersion}.`);
      if (currentPlan && staleReasons(currentPlan).length) markPlanStale("A provider changed after plan validation.");
    }
  } else if (data.type === "relay_provider_proposal") {
    if (!validateProposal(data.proposal, sourceProvider, event.origin)) {
      securityReject(sourceProvider, "Rejected malformed or origin-spoofed proposal.");
      return;
    }
    const state = providerStates.get(sourceProvider);
    if (!state || state.stateVersion !== data.proposal.stateVersion) {
      securityReject(sourceProvider, "Rejected proposal that does not match the live provider version.");
      return;
    }
    knownProposals.set(data.proposal.proposalId, structuredClone(data.proposal));
    logEvent("proposal", `${labelForProvider(sourceProvider)} proposed ${data.proposal.quantity} ${data.proposal.unit}: ${data.proposal.resourceLabel}.`);
  } else if (data.type === "relay_provider_receipt") {
    if (!validateReceipt(data.receipt, sourceProvider, event.origin)) {
      securityReject(sourceProvider, "Rejected malformed, duplicate or unscoped commit receipt.");
      return;
    }
    receipts.set(data.receipt.receiptId, structuredClone(data.receipt));
    logEvent("commit", `${labelForProvider(sourceProvider)} committed proposal ${shortId(data.receipt.proposalId)}.`);
    maybeMarkCommitted();
  } else {
    securityReject(sourceProvider, `Rejected unknown message type ${(event.data as Record<string, unknown>).type}.`);
    return;
  }

  renderDynamic();
});

function committedProposalIds(): Set<string> {
  return new Set([...receipts.values()].map((receipt) => receipt.proposalId));
}

function staleReasons(plan: PlanDraft): string[] {
  const reasons: string[] = [];
  const committed = committedProposalIds();
  for (const proposal of plan.proposals) {
    if (committed.has(proposal.proposalId)) continue;
    const state = providerStates.get(proposal.providerId);
    if (!state) reasons.push(`${labelForProvider(proposal.providerId)} is offline.`);
    else if (state.origin !== proposal.providerOrigin) reasons.push(`${labelForProvider(proposal.providerId)} origin changed.`);
    else if (state.stateVersion !== proposal.stateVersion) reasons.push(`${state.providerName} is v${state.stateVersion}; proposal ${shortId(proposal.proposalId)} was v${proposal.stateVersion}.`);
    if (Date.parse(proposal.expiresAt) <= Date.now()) reasons.push(`Proposal ${shortId(proposal.proposalId)} expired.`);
  }
  return reasons;
}

function clearPendingApproval(result: string): void {
  if (!pendingApproval) return;
  if (pendingApproval.signal && pendingApproval.abortListener) {
    pendingApproval.signal.removeEventListener("abort", pendingApproval.abortListener);
  }
  pendingApproval.resolve(result);
  pendingApproval = null;
}

function markPlanStale(reason: string): void {
  if (!currentPlan || currentPlan.status === "COMMITTED") return;
  currentPlan.status = "STALE";
  planStatus = "STALE";
  approvalTool.disable();
  clearPendingApproval(toolOutput({ ok: false, code: "PLAN_STALE_DURING_APPROVAL", message: reason }));
  logEvent("stale", reason);
}

function maybeMarkCommitted(): void {
  if (!currentPlan) return;
  const committed = committedProposalIds();
  if (currentPlan.proposals.every((proposal) => committed.has(proposal.proposalId))) {
    currentPlan.status = "COMMITTED";
    planStatus = "COMMITTED";
    approvalTool.disable();
    logEvent("complete", "All human-approved operations committed. The plan is complete.");
  }
}

function validateStageInput(value: unknown): {
  summary: string;
  rationale: string;
  completionDeadline: string;
  proposalIds: string[];
  maxBudget: number;
} | null {
  if (!isRecord(value)) return null;
  const summary = plainText(value.summary, 180);
  const rationale = plainText(value.rationale, 500);
  const completionDeadline = plainText(value.completionDeadline, 5);
  if (
    !summary
    || !rationale
    || !completionDeadline
    || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(completionDeadline)
    || !Array.isArray(value.proposalIds)
    || value.proposalIds.length === 0
  ) return null;
  const proposalIds = value.proposalIds.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 160);
  if (proposalIds.length !== value.proposalIds.length || new Set(proposalIds).size !== proposalIds.length) return null;
  const requestedBudget = value.maxBudget === undefined ? incident.maximumBudget : value.maxBudget;
  if (typeof requestedBudget !== "number" || !Number.isFinite(requestedBudget) || requestedBudget <= 0) return null;
  return { summary, rationale, completionDeadline, proposalIds, maxBudget: Math.min(requestedBudget, incident.maximumBudget) };
}

async function stagePlan(input: unknown): Promise<string> {
  if (stageLockedStatus(currentPlan?.status)) {
    return toolOutput({
      ok: false,
      code: "PLAN_REPLACEMENT_LOCKED",
      status: currentPlan?.status,
      message: "The current plan cannot be replaced after consent begins.",
    });
  }

  const validated = validateStageInput(input);
  if (!validated) return toolOutput({ ok: false, code: "INVALID_INPUT", message: "Provide a summary, rationale, HH:MM completion deadline, unique proposal IDs and a valid budget." });

  const proposals = validated.proposalIds.map((id) => knownProposals.get(id)).filter(Boolean) as ProviderProposal[];
  if (proposals.length !== validated.proposalIds.length) {
    return toolOutput({ ok: false, code: "UNKNOWN_PROPOSAL", message: "Every proposal ID must come from a live provider proposal tool in this Relay session." });
  }
  if (proposals.some((proposal) => committedProposalIds().has(proposal.proposalId))) {
    return toolOutput({ ok: false, code: "ALREADY_COMMITTED" });
  }

  const now = new Date().toISOString();
  const totalCost = Number(proposals.reduce((sum, proposal) => sum + proposal.totalCost, 0).toFixed(2));
  const candidate: PlanDraft = {
    planId: `plan-${crypto.randomUUID()}`,
    incidentId: incident.id,
    summary: validated.summary,
    rationale: validated.rationale,
    completionDeadline: validated.completionDeadline,
    proposals: structuredClone(proposals),
    totalCost,
    maxBudget: validated.maxBudget,
    revision: (currentPlan?.revision ?? 0) + 1,
    status: "VALIDATED",
    createdAt: now,
    updatedAt: now,
  };

  const stale = staleReasons(candidate);
  if (stale.length) {
    candidate.status = "STALE";
    currentPlan = candidate;
    planStatus = "STALE";
    approvalTool.disable();
    logEvent("stale", `Agent staged stale work: ${stale.join(" ")}`);
    renderDynamic();
    return toolOutput({ ok: false, code: "PLAN_STALE", planId: candidate.planId, reasons: stale });
  }
  if (candidate.totalCost > candidate.maxBudget) {
    candidate.status = "DRAFT";
    currentPlan = candidate;
    planStatus = "DRAFT";
    approvalTool.disable();
    renderDynamic();
    return toolOutput({ ok: false, code: "BUDGET_EXCEEDED", planId: candidate.planId, totalCost: candidate.totalCost, maxBudget: candidate.maxBudget });
  }

  const policy = validateEvacuationPlan(
    candidate.proposals,
    [...providerStates.values()],
    candidate.maxBudget,
    candidate.completionDeadline,
    incident.deadline,
  );
  if (!policy.ok) {
    candidate.status = "DRAFT";
    currentPlan = candidate;
    planStatus = "DRAFT";
    approvalTool.disable();
    const failedChecks = policy.checks.filter((check) => !check.pass);
    logEvent("policy", `Plan rejected by ${failedChecks.length} deterministic constraint check${failedChecks.length === 1 ? "" : "s"}.`);
    renderDynamic();
    return toolOutput({ ok: false, code: "POLICY_VIOLATION", planId: candidate.planId, failedChecks, checks: policy.checks });
  }

  currentPlan = candidate;
  planStatus = "VALIDATED";
  await approvalTool.enable();
  logEvent("plan", `Plan ${shortId(candidate.planId)} validated across ${proposals.length} exact operations. Human approval is now available.`);
  renderDynamic();
  return toolOutput({
    ok: true,
    planId: candidate.planId,
    status: candidate.status,
    totalCost: candidate.totalCost,
    maxBudget: candidate.maxBudget,
    completionDeadline: candidate.completionDeadline,
    policyChecks: policy.checks,
    proposalCount: candidate.proposals.length,
    next: "Call relay_request_approval. The call remains suspended until the human approves or rejects this exact plan.",
  });
}

const approvalTool = new DynamicTool({
  name: "relay_request_approval",
  title: "Request human approval",
  description: "Pause agent execution and ask the human to approve the exact staged plan. Returns a signed, short-lived PACT token only after explicit approval.",
  inputSchema: {
    type: "object",
    properties: {
      planId: { type: "string", description: "Exact staged Relay plan ID." },
      note: { type: "string", maxLength: 240, description: "Short explanation of why the plan is ready for commitment." },
    },
    required: ["planId"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, untrustedContentHint: false },
  execute: async (input: { planId: string; note?: string }, options?: { signal?: AbortSignal }) => {
    if (!currentPlan || typeof input?.planId !== "string" || currentPlan.planId !== input.planId) {
      return toolOutput({ ok: false, code: "PLAN_NOT_FOUND", message: "Stage or restage a valid plan first." });
    }
    if (currentPlan.status !== "VALIDATED") {
      return toolOutput({ ok: false, code: "PLAN_NOT_APPROVABLE", status: currentPlan.status });
    }
    const stale = staleReasons(currentPlan);
    if (stale.length) {
      markPlanStale(stale.join(" "));
      renderDynamic();
      return toolOutput({ ok: false, code: "PLAN_STALE", reasons: stale });
    }
    const policy = validateEvacuationPlan(
      currentPlan.proposals,
      [...providerStates.values()],
      currentPlan.maxBudget,
      currentPlan.completionDeadline,
      incident.deadline,
    );
    if (!policy.ok || currentPlan.totalCost > currentPlan.maxBudget) {
      return toolOutput({ ok: false, code: "PLAN_POLICY_FAILED", checks: policy.checks });
    }
    if (pendingApproval) return toolOutput({ ok: false, code: "APPROVAL_ALREADY_PENDING" });
    if (!signer) return toolOutput({ ok: false, code: "SIGNER_NOT_READY" });

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
    renderDynamic();

    return new Promise<string>((resolve) => {
      const abortListener = () => {
        if (!pendingApproval || pendingApproval.payload.planId !== payload.planId) return;
        pendingApproval = null;
        if (currentPlan && currentPlan.planId === payload.planId) {
          currentPlan.status = "VALIDATED";
          planStatus = "VALIDATED";
        }
        logEvent("approval", "Approval request cancelled by the agent or browser.");
        renderDynamic();
        resolve(toolOutput({ ok: false, code: "APPROVAL_CANCELLED" }));
      };
      pendingApproval = { resolve, payload, signal: options?.signal, abortListener };
      options?.signal?.addEventListener("abort", abortListener, { once: true });
      renderDynamic();
    });
  },
});

async function approvePending(): Promise<void> {
  if (!pendingApproval || !currentPlan || !signer) return;
  const stale = staleReasons(currentPlan);
  const currentHash = await hashPlan(currentPlan);
  if (stale.length || currentHash !== pendingApproval.payload.planHash) {
    markPlanStale(stale.join(" ") || "The plan changed after the approval request was created.");
    renderDynamic();
    return;
  }
  const policy = validateEvacuationPlan(
    currentPlan.proposals,
    [...providerStates.values()],
    currentPlan.maxBudget,
    currentPlan.completionDeadline,
    incident.deadline,
  );
  if (!policy.ok || currentPlan.totalCost > currentPlan.maxBudget) {
    clearPendingApproval(toolOutput({ ok: false, code: "PLAN_POLICY_FAILED", checks: policy.checks }));
    currentPlan.status = "DRAFT";
    planStatus = "DRAFT";
    renderDynamic();
    return;
  }

  const token: ApprovalToken = await signer.sign(pendingApproval.payload);
  currentPlan.status = "APPROVED";
  planStatus = "APPROVED";
  logEvent("approval", `Human approved ${currentPlan.proposals.length} exact operations. Signed PACT token expires in two minutes.`);
  clearPendingApproval(toolOutput({
    ok: true,
    status: "APPROVED",
    approvalToken: token,
    next: "Commit every approved proposal for each provider in one exact same-origin batch.",
  }));
  approvalTool.disable();
  renderDynamic();
}

function rejectPending(): void {
  if (!pendingApproval || !currentPlan) return;
  currentPlan.status = "REJECTED";
  planStatus = "REJECTED";
  logEvent("approval", "Human rejected the proposed transaction. No provider capacity changed.");
  clearPendingApproval(toolOutput({ ok: false, status: "REJECTED", code: "HUMAN_REJECTED" }));
  approvalTool.disable();
  renderDynamic();
}

function applyBudgetAmendment(): void {
  if (!currentPlan || pendingApproval || currentPlan.status === "APPROVED" || currentPlan.status === "COMMITTED") return;
  const input = app.querySelector<HTMLInputElement>("#authority-cap");
  if (!input) return;
  const requested = Number(input.value);
  if (!Number.isFinite(requested) || requested < currentPlan.totalCost || requested > incident.maximumBudget) {
    logEvent("amend", `Amendment rejected. Authority must stay between ${money(currentPlan.totalCost)} and ${money(incident.maximumBudget)}.`);
    renderDynamic();
    return;
  }
  currentPlan.maxBudget = Number(requested.toFixed(2));
  currentPlan.revision += 1;
  currentPlan.updatedAt = new Date().toISOString();
  currentPlan.status = "VALIDATED";
  planStatus = "VALIDATED";
  void approvalTool.enable();
  logEvent("amend", `Human tightened transaction authority to ${money(currentPlan.maxBudget)}. Plan revision is now ${currentPlan.revision}.`);
  renderDynamic();
}

function resetPlan(): void {
  clearPendingApproval(toolOutput({ ok: false, code: "PLAN_RESET" }));
  currentPlan = null;
  planStatus = "DRAFT";
  approvalTool.disable();
  logEvent("plan", "Staged plan cleared. Existing provider proposals remain non-binding until expiry.");
  renderDynamic();
}

function renderDynamic(): void {
  const webMcpPill = app.querySelector<HTMLSpanElement>("#webmcp-pill");
  const providerPill = app.querySelector<HTMLSpanElement>("#provider-pill");
  const sessionPill = app.querySelector<HTMLSpanElement>("#session-pill");
  const mapState = app.querySelector<HTMLSpanElement>("#map-state");
  const planStatusNode = app.querySelector<HTMLSpanElement>("#plan-status");
  const mapContent = app.querySelector<HTMLDivElement>("#map-content");
  const planContent = app.querySelector<HTMLDivElement>("#plan-content");
  const activity = app.querySelector<HTMLDivElement>("#activity-list");
  const eventCount = app.querySelector<HTMLSpanElement>("#event-count");
  const modalRoot = app.querySelector<HTMLDivElement>("#modal-root");
  if (!webMcpPill || !providerPill || !sessionPill || !mapState || !planStatusNode || !mapContent || !planContent || !activity || !eventCount || !modalRoot) return;

  webMcpPill.className = `pill ${webMcpAvailable() ? "pill-live" : "pill-warn"}`;
  webMcpPill.textContent = webMcpAvailable() ? "● WebMCP LIVE" : "○ WebMCP NOT DETECTED";
  providerPill.textContent = `${providerStates.size}/3 PROVIDERS`;
  sessionPill.textContent = signer ? `SESSION ${shortId(signer.sessionId)}` : "SESSION BOOTING";
  mapState.textContent = planStatus.replaceAll("_", " ");
  planStatusNode.className = `plan-status status-${planStatus.toLowerCase()}`;
  planStatusNode.textContent = planStatus.replaceAll("_", " ");
  mapContent.innerHTML = renderMap();
  planContent.innerHTML = currentPlan ? renderPlan(currentPlan, staleReasons(currentPlan)) : renderEmptyPlan();
  eventCount.textContent = `${eventLog.length} EVENT${eventLog.length === 1 ? "" : "S"}`;
  activity.innerHTML = eventLog.length ? eventLog.map(renderEvent).join("") : `<div class="empty-mini">Waiting for provider/tool activity…</div>`;
  modalRoot.innerHTML = pendingApproval ? renderApprovalModal() : "";

  for (const id of providerIds) {
    const label = app.querySelector<HTMLElement>(`#frame-state-${id}`);
    const state = providerStates.get(id);
    if (label) label.textContent = state ? `v${state.stateVersion} · connected` : "connecting…";
  }
}

function renderMap(): string {
  const southState = providerStates.get("shelter")?.resources.find((resource) => resource.id === "south");
  const southAlert = Boolean(southState && southState.available <= 12);
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
    ${mapNode(540, 91, "NORTH", providerStates.get("shelter")?.resources.find((resource) => resource.id === "north")?.available ?? 46, false)}
    ${mapNode(454, 220, "EAST", providerStates.get("shelter")?.resources.find((resource) => resource.id === "east")?.available ?? 18, false)}
    ${mapNode(555, 250, "SOUTH", southState?.available ?? 24, southAlert)}
    <g transform="translate(42 35)"><rect width="182" height="62" rx="10" fill="#0b181d" stroke="#1c3941"/><text x="14" y="22" fill="#729198" font-size="9">CURRENT PLAN</text><text x="14" y="43" fill="#e9f6f7" font-size="13">${currentPlan ? `${currentPlan.proposals.length} scoped operations` : "Awaiting agent proposal"}</text></g>
  </svg>`;
}

function mapNode(x: number, y: number, label: string, available: number, alert: boolean): string {
  return `<g transform="translate(${x} ${y})"><circle r="23" fill="${alert ? "#341b1c" : "#0d262b"}" stroke="${alert ? "#ff737f" : "#46d5ba"}"/><text y="4" text-anchor="middle" fill="#f4fbfc" font-size="12" font-weight="700">${available}</text><text y="39" text-anchor="middle" fill="${alert ? "#ff9ba4" : "#83b8b9"}" font-size="9">${label}</text></g>`;
}

function renderEmptyPlan(): string {
  return `<div class="empty-plan">
    <div class="protocol-rail"><span class="active">1</span><i></i><span>2</span><i></i><span>3</span><i></i><span>4</span></div>
    <h2>Propose → Amend → Consent → Transact</h2>
    <p>The agent must discover provider tools, create non-binding proposals, then stage their exact IDs as one governed transaction.</p>
    <div class="tool-callout"><span>START PROMPT</span><code>Evacuate all 42 residents before 18:00. Preserve 20 North beds, cover 9 accessible passengers, stay under €5,000. Prepare everything, but do not commit until I approve.</code></div>
  </div>`;
}

function renderPlan(plan: PlanDraft, stale: string[]): string {
  const amendmentDisabled = Boolean(pendingApproval) || plan.status === "APPROVED" || plan.status === "COMMITTED";
  return `<div class="plan-body">
    <div class="plan-summary"><div><span>PLAN ${escapeHtml(shortId(plan.planId))} · COMPLETE BY ${escapeHtml(plan.completionDeadline)}</span><h2>${escapeHtml(plan.summary)}</h2><p>${escapeHtml(plan.rationale)}</p></div><div class="plan-cost"><strong>${money(plan.totalCost)}</strong><span>of ${money(plan.maxBudget)}</span></div></div>
    ${stale.length ? `<div class="stale-banner"><strong>STATE INVALIDATED</strong>${escapeHtml(stale.join(" "))}</div>` : ""}
    <div class="proposal-table">
      <div class="proposal-row proposal-head"><span>Origin</span><span>Operation</span><span>Version</span><span>Cost</span></div>
      ${plan.proposals.map((proposal) => `<div class="proposal-row"><span><b>${labelForProvider(proposal.providerId)}</b><small>${escapeHtml(proposal.providerOrigin)}</small></span><span>${proposal.quantity} ${escapeHtml(proposal.unit)} · ${escapeHtml(proposal.resourceLabel)}<small>${escapeHtml(proposal.purpose)}</small></span><span>v${proposal.stateVersion}</span><span>${money(proposal.totalCost)}</span></div>`).join("")}
    </div>
    ${renderPolicyChecks(plan)}
    <div class="amendment-row"><div><span>HUMAN AMENDMENT</span><strong>Tighten maximum authority before consent</strong></div><div class="amendment-control"><span>€</span><input id="authority-cap" type="number" step="0.01" min="${Math.ceil(plan.totalCost)}" max="${incident.maximumBudget}" value="${plan.maxBudget}" ${amendmentDisabled ? "disabled" : ""}><button id="apply-amendment" ${amendmentDisabled ? "disabled" : ""}>Apply</button></div></div>
    <div class="protocol-state">
      ${protocolStep("PROPOSE", true, `${plan.proposals.length} exact operations`)}
      ${protocolStep("AMEND", true, `revision ${plan.revision}`)}
      ${protocolStep("CONSENT", plan.status === "AWAITING_APPROVAL" || plan.status === "APPROVED" || plan.status === "COMMITTED", plan.status === "APPROVED" || plan.status === "COMMITTED" ? "signed" : "human required")}
      ${protocolStep("TRANSACT", plan.status === "COMMITTED", `${receipts.size}/${plan.proposals.length} receipts`)}
    </div>
    <button id="reset-plan" class="ghost-button">Clear staged plan</button>
  </div>`;
}

function renderPolicyChecks(plan: PlanDraft): string {
  const policy = validateEvacuationPlan(
    plan.proposals,
    [...providerStates.values()],
    plan.maxBudget,
    plan.completionDeadline,
    incident.deadline,
  );
  return `<div class="policy-grid">${policy.checks.map((check) => `<div class="policy-check ${check.pass ? "pass" : "fail"}"><span>${check.pass ? "✓" : "×"}</span><div><b>${escapeHtml(check.label)}</b><small>${escapeHtml(check.actualLabel ?? String(check.actual))} ${check.relation} ${escapeHtml(check.requiredLabel ?? String(check.required))}</small></div></div>`).join("")}</div>`;
}

function protocolStep(label: string, active: boolean, detail: string): string {
  return `<div class="p-step ${active ? "on" : ""}"><span>${active ? "✓" : "○"}</span><div><b>${label}</b><small>${escapeHtml(detail)}</small></div></div>`;
}

function renderEvent(event: EventRecord): string {
  return `<div class="event event-${escapeHtml(event.kind)}"><time>${escapeHtml(event.time)}</time><span class="event-dot"></span><p>${escapeHtml(event.text)}</p></div>`;
}

function renderApprovalModal(): string {
  if (!pendingApproval || !currentPlan) return "";
  return `<div class="modal-backdrop">
    <section class="approval-sheet" role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <div class="approval-icon">◈</div>
      <div class="eyebrow">HUMAN AUTHORITY REQUIRED</div>
      <h2 id="approval-title">Approve exact transaction?</h2>
      <p>The agent is paused. Approval signs only these operations, provider origins, state versions, completion deadline and costs for two minutes.</p>
      <div class="approval-hash"><span>PLAN HASH</span><code>${escapeHtml(pendingApproval.payload.planHash)}</code></div>
      <div class="approval-lines">${currentPlan.proposals.map((proposal) => `<div><span>${labelForProvider(proposal.providerId)} · ${escapeHtml(proposal.resourceLabel)}</span><b>${proposal.quantity} ${escapeHtml(proposal.unit)} · ${money(proposal.totalCost)}</b><small>${escapeHtml(proposal.providerOrigin)} · ${escapeHtml(shortId(proposal.proposalId))} · state v${proposal.stateVersion}</small></div>`).join("")}</div>
      <div class="approval-total"><span>Completion deadline</span><strong>${escapeHtml(currentPlan.completionDeadline)}</strong></div>
      <div class="approval-total"><span>Maximum authority</span><strong>${money(pendingApproval.payload.maximumCost)}</strong></div>
      <div class="approval-actions"><button id="reject-plan" class="reject-button">Reject</button><button id="approve-plan" class="approve-button">Approve & sign PACT token</button></div>
      <small class="approval-footnote">No capacity changes until the agent presents this signed token back to every exact scoped provider.</small>
    </section>
  </div>`;
}

async function registerRelayTools(): Promise<void> {
  await registerTool({
    name: "relay_get_incident",
    title: "Read active emergency brief",
    description: "Return the active Riverside evacuation objective, hard constraints, provider origins, budget and deadline. Read this before proposing operations.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput({ ...incident, providerOrigins: origins, rule: "Prepare proposals first. Never commit a provider reservation before explicit human approval." }),
  });

  await registerTool({
    name: "relay_get_mesh_state",
    title: "Read provider mesh state",
    description: "Return current provider origins, versions and resources known to Relay. Use this to detect whether prior proposals became stale.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput({
      providers: [...providerStates.values()],
      stagedPlan: currentPlan ? { planId: currentPlan.planId, status: currentPlan.status, totalCost: currentPlan.totalCost, revision: currentPlan.revision } : null,
    }),
  });

  await registerTool({
    name: "relay_stage_plan",
    title: "Stage a federated plan",
    description: "Stage exact non-binding provider proposal IDs as one Relay transaction. Validates live origins, provider versions, deterministic incident constraints and budget, then unlocks human approval.",
    inputSchema: {
      type: "object",
      properties: {
        summary: { type: "string", minLength: 1, maxLength: 180, description: "Concise plan summary." },
        rationale: { type: "string", minLength: 1, maxLength: 500, description: "How the exact operations satisfy every incident constraint." },
        completionDeadline: { type: "string", pattern: "^(?:[01]\\d|2[0-3]):[0-5]\\d$", description: `Planned completion time in 24-hour HH:MM format. Must be no later than the incident deadline ${incident.deadline}.` },
        proposalIds: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true, description: "Exact proposal IDs returned by provider proposal tools." },
        maxBudget: { type: "number", exclusiveMinimum: 0, maximum: incident.maximumBudget, description: "Plan cost ceiling, never above €5,000." },
      },
      required: ["summary", "rationale", "completionDeadline", "proposalIds"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: true },
    execute: stagePlan,
  });

  await registerTool({
    name: "relay_get_plan",
    title: "Read staged Relay plan",
    description: "Return the exact staged operation scopes, policy checks, receipts, current status and stale-state reasons without changing anything.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => toolOutput(currentPlan ? {
      plan: currentPlan,
      staleReasons: staleReasons(currentPlan),
      policy: validateEvacuationPlan(
        currentPlan.proposals,
        [...providerStates.values()],
        currentPlan.maxBudget,
        currentPlan.completionDeadline,
        incident.deadline,
      ),
      receipts: [...receipts.values()],
    } : { plan: null }),
  });
}

async function boot(): Promise<void> {
  signer = await createSessionSigner();
  mountShell();
  logEvent("boot", "Relay created an ephemeral P-256 signing key. The private key never leaves this browser session.");
  await registerRelayTools();
  renderDynamic();
  globalThis.setTimeout(() => postSessionInit(), 350);
}

void boot().catch((error) => {
  console.error(error);
  app.textContent = `Relay failed to boot: ${error instanceof Error ? error.message : "unknown error"}`;
});
