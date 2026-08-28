import "./capability-surface.css";
import type { ProviderId } from "@relay/contracts";

interface RegisteredToolView {
  name: string;
  title?: string;
  origin: string;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
}

const origins: Record<ProviderId, string> = {
  shelter: import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174",
  transit: import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175",
  supply: import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176",
};

const panel = document.createElement("aside");
panel.className = "capability-surface";
panel.innerHTML = `<div class="capability-head"><span>AGENT CAPABILITY SURFACE</span><b>booting</b></div>`;
document.body.append(panel);

let refreshGeneration = 0;

function originLabel(origin: string): string {
  if (origin === window.location.origin) return "Relay";
  if (origin === origins.shelter) return "Shelter";
  if (origin === origins.transit) return "Transit";
  if (origin === origins.supply) return "Supply";
  return new URL(origin).hostname;
}

async function refreshCapabilitySurface(): Promise<void> {
  const generation = ++refreshGeneration;
  const context = document.modelContext;
  if (!context?.getTools) {
    panel.innerHTML = `<div class="capability-head"><span>AGENT CAPABILITY SURFACE</span><b class="capability-warn">WebMCP unavailable</b></div>`;
    return;
  }

  try {
    const raw = await context.getTools({ fromOrigins: Object.values(origins) });
    if (generation !== refreshGeneration) return;
    const tools = (raw as RegisteredToolView[]).sort((a, b) => a.origin.localeCompare(b.origin) || a.name.localeCompare(b.name));
    panel.innerHTML = `
      <div class="capability-head"><span>AGENT CAPABILITY SURFACE</span><b>${tools.length} live tools</b></div>
      <div class="capability-list">
        ${tools.map((tool) => `<div class="capability-tool ${tool.annotations?.readOnlyHint ? "is-read" : "is-write"}">
          <span class="capability-origin">${originLabel(tool.origin)}</span>
          <code>${tool.name}</code>
          <i>${tool.annotations?.readOnlyHint ? "READ" : "ACT"}</i>
        </div>`).join("") || `<div class="capability-empty">Waiting for registered tools…</div>`}
      </div>
      <div class="capability-foot">Driven by <code>getTools()</code> + <code>toolchange</code></div>`;
  } catch (error) {
    panel.innerHTML = `<div class="capability-head"><span>AGENT CAPABILITY SURFACE</span><b class="capability-warn">discovery blocked</b></div><div class="capability-empty">${error instanceof Error ? error.message : "Unable to query tool surface"}</div>`;
  }
}

document.modelContext?.addEventListener("toolchange", () => {
  void refreshCapabilitySurface();
});

window.addEventListener("load", () => {
  void refreshCapabilitySurface();
  window.setTimeout(() => void refreshCapabilitySurface(), 700);
});
