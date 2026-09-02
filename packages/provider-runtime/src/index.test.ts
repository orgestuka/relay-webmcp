import { afterEach, describe, expect, it } from "vitest";
import type {
  ApprovalPayload,
  ApprovalToken,
  PlanDraft,
  ProviderProposal,
  ProviderRpcResponseMessage,
  ProviderToRelayMessage,
} from "@relay/contracts";
import { PROVIDER_RPC_PROTOCOL } from "@relay/contracts";
import {
  createSessionSigner,
  hashPlan,
  proposalScope,
  type SessionSigner,
} from "@relay/pact";
import { shelterSeed } from "@relay/simulation";
import type { ToolDefinition } from "@relay/webmcp-runtime";
import { mountProvider } from "./index";

const relayOrigin = "https://relay.example.test";
const providerOrigin = "https://shelter.example.test";

interface PostedMessage {
  message: ProviderToRelayMessage;
  targetOrigin: string;
}

interface ProviderHarness {
  activeTools: Map<string, ToolDefinition>;
  posted: PostedMessage[];
  signer: SessionSigner;
  call<T extends object = Record<string, unknown>>(name: string, input: T): Promise<Record<string, unknown>>;
  getTool(name: string): ToolDefinition | undefined;
  rpcCall(name: string, input: Record<string, unknown>, requestId?: string): Promise<ProviderRpcResponseMessage>;
  dispatchMessage(data: unknown, options?: { origin?: string; source?: MessageEventSource | null }): void;
  injectDisruption(): void;
  close(): Promise<void>;
}

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;

function parseResult(value: unknown): Record<string, unknown> {
  expect(typeof value).toBe("string");
  const parsed = JSON.parse(value as string) as unknown;
  expect(parsed).toBeTruthy();
  expect(typeof parsed).toBe("object");
  expect(Array.isArray(parsed)).toBe(false);
  return parsed as Record<string, unknown>;
}

function parseRpcOutput(response: ProviderRpcResponseMessage): Record<string, unknown> {
  expect(response.transportOk).toBe(true);
  expect(typeof response.output).toBe("string");
  return parseResult(response.output);
}

async function flushTasks(): Promise<void> {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
}

async function approvalFor(
  signer: SessionSigner,
  proposals: ProviderProposal[],
  maximumCost = 5000,
): Promise<ApprovalToken> {
  const now = new Date();
  const plan: PlanDraft = {
    planId: `plan-${crypto.randomUUID()}`,
    incidentId: "FLOOD-RIVERSIDE-042",
    summary: "Provider runtime atomicity test",
    rationale: "The exact provider proposals are approved as one local batch.",
    proposals,
    totalCost: proposals.reduce((sum, proposal) => sum + proposal.totalCost, 0),
    maxBudget: maximumCost,
    revision: 1,
    status: "VALIDATED",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const payload: ApprovalPayload = {
    sessionId: signer.sessionId,
    planId: plan.planId,
    planHash: await hashPlan(plan),
    scopes: proposals.map(proposalScope),
    maximumCost,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 120_000).toISOString(),
  };
  return signer.sign(payload);
}

function resourceAvailability(result: Record<string, unknown>, resourceId: string): number {
  const resources = result.resources;
  expect(Array.isArray(resources)).toBe(true);
  const resource = (resources as Array<Record<string, unknown>>)
    .find((candidate) => candidate.id === resourceId);
  expect(resource).toBeTruthy();
  expect(typeof resource?.available).toBe("number");
  return resource!.available as number;
}

async function createHarness(): Promise<ProviderHarness> {
  const activeTools = new Map<string, ToolDefinition>();
  const posted: PostedMessage[] = [];
  const messageListeners: Array<(event: MessageEvent<unknown>) => void> = [];
  const pagehideListeners: Array<() => void> = [];
  let disruptionHandler: (() => void) | null = null;

  const fakeParent = {
    postMessage(message: ProviderToRelayMessage, targetOrigin: string) {
      posted.push({ message: structuredClone(message), targetOrigin });
    },
  } as unknown as Window;

  const app = {
    innerHTML: "",
    querySelector(selector: string) {
      if (selector !== "#inject-disruption") return null;
      return {
        addEventListener(type: string, listener: EventListener) {
          if (type === "click") disruptionHandler = () => listener(new Event("click"));
        },
      };
    },
  } as unknown as HTMLDivElement;

  const modelContext = new EventTarget() as EventTarget & {
    registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal }): Promise<void>;
  };
  modelContext.registerTool = async (tool, options) => {
    activeTools.set(tool.name, tool);
    options?.signal?.addEventListener("abort", () => {
      if (activeTools.get(tool.name) === tool) activeTools.delete(tool.name);
    }, { once: true });
  };

  const fakeWindow = {
    location: { origin: providerOrigin, href: `${providerOrigin}/` },
    parent: fakeParent,
    addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
      const callable = typeof listener === "function"
        ? listener
        : (event: Event) => listener.handleEvent(event);
      if (type === "message") {
        messageListeners.push((event) => callable(event));
      } else if (type === "pagehide") {
        pagehideListeners.push(() => callable(new Event("pagehide")));
      }
    },
  } as unknown as Window;

  const fakeDocument = {
    modelContext,
    querySelector(selector: string) {
      return selector === "#app" ? app : null;
    },
  } as unknown as Document;

  Object.defineProperty(globalThis, "window", { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });

  await mountProvider({
    seed: shelterSeed,
    relayOrigin,
    searchToolName: "shelter_find_capacity",
    searchToolTitle: "Find shelter capacity",
    searchToolDescription: "Return current shelter capacity for tests.",
    proposeToolName: "shelter_propose_reservation",
    commitToolName: "shelter_commit_reservation",
  });

  const signer = await createSessionSigner(`session-${crypto.randomUUID()}`);
  const initEvent = {
    source: fakeParent,
    origin: relayOrigin,
    data: {
      type: "relay_session_init",
      sessionId: signer.sessionId,
      publicKeyJwk: signer.publicKeyJwk,
      commandOrigin: relayOrigin,
    },
  } as MessageEvent<unknown>;
  for (const listener of messageListeners) listener(initEvent);
  await flushTasks();

  return {
    activeTools,
    posted,
    signer,
    async call(name, input) {
      const tool = activeTools.get(name);
      expect(tool, `Expected active tool ${name}`).toBeDefined();
      return parseResult(await tool!.execute(input as Record<string, unknown>));
    },
    getTool(name) {
      return activeTools.get(name);
    },
    async rpcCall(name, input, requestId = crypto.randomUUID()) {
      const before = posted.length;
      const event = {
        source: fakeParent,
        origin: relayOrigin,
        data: {
          type: "relay_provider_rpc_request",
          protocol: PROVIDER_RPC_PROTOCOL,
          requestId,
          providerId: "shelter",
          toolName: name,
          input,
        },
      } as MessageEvent<unknown>;
      for (const listener of messageListeners) listener(event);
      await flushTasks();
      const response = posted.slice(before)
        .map(({ message }) => message)
        .find((message): message is ProviderRpcResponseMessage =>
          message.type === "relay_provider_rpc_response" && message.requestId === requestId);
      expect(response, `Expected provider RPC response for ${requestId}`).toBeDefined();
      return response!;
    },
    dispatchMessage(data, options = {}) {
      const event = {
        source: options.source === undefined ? fakeParent : options.source,
        origin: options.origin ?? relayOrigin,
        data,
      } as MessageEvent<unknown>;
      for (const listener of messageListeners) listener(event);
    },
    injectDisruption() {
      expect(disruptionHandler).toBeTypeOf("function");
      disruptionHandler!();
    },
    async close() {
      for (const listener of pagehideListeners) listener();
      await flushTasks();
    },
  };
}

afterEach(() => {
  Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
});

describe("provider runtime release invariants", () => {
  it("executes the same provider tools through an origin-locked, replay-safe RPC fallback", async () => {
    const harness = await createHarness();
    try {
      const advertised = harness.posted
        .map(({ message }) => message)
        .filter((message) => message.type === "relay_provider_rpc_capabilities")
        .at(-1);
      expect(advertised).toMatchObject({
        protocol: PROVIDER_RPC_PROTOCOL,
        providerId: "shelter",
        tools: ["shelter_find_capacity", "shelter_propose_reservation"],
      });

      const read = parseRpcOutput(await harness.rpcCall("shelter_find_capacity", { minimum: 0 }));
      expect(read).toMatchObject({ ok: true, providerOrigin });
      expect(resourceAvailability(read, "north")).toBe(46);

      const requestId = crypto.randomUUID();
      const proposed = parseRpcOutput(await harness.rpcCall("shelter_propose_reservation", {
        resourceId: "east",
        quantity: 2,
        purpose: "RPC fallback test",
      }, requestId));
      expect(proposed).toMatchObject({ ok: true });
      expect(harness.posted
        .map(({ message }) => message)
        .filter((message) => message.type === "relay_provider_rpc_capabilities")
        .at(-1)).toMatchObject({
          tools: ["shelter_commit_reservation", "shelter_find_capacity", "shelter_propose_reservation"],
        });

      const replay = await harness.rpcCall("shelter_propose_reservation", {
        resourceId: "east",
        quantity: 2,
        purpose: "Must not execute twice",
      }, requestId);
      expect(replay).toMatchObject({
        transportOk: false,
        error: { code: "PROVIDER_RPC_REPLAYED" },
      });

      const postedBeforeWrongOrigin = harness.posted.length;
      harness.dispatchMessage({
        type: "relay_provider_rpc_request",
        protocol: PROVIDER_RPC_PROTOCOL,
        requestId: crypto.randomUUID(),
        providerId: "shelter",
        toolName: "shelter_find_capacity",
        input: { minimum: 0 },
      }, { origin: "https://evil.example.test" });
      await flushTasks();
      expect(harness.posted).toHaveLength(postedBeforeWrongOrigin);
    } finally {
      await harness.close();
    }
  });

  it("rejects an incomplete approved same-origin batch without changing capacity", async () => {
    const harness = await createHarness();
    try {
      const before = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(resourceAvailability(before, "east")).toBe(18);
      expect(resourceAvailability(before, "south")).toBe(24);

      const eastResult = await harness.call("shelter_propose_reservation", {
        resourceId: "east",
        quantity: 2,
        purpose: "Atomicity test east allocation",
      });
      const southResult = await harness.call("shelter_propose_reservation", {
        resourceId: "south",
        quantity: 3,
        purpose: "Atomicity test south allocation",
      });
      const east = eastResult.proposal as ProviderProposal;
      const south = southResult.proposal as ProviderProposal;
      const approvalToken = await approvalFor(harness.signer, [east, south]);

      const rejected = await harness.call("shelter_commit_reservation", {
        proposalIds: [east.proposalId],
        approvalToken,
      });
      expect(rejected).toMatchObject({ ok: false, code: "INCOMPLETE_PROVIDER_BATCH" });

      const afterFailure = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(resourceAvailability(afterFailure, "east")).toBe(18);
      expect(resourceAvailability(afterFailure, "south")).toBe(24);

      const committed = await harness.call("shelter_commit_reservation", {
        proposalIds: [east.proposalId, south.proposalId],
        approvalToken,
      });
      expect(committed).toMatchObject({ ok: true, atomic: true, providerStateVersion: 2 });
      expect((committed.receipts as unknown[]).length).toBe(2);

      const afterCommit = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(resourceAvailability(afterCommit, "east")).toBe(16);
      expect(resourceAvailability(afterCommit, "south")).toBe(21);
      expect(harness.posted.filter(({ message }) => message.type === "relay_provider_receipt")).toHaveLength(2);

      await flushTasks();
      expect(harness.getTool("shelter_commit_reservation")).toBeUndefined();
    } finally {
      await harness.close();
    }
  });

  it("revokes stale commit capability and rejects a captured stale handle", async () => {
    const harness = await createHarness();
    try {
      const proposalResult = await harness.call("shelter_propose_reservation", {
        resourceId: "south",
        quantity: 5,
        purpose: "Stale-state revocation test",
      });
      const proposal = proposalResult.proposal as ProviderProposal;
      const approvalToken = await approvalFor(harness.signer, [proposal]);
      const capturedCommit = harness.getTool("shelter_commit_reservation");
      expect(capturedCommit).toBeDefined();

      harness.injectDisruption();
      await flushTasks();
      expect(harness.getTool("shelter_commit_reservation")).toBeUndefined();

      const state = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(state.stateVersion).toBe(2);
      expect(resourceAvailability(state, "south")).toBe(12);

      const staleResult = parseResult(await capturedCommit!.execute({
        proposalIds: [proposal.proposalId],
        approvalToken,
      }));
      expect(staleResult).toMatchObject({ ok: false, code: "PROPOSAL_NOT_FOUND" });

      const afterStaleAttempt = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(resourceAvailability(afterStaleAttempt, "south")).toBe(12);
    } finally {
      await harness.close();
    }
  });

  it("accepts a plan-aware disruption only from the exact trusted Relay parent", async () => {
    const harness = await createHarness();
    try {
      const before = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(resourceAvailability(before, "north")).toBe(46);

      const request = {
        type: "relay_demo_inject_disruption",
        providerId: "shelter",
        resourceId: "north",
        newAvailability: 25,
      };
      harness.dispatchMessage(request, { origin: "https://evil.example.test" });
      await flushTasks();
      const afterWrongOrigin = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(afterWrongOrigin.stateVersion).toBe(1);
      expect(resourceAvailability(afterWrongOrigin, "north")).toBe(46);

      harness.dispatchMessage(request);
      await flushTasks();
      const disrupted = await harness.call("shelter_find_capacity", { minimum: 0 });
      expect(disrupted.stateVersion).toBe(2);
      expect(resourceAvailability(disrupted, "north")).toBe(25);
    } finally {
      await harness.close();
    }
  });
});
