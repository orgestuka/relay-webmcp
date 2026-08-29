import { assertCompiledReleaseSha } from "./release-provenance";

const configuredOrigins = [
  import.meta.env.VITE_SHELTER_ORIGIN || "http://localhost:5174",
  import.meta.env.VITE_TRANSIT_ORIGIN || "http://localhost:5175",
  import.meta.env.VITE_SUPPLY_ORIGIN || "http://localhost:5176",
];

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function parseSecureOrigin(value: string, label: string): URL {
  const url = new URL(value, window.location.href);
  const local = isLocalHost(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
    throw new Error(`${label} must use HTTPS outside local development.`);
  }
  if (url.origin !== value && !value.startsWith("/")) {
    throw new Error(`${label} must be an origin without a path, query or fragment.`);
  }
  return url;
}

function assertWebMcpEnvironment(): void {
  if (!window.isSecureContext) {
    throw new Error("WebMCP requires a secure context. Use HTTPS, or localhost for local development.");
  }

  // The current WebMCP algorithms reject registration and discovery when the
  // document is not running in an origin-keyed agent cluster. The property is
  // feature-detected so an older experimental client can still expose a useful
  // compatibility failure through the normal diagnostics.
  if ("originAgentCluster" in window && window.originAgentCluster !== true) {
    throw new Error(
      "WebMCP requires an origin-keyed agent cluster. Serve every Relay origin with "
      + "Origin-Agent-Cluster: ?1, then reopen Relay in a fresh ChatGPT browser context.",
    );
  }
}

async function boot(): Promise<void> {
  assertWebMcpEnvironment();

  const command = parseSecureOrigin(window.location.origin, "Relay Command");
  const commandIsLocal = isLocalHost(command.hostname);
  const compiledReleaseSha = assertCompiledReleaseSha(import.meta.env.VITE_RELEASE_SHA, {
    localDevelopment: commandIsLocal,
  });
  if (compiledReleaseSha) document.documentElement.dataset.releaseSha = compiledReleaseSha;

  const providers = configuredOrigins.map((value, index) => parseSecureOrigin(value, `Provider ${index + 1}`));
  const origins = providers.map((provider) => provider.origin);

  if (new Set(origins).size !== origins.length) {
    throw new Error("Every WebMCP provider must run on a distinct origin.");
  }
  if (origins.includes(command.origin)) {
    throw new Error("Provider origins must be independent from Relay Command.");
  }
  if (!commandIsLocal && providers.some((provider) => isLocalHost(provider.hostname))) {
    throw new Error("A production Relay page cannot delegate tools to localhost providers.");
  }

  const params = new URLSearchParams(window.location.search);
  const directOnly = params.get("direct") === "1";
  const proofEnabled = params.get("proof") === "1" || import.meta.env.VITE_ENABLE_PROOF_RUNNER === "1";

  // Install the authority input guard before relay_stage_plan is registered.
  // The last human-confirmed ceiling then survives stale-plan recovery even if
  // an agent later requests the original €5,000 incident maximum.
  const { installAuthorityGuard } = await import("./authority-guard");
  installAuthorityGuard();

  await import("./command-app");

  // OpenAI's current site-tools client does not expose tools provided only by
  // embedded content. Relay therefore enables a fixed top-level bridge by
  // default. Bound its initial registration race before diagnostics become
  // callable so a fast first ChatGPT probe does not observe a false negative.
  if (!directOnly) {
    await import("./compatibility-bridge");
    const { waitForInitialBridgeSurface } = await import("./bridge-readiness");
    const readiness = await waitForInitialBridgeSurface();
    if (!readiness.pass) {
      console.warn("[Relay bridge] Initial capability surface is incomplete", readiness);
    }
  }

  // Release identity is part of the permanent compatibility surface. Register
  // it before diagnostics so the first diagnostic cannot observe a transiently
  // incomplete tool set.
  await import("./release-identity");
  await import("./release-diagnostics");
  await import("./capability-surface");
  await import("./fault-injection");
  await import("./scenario-reset");

  // Keep the deterministic proof console out of the judging shot unless it is
  // explicitly requested. It is harness evidence, not ChatGPT evidence.
  if (proofEnabled) await import("./demo-agent");
}

void boot().catch((error) => {
  console.error("Relay boot rejected", error);
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  app.textContent = error instanceof Error ? `Relay configuration rejected: ${error.message}` : "Relay configuration rejected.";
  app.setAttribute("role", "alert");
});
