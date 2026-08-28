# Relay WebMCP

**Human-governed operations for the agentic web.**

Relay is a federated WebMCP command surface that lets an agent compose actions across independent websites while a human retains precise authority over consequential execution.

The demo coordinates a 42-person flood evacuation across three independently hosted WebMCP providers:

- **Shelter Grid** — bed inventory and reservations
- **Transit Ops** — standard and wheelchair-accessible transport
- **Supply Hub** — evacuation and medical kits

The agent can discover capacity, create non-binding proposals and stage a cross-provider plan. It **cannot commit the plan until a human explicitly approves the exact proposal set, provider state versions and cost ceiling**.

## Why Relay exists

WebMCP makes websites callable by agents. Relay explores the next systems problem: what happens when one user objective spans multiple independent origins and some actions are consequential?

Relay's answer is **PACT**:

> **Propose → Amend → Consent → Transact**

The browser remains the visible state, trust and execution layer. The agent is the composer. The human is the authority.

## The three-minute demo

Use this prompt in ChatGPT's in-app browser:

> Evacuate all 42 Riverside residents before 18:00. Cover at least 9 wheelchair-accessible passengers, preserve 20 beds at North Shelter and stay under €5,000. Prepare everything, but do not commit any reservation until I approve the exact plan.

A strong path is:

1. `relay_get_incident`
2. Query all three provider origins using their read-only WebMCP tools.
3. Create non-binding provider proposals.
4. `relay_stage_plan` with those exact proposal IDs.
5. The human may tighten the authority cap in Relay.
6. `relay_request_approval` suspends agent execution and opens the human consent sheet.
7. The human approves. Relay returns a two-minute, session-bound ECDSA P-256 approval token.
8. Commit each provider's scoped proposal batch with that token.
9. Each provider verifies the signature, session, origin scope, proposal state version and cost ceiling before committing.

### Failure/recovery moment

Before approval, click **Inject disruption** in Shelter Grid. South Shelter drops from 24 beds to 12 and advances its provider state version.

Relay immediately marks the staged plan **STALE**. The shelter commit capability disappears because its old proposals are no longer committable. The agent must re-query, re-propose and restage against the new state.

This is deliberate: stale plans fail closed.

## WebMCP leverage

Relay uses WebMCP as a systems primitive rather than a button shortcut:

- top-level Relay tools plus descendant cross-origin provider tools
- `allow="tools"` permission delegation on provider iframes
- explicit `exposedTo` origin gating for in-page cross-origin access
- `readOnlyHint` annotations on discovery/state tools
- imperative tools for stateful proposal and transaction flows
- **dynamic tool lifecycles** using `AbortSignal`
- agent-visible provider state versions
- suspended async tool execution for human approval
- visible state mutation in the same pages whose tools the agent invokes

## PACT invariants

A provider commit succeeds only when all of these hold:

1. The proposal exists and has not expired.
2. The proposal's provider state version still equals the live version.
3. The approval token belongs to the current Relay session.
4. The token has not expired.
5. The exact proposal ID, provider ID, provider origin, state version and maximum cost are inside the approved scope.
6. The token verifies against the Relay session public key previously established from the trusted parent origin.
7. The provider still has enough capacity for the **entire same-origin batch**.

All proposals in one provider commit are applied atomically. If one fails validation, none of that provider's capacity changes.

## Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│ relay-command :5173                                                │
│                                                                    │
│ WebMCP: relay_get_incident                                         │
│         relay_get_mesh_state                                       │
│         relay_stage_plan                                           │
│         relay_request_approval  ← dynamically registered           │
│         relay_get_plan                                             │
│                                                                    │
│ Ephemeral P-256 session signer                                     │
│ Human approval surface                                             │
│ Provenance + plan state                                            │
│                                                                    │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐          │
│  │ Shelter Grid   │ │ Transit Ops    │ │ Supply Hub     │          │
│  │ :5174          │ │ :5175          │ │ :5176          │          │
│  │ allow="tools"  │ │ allow="tools"  │ │ allow="tools"  │          │
│  │ versioned      │ │ versioned      │ │ versioned      │          │
│  │ propose/commit │ │ propose/commit │ │ propose/commit │          │
│  └────────────────┘ └────────────────┘ └────────────────┘          │
└────────────────────────────────────────────────────────────────────┘
```

Cross-origin provider UI updates use explicit-origin `postMessage`. Agent actuation uses WebMCP.

See [`docs/architecture.md`](docs/architecture.md) and [`docs/threat-model.md`](docs/threat-model.md).

## Local development

Requirements:

- Node.js 22+
- Chrome with `chrome://flags/#enable-webmcp-testing` enabled, or ChatGPT's in-app browser

```bash
npm install
npm run dev
```

Local origins:

| App | Origin |
| --- | --- |
| Relay Command | `http://localhost:5173` |
| Shelter Grid | `http://localhost:5174` |
| Transit Ops | `http://localhost:5175` |
| Supply Hub | `http://localhost:5176` |

Different localhost ports are intentionally different origins. `localhost` is treated as a potentially trustworthy origin for local Web Platform development.

### Build

```bash
npm run typecheck
npm run build
```

## Production deployment

Deploy each `apps/*` directory as a separate Vite project and configure the reciprocal origins:

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

Each app includes an `Origin-Agent-Cluster: ?1` header configuration for Vercel.

## Repository map

```text
apps/
  relay-command/       shared command, plan and consent surface
  shelter-grid/        independent WebMCP provider
  transit-ops/         independent WebMCP provider
  supply-hub/          independent WebMCP provider
packages/
  contracts/           protocol and message types
  pact/                canonicalization, hashing, signing and verification
  webmcp-runtime/      minimal WebMCP registration + dynamic tool helpers
  provider-runtime/    versioned proposal/commit state machine
  simulation/          deterministic competition scenario
docs/
  architecture.md
  threat-model.md
  demo-script.md
  judging.md
```

## Security model

Relay is a hackathon reference implementation, not production emergency infrastructure. The demo deliberately focuses on browser-local trust boundaries that can be inspected during judging.

Notable choices:

- no generic agent-accessible signing function
- session private key remains in Relay memory
- providers accept session keys only from the configured Relay parent origin
- approval tokens are exact-scope and short-lived
- proposals are non-binding
- provider commits are state-versioned
- stale state fails closed
- externally sourced tool output would be marked `untrustedContentHint`; deterministic demo data is not

Production deployment would move signing to an authenticated backend/HSM, add durable identity and authorization, use provider-specific trust roots and add compensating transaction semantics for partially completed multi-origin plans.

## Competition thesis

Relay is not "a chatbot with tools". It is an experiment in what websites become when agents are primary navigators:

> **Websites become trusted, visible state and execution boundaries. Agents compose. Humans authorize.**

That is the product and the protocol.

## Status

Initial PACT vertical slice:

- [x] deterministic multi-provider scenario
- [x] three independent provider apps
- [x] imperative WebMCP discovery/proposal tools
- [x] dynamic commit-tool availability
- [x] cross-origin provider mesh
- [x] state-versioned proposals
- [x] human-suspended approval tool
- [x] browser-session ECDSA approval tokens
- [x] exact proposal/origin/version/cost scopes
- [x] atomic same-origin batch commits
- [x] stale-state invalidation
- [x] provenance stream and receipts
- [ ] automated browser/WebMCP eval suite
- [ ] production deployment URLs
- [ ] final three-minute judging video

## License

MIT.
