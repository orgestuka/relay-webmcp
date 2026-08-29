# WebMCP origin-isolation release invariant

Status: **mandatory release gate**

## Why this exists

The current WebMCP registration and discovery algorithms reject ordinary non-`file:` documents whose agent cluster is not origin-keyed. The observable failure is a `SecurityError` from `registerTool()` or `getTools()` before Relay can prove any provider behavior.

Relay therefore requires every command and provider document to run with:

```http
Origin-Agent-Cluster: ?1
```

This is required on all four origins:

```text
Relay Command
Shelter Grid
Transit Ops
Supply Hub
```

## Enforcement layers

### Local development and preview

Every Vite application sets the header in both `server.headers` and `preview.headers`.

### Production

The shared Caddy edge sets the header for every Relay hostname. App containers remain private behind Caddy, so the authoritative browser response is the Caddy response.

### Command boot

Relay Command fails closed when the browser explicitly reports:

```ts
window.originAgentCluster === false
```

It also rejects non-secure production contexts.

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

`ok` cannot be `true` when `originIsolationPass` is false.

### Source and deployment gates

```bash
npm run check:origin-isolation
npm run deploy:smoke
```

The first command verifies that the source configuration cannot silently lose the invariant. The deployed smoke test verifies the actual response header on all four HTTPS origins.

## Fresh-context requirement

Agent-cluster keying is decided when a document enters its browsing context group. Adding the header after the origin was already opened may not repair the existing context.

After changing or fixing the header:

1. close the existing Relay tab or ChatGPT browser window
2. open Relay in a fresh ChatGPT browser context
3. rerun `relay_diagnose_webmcp`

A simple page refresh is not accepted as proof when the prior context loaded the origin without the header.

## Release pass condition

All conditions must hold simultaneously:

```text
four HTTPS responses contain Origin-Agent-Cluster: ?1
window.isSecureContext === true
window.originAgentCluster === true
registerTool available
getTools available
executeTool available
Relay tools client-visible
provider discovery passes
provider read probes return semantic ok:true
```

Anything less is **DO NOT MERGE**.
