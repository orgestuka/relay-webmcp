import { afterEach, describe, expect, it } from "vitest";
import { DynamicTool, toolOutput } from "./index";

const originalDocument = globalThis.document;

type RegistrationOptions = { signal?: AbortSignal; exposedTo?: string[] };

function installContext(registerTool: (tool: unknown, options?: RegistrationOptions) => Promise<void>): void {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { modelContext: { registerTool } },
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
  });
});

const definition = {
  name: "relay_test_dynamic",
  description: "Exercise dynamic registration lifecycle.",
  execute: () => ({ ok: true }),
};

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
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1));

    expect(tool.active).toBe(false);
    expect(registrationSignal?.aborted).toBe(true);
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
    await new Promise((resolve) => globalThis.setTimeout(resolve, 1));

    expect(tool.active).toBe(false);
    expect(registrationSignal?.aborted).toBe(true);
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
