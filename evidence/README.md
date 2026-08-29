# Relay evidence

Evidence is separated by execution environment. Never upgrade one evidence class into another in the submission narrative.

## Local source evidence

- `local-core-smoke-2026-08-29.json`
- `release-audit-2026-08-29.json`
- `release-modules-typecheck-2026-08-29.json`

The core smoke and hostile authorization audit prove pure PACT, policy and dynamic-capability properties against source reconstructed from the connected private branch.

The release-module evidence proves strict TypeScript compatibility and local registration-ledger behavior for the current WebMCP runtime and release diagnostics.

## Deterministic harness evidence

- `release-diagnostics-semantic-probe-2026-08-29.json`
- `compatibility-bridge-smoke-2026-08-29.json`

The diagnostic semantic probe proves that a provider tool counts as executable only when it returns a real semantic `{ "ok": true }` result. Listed tools that throw, return null, return malformed JSON or return `{ "ok": false }` fail closed.

The compatibility bridge smoke proves:

- fixed provider-origin and tool-name routing
- wrong-origin name collisions are ignored
- no generic execute-any capability exists
- rejected provider commits do not record approval evidence
- provider-accepted commits record the signed PACT capsule
- dynamic commit wrappers appear and disappear with the underlying provider capability

These local and harness files do **not** prove:

- a clean full checkout
- npm installation from the repository
- Vite production builds
- Docker or Caddy deployment
- four deployed HTTPS origins
- browser-level provider mutation
- actual ChatGPT compatibility

## GitHub Actions evidence

Current Actions runs have failed before runner allocation. The workflow job contains zero executed steps and no downloadable job log.

Treat this as:

```text
GITHUB_ACTIONS_INFRA_FAILURE
```

Do not label it as a code test failure or a successful verification run.

## Deployment evidence

Create only after four HTTPS origins are live:

```text
evidence/deployment/01-preflight.json
evidence/deployment/02-dns.json
evidence/deployment/03-https-smoke.json
```

## Actual ChatGPT evidence

Create only from ChatGPT's supported built-in browser:

```text
evidence/chatgpt/01-initial-diagnostic.json
evidence/chatgpt/02-provider-proposal-probes.json
evidence/chatgpt/03-capability-created.json
evidence/chatgpt/04-capability-torn-down.json
evidence/chatgpt/05-full-path.json
evidence/chatgpt/06-final-audit-bundle.json
evidence/chatgpt/07-partial-commit-recovery.json
```

Each file must preserve raw tool output and identify:

- deployed Relay URL
- test date
- ChatGPT desktop/browser build when visible
- branch commit SHA
- default fixed-bridge mode or `?direct=1`

Ordinary Chrome, Playwright, deterministic ModelContext doubles and Relay's optional proof console are harness evidence and must never be described as actual ChatGPT evidence.
