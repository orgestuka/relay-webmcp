# Relay architecture

## Design objective

Demonstrate a web-native transaction pattern for a user objective that spans independent WebMCP origins while preserving explicit human authority over consequential actions.

## Components

### Relay Command

The top-level page owns:

- incident objective and hard constraints
- provider iframe mesh
- provider state snapshots
- known non-binding proposals
- staged cross-provider plan
- human amendment controls
- consent UI
- ephemeral P-256 signing key
- receipt/provenance stream

Its permanent WebMCP tools are read/state/stage operations. `relay_request_approval` is registered only after a live plan passes validation.

### Provider apps

Each provider owns its own inventory and state version. It exposes:

- one read-only discovery tool
- one proposal tool
- one commit tool that exists only while at least one current-version proposal is committable

Providers never trust Relay's internal JavaScript state. They re-check their own state at commit time.

## PACT state machine

```text
DRAFT
  │ provider proposals
  ▼
VALIDATED ───────────────┐
  │ human amendment     │ provider version changes
  │                     ▼
  ├───────────────→ STALE
  │ approval call
  ▼
AWAITING_APPROVAL
  │ human reject → REJECTED
  │ human approve
  ▼
APPROVED
  │ scoped provider commits
  ▼
COMMITTED
```

## Dynamic WebMCP surface

Relay intentionally changes tool availability rather than exposing every possible action all the time.

- `relay_request_approval` does not exist in `DRAFT`.
- It appears after a valid plan is staged.
- It disappears after approval, rejection or stale-state invalidation.
- Provider commit tools appear only while that provider has current-version proposals.
- Provider commit tools disappear when all proposals become stale, expire or commit.

This lets the tool surface communicate application state to agents.

## Human approval as suspended execution

`relay_request_approval.execute()` returns a Promise that remains pending while a modal is visible to the human.

The tool result is resolved only after one of:

- human approval → signed PACT token
- human rejection → explicit rejection result
- browser/agent cancellation → cancellation result
- provider state change → stale-plan result

This is not a simulated notification. The agent's tool call is actually waiting on the human decision.

## Session trust bootstrap

1. Relay creates an ephemeral ECDSA P-256 key pair.
2. Provider iframes announce `relay_provider_ready` to the configured Relay origin.
3. Relay sends `relay_session_init` back with session ID and public JWK.
4. Providers accept that key only from the configured parent origin.
5. Human approval signs the canonical approval payload with the session private key.
6. Providers verify the token with the trusted session public key.

The private key has no WebMCP tool and remains in the top-level page memory.

## Versioning

Every provider state mutation increments a monotonically increasing `stateVersion`.

Each proposal captures the exact version observed at proposal time. A proposal against v4 can never commit when the provider is at v5.

That rule is intentionally coarse. It favors safe invalidation over maximum concurrency for the competition prototype.

## Same-origin atomic batches

A provider commit accepts multiple proposal IDs from that provider and validates the entire batch before mutation. Capacity is changed only after every scoped proposal succeeds validation.

This avoids a self-induced stale-state failure when a plan needs more than one resource from the same provider.

True atomic transactions across unrelated origins are intentionally not claimed. Relay provides per-origin atomicity plus visible receipts. Production systems would require compensation or domain-specific transaction coordination for cross-origin partial failure.
