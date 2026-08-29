# WebMCP origin-isolation release invariant

Status: **mandatory release gate**

## Why this exists

WebMCP registration and discovery reject ordinary non-`file:` documents whose agent cluster is not origin-keyed. The observable failure is a `SecurityError` from `registerTool()` or `getTools()` before Relay can prove provider behavior.

Every command and provider document therefore requires:

```http
Origin-Agent-Cluster: ?1
```

This applies to all four origins and their relevant root, manifest, health and asset responses.

## Enforcement layers

### Local development and preview

Every Vite application applies the shared `webMcpHeaders` set in both `server.headers` and `preview.headers`.

### Application server

Nginx emits the origin-isolation header at server scope and repeats it inside every location that declares its own `add_header` set. This repetition is required because Nginx header inheritance resets when a child location owns headers.

### Public HTTPS edge

Caddy also sets the header on every public Relay hostname alongside the origin-aware CSP, WebMCP Permissions-Policy and release identity header.

The release is rejected when either internal static serving or the authoritative HTTPS edge silently loses the invariant.

### Command boot

Relay Command fails closed when:

```text
window.isSecureContext !== true
or
window.originAgentCluster === false
```

A non-local boot also requires a valid compiled release SHA before tools are registered.

### Machine-readable diagnostics

`relay_diagnose_webmcp` reports:

```json
{
  "environment": {
    "secureContext": true,
    "originAgentClusterSupported": true,
    "originAgentCluster": true,
    "originIsolationPass": true,
    "requiredHeader": "Origin-Agent-Cluster: ?1"
  }
}
```

Production `ok` cannot be true when origin isolation or deployed release identity fails.

### Source and deployment gates

```bash
npm run gate:source
npm run gate:release -- --env .env.deploy
```

The source gate verifies Vite, Nginx, Caddy, boot and diagnostic invariants. The full gate validates actual root, manifest, health and asset responses on all four HTTPS origins.

## Fresh-context requirement

Agent-cluster keying is decided when a document enters its browsing-context group. Adding the header after an origin was already opened may not repair the existing context.

After any isolation correction:

1. close the existing Relay tab or ChatGPT browser window
2. open Relay in a fresh ChatGPT browser context
3. call `relay_get_release_identity`
4. rerun `relay_diagnose_webmcp`

A simple refresh is not accepted as proof when the prior context loaded the origin without the header.

## Release pass condition

All conditions must hold simultaneously:

```text
all four HTTPS roots contain one consistent Origin-Agent-Cluster: ?1 value
all four /release.json responses preserve the header
health and static asset responses preserve the header
window.isSecureContext === true
window.originAgentCluster === true
registerTool available
getTools available
executeTool available
permanent Relay tools runtime-registered and client-visible
fixed read/proposal bridge ready
provider discovery passes
provider read probes return semantic ok:true
deployed release identity passes
```

Anything less is **DO NOT MERGE**.
