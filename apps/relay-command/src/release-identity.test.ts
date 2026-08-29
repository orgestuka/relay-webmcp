import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@relay/webmcp-runtime";

const releaseSha = "1234567890abcdef1234567890abcdef12345678";
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalFetch = globalThis.fetch;

interface HarnessOptions {
  compiledSha?: string;
  edgeSha?: string | null;
  manifestSha?: string;
  manifestApp?: string;
  manifestSchema?: string;
  responseStatus?: number;
  responseBody?: string;
  fetchError?: Error;
}

async function importReleaseIdentity(options: HarnessOptions = {}): Promise<ToolDefinition> {
  vi.resetModules();
  vi.stubEnv("VITE_RELEASE_SHA", options.compiledSha ?? releaseSha);

  let registered: ToolDefinition | null = null;
  const modelContext = new EventTarget() as EventTarget & {
    registerTool(tool: ToolDefinition): Promise<void>;
  };
  modelContext.registerTool = async (tool) => {
    registered = tool;
  };

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: { modelContext },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: new URL("https://relay.example.test/"),
    },
  });

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: vi.fn(async () => {
      if (options.fetchError) throw options.fetchError;
      const body = options.responseBody ?? JSON.stringify({
        schema: options.manifestSchema ?? "relay.release.v1",
        app: options.manifestApp ?? "relay-command",
        title: "Relay Command",
        sha: options.manifestSha ?? releaseSha,
      });
      const headers = new Headers({ "Content-Type": "application/json" });
      const edgeSha = options.edgeSha === undefined ? releaseSha : options.edgeSha;
      if (edgeSha !== null) headers.set("X-Relay-Release", edgeSha);
      return new Response(body, {
        status: options.responseStatus ?? 200,
        headers,
      });
    }),
  });

  await import("./release-identity");
  await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  if (!registered) throw new Error("release identity tool did not register");
  return registered;
}

async function execute(tool: ToolDefinition): Promise<Record<string, unknown>> {
  const raw = await tool.execute({});
  if (typeof raw !== "string") throw new Error("release identity tool returned non-JSON output");
  return JSON.parse(raw) as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: originalDocument,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: originalWindow,
  });
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: originalFetch,
  });
});

describe("relay_get_release_identity", () => {
  it("passes only when compiled, edge and manifest identities match", async () => {
    const result = await execute(await importReleaseIdentity());

    expect(result).toMatchObject({
      ok: true,
      schema: "relay.release-identity.v1",
      app: "relay-command",
      origin: "https://relay.example.test",
      compiledSha: releaseSha,
      edgeHeaderRaw: releaseSha,
      edgeSha: releaseSha,
      responseStatus: 200,
      checks: {
        responseOk: true,
        compiledShaValid: true,
        edgeHeaderConsistent: true,
        edgeShaValid: true,
        manifestValid: true,
        allLayersConsistent: true,
      },
      manifestError: null,
      recovery: null,
    });
  });

  it("accepts repeated identical edge identity", async () => {
    const result = await execute(await importReleaseIdentity({
      edgeSha: `${releaseSha}, ${releaseSha.toUpperCase()}`,
    }));

    expect(result).toMatchObject({
      ok: true,
      edgeSha: releaseSha,
      checks: {
        edgeHeaderConsistent: true,
        allLayersConsistent: true,
      },
    });
  });

  it("rejects a different trusted-edge release header", async () => {
    const result = await execute(await importReleaseIdentity({
      edgeSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }));

    expect(result).toMatchObject({
      ok: false,
      compiledSha: releaseSha,
      edgeSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      checks: {
        responseOk: true,
        edgeHeaderConsistent: true,
        allLayersConsistent: false,
      },
    });
  });

  it("rejects conflicting duplicate trusted-edge headers", async () => {
    const conflicting = `${releaseSha}, ${"a".repeat(40)}`;
    const result = await execute(await importReleaseIdentity({ edgeSha: conflicting }));

    expect(result).toMatchObject({
      ok: false,
      edgeHeaderRaw: conflicting,
      edgeSha: null,
      checks: {
        edgeHeaderConsistent: false,
        edgeShaValid: false,
        allLayersConsistent: false,
      },
      manifestError: "conflicting X-Relay-Release response headers",
    });
  });

  it("rejects a manifest for the wrong application or commit", async () => {
    const wrongApp = await execute(await importReleaseIdentity({ manifestApp: "shelter-grid" }));
    expect(wrongApp).toMatchObject({
      ok: false,
      checks: { responseOk: true, manifestValid: false, allLayersConsistent: false },
    });

    const wrongSha = await execute(await importReleaseIdentity({
      manifestSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    }));
    expect(wrongSha).toMatchObject({
      ok: false,
      checks: { responseOk: true, manifestValid: true, allLayersConsistent: false },
    });
  });

  it("rejects placeholder build identity and missing edge identity", async () => {
    const placeholder = await execute(await importReleaseIdentity({
      compiledSha: "0000000000000000000000000000000000000000",
    }));
    expect(placeholder).toMatchObject({
      ok: false,
      checks: { responseOk: true, compiledShaValid: false, allLayersConsistent: false },
    });

    const missingEdge = await execute(await importReleaseIdentity({ edgeSha: null }));
    expect(missingEdge).toMatchObject({
      ok: false,
      edgeHeaderRaw: null,
      edgeSha: null,
      checks: {
        responseOk: true,
        edgeHeaderConsistent: false,
        edgeShaValid: false,
        allLayersConsistent: false,
      },
    });
  });

  it("rejects a non-success manifest response even when its body looks valid", async () => {
    const result = await execute(await importReleaseIdentity({ responseStatus: 503 }));

    expect(result).toMatchObject({
      ok: false,
      responseStatus: 503,
      checks: {
        responseOk: false,
        manifestValid: false,
        allLayersConsistent: false,
      },
      manifestError: "release manifest returned HTTP 503",
    });
  });

  it("returns machine-readable failure evidence when the manifest is unavailable", async () => {
    const result = await execute(await importReleaseIdentity({
      fetchError: new Error("synthetic network failure"),
    }));

    expect(result).toMatchObject({
      ok: false,
      edgeHeaderRaw: null,
      edgeSha: null,
      manifest: null,
      responseStatus: null,
      checks: {
        responseOk: false,
        edgeHeaderConsistent: false,
        allLayersConsistent: false,
      },
      manifestError: "synthetic network failure",
    });
  });
});
