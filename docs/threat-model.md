# Relay threat model

## Assets

- human intent and constraints
- provider inventory/state
- non-binding proposal scopes
- approval authority
- transaction receipts
- provenance of which origin committed what

## Trust boundaries

### Browser agent ↔ WebMCP tool

The agent may invoke registered tools with valid schema-shaped arguments. Tool inputs are never treated as proof of authorization.

### Relay origin ↔ provider origins

Providers are independent origins embedded with `allow="tools"`. Cross-origin UI messaging is accepted only from explicitly configured origins.

### Human ↔ approval token

The human does not hand the agent a blanket capability. Approval signs an exact set of proposal IDs, provider origins, state versions and cost ceilings with a short expiry.

## Threats and mitigations

### Agent attempts to commit before approval

**Mitigation:** provider commit requires a valid signed approval token. Proposal creation never consumes capacity.

### Agent changes arguments after approval

**Mitigation:** providers look up server-owned/browser-owned proposal objects by ID and validate the token's exact scope. The agent cannot replace quantity/cost during commit.

### Provider state changes after planning

**Mitigation:** proposal state version must equal live provider state version. Stale proposals fail closed.

### Human approval is replayed later

**Mitigation:** two-minute expiry plus session ID binding. Provider session trust is browser-session scoped.

### Approval from another origin/provider is reused

**Mitigation:** each proposal scope includes provider ID and provider origin.

### Partial mutation inside one provider batch

**Mitigation:** validate the entire resource demand map before applying any changes, then mutate as one local batch.

### Malicious external content influences the model

The competition simulation uses deterministic trusted fixtures. In a production version, tools returning user-generated or external content should set `untrustedContentHint: true`, sanitize displayed data and avoid combining untrusted text with authority-bearing instructions.

### Compromised Relay JavaScript origin

Out of scope for the browser-only prototype. A production system should move signing to an authenticated service or hardware-backed key, use strong CSP/SRI and enforce user identity, policy and audit server-side.

## Non-claims

Relay does **not** claim:

- distributed ACID transactions across the public web
- production-grade emergency dispatch reliability
- protection after arbitrary code execution on a trusted origin
- durable authentication or non-repudiation

The prototype demonstrates a narrower and testable claim: **WebMCP actions can be composed across independent origins while exact human consent, origin scope and stale-state protection remain visible and enforceable.**
