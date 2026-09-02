import { afterEach, describe, expect, it } from "vitest";
import {
  DynamicTool,
  executeLocalRegisteredTool,
  getLocalRegisteredToolNames,
  installToolInputGuard,
  registerTool,
  toolOutput,
  type ToolDefinition,
} from "./index";

const originalDocument = globalThis.document;
const originalNavigator = globalThis.navigator;

type RegistrationOptions = { signal?: AbortSignal; exposedTo?: string[] };

function installContext(registerToolImpl: (tool: unknown, options?: RegistrationOptions) => Promise<void>): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { modelContext: { registerTool: registerToolImpl } },
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {},
  });
}

async function flushAbort(): Promise<void> {
  await new Promise((resolve) => globalThis.setTimeout(resolve, 1));
}

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

const definition = {
  name: "relay_test_dynamic",
  description: "Exercise dynamic registration lifecycle.",
  execute: () => ({ ok: true }),
};

describe("local registration evidence", () => {
  it("executes a registered local read without recursively calling executeTool", async () => {
    installContext(async () => {});
    const name = "relay_test_local_read";
    const controller = await registerTool({
      name,
      description: "Return a deterministic local snapshot.",
      execute: (input: { marker: string }) => ({ ok: true, marker: input.marker }),
    });

    expect(getLocalRegisteredToolNames()).toContain(name);
    await expect(executeLocalRegisteredTool(name, { marker: "audit" }))
      .resolves.toEqual({ ok: true, marker: "audit" });

    controller?.abort();
    expect(getLocalRegisteredToolNames()).not.toContain(name);
    await expect(executeLocalRegisteredTool(name, {})).rejects.toThrow(/not currently registered/);
  });

  it("removes only the registration instance that was aborted", async () => {
    installContext(async () => {});
    const name = "relay_test_replaced_registration";
    const first = await registerTool({ name, description: "first", execute: () => "first" });
    const second = await registerTool({ name, description: "second", execute: () => "second" });

    first?.abort();
    expect(getLocalRegisteredToolNames()).toContain(name);
    await expect(executeLocalRegisteredTool(name, {})).resolves.toBe("second");

    second?.abort();
    expect(getLocalRegisteredToolNames()).not.toContain(name);
  });
});

describe("tool input guards", () => {
  it("caps browser and local execution through the same guarded definition", async () => {
    let browserDefinition: ToolDefinition | null = null;
    installContext(async (tool) => {
      browserDefinition = tool as ToolDefinition;
    });

    const name = "relay_test_guarded_stage";
    const removeGuard = installToolInputGuard(name, (input) => ({
      ...input,
      maxBudget: Math.min(Number(input.maxBudget ?? 3000), 3000),
    }));
    const controller = await registerTool({
      name,
      description: "Return guarded stage input.",
      execute: (input: { maxBudget: number }) => input,
    });

    await expect(executeLocalRegisteredTool(name, { maxBudget: 5000 }))
      .resolves.toEqual({ maxBudget: 3000 });
    const registeredDefinition = browserDefinition as ToolDefinition | null;
    if (!registeredDefinition) throw new Error("Browser tool definition was not registered.");
    await expect(registeredDefinition.execute({ maxBudget: 5000 }))
      .resolves.toEqual({ maxBudget: 3000 });

    controller?.abort();
    removeGuard();
  });

  it("rejects guards installed after a tool is already registered", async () => {
    installContext(async () => {});
    const name = "relay_test_late_guard";
    const controller = await registerTool({ name, description: "already live", execute: (input) => input });

    expect(() => installToolInputGuard(name, (input) => input)).toThrow(/before tool registration/);

    controller?.abort();
  });
});

describe("DynamicTool", () => {
  it("coalesces concurrent enable calls into one registration", async () => {
    let registrations = 0;
    installContext(async () => {
      registrations += 1;
    });

    const tool = new DynamicTool(definition);
    await Promise.all([tool.enable(), tool.enable(), tool.enable()]);

    expect(registrations).toBe(1);
    expect(tool.active).toBe(true);
    expect(getLocalRegisteredToolNames()).toContain(definition.name);

    tool.disable();
    await flushAbort();
    expect(getLocalRegisteredToolNames()).not.toContain(definition.name);
  });

  it("fails closed when disabled while registration is still pending", async () => {
    let release!: () => void;
    let registrationSignal: AbortSignal | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    installContext(async (_tool, options) => {
      registrationSignal = options?.signal;
      await gate;
    });

    const tool = new DynamicTool(definition);
    const enabling = tool.enable();
    tool.disable();
    release();
    await enabling;
    await flushAbort();

    expect(tool.active).toBe(false);
    expect(registrationSignal?.aborted).toBe(true);
    expect(getLocalRegisteredToolNames()).not.toContain(definition.name);
  });

  it("aborts an active registration on disable", async () => {
    let registrationSignal: AbortSignal | undefined;
    installContext(async (_tool, options) => {
      registrationSignal = options?.signal;
    });

    const tool = new DynamicTool(definition);
    await tool.enable();
    expect(tool.active).toBe(true);

    tool.disable();
    await flushAbort();

    expect(tool.active).toBe(false);
    expect(registrationSignal?.aborted).toBe(true);
    expect(getLocalRegisteredToolNames()).not.toContain(definition.name);
  });

  it("clears a failed registration so a later retry can succeed", async () => {
    let registrations = 0;
    installContext(async () => {
      registrations += 1;
      if (registrations === 1) throw new Error("synthetic registration failure");
    });

    const tool = new DynamicTool(definition);
    await expect(tool.enable()).rejects.toThrow(/synthetic/);
    await tool.enable();

    expect(registrations).toBe(2);
    expect(tool.active).toBe(true);

    tool.disable();
    await flushAbort();
  });
});

describe("toolOutput", () => {
  it("never truncates signed protocol objects into invalid JSON", () => {
    const value = { signature: "x".repeat(5000), scopes: Array.from({ length: 20 }, (_, index) => ({ index })) };
    const serialized = toolOutput(value);

    expect(serialized.length).toBeGreaterThan(5000);
    expect(JSON.parse(serialized)).toEqual(value);
  });
});
