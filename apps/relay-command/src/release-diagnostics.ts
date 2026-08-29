import { sha256 } from "@relay/pact";
import {
  executeLocalRegisteredTool,
  getLocalRegisteredToolNames,
  getModelContext,
  registerTool,
  toolOutput,
  type RegisteredTool,
} from "@relay/webmcp-runtime";
import { readApprovalEvidence } from "./release-state";

interface ProviderDiagnosticSpec {
  id: "shelter" | "transit" | "supply";
  origin: string;
  readTool: string;
  expectedTools: string[];
}

interface ToolCollection {
  tools: RegisteredTool[];
  errors: {
    local?: string;
    remote?: string;
  };
}

interface ToolchangeEvidence {
  sequence: number;
  capturedAt: string;
  reason: "initial" | "toolchange" | "diagnostic";
  runtimeRegisteredTools: string[];
  toolsByOrigin: Record<string, string[]>;
  discoveryErrors: ToolCollection["errors"];
}

interface ExecutionProbe {
  ok: boolean;
  result?: unknown;
  error?: string;
}

const commandOrigin = window.location.origin;
const providerSpecs: ProviderDiagnosticSpec[] = [
  {
    id: "shelter",
    origin: new URL(import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174", window.location.href).origin,
    readTool: "shelter_find_capacity",
    expectedTools: ["shelter_find_capacity", "shelter_propose_reservation", "shelter_commit_reservation"],
  },
  {
    id: "transit",
    origin: new URL(import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175", window.location.href).origin,
    readTool: "transit_find_accessible_routes",
    expectedTools: ["transit_find_accessible_routes", "transit_propose_reservation", "transit_commit_reservation"],
  },
  {
    id: "supply",
    origin: new URL(import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176", window.location.href).origin,
    readTool: "supply_check_stock",
    expectedTools: ["supply_check_stock", "supply_propose_reservation", "supply_commit_reservation"],
  },
];

const permanentRelayTools = [
  "relay_get_incident",
  "relay_get_mesh_state",
  "relay_stage_plan",
  "relay_get_plan",
  "relay_diagnose_webmcp",
  "relay_get_audit_bundle",
];

const expectedInitialBridgeTools = [
  "relay_bridge_status",
  "relay_bridge_shelter_find_capacity",
  "relay_bridge_shelter_propose_reservation",
  "relay_bridge_transit_find_accessible_routes",
  "relay_bridge_transit_propose_reservation",
  "relay_bridge_supply_check_stock",
  "relay_bridge_supply_propose_reservation",
];

const evidence: ToolchangeEvidence[] = [];
let evidenceSequence = 0;
let captureTimer: number | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown WebMCP failure";
}

function normalizeToolOrigin(tool: RegisteredTool): string {
  return typeof tool.origin === "string" && tool.origin ? tool.origin : commandOrigin;
}

function deduplicateTools(tools: RegisteredTool[]): RegisteredTool[] {
  const unique = new Map<string, RegisteredTool>();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== "string" || !tool.name) continue;
    unique.set(`${normalizeToolOrigin(tool)}|${tool.name}`, tool);
  }
  return [...unique.values()];
}

async function collectTools(): Promise<ToolCollection> {
  const context = getModelContext();
  if (!context?.getTools) {
    return {
      tools: [],
      errors: { local: "document.modelContext.getTools is unavailable" },
    };
  }

  let local: RegisteredTool[] = [];
  let remote: RegisteredTool[] = [];
  const errors: ToolCollection["errors"] = {};

  try {
    local = await context.getTools();
  } catch (error) {
    errors.local = errorMessage(error);
  }

  try {
    remote = await context.getTools({ fromOrigins: providerSpecs.map((provider) => provider.origin) });
  } catch (error) {
    errors.remote = errorMessage(error);
  }

  return {
    tools: deduplicateTools([...local, ...remote]),
    errors,
  };
}

function groupTools(tools: RegisteredTool[]): Record<string, string[]> {
  const grouped: Record<string, string[]> = {};
  for (const tool of tools) {
    const origin = normalizeToolOrigin(tool);
    (grouped[origin] ??= []).push(tool.name);
  }
  for (const names of Object.values(grouped)) names.sort();
  return grouped;
}

async function captureSurface(reason: ToolchangeEvidence["reason"]): Promise<void> {
  try {
    const collection = await collectTools();
    evidence.push({
      sequence: ++evidenceSequence,
      capturedAt: new Date().toISOString(),
      reason,
      runtimeRegisteredTools: getLocalRegisteredToolNames(),
      toolsByOrigin: groupTools(collection.tools),
      discoveryErrors: collection.errors,
    });
    if (evidence.length > 24) evidence.splice(0, evidence.length - 24);
  } catch (error) {
    console.warn("[Relay diagnostics] Unable to capture tool surface", error);
  }
}

function scheduleCapture(reason: ToolchangeEvidence["reason"]): void {
  if (captureTimer !== null) globalThis.clearTimeout(captureTimer);
  captureTimer = globalThis.setTimeout(() => {
    captureTimer = null;
    void captureSurface(reason);
  }, 25);
}

function parseToolOutput(raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === null || raw === undefined) return { ok: false, error: "Tool returned no result." };
  if (typeof raw !== "string") return { ok: true, value: raw };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (error) {
    return {
      ok: false,
      error: `Tool returned invalid JSON: ${errorMessage(error)}`,
    };
  }
}

function semanticSuccess(value: unknown): boolean {
  return isRecord(value) && value.ok === true;
}

async function executeExactTool(
  tools: RegisteredTool[],
  origin: string,
  name: string,
  input: Record<string, unknown>,
): Promise<ExecutionProbe> {
  const context = getModelContext();
  if (!context?.executeTool) return { ok: false, error: "document.modelContext.executeTool is unavailable" };
  const tool = tools.find((candidate) => normalizeToolOrigin(candidate) === origin && candidate.name === name);
  if (!tool) return { ok: false, error: `Exact tool ${origin}::${name} is not discoverable` };

  try {
    const parsed = parseToolOutput(await context.executeTool(tool, JSON.stringify(input)));
    if (!parsed.ok) return parsed;
    if (!semanticSuccess(parsed.value)) {
      return {
        ok: false,
        result: parsed.value,
        error: "Provider tool executed but returned a semantic failure result.",
      };
    }
    return { ok: true, result: parsed.value };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

async function readLocalTool(name: string): Promise<unknown> {
  const parsed = parseToolOutput(await executeLocalRegisteredTool(name, {}));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

function auditConsistency(planOutput: unknown, approvals: ReturnType<typeof readApprovalEvidence>) {
  const planEnvelope = isRecord(planOutput) ? planOutput : {};
  const plan = isRecord(planEnvelope.plan) ? planEnvelope.plan : null;
  const receipts = Array.isArray(planEnvelope.receipts)
    ? planEnvelope.receipts.filter(isRecord)
    : [];
  const approvedProposalIds = new Set<string>();
  for (const approval of approvals) {
    for (const scope of approval.token.payload.scopes) {
      approvedProposalIds.add(scope.proposalId);
    }
  }
  const receiptProposalIds = receipts
    .map((receipt) => receipt.proposalId)
    .filter((value): value is string => typeof value === "string");
  const uniqueReceiptIds = new Set(receiptProposalIds);
  const allReceiptsApproved = receiptProposalIds.every((proposalId) => approvedProposalIds.has(proposalId));
  const planStatus = typeof plan?.status === "string" ? plan.status : null;

  return {
    planStatus,
    approvalCount: approvals.length,
    approvedScopeCount: approvedProposalIds.size,
    receiptCount: receipts.length,
    uniqueReceiptProposalCount: uniqueReceiptIds.size,
    allReceiptsApproved,
    committed: planStatus === "COMMITTED",
    pass: planStatus === "COMMITTED"
      && approvals.length > 0
      && receipts.length > 0
      && uniqueReceiptIds.size === receipts.length
      && allReceiptsApproved,
  };
}

async function registerReleaseTools(): Promise<void> {
  const context = getModelContext();
  if (!context) return;

  context.addEventListener("toolchange", () => scheduleCapture("toolchange"));

  await registerTool({
    name: "relay_diagnose_webmcp",
    title: "Diagnose Relay WebMCP compatibility",
    description: "Return machine-readable evidence for Relay registration, provider-origin discovery, successful read-only provider execution and observed dynamic toolchange events. This tool never creates proposals or commits capacity.",
    inputSchema: {
      type: "object",
      properties: {
        executeReadProbes: {
          type: "boolean",
          description: "When true, execute one read-only discovery tool against every provider origin.",
        },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async (input: { executeReadProbes?: boolean }) => {
      await captureSurface("diagnostic");
      const modelContext = getModelContext();
      const collection = await collectTools();
      const grouped = groupTools(collection.tools);
      const executeReadProbes = input?.executeReadProbes !== false;

      const providers = [];
      for (const provider of providerSpecs) {
        const visibleTools = grouped[provider.origin] ?? [];
        const probe = executeReadProbes
          ? await executeExactTool(collection.tools, provider.origin, provider.readTool, { minimum: 0 })
          : { ok: false, error: "probe skipped by caller" };
        providers.push({
          id: provider.id,
          origin: provider.origin,
          expectedTools: provider.expectedTools,
          visibleTools,
          readTool: provider.readTool,
          readProbe: probe,
          discoveryPass: visibleTools.includes(provider.readTool),
          executionPass: executeReadProbes ? probe.ok : null,
        });
      }

      const runtimeRegisteredTools = getLocalRegisteredToolNames();
      const clientVisibleRelayTools = grouped[commandOrigin] ?? [];
      const bridgeTools = runtimeRegisteredTools.filter((name) => name.startsWith("relay_bridge_"));
      const runtimeRegistrationPass = permanentRelayTools.every((name) => runtimeRegisteredTools.includes(name));
      const clientVisibilityPass = permanentRelayTools.every((name) => clientVisibleRelayTools.includes(name));
      const initialBridgeRegistrationPass = expectedInitialBridgeTools.every((name) => runtimeRegisteredTools.includes(name));
      const initialBridgeVisibilityPass = expectedInitialBridgeTools.every((name) => clientVisibleRelayTools.includes(name));
      const providerDiscoveryPass = providers.every((provider) => provider.discoveryPass);
      const providerExecutionPass = executeReadProbes
        ? providers.every((provider) => provider.executionPass === true)
        : null;
      const compatibilityMode = bridgeTools.length ? "fixed-top-level-bridge-active" : "direct-only";
      const overallPass = runtimeRegistrationPass
        && clientVisibilityPass
        && providerDiscoveryPass
        && (providerExecutionPass ?? true)
        && (compatibilityMode === "direct-only" || (initialBridgeRegistrationPass && initialBridgeVisibilityPass));

      return toolOutput({
        ok: overallPass,
        capturedAt: new Date().toISOString(),
        commandOrigin,
        compatibilityMode,
        api: {
          registerTool: Boolean(modelContext?.registerTool),
          getTools: Boolean(modelContext?.getTools),
          executeTool: Boolean(modelContext?.executeTool),
          toolchangeListenerInstalled: true,
        },
        relay: {
          expectedPermanentTools: permanentRelayTools,
          runtimeRegisteredTools,
          clientVisibleTools: clientVisibleRelayTools,
          runtimeRegistrationPass,
          clientVisibilityPass,
          bridgeTools,
          expectedInitialBridgeTools,
          initialBridgeRegistrationPass,
          initialBridgeVisibilityPass,
        },
        providers,
        providerDiscoveryPass,
        providerExecutionPass,
        discoveryErrors: collection.errors,
        toolchange: {
          observedEventCount: evidence.filter((entry) => entry.reason === "toolchange").length,
          captures: evidence,
          instruction: "Capture before proposals, after capability creation and after staleness or commit teardown. Compare runtimeRegisteredTools, toolsByOrigin and observedEventCount.",
        },
        evidenceBoundary: {
          currentDocument: "actual live page",
          externalClient: "The caller must record whether this result came from ChatGPT's built-in browser. Harness execution is not equivalent.",
        },
      });
    },
  });

  await registerTool({
    name: "relay_get_audit_bundle",
    title: "Export signed-transaction audit evidence",
    description: "Read Relay's local plan and mesh snapshots without recursively invoking WebMCP, include every provider-accepted PACT approval token and bind the complete evidence bundle to a canonical SHA-256 digest. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async () => {
      try {
        const [plan, mesh] = await Promise.all([
          readLocalTool("relay_get_plan"),
          readLocalTool("relay_get_mesh_state"),
        ]);
        const approvals = readApprovalEvidence();
        if (!approvals.length) {
          return toolOutput({
            ok: false,
            code: "APPROVAL_EVIDENCE_MISSING",
            message: "No provider-accepted PACT approval token has passed through a fixed commit bridge in this page session.",
          });
        }
        const consistency = auditConsistency(plan, approvals);
        const bundle = {
          schema: "relay.audit.v1",
          capturedAt: new Date().toISOString(),
          commandOrigin,
          providerOrigins: Object.fromEntries(providerSpecs.map((provider) => [provider.id, provider.origin])),
          approvals,
          consistency,
          plan,
          mesh,
        };
        const digest = await sha256(bundle);
        if (!consistency.pass) {
          return toolOutput({
            ok: false,
            code: "AUDIT_STATE_INCONSISTENT",
            algorithm: "SHA-256",
            digest,
            bundle,
          });
        }
        return toolOutput({
          ok: true,
          algorithm: "SHA-256",
          digest,
          bundle,
        });
      } catch (error) {
        return toolOutput({
          ok: false,
          code: "AUDIT_CAPTURE_UNAVAILABLE",
          message: errorMessage(error),
          fallback: "Call relay_get_plan and relay_get_mesh_state directly and preserve their raw JSON outputs.",
        });
      }
    },
  });

  scheduleCapture("initial");
}

void registerReleaseTools().catch((error) => {
  console.error("[Relay diagnostics] Registration failed", error);
});
