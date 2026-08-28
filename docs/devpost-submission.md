# Devpost submission draft

## Project title

Relay

## Tagline

Human-governed operations across the agentic web.

## One-sentence pitch

Relay lets an agent compose actions across independent WebMCP websites while a human approves the exact transaction before any consequential operation executes.

## Short description

Relay coordinates a 42-person flood evacuation across three independent WebMCP providers: Shelter Grid, Transit Ops and Supply Hub.

The agent can discover live capacity, create non-binding proposals and stage a cross-provider plan. It cannot reserve beds, vehicles or supplies until the human approves the exact proposal set, origins, provider versions and total authority ceiling.

Relay introduces **PACT: Propose → Amend → Consent → Transact**. Human approval creates a short-lived P-256 signed authorization capsule. Each provider independently verifies its exact scope before committing its complete local batch.

When provider state changes before consent, Relay marks the plan stale, revokes obsolete commit capabilities and forces the agent to re-query and re-plan.

## Inspiration

WebMCP gives websites a structured interface for agents. Most examples naturally begin with one website and one user action.

We wanted to explore the harder systems question:

> What happens when one human objective spans independent websites and some actions are consequential?

A normal agent can search and compose faster than a person. That does not mean it should receive open-ended authority to transact across every site involved.

Relay treats the browser as the visible state, trust and execution layer. The agent composes. The human authorizes. Each provider verifies.

## What it does

The demo starts with a flash-flood evacuation objective:

- evacuate 42 residents before 18:00
- provide at least 9 wheelchair-accessible transport positions
- preserve 20 beds at North Shelter
- provide evacuation and mobility medical kits
- stay beneath a €5,000 budget
- do not commit anything before exact human approval

Relay embeds three independently hosted providers, each with its own state, user interface and WebMCP tools.

The agent:

1. reads the incident brief
2. discovers tools from all three provider origins
3. queries live provider inventories
4. creates six non-binding proposals
5. stages the proposal IDs as one plan
6. requests human approval
7. receives a signed PACT token only after the human approves
8. presents the token to each provider
9. collects origin-bound receipts

The human can narrow the authority ceiling before consent.

If a provider changes capacity while approval is pending, Relay invalidates the plan and the affected commit capability disappears. The agent must recover with new proposals instead of forcing stale work through.

## Why WebMCP materially improves the experience

Without WebMCP, this experience would require one of two weaker architectures:

1. centralize every provider behind a Relay backend and erase the websites as independent execution boundaries
2. rely on brittle visual browser automation that guesses which interface elements correspond to consequential actions

WebMCP enables a third architecture:

- each visible website owns and exposes its own narrow capabilities
- tools execute inside the provider's document context
- provider origins remain independently identifiable
- tool availability changes with provider state
- the human sees the same pages and state the agent operates
- the agent can compose capabilities across descendant origins

Relay uses WebMCP as a stateful capability layer, not a shortcut to existing buttons.

## How we built it

Relay is a TypeScript monorepo with four Vite applications:

- Relay Command
- Shelter Grid
- Transit Ops
- Supply Hub

Shared packages implement:

- protocol contracts
- PACT canonicalization, hashing, signing and verification
- race-safe dynamic WebMCP tool registration
- provider proposal and atomic commit runtime
- deterministic emergency simulation and policy checks

### WebMCP primitives used

- imperative `registerTool`
- cross-origin iframe delegation with `allow="tools"`
- `exposedTo` origin gating
- `readOnlyHint` and `untrustedContentHint`
- dynamic registration and revocation through `AbortSignal`
- descendant tool discovery through `getTools({ fromOrigins })`
- programmatic invocation through `executeTool`
- `toolchange` visualization
- an async tool call suspended on a human decision

### PACT authorization

Relay generates an ephemeral ECDSA P-256 browser-session key pair.

Human approval signs:

- exact provider origins
- proposal and resource IDs
- quantities and units
- purpose and costs
- provider state versions
- proposal expiries
- total authority ceiling
- plan summary, rationale and revision through the plan hash

The private key remains in Relay Command memory and has no agent-callable tool.

Each provider independently validates the signature, session, complete local scope set, current state and capacity before mutation.

## Challenges we ran into

### Keeping provider documents alive

Our first command-page render strategy replaced the entire application DOM after each event. That also recreated the provider iframes, destroying proposal memory and dynamic tool registrations.

We rebuilt the command page around a persistent iframe invariant. Provider frames mount once. Only dedicated command-page containers update.

### Making capability revocation race-safe

A dynamic tool can be disabled while registration is still pending. A naive implementation can let the obsolete tool appear after revocation.

We added generation tracking, concurrent-enable coalescing and deferred abort behavior for in-flight tool results.

### Avoiding fake human-in-the-loop behavior

A notification after agent execution is not human authority.

`relay_request_approval` returns a Promise that remains pending while the human consent sheet is open. The agent's actual tool call waits for approval, rejection, cancellation or stale-state invalidation.

### Preserving exact authority across providers

Checking only individual operation costs is insufficient because their aggregate can exceed the human ceiling.

PACT validates exact operation fields, integer-cent arithmetic, complete provider batches and aggregate authority.

### Being honest about atomicity

Relay provides atomicity inside one provider origin. It does not claim distributed ACID transactions across unrelated websites.

Origin-bound receipts make cross-origin partial completion visible. Production use would add reservation holds or compensating operations.

## Accomplishments we are proud of

- one objective composed across four independent WebMCP documents
- dynamic approval and commit capabilities that appear and disappear with state
- a real suspended agent call waiting on a human decision
- exact P-256 signed human authorization
- automatic proposal expiry and capability revocation
- deterministic stale-state failure and recovery
- complete same-origin atomic provider batches
- persistent iframe and source-bound cross-origin messaging
- a live capability surface driven by `toolchange`
- a proof runner restricted to `getTools()` and `executeTool()`
- adversarial protocol, policy and lifecycle tests
- explicit architecture and threat-model documentation

## What we learned

Agent UX is not only about giving a model more tools. It is also about deciding:

- when a capability should exist
- who may see it
- what exact authority it carries
- how it expires
- what state invalidates it
- how the human understands the transaction
- where the final verification occurs

Websites remain valuable in an agentic world because they can become visible trust, state and execution boundaries.

## What's next

The reference implementation intentionally stops short of production distributed transactions.

The next protocol layer would add:

- provider reservation holds
- prepare and commit phases
- compensating operations
- durable user identity
- authenticated provider trust roots
- durable audit storage
- hardware-backed or service-side signing
- policy templates for procurement, travel disruption and regulated operations

## Built with

- TypeScript
- Vite
- WebMCP
- Web Crypto API
- ECDSA P-256
- Vitest
- cross-origin iframes
- `postMessage`
- deterministic policy evaluation

## Suggested submission links

Replace before submission:

- Live Relay Command: `[LIVE_URL]`
- Shelter Grid: `[SHELTER_URL]`
- Transit Ops: `[TRANSIT_URL]`
- Supply Hub: `[SUPPLY_URL]`
- Public repository: `[REPOSITORY_URL]`
- Public video: `[VIDEO_URL]`

## Final submission checklist

- [ ] repository is public
- [ ] MIT license is visible
- [ ] all production origins use HTTPS
- [ ] all four applications are reachable without authentication
- [ ] production environment variables point to exact reciprocal origins
- [ ] `npm run verify` passes from a clean checkout
- [ ] supported-browser success path is recorded
- [ ] stale-state path is recorded
- [ ] public video is under three minutes
- [ ] Devpost text does not claim cross-origin atomicity
- [ ] links are tested in an incognito browser
- [ ] submission is frozen before judging
