# Devpost submission draft

Replace bracketed values only after the release gates pass.

## Project title

Relay

## Tagline

Human-governed operations across the agentic web.

## One-sentence pitch

Relay lets an agent compose actions across independent WebMCP websites while a human approves the exact transaction before any consequential operation executes.

## What Relay does

Relay coordinates a 42-person flood evacuation across three independent provider websites:

- Shelter Grid
- Transit Ops
- Supply Hub

The agent discovers live capacity, creates non-binding proposals and stages one cross-provider plan. It cannot consume a bed, vehicle seat or supply kit before the human approves the exact operations, provider origins, state versions and total authority ceiling.

Relay introduces **PACT: Propose → Amend → Consent → Transact**.

Human approval creates a short-lived ECDSA P-256 authorization capsule. Every provider independently verifies its own exact scopes before committing its complete local batch.

If provider state changes while consent is pending, Relay invalidates the plan, revokes stale capabilities and forces the agent to re-query and recover.

## Inspiration

WebMCP gives a website a structured interface for agents. We wanted to explore the harder systems problem:

> What happens when one human objective spans several independent websites and some actions are consequential?

An agent may be better at search and composition. That does not justify giving it blank-cheque authority across every site involved.

Relay keeps websites relevant as visible state, trust and execution boundaries. The agent composes. The human authorizes. The providers verify.

## How it works

The incident objective is to evacuate 42 Riverside residents before 18:00 while:

- sheltering all 42 residents
- transporting all 42 residents
- providing at least 9 wheelchair-accessible positions
- preserving 20 North Shelter beds
- providing evacuation and mobility medical kits
- remaining below the incident's €5,000 budget

The agent stages six exact non-binding proposals costing €2,733 under the initial €5,000 ceiling.

Before consent, the human deliberately narrows the agent's authority from €5,000 to €3,000. Only then does the agent call `relay_request_approval`. The tool call remains suspended while the consent sheet is visible.

Before approval, Shelter Grid loses capacity. Its state version advances, old shelter proposals become invalid and the affected approval and commit capabilities disappear.

The agent recovers with fresh shelter proposals while preserving the human-amended €3,000 ceiling. The human approves the revised exact scopes and all three providers independently verify and commit. Relay records six origin-bound receipts and emits a final audit digest.

## Why WebMCP materially improves the experience

Without WebMCP, Relay would have to centralize every provider behind one backend or rely on brittle visual automation.

WebMCP lets each visible provider website:

- own its capabilities inside its document
- expose narrow structured actions
- remain identifiable by origin
- change tool availability with application state
- revoke obsolete capabilities
- visibly mutate the same state the human sees

Relay uses imperative registration, `allow="tools"`, `exposedTo`, `getTools({ fromOrigins })`, `executeTool`, `toolchange`, tool annotations and `AbortSignal` capability revocation.

## ChatGPT compatibility

OpenAI currently documents that tools exposed only by embedded content are not directly supported by ChatGPT's site-tools client.

Relay preserves the independent provider documents and adds a strict top-level capability bridge:

- each wrapper is hard-bound to one origin and one provider tool name
- wrappers have explicit schemas
- no arbitrary execute-any capability exists
- wrappers appear and disappear with the underlying provider tools
- provider-side PACT authorization remains authoritative

The submission must include raw `relay_diagnose_webmcp` evidence from the deployed application inside ChatGPT's supported built-in browser. Harness evidence is not described as ChatGPT evidence.

## Technical implementation

Relay is a TypeScript monorepo with four Vite applications and shared packages for:

- PACT contracts
- canonical hashing and ECDSA signing
- exact authorization verification
- dynamic WebMCP registration lifecycle
- provider proposal and commit state machines
- deterministic policy validation

The browser session private key remains in Relay Command memory and is never exposed as a tool.

A signed scope binds:

- provider origin and identity
- proposal and resource IDs
- quantity and unit
- cost and total authority
- stated purpose
- provider state version
- proposal expiry

Same-origin batches are atomic: if any local check fails, no local capacity changes.

Relay does not claim distributed ACID across unrelated providers. Cross-origin partial completion is represented honestly through receipts and requires compensation or recovery in production.

## Challenges

### Preserving provider documents

Provider iframes must remain mounted while proposals, state versions and dynamic tools change. Relay updates dedicated UI containers without recreating the provider documents.

### Revoking capabilities safely

Dynamic registration can race with invalidation. Relay coalesces concurrent registration and revokes obsolete capabilities even when registration is still pending.

### Making human approval real

`relay_request_approval` is not a notification. Its Promise remains pending while the human decides, so the human is an actual dependency inside the agent execution path.

### Binding aggregate authority

Individual operation limits are insufficient when several providers are involved. PACT validates every exact operation and the aggregate cross-provider ceiling.

## Accomplishments

- one objective spanning four independent WebMCP documents
- fixed ChatGPT-compatible top-level provider bridge
- live provider discovery and execution diagnostics
- dynamic capability creation and teardown evidence
- real suspended human approval
- exact P-256 signed authorization
- deterministic stale-state failure and recovery
- complete same-origin atomic batches
- origin-bound receipts
- canonical audit digest
- four-origin Caddy and Docker deployment stack
- hostile protocol and policy audit

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

- Live Relay Command: `[RELAY_URL]`
- Shelter Grid: `[SHELTER_URL]`
- Transit Ops: `[TRANSIT_URL]`
- Supply Hub: `[SUPPLY_URL]`
- Public repository: `[REPOSITORY_URL]`
- Public video: `[VIDEO_URL]`

## Submission freeze checklist

- [ ] clean checkout passes `npm run verify`
- [ ] four HTTPS origins pass `npm run deploy:smoke`
- [ ] raw actual ChatGPT diagnostic passes
- [ ] initial plan visibly stages at €5,000 authority
- [ ] human visibly narrows authority to €3,000
- [ ] full stale/recovery/commit path passes in ChatGPT
- [ ] final audit bundle captured
- [ ] 2:40–2:50 demo rehearsed repeatedly
- [ ] public video under three minutes
- [ ] repository public or transferred if required
- [ ] PR #1 merged only after all prior gates
- [ ] submission tag created from merged release
