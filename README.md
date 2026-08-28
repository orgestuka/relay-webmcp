# Relay WebMCP

**Human-governed operations for the agentic web.**

> One objective. Four independent origins. Six consequential operations. One exact human decision.

Relay lets an agent compose work across independent WebMCP websites while the human retains precise authority over execution.

The reference scenario coordinates a 42-person flood evacuation across:

- **Relay Command**: shared incident, plan, consent and provenance surface
- **Shelter Grid**: independent bed inventory and reservations
- **Transit Ops**: independent standard and wheelchair-accessible transport
- **Supply Hub**: independent evacuation and medical supplies

The agent may discover capacity, create non-binding proposals and stage a cross-provider plan. It cannot consume capacity until the human approves the exact operation set, provider origins, state versions and cost ceiling.

## The thesis

WebMCP makes websites callable by agents. Relay explores the next systems problem:

> What should the web become when one human objective spans multiple independent sites and some actions are consequential?

Relay's answer is **PACT**:

> **Propose → Amend → Consent → Transact**

The agent is the composer. The websites remain visible state and execution boundaries. The human is the authority.

Relay is not a chatbot embedded in a dashboard. The browser itself coordinates a federated capability surface across independent origins.

## What the demo proves

A successful run demonstrates all of the following in one legible workflow:

1. A top-level page discovers tools exposed by three descendant provider origins.
2. The agent queries live, versioned provider state.
3. Provider proposals are non-binding and expire automatically.
4. Relay validates deterministic incident constraints before consent is possible.
5. The human can amend the maximum authority without giving the agent blanket permission.
6. `relay_request_approval` remains suspended while the human decides.
7. Human approval produces a short-lived P-256 signed PACT token.
8. Providers independently verify the exact signed scope before mutation.
9. Each provider commits its complete same-origin batch atomically.
10. Origin-bound receipts converge the shared plan to `COMMITTED`.

The failure path is equally important:

1. The agent stages a valid plan.
2. Shelter Grid changes capacity before consent.
3. Its state version advances and every old shelter proposal is invalidated.
4. Relay marks the plan `STALE`.
5. The approval call resolves with a failure result.
6. The stale provider commit capability disappears.
7. The agent must re-query, re-propose and restage.

Stale plans fail closed.

## Built-in live WebMCP proof

Relay includes a judge-facing proof console in `apps/relay-command/src/demo-agent.ts`.

The proof runner is deliberately constrained. It may only use:

```ts
document.modelContext.getTools()
document.modelContext.executeTool()
```

It does not import Relay state, provider inventories, proposal maps, signing keys or commit functions. It discovers and invokes the same WebMCP tools available to an external agent.

The proof console can execute either:

- the complete approval and commit path
- the stale-state path when a human injects a provider disruption during consent
- the human-rejection path

This is an evaluation harness, not a substitute for the ChatGPT demonstration. It gives judges a deterministic way to verify that the product actually depends on the WebMCP capability layer.

## Canonical evacuation plan

The deterministic success path stages six exact operations:

| Provider | Operation | Quantity | Cost |
| --- | --- | ---: | ---: |
| Shelter Grid | East Shelter beds | 18 | €180 |
| Shelter Grid | South Shelter beds | 24 | €216 |
| Transit Ops | Rapid Bus seats | 32 | €928 |
| Transit Ops | Accessible shuttle seats | 10 | €680 |
| Supply Hub | Evacuation kits | 42 | €504 |
| Supply Hub | Mobility medical kits | 9 | €225 |
|  | **Total** |  | **€2,733** |

The plan satisfies these hard constraints:

- all 42 residents receive shelter
- all 42 residents receive transport
- at least 9 wheelchair-accessible positions are available
- North Shelter retains at least 20 beds
- every resident receives an evacuation kit
- all 9 mobility-constrained residents receive a medical kit
- total cost remains within the human authority ceiling

## PACT authorization capsule

Human approval does not mean:

> Do whatever is necessary to complete the objective.

It means:

> Execute these exact operations, at these exact origins and state versions, before this expiry, beneath this total authority ceiling.

Each signed proposal scope binds:

- proposal ID
- provider ID
- provider origin
- resource ID and human-readable label
- quantity and unit
- unit cost and maximum cost
- purpose
- provider state version
- proposal expiry

The plan hash additionally binds:

- plan ID
- incident ID
- human-visible summary
- human-visible rationale
- plan revision
- maximum authority
- the sorted exact proposal scopes

The private signing key remains inside Relay Command memory and is never exposed as a WebMCP tool.

## PACT invariants

A provider commit succeeds only when every invariant holds:

1. The approval signature verifies against the trusted Relay session public key.
2. The approval belongs to the active Relay session.
3. The approval and every included proposal are still live.
4. The aggregate signed scope cost does not exceed the human ceiling.
5. Every scope has internally consistent quantity and cost arithmetic.
6. The proposal ID, provider, origin, resource, quantity, unit, price, purpose, version and expiry exactly match.
7. The commit contains every approved proposal for that provider exactly once.
8. Every proposal still targets the provider's current state version.
9. The provider still has capacity for the entire local batch.
10. No mutation occurs until all checks pass.

Any provider state advance invalidates every outstanding proposal from its previous version.

## Dynamic WebMCP surface

Tool availability communicates application state:

```text
DRAFT
  relay_request_approval absent

VALIDATED
  relay_request_approval available

AWAITING_APPROVAL
  agent call suspended on human decision

APPROVED
  exact provider commit tools available

STALE / REJECTED / COMMITTED
  obsolete authority tools removed
```

Provider commit tools also disappear when proposals expire, commit or become stale. `AbortSignal` is used as the capability revocation mechanism.

A live capability panel listens for `toolchange` and renders the current federated tool surface without trusting tool metadata as HTML.

## Browser trust boundaries

Relay Command and all three providers must run on distinct origins.

The command boot gate rejects:

- duplicated provider origins
- a provider sharing the Relay Command origin
- non-HTTPS production origins
- production pages configured to delegate tools to localhost

Cross-origin state messages are accepted only when both conditions hold:

- `event.origin` equals the configured provider origin
- `event.source` equals that provider's exact persistent iframe

Provider iframes are mounted once. They are never recreated during planning, approval or commit, so their proposal state and dynamic WebMCP registrations remain stable.

Providers accept a Relay public key only from their configured parent origin. They reject malformed keys, private key material and same-session public-key substitution.

## Architecture

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Relay Command                                                      │
│                                                                     │
│  Incident constraints      Ephemeral P-256 signer                  │
│  Cross-provider plan       Human consent sheet                     │
│  Provenance stream         Live WebMCP proof runner                │
│                                                                     │
│  WebMCP tools:                                                      │
│  relay_get_incident                                                │
│  relay_get_mesh_state                                              │
│  relay_stage_plan                                                  │
│  relay_get_plan                                                    │
│  relay_request_approval  [dynamic]                                 │
│                                                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐     │
│  │ Shelter Grid     │ │ Transit Ops      │ │ Supply Hub       │     │
│  │ independent      │ │ independent      │ │ independent      │     │
│  │ origin           │ │ origin           │ │ origin           │     │
│  │ allow="tools"    │ │ allow="tools"    │ │ allow="tools"    │     │
│  │ search/propose/  │ │ search/propose/  │ │ search/propose/  │     │
│  │ commit           │ │ commit           │ │ commit           │     │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘
```

Agent actuation uses WebMCP. Explicit-origin `postMessage` synchronizes human-visible provider state and receipts into Relay Command.

See:

- [`docs/architecture.md`](docs/architecture.md)
- [`docs/pact-v0.1.md`](docs/pact-v0.1.md)
- [`docs/threat-model.md`](docs/threat-model.md)
- [`docs/evaluation.md`](docs/evaluation.md)
- [`docs/demo-script.md`](docs/demo-script.md)

## Run locally

Requirements:

- Node.js 22+
- a browser surface with WebMCP testing enabled

```bash
npm install
npm run verify
npm run dev
```

`npm run verify` runs:

```text
TypeScript validation
→ adversarial protocol and lifecycle tests
→ production builds for all four applications
```

Local origins:

| Application | Origin |
| --- | --- |
| Relay Command | `http://localhost:5173` |
| Shelter Grid | `http://localhost:5174` |
| Transit Ops | `http://localhost:5175` |
| Supply Hub | `http://localhost:5176` |

The different ports intentionally create different origins.

## Production configuration

Relay Command:

```env
VITE_SHELTER_ORIGIN=https://shelter.example.com
VITE_TRANSIT_ORIGIN=https://transit.example.com
VITE_SUPPLY_ORIGIN=https://supply.example.com
```

Each provider:

```env
VITE_RELAY_ORIGIN=https://relay.example.com
```

All four production applications require HTTPS and distinct origins.

## Repository map

```text
apps/
  relay-command/       command, plan, consent, provenance and proof surface
  shelter-grid/        independent shelter provider
  transit-ops/         independent transport provider
  supply-hub/          independent supply provider
packages/
  contracts/           shared protocol and message types
  pact/                canonicalization, hashing, signing and verification
  webmcp-runtime/      registration and race-safe dynamic tool lifecycle
  provider-runtime/    versioned proposal and atomic commit state machine
  simulation/          deterministic incident data and policy engine
docs/
  architecture.md
  pact-v0.1.md
  threat-model.md
  evaluation.md
  demo-script.md
  judging.md
```

## Security posture and non-claims

Relay is a competition reference implementation, not production emergency infrastructure.

It demonstrates a narrower, testable claim:

> Independent WebMCP sites can be composed into one human-governed workflow while exact consent, origin scope, capability revocation and stale-state protection remain visible and enforceable.

Relay does not claim:

- distributed ACID transactions across unrelated websites
- production-grade emergency dispatch reliability
- durable user identity or non-repudiation
- safety after arbitrary code execution on a trusted origin

A production system would move signing into an authenticated service or hardware-backed key, add durable audit storage and use domain-specific compensation for cross-origin partial failure.

## Competition status

- [x] four-origin federated application
- [x] imperative WebMCP discovery and proposal tools
- [x] dynamic approval and commit capabilities
- [x] deterministic constraint engine
- [x] suspended human approval call
- [x] exact P-256 signed PACT authorization
- [x] complete same-origin atomic batches
- [x] automatic proposal expiry and capability revocation
- [x] stale-state failure and recovery path
- [x] persistent provider frames and source-bound messaging
- [x] judge-facing live WebMCP proof runner
- [x] adversarial protocol, policy and lifecycle tests
- [ ] recorded supported-browser evidence
- [ ] production URLs
- [ ] final public three-minute video

## License

MIT.
