# ChatGPT release identity gate

This gate runs before any scenario action. It proves that ChatGPT is testing the exact reviewed commit rather than a stale page, mixed deployment or conflicting proxy response.

## Preconditions

The exact branch has already passed:

```bash
npm run gate:source
npm run gate:release -- --env .env.deploy
```

`.env.deploy` contains:

```env
RELAY_RELEASE_SHA=<exact output of git rev-parse HEAD>
```

Open Relay in a fresh ChatGPT built-in browser context.

## Exact instruction

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
  "edgeHeaderRaw": "<RELAY_RELEASE_SHA>",
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
    "edgeHeaderConsistent": true,
    "edgeShaValid": true,
    "manifestValid": true,
    "allLayersConsistent": true
  },
  "manifestError": null,
  "recovery": null
}
```

These values must identify the same commit:

```text
Git checkout HEAD
RELAY_RELEASE_SHA
compiledSha
one consistent X-Relay-Release value
/release.json manifest.sha
```

Repeated identical proxy headers may normalize to one value. Conflicting duplicate `X-Relay-Release` values fail with:

```text
edgeHeaderConsistent: false
manifestError: conflicting X-Relay-Release response headers
```

Store validation output under ignored runtime evidence:

```text
.relay-artifacts/chatgpt/01-release-identity.json
```

Record the test timestamp, ChatGPT build when visible, Relay URL, exact PR head SHA and fresh-context confirmation.

## Failure conditions

Any of these block the release:

- tool is not visible to ChatGPT
- HTTP response is not successful
- missing, malformed or conflicting `X-Relay-Release`
- missing or malformed `/release.json`
- manifest names another application
- any SHA is placeholder, malformed or different
- result came from Chrome, Playwright or the proof harness instead of ChatGPT

Do not continue to `relay_diagnose_webmcp` until this gate returns `ok: true`.
