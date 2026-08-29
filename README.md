# Relay WebMCP

**Human-governed operations for the agentic web.**

> One objective. Three independent provider websites. Six consequential operations. One exact human decision.

Relay coordinates a 42-person flood evacuation across:

- **Shelter Grid**: bed inventory and reservations
- **Transit Ops**: standard and wheelchair-accessible transport
- **Supply Hub**: evacuation and mobility medical supplies

The agent can discover live capacity, create non-binding proposals and stage a cross-provider plan. It cannot consume provider capacity until the human approves the exact operations, origins, provider versions and total authority ceiling.

Relay's protocol is **PACT**:

> **Propose → Amend → Consent → Transact**

The agent composes. The human authorizes. Each website independently verifies and executes its own scope.

## Why WebMCP matters

Without WebMCP, Relay would either centralize every provider behind one backend or rely on brittle visual automation.

With WebMCP:

- each visible provider website owns its own narrow capabilities
- provider tools execute inside the provider document
- provider origins remain independently identifiable
- tool availability changes when provider state changes
- the human sees the same provider state the agent operates
- obsolete capabilities can be revoked through the tool lifecycle

Relay uses WebMCP as a browser capability system, not as a button alias.

## ChatGPT compatibility architecture

OpenAI currently documents that tools provided only by embedded content are not directly supported by ChatGPT's site-tools client.

Relay therefore keeps the providers as independent WebMCP documents and exposes a **strict fixed top-level bridge** from Relay Command.

Each wrapper is hard-bound to:

```text
one provider origin
+ one provider tool name
+ one explicit input schema
```

There is no arbitrary origin parameter and no generic `execute any tool` wrapper.

The bridge:

1. discovers the exact provider tool with `getTools({ fromOrigins })`
2. registers a fixed Relay wrapper only while that provider tool exists
3. invokes the provider tool with `executeTool()`
4. unregisters the wrapper when the provider capability expires, commits or becomes stale

Provider-side PACT verification remains authoritative. The bridge cannot sign approval, bypass state versions or mutate inventory directly.

Use the normal Relay URL for judging. `?direct=1` disables the bridge only for controlled compatibility diagnosis.

## Canonical scenario

The initial valid plan contains six operations:

| Provider | Operation | Quantity | Cost |
| --- | --- | ---: | ---: |
| Shelter Grid | East Shelter | 18 beds | €180 |
| Shelter Grid | South Shelter | 24 beds | €216 |
| Transit Ops | Rapid Bus 32 | 32 seats | €928 |
| Transit Ops | Access Shuttle 10 | 10 accessible seats | €680 |
| Supply Hub | Evacuation Kits | 42 kits | €504 |
| Supply Hub | Mobility Medical Kits | 9 kits | €225 |
|  | **Total** |  | **€2,733** |

Hard constraints:

- shelter all 42 residents
- transport all 42 residents
- provide at least 9 wheelchair-accessible positions
- keep at least 20 beds unallocated at North Shelter
- provide 42 evacuation kits
- provide 9 mobility medical kits
- remain under the human authority ceiling
- commit nothing before explicit human approval

## The memorable failure path

1. The agent stages a valid plan.
2. The human lowers authority to €3,000.
3. The agent calls `relay_request_approval` and pauses.
4. Shelter capacity changes while consent is pending.
5. Shelter Grid advances its state version and deletes old proposals.
6. The stale plan is invalidated.
7. The approval and shelter commit capabilities disappear.
8. The agent re-queries and replaces only stale shelter work.
9. The human approves the recovered exact scopes.
10. Providers independently verify, commit and issue receipts.

The recovered shelter plan uses:

```text
East Shelter    18 beds
South Shelter   12 beds
North Shelter   12 beds
```

Recovered total: **€2,793**. North Shelter retains 34 beds.

## PACT authorization

Human approval signs an ephemeral ECDSA P-256 authorization capsule.

Every proposal scope binds:

- proposal ID
- provider ID and exact origin
- resource ID and visible label
- quantity and unit
- unit cost and maximum cost
- purpose
- provider state version
- proposal expiry

The plan hash also binds:

- plan ID and incident ID
- human-visible summary and rationale
- plan revision
- total authority ceiling
- sorted proposal scopes

The private key remains in Relay Command memory and is never exposed as a WebMCP tool.

Each provider independently rejects:

- missing or invalid signatures
- wrong sessions
- wrong origins
- changed operation arguments
- stale state versions
- expired proposals or approval
- aggregate authority escalation
- incomplete same-origin batches
- insufficient current capacity

A same-origin batch mutates nothing unless every local check passes.

Relay does **not** claim distributed ACID atomicity across unrelated websites. Cross-origin partial completion is represented through origin-bound receipts and must be handled by compensation or recovery in a production protocol.

## Machine-readable release tools

Relay Command exposes:

### `relay_diagnose_webmcp`

Returns:

- registration API availability
- Relay tool registration state
- provider-origin discovery state
- read-only execution probes against all providers
- fixed bridge status
- `toolchange` capture history
- dynamic capability creation and teardown evidence

### `relay_get_audit_bundle`

Captures the final plan and mesh state and binds them to a canonical SHA-256 digest.

### `relay_bridge_status`

Shows the exact fixed origin-to-tool mappings and which wrappers are currently active.

## Repository architecture

```text
apps/
  relay-command/       command, policy, consent, diagnostics and audit
  shelter-grid/        independent shelter provider
  transit-ops/         independent transport provider
  supply-hub/          independent supply provider
packages/
  contracts/           shared protocol types
  pact/                canonicalization, hashing, signing and verification
  webmcp-runtime/      registration and race-safe dynamic capability lifecycle
  provider-runtime/    versioned proposal and atomic local commit runtime
  simulation/          deterministic data and hard-constraint policy
scripts/
  integrity-smoke.ts
  release-audit.ts
  deploy-preflight.mjs
  deployment-smoke.mjs
deploy/
  Dockerfile
  Caddyfile
  nginx.conf
  entrypoint.sh
docs/
  chatgpt-validation.md
  submission-readiness.md
  demo-script.md
  pact-v0.1.md
  threat-model.md
```

## Local verification

Requirements:

- Node.js 22
- npm 10

```bash
npm install --no-audit --no-fund
npm run verify
```

`npm run verify` runs:

```text
TypeScript validation
→ dependency-free PACT smoke
→ hostile authorization audit
→ unit and adversarial tests
→ all four production builds
```

Local development:

```bash
npm run dev
```

Local origins:

| Application | Origin |
| --- | --- |
| Relay Command | `http://localhost:5173` |
| Shelter Grid | `http://localhost:5174` |
| Transit Ops | `http://localhost:5175` |
| Supply Hub | `http://localhost:5176` |

## Four-origin HTTPS deployment

Relay ships a Caddy and Docker Compose stack. Four real hostnames must resolve to the deployment server.

```bash
cp .env.deploy.example .env.deploy
# replace every placeholder

npm run deploy:check
npm run deploy:check:dns

docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
docker compose --env-file .env.deploy ps

npm run deploy:smoke
```

Caddy obtains HTTPS certificates and routes each hostname to a separate static application container.

Exact deployment and ChatGPT validation steps:

- [`docs/chatgpt-validation.md`](docs/chatgpt-validation.md)
- [`docs/submission-readiness.md`](docs/submission-readiness.md)

## Actual ChatGPT validation gate

A browser harness is not sufficient evidence.

Before merge, the deployed Relay URL must be opened in ChatGPT's supported built-in browser and must prove:

- Relay tools register
- all three provider origins are discoverable by Relay Command
- provider tools execute, not merely list
- one real discovery and proposal call succeeds against every provider
- dynamic wrappers appear and disappear with `toolchange`
- the full human approval and provider commit path completes
- final receipts and audit digest are captured

Use this exact command in ChatGPT:

```text
On the open Relay page, call relay_diagnose_webmcp with:
{"executeReadProbes":true}
Return the raw tool result JSON without summarizing it.
```

Do not merge PR #1 until the raw deployed ChatGPT evidence passes.

## Demo recording

The final script targets 2:45 and leaves margin beneath three minutes:

- [`docs/demo-script.md`](docs/demo-script.md)

A **Reset scenario** control reloads all four deterministic browser documents.

The optional proof console is disabled in the judging URL and can be enabled only with:

```text
?proof=1
```

It is harness evidence, not actual ChatGPT evidence.

## Release discipline

- `main` remains frozen
- all release work stays on `build/pact-vertical-slice`
- PR #1 remains draft until every external gate passes
- merge through PR #1 only
- preserve history
- create the submission tag only after merge

Current recommendation is recorded in:

- [`docs/submission-readiness.md`](docs/submission-readiness.md)

## License

MIT.
