export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

export interface ToolDefinition<TInput extends object = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: ToolAnnotations;
  execute(input: TInput, options?: { signal?: AbortSignal }): Promise<unknown> | unknown;
}

interface ModelContextLike extends EventTarget {
  registerTool(tool: ToolDefinition, options?: { signal?: AbortSignal; exposedTo?: string[] }): Promise<void>;
  getTools?(options?: { fromOrigins?: string[] }): Promise<unknown[]>;
  executeTool?(tool: unknown, input?: string, options?: { signal?: AbortSignal }): Promise<string | null>;
}

declare global {
  interface Document {
    modelContext?: ModelContextLike;
  }
  interface Navigator {
    modelContext?: ModelContextLike;
  }
}

export function getModelContext(): ModelContextLike | null {
  return document.modelContext ?? navigator.modelContext ?? null;
}

export function webMcpAvailable(): boolean {
  return Boolean(getModelContext()?.registerTool);
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

  const controller = new AbortController();
  await context.registerTool(tool as ToolDefinition, {
    signal: controller.signal,
    exposedTo: options.exposedTo,
  });
  return controller;
}

export class DynamicTool {
  #controller: AbortController | null = null;
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
    this.#controller = await registerTool(this.#definition, { exposedTo: this.#exposedTo });
  }

  disable(): void {
    const controller = this.#controller;
    this.#controller = null;
    if (!controller) return;

    // Chrome versions before 153 can couple registration-signal abort with an
    // in-flight execution. Defer unregistration to the next task so a tool can
    // safely return its approval token / commit receipt before disappearing.
    window.setTimeout(() => controller.abort(), 0);
  }
}

export function toolOutput(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length <= 1450 ? text : `${text.slice(0, 1400)}…`;
}
