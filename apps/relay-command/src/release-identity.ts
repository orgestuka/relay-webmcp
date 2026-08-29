import { registerTool, toolOutput } from "@relay/webmcp-runtime";
import { normalizeReleaseSha, validReleaseSha } from "./release-provenance";

const compiledSha = normalizeReleaseSha(import.meta.env.VITE_RELEASE_SHA);

async function readReleaseIdentity(): Promise<string> {
  let manifest: unknown = null;
  let manifestError: string | null = null;
  let edgeSha: string | null = null;
  let responseStatus: number | null = null;
  let responseOk = false;

  try {
    const response = await fetch("/release.json", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    responseStatus = response.status;
    responseOk = response.ok;
    edgeSha = normalizeReleaseSha(response.headers.get("x-relay-release")) || null;
    try {
      manifest = JSON.parse(await response.text()) as unknown;
    } catch (error) {
      manifestError = error instanceof Error ? error.message : "release manifest parse failed";
    }
    if (!response.ok && !manifestError) {
      manifestError = `release manifest returned HTTP ${response.status}`;
    }
  } catch (error) {
    manifestError = error instanceof Error ? error.message : "release manifest request failed";
  }

  const record = manifest && typeof manifest === "object" && !Array.isArray(manifest)
    ? manifest as Record<string, unknown>
    : null;
  const manifestSha = normalizeReleaseSha(record?.sha) || null;
  const compiledValid = validReleaseSha(compiledSha);
  const edgeValid = validReleaseSha(edgeSha);
  const manifestValid = responseOk
    && record?.schema === "relay.release.v1"
    && record?.app === "relay-command"
    && validReleaseSha(manifestSha);
  const consistent = compiledValid
    && edgeValid
    && manifestValid
    && compiledSha === edgeSha
    && edgeSha === manifestSha;

  return toolOutput({
    ok: consistent,
    schema: "relay.release-identity.v1",
    app: "relay-command",
    origin: window.location.origin,
    compiledSha: compiledSha || null,
    edgeSha,
    manifest,
    responseStatus,
    checks: {
      responseOk,
      compiledShaValid: compiledValid,
      edgeShaValid: edgeValid,
      manifestValid,
      allLayersConsistent: consistent,
    },
    manifestError,
    recovery: consistent
      ? null
      : "Deploy one exact clean commit across all four origins, confirm X-Relay-Release and /release.json, then reopen Relay in a fresh ChatGPT browser context.",
  });
}

void registerTool({
  name: "relay_get_release_identity",
  title: "Verify deployed Relay release identity",
  description: "Read the Relay Command release manifest and trusted edge header, then prove both match the immutable commit compiled into this application. Read-only.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, untrustedContentHint: false },
  execute: readReleaseIdentity,
}).catch((error) => {
  console.error("[Relay release identity] Tool registration failed", error);
});
