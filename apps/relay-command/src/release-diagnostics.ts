import { sha256 } from "@relay/pact";
import {
  getModelContext,
  registerTool,
  toolOutput,
  type RegisteredTool,
} from "@relay/webmcp-runtime";

interface ProviderDiagnosticSpec {
  id: "shelter" | "transit" | "supply";
  origin: string;
  readTool: string;
  expectedTools: string[];
}

interface ToolchangeEvidence {
  sequence: number;
  capturedAt: string;
  reason: "initial" | "toolchange" | "diagnostic";
  toolsByOrigin: Record<string, string[]>;
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

const evidence: ToolchangeEvidence[] = [];
let evidenceSequence = 0;
let captureTimer: number | null = null;

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

async function collectTools(): Promise<RegisteredTool[]> {
  const context = getModelContext();
  if (!context?.getTools) return [];

  const local = await context.getTools();
  const remote = await context.getTools({ fromOrigins: providerSpecs.map((provider) => provider.origin) });
  return deduplicateTools([...local, ...remote]);
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
    evidence.push({
      sequence: ++evidenceSequence,
      capturedAt: new Date().toISOString(),
      reason,
      toolsByOrigin: groupTools(await collectTools()),
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

function parseToolOutput(raw: string | null): { ok: boolean; value?: unknown; error?: string } {
  if (raw === null) return { ok: false, error: "executeTool returned null" };
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (error) {
    return {
      ok: false,
      error: `executeTool returned invalid JSON: ${error instanceof Error ? error.message : "parse failure"}`,
    };
  }
}

async function executeExactTool(
  tools: RegisteredTool[],
  origin: string,
  name: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const context = getModelContext();
  if (!context?.executeTool) return { ok: false, error: "document.modelContext.executeTool is unavailable" };
  const tool = tools.find((candidate) => normalizeToolOrigin(candidate) === origin && candidate.name === name);
  if (!tool) return { ok: false, error: `Exact tool ${origin}::${name} is not discoverable` };

  try {
    const parsed = parseToolOutput(await context.executeTool(tool, JSON.stringify(input)));
    return parsed.ok ? { ok: true, result: parsed.value } : { ok: false, error: parsed.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "executeTool failed" };
  }
}

async function readLocalTool(name: string): Promise<unknown> {
  const context = getModelContext();
  if (!context?.getTools || !context.executeTool) throw new Error("getTools/executeTool unavailable");
  const tools = await context.getTools();
  const tool = tools.find((candidate) => normalizeToolOrigin(candidate) === commandOrigin && candidate.name === name);
  if (!tool) throw new Error(`${name} is not registered on Relay Command`);
  const parsed = parseToolOutput(await context.executeTool(tool, "{}"));
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.value;
}

async function registerReleaseTools(): Promise<void> {
  const context = getModelContext();
  if (!context) return;

  context.addEventListener("toolchange", () => scheduleCapture("toolchange"));

  await registerTool({
    name: "relay_diagnose_webmcp",
    title: "Diagnose Relay WebMCP compatibility",
    description: "Return machine-readable evidence for Relay registration, provider-origin discovery, safe provider execution probes and observed dynamic toolchange events. This tool never creates proposals or commits capacity.",
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
      const tools = await collectTools();
      const grouped = groupTools(tools);
      const executeReadProbes = input?.executeReadProbes !== false;

      const providers = [];
      for (const provider of providerSpecs) {
        const visibleTools = grouped[provider.origin] ?? [];
        const probe = executeReadProbes
          ? await executeExactTool(tools, provider.origin, provider.readTool, { minimum: 0 })
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

      const relayTools = grouped[commandOrigin] ?? [];
      const bridgeTools = relayTools.filter((name) => name.startsWith("relay_bridge_"));
      const permanentRegistrationPass = permanentRelayTools.every((name) => relayTools.includes(name));
      const providerDiscoveryPass = providers.every((provider) => provider.discoveryPass);
      const providerExecutionPass = executeReadProbes
        ? providers.every((provider) => provider.executionPass === true)
        : null;

      return toolOutput({
        ok: permanentRegistrationPass && providerDiscoveryPass && (providerExecutionPass ?? true),
        capturedAt: new Date().toISOString(),
        commandOrigin,
        compatibilityMode: bridgeTools.length ? "fixed-top-level-bridge-active" : "direct-only",
        api: {
          registerTool: Boolean(modelContext?.registerTool),
          getTools: Boolean(modelContext?.getTools),
          executeTool: Boolean(modelContext?.executeTool),
          toolchangeListenerInstalled: true,
        },
        relay: {
          expectedPermanentTools: permanentRelayTools,
          visibleTools: relayTools,
          bridgeTools,
          permanentRegistrationPass,
        },
        providers,
        providerDiscoveryPass,
        providerExecutionPass,
        toolchange: {
          observedEventCount: evidence.filter((entry) => entry.reason === "toolchange").length,
          captures: evidence,
          instruction: "Capture once before proposals, once after proposal/commit capability creation and once after staleness or commit teardown. Compare toolsByOrigin and observedEventCount.",
        },
        evidenceBoundary: {
          currentDocument: "actual live page",
          externalClient: "The caller must record that this result came from ChatGPT's built-in browser. Harness execution is not equivalent.",
        },
      });
    },
  });

  await registerTool({
    name: "relay_get_audit_bundle",
    title: "Export signed-transaction audit evidence",
    description: "Read Relay's current plan and mesh state, then bind the captured plan, approval scopes, provider state and receipts to a canonical SHA-256 digest. Read-only.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: async () => {
      try {
        const [plan, mesh] = await Promise.all([
          readLocalTool("relay_get_plan"),
          readLocalTool("relay_get_mesh_state"),
        ]);
        const bundle = {
          schema: "relay.audit.v1",
          capturedAt: new Date().toISOString(),
          commandOrigin,
          providerOrigins: Object.fromEntries(providerSpecs.map((provider) => [provider.id, provider.origin])),
          plan,
          mesh,
        };
        return toolOutput({
          ok: true,
          algorithm: "SHA-256",
          digest: await sha256(bundle),
          bundle,
        });
      } catch (error) {
        return toolOutput({
          ok: false,
          code: "AUDIT_CAPTURE_UNAVAILABLE",
          message: error instanceof Error ? error.message : "Unable to capture Relay audit state",
          fallback: "Call relay_get_plan and relay_get_mesh_state directly, preserve their raw JSON outputs and record that nested executeTool was unavailable.",
        });
      }
    },
  });

  scheduleCapture("initial");
}

void registerReleaseTools().catch((error) => {
  console.error("[Relay diagnostics] Registration failed", error);
});
