# Relay threat model

## 1. Security objective

Relay lets an agent compose operations across independent WebMCP sites without turning the user's objective into blanket execution authority.

The core claim is:

> Before exact human consent, the agent has no top-level provider commit capability. After consent, each consequential capability is short-lived, exact, origin-bound and independently verified by its provider.

## 2. Protected assets

- human intent and hard constraints
- maximum transaction authority
- agent-visible capability surface
- provider inventory and state version
- non-binding proposal contents
- ephemeral Relay session private key
- trusted public key at each provider
- signed approval payload
- provider receipts
- provenance of which origin committed what
- identity of the exact deployed source commit
- integrity of final audit evidence

## 3. Actors

### Human

Trusted to approve or reject the exact visible transaction.

### Relay Command origin

Trusted to render consent, protect the ephemeral private key and expose only authority-compatible top-level tools.

### Provider origins

Each provider is trusted only for its own inventory, proposals and local execution.

A provider may return incorrect data. Relay cannot make an independent website honest. It can preserve origin provenance and prevent one provider from authorizing another provider's operations.

### Browser agent

Untrusted for authorization. The agent may:

- call tools in an unexpected order
- retain stale tool references
- repeat calls
- omit or alter scopes
- present stale data
- replay or mix approval tokens
- request restoration of a broader prior authority ceiling

Schema-shaped agent input and natural-language rationale are never proof of authority.

### Network edge and proxy chain

Operationally trusted to serve the configured TLS origins and headers, but treated as a potential source of stale or conflicting release metadata. Runtime evidence therefore checks edge headers against compiled and manifest identity.

### External content

Untrusted. The deterministic competition fixture avoids external content inside authority-bearing flows.

## 4. Trust boundaries

### 4.1 Agent to Relay bridge

The fixed bridge exposes no arbitrary origin or tool selector.

Read and proposal wrappers mirror exact provider tools. Consequential wrappers require live `APPROVED` plan status when registered and immediately before invocation.

### 4.2 Agent to provider execution

Even a visible commit wrapper is not sufficient authority. The provider validates every consequential input and independently verifies the signed PACT token.

### 4.3 Relay origin to provider origin

Providers are independent documents embedded with `allow="tools"` and limit exposure with `exposedTo`.

Visible state messages require exact origin and exact window-source binding.

### 4.4 Human to approval token

The human approves the rendered proposal set and authority ceiling. Relay signs exact operation scopes, plan hash, session and expiry.

### 4.5 Provider to provider

Providers do not trust each other. A Shelter Grid scope cannot authorize Transit Ops or Supply Hub.

### 4.6 Deployed application to reviewed source

Production Relay is trusted only when compiled SHA, trusted edge header and `/release.json` identify the same validated Git commit.

### 4.7 Proof runner to application

The optional proof runner is a harness evaluator restricted to WebMCP discovery and execution. It has no direct internal state or signing reference and is not actual ChatGPT evidence.

## 5. Threats and mitigations

### 5.1 Agent attempts to commit before approval

**Threat:** A provider has prepared a local commit implementation after proposal creation and the agent attempts consequential execution before consent.

**Mitigation:** Relay Command does not expose a top-level commit wrapper unless the exact plan is `APPROVED`. The provider also requires a valid signed PACT token. Proposal creation never consumes capacity.

### 5.2 Agent retains a stale commit wrapper

**Threat:** The agent captures a wrapper while approved and invokes it after the plan becomes stale, rejected or otherwise loses authority.

**Mitigation:** Every bridge invocation re-reads live plan status. Non-`APPROVED` status returns `HUMAN_APPROVAL_REQUIRED` without calling the provider. Periodic and event-driven synchronization removes the obsolete wrapper.

### 5.3 Agent changes an approved operation

**Threat:** The agent preserves a proposal ID but changes resource, quantity, unit, price, purpose, origin, version or expiry.

**Mitigation:** Every operation field is signed. The provider compares the signed scope with its provider-owned proposal object.

### 5.4 Agent submits only a favorable subset

**Threat:** The human approves several same-provider operations but the agent commits only part of them.

**Mitigation:** The provider requires the complete approved proposal set for its origin exactly once. Partial batches fail with `INCOMPLETE_PROVIDER_BATCH`.

### 5.5 Agent tries to restore broader authority during recovery

**Threat:** After a human narrows authority from €5,000 to €3,000, stale recovery requests the original ceiling.

**Mitigation:** Relay keeps a durable monotonic human ceiling and caps stage input. Authority may remain equal or tighten, never expand through agent action.

### 5.6 Aggregate cost exceeds human authority

**Threat:** Each operation appears beneath the ceiling while their sum exceeds it.

**Mitigation:** PACT validates integer-cent arithmetic and rejects aggregate scope cost above `maximumCost`.

### 5.7 Signed scope contains inconsistent arithmetic

**Threat:** `maxCost` differs from `quantity × unitCost`.

**Mitigation:** Approval validation rejects inconsistent scope arithmetic before provider mutation.

### 5.8 Provider state changes after planning

**Threat:** Capacity changes after proposal composition.

**Mitigation:** Every mutation advances `stateVersion`. Proposals bind that version. Any provider advance deletes old proposals, revokes the provider commit implementation, makes Relay stale and removes top-level consequential authority.

### 5.9 Proposal expires silently

**Threat:** An expired proposal remains callable.

**Mitigation:** Providers schedule expiry, prune proposals and revoke commit implementations. Bridge synchronization removes corresponding wrappers. Providers still reject expired proposals if a stale reference survives.

### 5.10 Approval replay

**Threat:** A previously valid token is replayed later.

**Mitigation:** Approval is session-bound and short-lived. Committed proposals are removed and provider versions advance.

### 5.11 Approval is mixed across sessions

**Threat:** A token from another Relay session is presented.

**Mitigation:** Token session ID must equal the provider's trusted active session. Final audit closure also requires matching approvals to come from one session.

### 5.12 Public-key substitution

**Threat:** A different key is presented under an existing session ID.

**Mitigation:** Providers fingerprint the accepted P-256 public key and reject same-session key changes.

### 5.13 Private key material supplied as public trust

**Threat:** A JWK contains private field `d` or signing key operations.

**Mitigation:** Providers accept only P-256 public verification JWKs without private material or signing operations.

### 5.14 Cross-origin confused deputy

**Threat:** Approval for one provider is reused against another.

**Mitigation:** Every signed scope binds provider ID and exact provider origin. Fixed bridge wrappers also bind one exact origin and tool name.

### 5.15 Cross-frame message spoofing

**Threat:** Another child window sends correctly shaped provider data.

**Mitigation:** Relay checks both `event.origin` and `event.source` against the exact persistent provider iframe.

### 5.16 Production origin or browser-isolation misconfiguration

**Threat:** Deployment shares origins, uses insecure HTTP, delegates to localhost or omits origin-agent-cluster isolation.

**Mitigation:** Relay boot validates the origin mesh and secure context. Source and deployed gates require `Origin-Agent-Cluster: ?1` across Vite, Nginx and Caddy. A fresh ChatGPT browsing context is required after isolation changes.

### 5.17 Partial mutation inside a provider

**Threat:** One local operation consumes capacity before another fails.

**Mitigation:** Provider validates the complete demand map before any mutation.

### 5.18 Partial completion across providers

**Threat:** One provider commits and another later fails.

**Mitigation:** Relay makes partial completion explicit through receipts and does not claim distributed atomicity. Audit bundle v2 fails until exact final receipt closure. Production use requires compensation or prepare/commit semantics.

### 5.19 Dynamic registration race

**Threat:** A capability is disabled while registration is pending, then appears after revocation.

**Mitigation:** `DynamicTool` uses generations, coalesces enables and aborts obsolete registrations after completion.

### 5.20 Initial bridge readiness race

**Threat:** ChatGPT calls diagnostics immediately after page load and observes a transiently incomplete fixed bridge.

**Mitigation:** Relay waits for the exact permanent read/proposal bridge surface for a bounded interval before registering diagnostics. Failure is logged and remains diagnosable; boot cannot hang indefinitely.

### 5.21 Tool-result truncation

**Threat:** A token, proposal ID or receipt is cut into invalid JSON.

**Mitigation:** Protocol outputs are never truncated. Callers return deliberately compact objects.

### 5.22 HTML injection through agent or provider text

**Threat:** Purpose, rationale or provider data contains markup.

**Mitigation:** Rendered values are escaped. Capability metadata uses DOM `textContent`.

### 5.23 Malicious content influences the model

**Threat:** Provider output contains prompt injection that attempts to expand authority.

**Mitigation:** Competition fixtures are deterministic. Untrusted tools are annotated. Authorization remains exact and cryptographic even if the model requests something invalid.

### 5.24 Human approves a bad but internally valid plan

**Threat:** The human approves harmful but policy-valid operations.

**Mitigation:** Relay provides visibility, deterministic hard constraints and precise scope. It cannot replace human judgment for every policy objective.

### 5.25 Stale or mixed deployed release

**Threat:** The repository, application bundle, proxy header and release manifest identify different commits.

**Mitigation:** Non-local boot requires a valid compiled SHA. `relay_get_release_identity` requires:

```text
compiled SHA = one consistent edge SHA = manifest SHA
```

Non-success manifests, wrong app identity, malformed SHA and conflicting duplicate edge headers fail. Deployment smoke verifies both root and manifest responses on all four origins.

### 5.26 Evidence changes the commit being proved

**Threat:** Runtime evidence is committed after deployment, creating a new commit while the old deployment is described as current.

**Mitigation:** Generated evidence defaults to ignored `.relay-artifacts/`. Committed runtime evidence requires rebuilding, redeploying and revalidating the new SHA.

### 5.27 Final audit accepts partial or altered closure

**Threat:** A plan claims `COMMITTED` despite missing, duplicated, malformed or changed receipt/scope evidence.

**Mitigation:** Audit bundle v2 recomputes the final plan hash and requires exact plan, matching approval scope and receipt equality, one session, reconciled totals and successful release identity.

### 5.28 Compromised trusted origin

**Threat:** Arbitrary script execution occurs on Relay Command or a provider.

**Mitigation:** CSP, dependency locking, read-only containers and provenance checks reduce exposure but do not make arbitrary trusted-origin compromise safe. Production use requires authenticated services, durable audit and hardware-backed or service-side signing.

## 6. Denial-of-service considerations

The prototype limits:

- open proposals per provider
- approval scopes per token
- text and identifier lengths
- approval lifetime
- proposal lifetime
- initial bridge readiness wait

An agent can still create noise within these bounds. Production providers need identity, rate limits, quotas and abuse monitoring.

## 7. What PACT authorization proves

A valid PACT token proves:

- a trusted Relay session key signed the exact payload
- payload contains a bounded exact operation set
- token was live when checked

It does not prove:

- legal identity of the human
- non-repudiation
- truthfulness of provider inventory
- delivery of a physical service
- cross-origin atomic completion
- absence of arbitrary code execution on a trusted origin

## 8. Non-claims

Relay does not claim:

- distributed ACID across the public web
- production-grade emergency dispatch reliability
- durable authentication or access control
- safety after arbitrary trusted-origin compromise
- protection against a provider lying about its own state

The implemented claim is narrower:

> WebMCP actions can be composed across independent origins while exact human consent, bounded authority, provider provenance, capability revocation, stale-state protection and deployed-source identity remain visible and enforceable.
