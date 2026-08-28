# Relay threat model

## 1. Security objective

Relay must let an agent compose operations across independent WebMCP sites without turning the user's objective into blanket execution authority.

The core security claim is:

> Provider mutation requires a live provider proposal plus an exact, short-lived human approval that the provider verifies independently.

## 2. Protected assets

- human intent and hard constraints
- maximum transaction authority
- provider inventory and state version
- non-binding proposal contents
- ephemeral Relay session private key
- trusted session public key at each provider
- signed approval payload
- provider commit receipts
- provenance of which origin committed what
- integrity of the agent-visible capability surface

## 3. Actors

### Human

Trusted to approve or reject the visible exact transaction.

### Relay Command origin

Trusted to render the consent surface and protect the ephemeral session private key.

### Provider origins

Each provider is trusted only for its own inventory, proposals and local execution.

A provider may return incorrect data. Relay cannot make an independent website honest. It can preserve origin provenance and prevent one provider from authorizing another provider's operations.

### Browser agent

Untrusted with respect to authorization. The agent may:

- call tools in an unexpected order
- repeat calls
- omit scopes
- alter arguments
- present stale data
- attempt to replay or mix approval tokens

Schema-shaped agent input is never treated as proof of authority.

### External content

Untrusted. The deterministic competition fixture avoids external content inside authority-bearing flows.

## 4. Trust boundaries

### 4.1 Agent to WebMCP tool

The tool implementation validates every consequential input. Agent intent and natural-language rationale do not authorize mutation.

### 4.2 Relay origin to provider origin

Providers are independent documents embedded with `allow="tools"`.

Tool exposure is restricted with `exposedTo`.

Visible state messages require both exact origin and exact window-source binding.

### 4.3 Human to approval token

The human approves the rendered proposal set. Relay signs a capsule containing exact operation scopes, total authority and expiry.

### 4.4 Provider to provider

Providers do not trust each other. A Shelter Grid scope cannot authorize Transit Ops or Supply Hub.

### 4.5 Proof runner to application

The built-in proof runner is trusted only as an evaluator. It is structurally restricted to WebMCP discovery and execution and receives no direct reference to internal state or signing functions.

## 5. Threats and mitigations

### 5.1 Agent attempts to commit before approval

**Threat:** The agent invokes a provider commit tool after proposal creation but before a human decision.

**Mitigation:** Provider commit requires a signed approval token verified against the active Relay session public key. Proposal creation never consumes capacity.

### 5.2 Agent changes an approved operation

**Threat:** The agent preserves a proposal ID but changes resource, quantity, unit, price, purpose, origin, version or expiry.

**Mitigation:** Every operation field is inside the signed proposal scope. The provider compares the signed scope with its provider-owned proposal object.

### 5.3 Agent submits only a favorable subset

**Threat:** The human approves several same-provider operations but the agent commits only part of them.

**Mitigation:** The provider requires the complete approved proposal set for its origin exactly once. Partial batches fail with `INCOMPLETE_PROVIDER_BATCH`.

### 5.4 Aggregate cost exceeds human authority

**Threat:** Each individual operation appears beneath the ceiling while their sum exceeds it.

**Mitigation:** PACT validates integer-cent arithmetic for every scope and rejects the token when aggregate scope cost exceeds `maximumCost`.

### 5.5 Signed scope contains inconsistent arithmetic

**Threat:** `maxCost` differs from `quantity × unitCost`.

**Mitigation:** The approval envelope rejects inconsistent scope arithmetic before provider mutation.

### 5.6 Provider state changes after planning

**Threat:** Capacity or price changes after proposal composition.

**Mitigation:** Every mutation advances provider `stateVersion`. Proposals bind the exact version. Any provider state advance deletes all old proposals and removes the commit capability.

### 5.7 Proposal expires silently

**Threat:** An old proposal remains visible as a callable commit path after its TTL.

**Mitigation:** Providers schedule the earliest proposal expiry, prune expired proposals automatically and revoke the dynamic commit tool when no current proposals remain.

### 5.8 Approval replay

**Threat:** A previously valid token is replayed later.

**Mitigation:** Approval is bound to a browser session and short expiry. Committed proposals are removed. Provider state advances after commit, invalidating old versions.

### 5.9 Approval is mixed across sessions

**Threat:** A token signed in another Relay session is presented to a provider.

**Mitigation:** The token session ID must equal the provider's active trusted Relay session.

### 5.10 Public-key substitution

**Threat:** A different key is presented under an existing session ID so an attacker can sign new authority.

**Mitigation:** Providers fingerprint the accepted P-256 public key and reject same-session key changes.

### 5.11 Private key material supplied as a public key

**Threat:** A malformed JWK contains private field `d` or signing key operations.

**Mitigation:** Providers accept only P-256 public verification JWKs without private material or signing operations.

### 5.12 Cross-origin confused deputy

**Threat:** An approval for one provider is reused against another.

**Mitigation:** Each signed scope binds provider ID and exact provider origin. Providers require their own identity and origin.

### 5.13 Cross-frame message spoofing

**Threat:** Another child window sends a correctly shaped provider message.

**Mitigation:** Relay checks both `event.origin` and `event.source` against the configured persistent provider iframe.

### 5.14 Production origin misconfiguration

**Threat:** A deployment accidentally shares provider origins, uses insecure HTTP or points production at localhost.

**Mitigation:** Relay bootstrap rejects invalid origin meshes before loading command logic or registering tools.

### 5.15 Partial mutation inside a provider

**Threat:** One operation consumes capacity before another operation in the same provider batch fails.

**Mitigation:** The provider validates the complete local demand map before applying any resource mutation.

### 5.16 Partial completion across providers

**Threat:** One provider commits and a later provider fails.

**Mitigation:** Relay does not claim distributed atomicity. Origin-bound receipts make partial completion visible. Production use requires compensation or prepare/commit semantics.

### 5.17 Dynamic tool registration race

**Threat:** A capability is disabled while its registration Promise is pending, then appears after it should be revoked.

**Mitigation:** `DynamicTool` uses generation tracking, coalesces concurrent enables and aborts obsolete registrations after completion.

### 5.18 Tool-result truncation

**Threat:** A signed token or proposal ID is cut into invalid JSON for context-size reasons.

**Mitigation:** Protocol tool results are never truncated. Callers return deliberately compact objects instead.

### 5.19 HTML injection through agent or provider text

**Threat:** Purpose, rationale, provider data or tool metadata contains markup.

**Mitigation:** Command and provider pages escape rendered values. The capability surface uses DOM `textContent` rather than metadata interpolation.

### 5.20 Malicious external content influences the model

**Threat:** Provider output includes prompt-injection text that attempts to expand authority.

**Mitigation:** The competition scenario uses deterministic fixtures. Tools carrying untrusted text are annotated with `untrustedContentHint`. Authorization remains cryptographic and exact even if the agent is persuaded to make a bad request.

### 5.21 Human approves a bad but internally valid plan

**Threat:** The human intentionally or mistakenly approves exact harmful operations.

**Mitigation:** Relay provides visibility, deterministic hard-constraint checks and precise scope. It cannot replace human judgment for every policy objective.

### 5.22 Compromised trusted origin

**Threat:** Arbitrary script execution occurs on Relay Command or a provider.

**Mitigation:** Out of scope for the browser-only reference implementation. Production use requires authenticated services, CSP, dependency controls, durable audit and hardware-backed or service-side signing.

## 6. Denial-of-service considerations

The prototype limits:

- open proposals per provider
- approval scopes per token
- text and identifier lengths
- approval lifetime
- proposal lifetime

An agent can still create noise within these bounds. Production providers should add identity, rate limits, quotas and abuse monitoring.

## 7. What PACT authorization does not prove

A valid PACT token proves:

- a trusted Relay session key signed this exact payload
- the payload contains a bounded exact operation set
- the token was live when checked

It does not prove:

- legal identity of the human
- non-repudiation
- truthfulness of provider inventory
- delivery of a physical service
- cross-origin atomic completion

## 8. Non-claims

Relay does not claim:

- distributed ACID transactions across the public web
- production-grade emergency dispatch reliability
- durable authentication or access control
- safety after arbitrary code execution on a trusted origin
- protection against a provider lying about its own state

The implemented claim is narrower:

> WebMCP actions can be composed across independent origins while exact human consent, provider provenance, capability revocation and stale-state protection remain visible and enforceable.
