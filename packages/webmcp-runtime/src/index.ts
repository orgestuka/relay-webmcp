export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolExecutionOptions {
  signal?: AbortSignal;
}

export interface ToolDefinition<TInput extends object = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  execute(input: TInput, options?: ToolExecutionOptions): Promise<unknown> | unknown;
}

export interface RegisteredTool {
  name: string;
  title?: string;
  origin: string;
  annotations?: ToolAnnotations;
}

export type ToolInputGuard = (
  input: Record<string, unknown>,
) => Promise<Record<string, unknown>> | Record<string, unknown>;

interface ModelContextLike {
  addEventListener?: EventTarget["addEventListener"];
  registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal; exposedTo?: string[] }): Promise<void>;
  getTools?(options?: { fromOrigins?: string[] }): Promise<RegisteredTool[]>;
  executeTool?(tool: RegisteredTool, input?: string, options?: ToolExecutionOptions): Promise<string | null>;
}

interface LocalRegistration {
  definition: ToolDefinition;
  controller: AbortController;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
  interface Navigator {
    modelContext?: ModelContextLike;
  }
}

const localRegistrations = new Map<string, LocalRegistration>();
const inputGuards = new Map<string, ToolInputGuard>();

export function getModelContext(): ModelContextLike | null {
  return document.modelContext ?? navigator.modelContext ?? null;
}

export function webMcpAvailable(): boolean {
  return Boolean(getModelContext()?.registerTool);
}

export function installToolInputGuard(name: string, guard: ToolInputGuard): () => void {
  if (!name.trim()) throw new TypeError("Tool input guard requires a tool name.");
  if (localRegistrations.has(name)) {
    throw new Error(`Tool input guard for ${name} must be installed before tool registration.`);
  }

  inputGuards.set(name, guard);
  return () => {
    if (inputGuards.get(name) === guard) inputGuards.delete(name);
  };
}

export function getLocalRegisteredToolNames(): string[] {
  return [...localRegistrations.entries()]
    .filter(([, registration]) => !registration.controller.signal.aborted)
    .map(([name]) => name)
    .sort();
}

export async function executeLocalRegisteredTool<TInput extends object = Record<string, unknown>>(
  name: string,
  input: TInput,
  options?: ToolExecutionOptions,
): Promise<unknown> {
  const registration = localRegistrations.get(name);
  if (!registration || registration.controller.signal.aborted) {
    throw new Error(`Local WebMCP tool ${name} is not currently registered.`);
  }
  return registration.definition.execute(input as Record<string, unknown>, options);
}

function guardedDefinition<TInput extends object>(tool: ToolDefinition<TInput>): ToolDefinition {
  const guard = inputGuards.get(tool.name);
  if (!guard) return tool as ToolDefinition;

  return {
    ...tool,
    execute: async (input: Record<string, unknown>, options?: ToolExecutionOptions) => {
      const guardedInput = await guard(structuredClone(input));
      return tool.execute(guardedInput as TInput, options);
    },
  };
}

function deferredAbort(controller: AbortController | null): void {
  if (!controller || controller.signal.aborted) return;
  globalThis.setTimeout(() => controller.abort(), 0);
}

export async function registerTool<TInput extends object>(
  tool: ToolDefinition<TInput>,
  options: { exposedTo?: string[] } = {},
): Promise<AbortController | null> {
  const context = getModelContext();
  if (!context) {
    console.info(`[Relay] WebMCP unavailable; skipped ${tool.name}`);
    return null;
  }

  const definition = guardedDefinition(tool);
  const controller = new AbortController();
  try {
    await context.registerTool(definition, {
      signal: controller.signal,
      exposedTo: options.exposedTo,
    });

    const registration: LocalRegistration = {
      definition,
      controller,
    };
    localRegistrations.set(tool.name, registration);
    controller.signal.addEventListener("abort", () => {
      if (localRegistrations.get(tool.name) === registration) {
        localRegistrations.delete(tool.name);
      }
    }, { once: true });

    return controller;
  } catch (error) {
    controller.abort();
    console.error(`[Relay] Failed to register WebMCP tool ${tool.name}`, error);
    throw error;
  }
}

export class DynamicTool {
  #controller: AbortController | null = null;
  #pending: Promise<void> | null = null;
  #generation = 0;
  #definition: ToolDefinition;
  #exposedTo?: string[];

  constructor(definition: ToolDefinition, exposedTo?: string[]) {
    this.#definition = definition;
    this.#exposedTo = exposedTo;
  }

  get active(): boolean {
    return Boolean(this.#controller && !this.#controller.signal.aborted);
  }

  async enable(): Promise<void> {
    if (this.active) return;
    if (this.#pending) return this.#pending;

    const generation = ++this.#generation;
    const operation = (async () => {
      const controller = await registerTool(this.#definition, { exposedTo: this.#exposedTo });
      if (generation !== this.#generation) {
        deferredAbort(controller);
        return;
      }
      this.#controller = controller;
    })();

    this.#pending = operation;
    try {
      await operation;
    } finally {
      if (this.#pending === operation) this.#pending = null;
    }
  }

  disable(): void {
    this.#generation += 1;
    const controller = this.#controller;
    this.#controller = null;

    // Some experimental browser builds couple registration-signal abort with
    // an in-flight execution. Defer unregistration by one task so a tool can
    // return its approval token or receipt before disappearing.
    deferredAbort(controller);
  }
}

export function toolOutput(value: unknown): string {
  // Never truncate serialized protocol objects. Cut JSON can corrupt signed
  // tokens, proposal IDs or receipts. Return intentionally compact objects.
  return JSON.stringify(value);
}
