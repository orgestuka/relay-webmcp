# Devpost submission draft

Replace bracketed values only after the external release gates pass.

## Project title

Relay

## Tagline

Human-governed operations across the agentic web.

## One-sentence pitch

Relay lets an agent compose actions across independent WebMCP websites while a human controls whether the exact consequential capabilities ever become available.

## What Relay does

Relay coordinates a 42-person flood evacuation across three independent provider websites:

- Shelter Grid
- Transit Ops
- Supply Hub

The agent discovers live capacity, creates non-binding proposals and stages one cross-provider plan. It cannot consume a bed, vehicle seat or supply kit before the human approves the exact operations, origins, state versions and authority ceiling.

Relay introduces **PACT: Propose → Amend → Consent → Transact**.

Before consent, ChatGPT receives read and proposal capabilities but no top-level provider commit capability. Exact human approval creates short-lived commit wrappers and an ECDSA P-256 PACT capsule. Every provider independently verifies its own exact scopes before committing its complete local batch.

If provider state changes while consent is pending, Relay marks the plan stale, resolves the suspended approval call without authority and forces the agent to re-query and recover. The human's narrowed authority ceiling survives that recovery.

## Inspiration

WebMCP gives a website a structured interface for agents. We wanted to explore the harder systems problem:

> What happens when one human objective spans several independent websites and some actions are consequential?

An agent may be better at search and composition. That does not justify blank-cheque authority across every site involved.

Relay keeps websites relevant as visible state, trust and execution boundaries. The agent composes. The human authorizes. The providers verify.

## How it works

The objective is to evacuate 42 Riverside residents before 18:00 while:

- sheltering all 42 residents
- transporting all 42 residents
- providing at least 9 wheelchair-accessible positions
- preserving 20 North Shelter beds
- providing evacuation and mobility medical kits
- remaining below the €5,000 incident budget

The agent supplies `completionDeadline` as structured plan data. Relay rejects a
deadline later than 18:00 as an eighth deterministic policy check, displays the
accepted deadline in the approval sheet and binds it into the signed PACT plan
hash. It is therefore enforced authority, not prompt-only context.

The agent selects six non-binding proposals from live provider state under the initial €5,000 authority ceiling. In the first deployed ChatGPT run it chose a safer €2,861 plan that avoided flood-exposed South Shelter while preserving exactly 20 North beds.

Before consent, the human narrows authority from €5,000 to €3,000. Only then does the agent call `relay_request_approval`. The Promise remains suspended while the consent sheet is visible.

Before approval, Relay's demo control reduces the largest shelter allocation in the exact staged plan. Shelter Grid advances its state version, old shelter proposals become invalid, the plan becomes stale and no commit wrapper is exposed.

The agent recovers with fresh shelter proposals while preserving the human-amended €3,000 ceiling. The human approves the revised exact scopes. Only then do exactly three origin-bound commit wrappers appear. The providers independently verify and commit, Relay records six receipts and audit bundle v2 proves exact equality between the final plan, matching approval scopes, provider receipts and deployed release identity.

## Why WebMCP materially improves the experience

Without WebMCP, Relay would have to centralize every provider behind one backend or rely on brittle visual automation.

WebMCP lets each visible provider website:

- own capabilities inside its document
- expose narrow structured actions
- remain identifiable by origin
- change tool availability with application state
- revoke obsolete capabilities
- visibly mutate the same state the human sees

Relay uses imperative registration, `allow="tools"`, `exposedTo`, `getTools({ fromOrigins })`, `executeTool`, `toolchange`, annotations and `AbortSignal` revocation.

## ChatGPT compatibility

Relay preserves the independent provider documents and adds a strict top-level capability bridge:

- native cross-origin WebMCP remains the preferred transport
- an exact-origin, exact-frame RPC transport covers clients that omit iframe WebMCP
- each wrapper is hard-bound to one origin and one provider tool name
- wrappers have explicit schemas
- no arbitrary execute-any capability exists
- read and proposal wrappers mirror provider availability
- consequential wrappers require live `APPROVED` plan status at registration and invocation time
- provider-side PACT authorization remains independently authoritative

The submission will include raw `relay_get_release_identity` and `relay_diagnose_webmcp` output from the deployed application inside ChatGPT's supported built-in browser. Harness evidence is not described as ChatGPT evidence.

## Technical implementation

Relay is a TypeScript monorepo with four Vite applications and shared packages for:

- PACT contracts
- canonical hashing and ECDSA signing
- exact authorization verification
- dynamic WebMCP registration lifecycle
- provider proposal and commit state machines
- deterministic policy validation
- exact audit closure
- commit-bound release provenance

The browser-session private key remains in Relay Command memory and is never exposed as a tool.

A signed scope binds:

- provider origin and identity
- proposal and resource IDs
- quantity and unit
- cost and total authority
- stated purpose
- provider state version
- proposal expiry

Same-origin batches are atomic: if any local check fails, no local capacity changes.

Relay does not claim distributed ACID across unrelated providers. Cross-origin partial completion is represented honestly through receipts and requires recovery or compensation in production.

## Challenges

### Preserving provider documents

Provider iframes remain mounted while proposals, versions and dynamic tools change. Relay updates dedicated UI containers without recreating provider documents.

### Revoking capabilities safely

Dynamic registration can race with invalidation. Relay coalesces registration, revokes obsolete tools and bounds the initial compatibility-bridge readiness window before diagnostics become callable.

### Making human approval real

`relay_request_approval` is not a notification. Its Promise remains pending while the human decides, making the human a real dependency inside the execution path.

### Binding aggregate authority

Individual operation limits are insufficient across several providers. PACT validates every exact operation and the aggregate cross-provider ceiling.

### Proving the live code is the reviewed code

Production Relay fails closed without an exact commit SHA. The compiled application, `X-Relay-Release` edge header and `/release.json` manifest must all identify the same commit before diagnostics or audit can pass.

## Accomplishments

- one objective spanning four independent WebMCP documents
- native-first, origin-locked ChatGPT-compatible provider bridge
- no top-level commit capability before exact human consent
- live discovery and semantic execution diagnostics
- dynamic capability creation and teardown evidence
- real suspended human approval
- exact P-256 signed authorization
- deterministic stale-state failure and recovery
- retained human authority through recovery
- complete same-origin atomic batches
- origin-bound receipts
- exact audit bundle v2
- commit-bound four-origin release identity
- hardened Caddy, Nginx and Docker release stack
- hostile protocol and policy tests

## What we learned

Agent UX is not only about giving a model more tools. It is also about deciding:

- when a capability should exist
- what exact authority it carries
- which origin owns execution
- what state invalidates it
- how the human understands the transaction
- where independent verification occurs

## What's next

A production PACT system would add:

- authenticated human identity
- provider trust roots
- durable audit storage
- reservation holds
- prepare and commit phases
- compensating operations
- hardware-backed or service-side signing

## Built with

TypeScript, Vite, WebMCP, Web Crypto API, ECDSA P-256, Vitest, cross-origin iframes, `postMessage`, Docker, Nginx and Caddy.

## Links

- Live Relay Command: `https://relay.0rgest.com`
- Shelter Grid: `https://relay-shelter.0rgest.com`
- Transit Ops: `https://relay-transit.0rgest.com`
- Supply Hub: `https://relay-supply.0rgest.com`
- Public repository: `https://github.com/ValorSeven/relay-webmcp` (make public only at submission freeze)
- Public video: `[VIDEO_URL]`

## Submission freeze checklist

- [x] deployed baseline branch passed `npm run gate:source`
- [x] deployed baseline four HTTPS origins passed production smoke
- [x] `relay_get_release_identity` passed in ChatGPT
- [x] raw actual ChatGPT diagnostic passed
- [x] commit wrappers were absent before human approval
- [ ] initial plan visibly stages at €5,000 authority
- [ ] human visibly narrows authority to €3,000
- [ ] full stale/recovery/approval/commit path passes in ChatGPT
- [ ] exactly three commit wrappers appear after approval
- [ ] final audit bundle v2 passes
- [ ] partial-commit recovery drill passes
- [ ] 2:40–2:50 demo rehearsed repeatedly
- [ ] public video is under three minutes
- [ ] repository visibility requirement is satisfied
- [ ] PR #1 is merged only after all prior gates
- [ ] merged SHA is validated before the submission tag is created
