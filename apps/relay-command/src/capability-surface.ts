import "./capability-surface.css";
import type { ProviderId } from "@relay/contracts";
import { getModelContext, type RegisteredTool } from "@relay/webmcp-runtime";

const providerOrigins: Record<ProviderId, string> = {
  shelter: new URL(import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174", window.location.href).origin,
  transit: new URL(import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175", window.location.href).origin,
  supply: new URL(import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176", window.location.href).origin,
};

const panel = document.createElement("aside");
panel.className = "capability-surface";
panel.setAttribute("aria-label", "Live WebMCP capability surface");
document.body.append(panel);

let refreshGeneration = 0;
let refreshTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
let refreshInterval: ReturnType<typeof globalThis.setInterval> | null = null;

function originLabel(origin: string | undefined): string {
  if (!origin || origin === window.location.origin) return "Relay";
  if (origin === providerOrigins.shelter) return "Shelter";
  if (origin === providerOrigins.transit) return "Transit";
  if (origin === providerOrigins.supply) return "Supply";
  try {
    return new URL(origin).hostname;
  } catch {
    return "Unknown";
  }
}

function renderHeader(status: string, warning = false): HTMLElement {
  const head = document.createElement("div");
  head.className = "capability-head";
  const title = document.createElement("span");
  title.textContent = "AGENT CAPABILITY SURFACE";
  const state = document.createElement("b");
  state.textContent = status;
  if (warning) state.className = "capability-warn";
  head.append(title, state);
  return head;
}

function renderTools(tools: RegisteredTool[]): void {
  const fragment = document.createDocumentFragment();
  fragment.append(renderHeader(`${tools.length} live tools`));

  const list = document.createElement("div");
  list.className = "capability-list";
  if (!tools.length) {
    const empty = document.createElement("div");
    empty.className = "capability-empty";
    empty.textContent = "Waiting for registered tools…";
    list.append(empty);
  } else {
    for (const tool of tools) {
      const row = document.createElement("div");
      row.className = `capability-tool ${tool.annotations?.readOnlyHint ? "is-read" : "is-write"}`;
      const origin = document.createElement("span");
      origin.className = "capability-origin";
      origin.textContent = originLabel(tool.origin);
      const name = document.createElement("code");
      name.textContent = tool.name;
      name.title = tool.title ?? tool.name;
      const mode = document.createElement("i");
      mode.textContent = tool.annotations?.readOnlyHint ? "READ" : "ACT";
      row.append(origin, name, mode);
      list.append(row);
    }
  }
  fragment.append(list);

  const foot = document.createElement("div");
  foot.className = "capability-foot";
  foot.append("Live from ");
  const getTools = document.createElement("code");
  getTools.textContent = "getTools()";
  foot.append(getTools, " + ");
  const toolchange = document.createElement("code");
  toolchange.textContent = "toolchange";
  foot.append(toolchange);
  fragment.append(foot);
  panel.replaceChildren(fragment);
}

function renderFailure(message: string): void {
  const fragment = document.createDocumentFragment();
  fragment.append(renderHeader("discovery blocked", true));
  const empty = document.createElement("div");
  empty.className = "capability-empty";
  empty.textContent = message;
  fragment.append(empty);
  panel.replaceChildren(fragment);
}

async function refreshCapabilitySurface(): Promise<void> {
  const generation = ++refreshGeneration;
  const context = getModelContext();
  if (!context?.getTools) {
    panel.replaceChildren(renderHeader("WebMCP unavailable", true));
    return;
  }

  try {
    const [local, remote] = await Promise.all([
      context.getTools(),
      context.getTools({ fromOrigins: Object.values(providerOrigins) }),
    ]);
    if (generation !== refreshGeneration) return;

    const unique = new Map<string, RegisteredTool>();
    for (const tool of [...local, ...remote]) {
      if (!tool || typeof tool.name !== "string") continue;
      unique.set(`${tool.origin ?? window.location.origin}|${tool.name}`, tool);
    }
    const tools = [...unique.values()].sort((left, right) => {
      const originOrder = originLabel(left.origin).localeCompare(originLabel(right.origin));
      return originOrder || left.name.localeCompare(right.name);
    });
    renderTools(tools);
  } catch (error) {
    renderFailure(error instanceof Error ? error.message : "Unable to query the live tool surface.");
  }
}

function scheduleRefresh(delayMs = 0): void {
  if (refreshTimer !== null) globalThis.clearTimeout(refreshTimer);
  refreshTimer = globalThis.setTimeout(() => {
    refreshTimer = null;
    void refreshCapabilitySurface();
  }, delayMs);
}

const capabilityContext = getModelContext();
if (typeof capabilityContext?.addEventListener === "function") {
  capabilityContext.addEventListener("toolchange", () => scheduleRefresh(35));
} else {
  refreshInterval = globalThis.setInterval(() => scheduleRefresh(), 500);
}
window.addEventListener("load", () => {
  scheduleRefresh();
  scheduleRefresh(700);
});
window.addEventListener("pagehide", () => {
  if (refreshTimer !== null) globalThis.clearTimeout(refreshTimer);
  if (refreshInterval !== null) globalThis.clearInterval(refreshInterval);
}, { once: true });
