import "./demo-agent.css";
import type { ApprovalToken, ProviderId, ProviderProposal } from "@relay/contracts";
import { executeDiscoveredTool, type RegisteredTool } from "@relay/webmcp-runtime";

const providerOrigins: Record<ProviderId, string> = {
  shelter: new URL(import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174").origin,
  transit: new URL(import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175").origin,
  supply: new URL(import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176").origin,
};

const proof = document.createElement("aside");
proof.className = "proof-console";
proof.innerHTML = `
  <header class="proof-head">
    <div><span>LIVE WEBMCP PROOF</span><strong>Agent execution trace</strong></div>
    <button id="proof-collapse" aria-label="Collapse proof console">−</button>
  </header>
  <div class="proof-body">
    <p class="proof-thesis">This runner may only discover and invoke browser WebMCP tools. It has no direct access to Relay state or provider internals.</p>
    <div id="proof-status" class="proof-status">Checking browser capability…</div>
    <div id="proof-log" class="proof-log"></div>
    <div class="proof-actions">
      <button id="proof-run" class="proof-run">Run governed evacuation</button>
      <button id="proof-reload" class="proof-secondary">Reset page</button>
    </div>
    <small class="proof-foot">During CONSENT, click Inject disruption in Shelter Grid to prove stale plans fail closed.</small>
  </div>`;
document.body.append(proof);

const runButton = proof.querySelector<HTMLButtonElement>("#proof-run")!;
const reloadButton = proof.querySelector<HTMLButtonElement>("#proof-reload")!;
const collapseButton = proof.querySelector<HTMLButtonElement>("#proof-collapse")!;
const statusNode = proof.querySelector<HTMLDivElement>("#proof-status")!;
const logNode = proof.querySelector<HTMLDivElement>("#proof-log")!;

interface ToolResult extends Record<string, unknown> {
  ok?: boolean;
  code?: string;
  message?: string;
}

class ToolFailure extends Error {
  constructor(public readonly toolName: string, public readonly result: ToolResult) {
    super(`${toolName}: ${result.code ?? result.message ?? "tool rejected the operation"}`);
  }
}

function context() {
  const value = document.modelContext;
  if (!value?.getTools || !value.executeTool) throw new Error("WebMCP getTools()/executeTool() is unavailable in this browser.");
  return value;
}

function setStatus(text: string, state: "idle" | "running" | "human" | "success" | "failure" = "idle"): void {
  statusNode.textContent = text;
  statusNode.dataset.state = state;
}

function trace(kind: "discover" | "call" | "result" | "human" | "safe" | "error", text: string): void {
  const row = document.createElement("div");
  row.className = `proof-row proof-${kind}`;
  const dot = document.createElement("span");
  const content = document.createElement("p");
  dot.textContent = kind === "result" || kind === "safe" ? "✓" : kind === "error" ? "×" : kind === "human" ? "◆" : "·";
  content.textContent = text;
  row.append(dot, content);
  logNode.append(row);
  logNode.scrollTop = logNode.scrollHeight;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function discoverTools(): Promise<RegisteredTool[]> {
  const modelContext = context();
  const tools: RegisteredTool[] = [];
  const local = await modelContext.getTools!();
  tools.push(...local);
  const remote = await modelContext.getTools!({ fromOrigins: Object.values(providerOrigins) });
  tools.push(...remote);

  const unique = new Map<string, RegisteredTool>();
  for (const tool of tools) unique.set(`${tool.origin}|${tool.name}`, tool);
  return [...unique.values()];
}

async function waitForTool(name: string, timeoutMs = 12_000): Promise<RegisteredTool> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tool = (await discoverTools()).find((candidate) => candidate.name === name);
    if (tool) return tool;
    await delay(160);
  }
  throw new Error(`Timed out waiting for WebMCP tool ${name}.`);
}

function parseToolResult(toolName: string, raw: string | null): ToolResult {
  if (raw === null) throw new Error(`${toolName} returned no result.`);
  try {
    const first = JSON.parse(raw) as unknown;
    const parsed = typeof first === "string" ? JSON.parse(first) as unknown : first;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("result was not an object");
    return parsed as ToolResult;
  } catch (error) {
    throw new Error(`${toolName} returned invalid JSON: ${error instanceof Error ? error.message : "parse failed"}`);
  }
}

async function invoke(name: string, input: Record<string, unknown>, allowFailure = false): Promise<ToolResult> {
  const tool = await waitForTool(name);
  const origin = tool.origin === window.location.origin ? "Relay" : new URL(tool.origin).hostname;
  trace("call", `${name} @ ${origin}`);
  const raw = await executeDiscoveredTool(tool, input);
  const result = parseToolResult(name, raw);
  if (result.ok === false && !allowFailure) throw new ToolFailure(name, result);
  trace(result.ok === false ? "error" : "result", result.ok === false ? `${name} rejected: ${result.code ?? "UNKNOWN"}` : `${name} returned verified JSON`);
  return result;
}

function proposalFrom(result: ToolResult, toolName: string): ProviderProposal {
  const value = result.proposal;
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof (value as ProviderProposal).proposalId !== "string") {
    throw new Error(`${toolName} did not return a proposal.`);
  }
  return value as ProviderProposal;
}

function approvalTokenFrom(result: ToolResult): ApprovalToken {
  const value = result.approvalToken;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Human approval did not return a PACT token.");
  const token = value as ApprovalToken;
  if (token.algorithm !== "ECDSA_P256_SHA256" || typeof token.signature !== "string" || !token.payload) {
    throw new Error("Human approval returned a malformed PACT token.");
  }
  return token;
}

async function stageWithDeliveryRetry(proposalIds: string[]): Promise<ToolResult> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const result = await invoke("relay_stage_plan", {
      summary: "Riverside evacuation across three independent providers",
      rationale: "42 shelter beds, 42 transport seats including 10 accessible positions, 42 evacuation kits and 9 mobility medical kits. North Shelter remains untouched and total cost stays below the human ceiling.",
      completionDeadline: "18:00",
      proposalIds,
      maxBudget: 3000,
    }, true);
    if (result.ok !== false) return result;
    if (result.code !== "UNKNOWN_PROPOSAL") throw new ToolFailure("relay_stage_plan", result);
    trace("discover", "Waiting for cross-origin proposal events to reach Relay…");
    await delay(180);
  }
  throw new Error("Relay did not receive provider proposals in time.");
}

async function waitForCommitted(timeoutMs = 6_000): Promise<ToolResult> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = await invoke("relay_get_plan", {});
    const plan = result.plan as { status?: string } | undefined;
    if (plan?.status === "COMMITTED") return result;
    await delay(160);
  }
  throw new Error("Provider receipts did not converge to COMMITTED in time.");
}

async function runProof(): Promise<void> {
  runButton.disabled = true;
  logNode.replaceChildren();
  setStatus("Discovering federated capability surface…", "running");

  try {
    const expected = [
      "relay_get_incident",
      "shelter_find_capacity",
      "transit_find_accessible_routes",
      "supply_check_stock",
    ];
    for (const name of expected) await waitForTool(name);
    const surface = await discoverTools();
    trace("discover", `${surface.length} live tools discovered across Relay and three origins.`);

    await invoke("relay_get_incident", {});
    await invoke("shelter_find_capacity", { minimum: 0 });
    await invoke("transit_find_accessible_routes", { minimum: 0 });
    await invoke("supply_check_stock", { minimum: 0 });

    setStatus("Creating non-binding provider proposals…", "running");
    const proposals: ProviderProposal[] = [];
    proposals.push(proposalFrom(await invoke("shelter_propose_reservation", { resourceId: "east", quantity: 18, purpose: "Shelter Riverside residents before 18:00" }), "shelter_propose_reservation"));
    proposals.push(proposalFrom(await invoke("shelter_propose_reservation", { resourceId: "south", quantity: 24, purpose: "Shelter Riverside residents before 18:00" }), "shelter_propose_reservation"));
    proposals.push(proposalFrom(await invoke("transit_propose_reservation", { resourceId: "bus-32", quantity: 32, purpose: "Transport Riverside residents before 18:00" }), "transit_propose_reservation"));
    proposals.push(proposalFrom(await invoke("transit_propose_reservation", { resourceId: "accessible-10", quantity: 10, purpose: "Provide wheelchair-accessible evacuation transport" }), "transit_propose_reservation"));
    proposals.push(proposalFrom(await invoke("supply_propose_reservation", { resourceId: "evac-kit", quantity: 42, purpose: "Provide one evacuation kit per resident" }), "supply_propose_reservation"));
    proposals.push(proposalFrom(await invoke("supply_propose_reservation", { resourceId: "medical-kit", quantity: 9, purpose: "Provide mobility medical support" }), "supply_propose_reservation"));

    const staged = await stageWithDeliveryRetry(proposals.map((proposal) => proposal.proposalId));
    const planId = staged.planId;
    if (typeof planId !== "string") throw new Error("Relay did not return a plan ID.");
    trace("safe", `PACT plan staged at €${String(staged.totalCost)} under a €${String(staged.maxBudget)} authority cap.`);

    setStatus("Human consent required. The tool call is suspended.", "human");
    trace("human", "Agent paused inside relay_request_approval. Approve the exact transaction in Relay, reject it or inject a provider disruption.");
    const approval = await invoke("relay_request_approval", { planId, note: "All deterministic constraints pass. Requesting exact scoped authority." }, true);

    if (approval.ok === false) {
      if (approval.code === "PLAN_STALE_DURING_APPROVAL" || approval.code === "PLAN_STALE") {
        trace("safe", "PASS: provider state changed and Relay invalidated the plan before transaction.");
        setStatus("Fail-closed stale-state proof passed. Reload to run the commit path.", "success");
        return;
      }
      if (approval.code === "HUMAN_REJECTED") {
        trace("safe", "PASS: human rejection returned control without consuming provider capacity.");
        setStatus("Human rejection respected. No transaction executed.", "success");
        return;
      }
      throw new ToolFailure("relay_request_approval", approval);
    }

    const token = approvalTokenFrom(approval);
    trace("safe", `Human signed ${token.payload.scopes.length} exact scopes. No generic signing capability was exposed.`);
    setStatus("Transacting exact same-origin batches…", "running");

    const byProvider = new Map<ProviderId, string[]>();
    for (const proposal of proposals) {
      const ids = byProvider.get(proposal.providerId) ?? [];
      ids.push(proposal.proposalId);
      byProvider.set(proposal.providerId, ids);
    }

    await invoke("shelter_commit_reservation", { proposalIds: byProvider.get("shelter"), approvalToken: token });
    await delay(120);
    await invoke("transit_commit_reservation", { proposalIds: byProvider.get("transit"), approvalToken: token });
    await delay(120);
    await invoke("supply_commit_reservation", { proposalIds: byProvider.get("supply"), approvalToken: token });

    const finalState = await waitForCommitted();
    const finalPlan = finalState.plan as { status?: string; totalCost?: number };
    trace("safe", `PASS: six approved operations committed with origin-bound receipts. Final state: ${finalPlan.status}.`);
    setStatus("Governed WebMCP transaction complete.", "success");
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Unknown proof failure";
    trace("error", message);
    setStatus(message, "failure");
    runButton.disabled = false;
  }
}

runButton.addEventListener("click", () => void runProof());
reloadButton.addEventListener("click", () => window.location.reload());
collapseButton.addEventListener("click", () => {
  proof.classList.toggle("is-collapsed");
  collapseButton.textContent = proof.classList.contains("is-collapsed") ? "+" : "−";
});

if (document.modelContext?.getTools && document.modelContext.executeTool) {
  setStatus("Ready. Every step will use getTools() and executeTool().");
} else {
  setStatus("WebMCP unavailable. Open in the supported browser surface.", "failure");
  runButton.disabled = true;
}
