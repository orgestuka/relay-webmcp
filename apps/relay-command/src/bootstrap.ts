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

async function boot(): Promise<void> {
  const command = parseSecureOrigin(window.location.origin, "Relay Command");
  const commandIsLocal = isLocalHost(command.hostname);
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

  await import("./command-app");
  await import("./capability-surface");
  await import("./demo-agent");
}

void boot().catch((error) => {
  console.error("Relay boot rejected", error);
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;
  app.textContent = error instanceof Error ? `Relay configuration rejected: ${error.message}` : "Relay configuration rejected.";
  app.setAttribute("role", "alert");
});
