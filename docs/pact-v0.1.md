# PACT v0.1

**Propose → Amend → Consent → Transact**

Status: competition reference protocol

PACT is a browser-native authorization pattern for consequential agent actions composed across independent WebMCP origins.

It separates four concerns that are often collapsed into one agent request:

1. providers describe currently possible operations
2. an agent composes a plan
3. a human authorizes an exact transaction capsule
4. providers independently verify and execute their local scopes

## 1. Design goal

PACT is designed to preserve human authority without forcing the human to perform the agent's search and composition work.

The agent receives enough capability to:

- discover provider state
- create non-binding proposals
- compare and compose proposals
- request a human decision
- present approved authority back to providers

The agent does not receive:

- a generic signing capability
- blanket authority over an objective
- authority that survives provider state changes indefinitely
- permission to modify approved operation arguments

## 2. Parties

### 2.1 Human authority

The person who can amend, approve or reject the staged plan.

### 2.2 Relay coordinator

The top-level browser application that:

- holds the staged plan
- renders the consent surface
- creates an ephemeral signing session
- signs only after explicit human approval
- exposes coordination tools through WebMCP

### 2.3 Agent

The WebMCP client that discovers tools, composes proposals and invokes approved operations.

### 2.4 Provider origin

An independent website that owns its inventory, state version, proposals and commits.

A provider never trusts an agent assertion that approval occurred. It verifies the signed token itself.

## 3. Lifecycle

```text
PROPOSE
  provider state → non-binding exact proposal

AMEND
  agent composes proposals
  human may alter authority or reject the composition

CONSENT
  Relay hashes the exact plan
  human approves or rejects
  approval creates a short-lived signed token

TRANSACT
  each provider verifies its exact local scopes
  each provider commits its complete local batch atomically
  providers emit origin-bound receipts
```

## 4. Provider proposal

A proposal is a non-binding quote against one exact provider state version.

```ts
interface ProviderProposal {
  proposalId: string;
  providerId: "shelter" | "transit" | "supply";
  providerOrigin: string;
  resourceId: string;
  resourceLabel: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  purpose: string;
  stateVersion: number;
  createdAt: string;
  expiresAt: string;
}
```

Required invariants:

- `proposalId` is unique inside the provider runtime
- `quantity` is a positive integer
- `totalCost` equals `quantity × unitCost` in currency cents
- `providerOrigin` equals the provider's live origin
- `stateVersion` equals the provider version at proposal time
- `expiresAt` is later than `createdAt`
- proposal creation does not mutate provider inventory

A proposal is invalid when either condition becomes true:

- current time reaches `expiresAt`
- provider `stateVersion` no longer equals the proposal version

## 5. Signed proposal scope

The human approves the complete operation, not merely its ID.

```ts
interface ProposalScope {
  proposalId: string;
  providerId: ProviderId;
  providerOrigin: string;
  resourceId: string;
  resourceLabel: string;
  quantity: number;
  unit: string;
  unitCost: number;
  purpose: string;
  stateVersion: number;
  expiresAt: string;
  maxCost: number;
}
```

The verifier MUST compare every field with the provider-owned proposal.

This protects against an agent preserving a proposal ID while changing:

- destination resource
- quantity
- unit
- price
- stated purpose
- provider origin
- provider state version
- proposal expiry

## 6. Approval payload

```ts
interface ApprovalPayload {
  sessionId: string;
  planId: string;
  planHash: string;
  scopes: ProposalScope[];
  maximumCost: number;
  issuedAt: string;
  expiresAt: string;
}
```

### 6.1 Session binding

`sessionId` binds approval to the ephemeral Relay browser session trusted by each provider.

### 6.2 Plan binding

`planHash` is SHA-256 over the canonical representation of:

```ts
{
  planId,
  incidentId,
  summary,
  rationale,
  revision,
  maximumCost,
  scopes: scopesSortedByProposalId
}
```

The human-visible summary, rationale and revision are included so the displayed plan and authorized plan cannot silently diverge.

### 6.3 Aggregate authority

The sum of every `scope.maxCost` MUST be less than or equal to `maximumCost`.

Each `scope.maxCost` MUST equal `quantity × unitCost` in integer currency cents.

### 6.4 Time bounds

The Relay reference implementation issues two-minute approval tokens.

The verifier rejects:

- invalid timestamps
- tokens issued too far in the future
- expired tokens
- an expiry before issue time
- authority lifetimes longer than the protocol maximum
- scopes that were already expired when consent was issued

## 7. Approval token

```ts
interface ApprovalToken {
  payload: ApprovalPayload;
  signature: string;
  algorithm: "ECDSA_P256_SHA256";
}
```

The signature is produced with ECDSA P-256 and SHA-256 over the canonical approval payload. Signature bytes are base64url encoded.

The Relay session private key:

- remains in top-level page memory
- is not exported
- has no WebMCP tool
- is used only after explicit human approval

Providers receive only the public JWK through a source-bound message from their configured parent origin.

## 8. Canonical representation

PACT canonicalization uses these rules:

- `null`, strings, booleans and finite numbers are encoded as JSON
- object keys are sorted lexicographically
- array order is preserved
- sparse arrays are forbidden
- only arrays and plain objects are accepted
- `undefined`, functions, symbols and bigint are forbidden
- non-finite numbers are forbidden
- cyclic structures are forbidden

The same logical payload therefore produces the same signed byte sequence regardless of ordinary JavaScript object insertion order.

## 9. Public-key acceptance

A provider accepts only a public JWK satisfying all conditions:

- `kty` is `EC`
- `crv` is `P-256`
- `x` and `y` are valid base64url strings
- private field `d` is absent
- declared key operations do not include signing
- declared use, when present, is `sig`

A provider rejects a different public key presented under an already active `sessionId`.

## 10. Provider commit algorithm

For a proposed same-origin batch, a provider MUST perform the following checks before any state mutation:

1. input shape is valid
2. the provider has established Relay session trust
3. proposal IDs are unique and known
4. the signature verifies against the trusted session public key
5. the token session equals the trusted session
6. the token has not expired
7. aggregate signed authority is valid
8. every provider-approved scope for this origin is included exactly once
9. every proposal matches its exact signed operation scope
10. every proposal version equals the live provider version
11. every proposal is unexpired
12. aggregate resource demand is within current capacity

Only after all checks pass may the provider:

1. apply the entire local resource demand map
2. increment its state version
3. invalidate every outstanding proposal from the old version
4. emit one receipt per committed proposal
5. remove the now-obsolete commit capability

If any check fails, no provider inventory changes.

## 11. Receipt

```ts
interface CommitReceipt {
  receiptId: string;
  proposalId: string;
  providerId: ProviderId;
  providerOrigin: string;
  committedAt: string;
  resultingStateVersion: number;
  amount: number;
  totalCost: number;
}
```

Relay accepts a receipt only from the expected provider origin and exact provider iframe.

A valid receipt must match a known proposal and advance beyond that proposal's state version.

## 12. Capability lifecycle

PACT uses dynamic WebMCP registration as capability revocation.

### Relay approval capability

`relay_request_approval`:

- absent before plan validation
- present after validation
- suspended while waiting on the human
- removed after approval, rejection or staleness

### Provider commit capability

A provider commit tool:

- absent without trusted current-version proposals
- present while at least one proposal remains committable
- removed when proposals expire
- removed when provider state advances
- removed after commit

The application state and the agent-visible tool surface remain aligned.

## 13. Failure semantics

PACT fails closed.

Examples:

- provider state change → old proposals invalid
- human rejection → no token, no mutation
- approval cancellation → no token, no mutation
- incomplete provider batch → reject all local mutation
- signature mismatch → reject
- origin mismatch → reject
- cost mismatch → reject
- proposal expiry → reject and revoke commit capability

## 14. Atomicity boundary

PACT v0.1 guarantees atomicity only inside one provider origin.

It does not claim distributed ACID transactions across independent websites.

A cross-origin plan may partially commit if one provider succeeds and another fails later. Relay makes that state visible through origin-bound receipts.

A production protocol would add one or more of:

- reservation holds
- prepare/commit phases
- compensating operations
- escrow
- domain-specific rollback windows
- durable transaction coordination

## 15. Security properties demonstrated

PACT v0.1 demonstrates:

- exact human authorization rather than objective-level delegation
- cryptographic binding of authority to visible plan content
- provider-origin and state-version binding
- short-lived session authority
- independent provider verification
- complete same-origin batch enforcement
- capability revocation through WebMCP lifecycle
- stale-state failure before consequential execution

## 16. Non-goals

PACT v0.1 is not:

- an identity protocol
- a payment protocol
- a distributed database transaction protocol
- a replacement for provider authentication
- protection against arbitrary script execution on a trusted origin
- production emergency infrastructure

Its purpose is narrower: provide a concrete authorization pattern for human-governed operations on an agentic web.
