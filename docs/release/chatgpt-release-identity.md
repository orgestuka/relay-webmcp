# ChatGPT release identity gate

This gate runs before any WebMCP scenario action. It proves that ChatGPT is testing the exact commit intended for submission rather than a stale command page, mixed provider deployment or cached edge response.

## Preconditions

The deployed environment has already passed:

```bash
npm run deploy:check
npm run deploy:check:dns
docker compose --env-file .env.deploy up -d
npm run deploy:smoke
```

The `.env.deploy` value below must equal `git rev-parse HEAD` for the clean checkout used to build the release:

```env
RELAY_RELEASE_SHA=<40-character commit SHA>
```

Open Relay in a fresh ChatGPT built-in browser context.

## Exact ChatGPT instruction

```text
On the open Relay page, call relay_get_release_identity with an empty object.
Return the raw tool result JSON without summarizing it.
```

## Required result

```json
{
  "ok": true,
  "schema": "relay.release-identity.v1",
  "app": "relay-command",
  "origin": "https://<RELAY_HOST>",
  "compiledSha": "<RELAY_RELEASE_SHA>",
  "edgeSha": "<RELAY_RELEASE_SHA>",
  "manifest": {
    "schema": "relay.release.v1",
    "app": "relay-command",
    "sha": "<RELAY_RELEASE_SHA>"
  },
  "responseStatus": 200,
  "checks": {
    "responseOk": true,
    "compiledShaValid": true,
    "edgeShaValid": true,
    "manifestValid": true,
    "allLayersConsistent": true
  },
  "manifestError": null,
  "recovery": null
}
```

The following values must be identical:

```text
Git checkout HEAD
RELAY_RELEASE_SHA
compiledSha
X-Relay-Release / edgeSha
/release.json manifest.sha
```

Save the raw result as:

```text
evidence/chatgpt/00-release-identity.json
```

Record alongside it:

- test timestamp
- ChatGPT desktop/browser build when visible
- Relay URL
- PR head SHA
- whether a fresh browser context was used

## Failure conditions

Any of these fail the release gate:

- tool is not visible to ChatGPT
- HTTP response is not successful
- missing or malformed `X-Relay-Release`
- missing or malformed `/release.json`
- manifest names another application
- any SHA is a placeholder, malformed or different
- response was produced by Chrome, Playwright or the proof harness rather than ChatGPT

A mismatch usually means one of:

- one origin was not rebuilt
- Caddy still serves an older container
- the browser reused a cached browsing context
- `.env.deploy` contains a different SHA from the checkout
- deployment happened from a dirty or different branch

Do not continue to `relay_diagnose_webmcp` until this gate returns `ok: true`.
