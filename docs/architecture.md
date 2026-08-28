# Relay architecture

## 1. Design objective

Relay demonstrates a web-native coordination pattern for one user objective spanning independent WebMCP origins while preserving explicit human authority over consequential execution.

The architecture is built around three separations:

1. **composition is not authorization**
2. **proposal state is not provider state**
3. **cross-origin coordination is not cross-origin atomicity**

## 2. Application topology

Relay is a four-document federation:

```text
Relay Command origin
├── Shelter Grid iframe origin
├── Transit Ops iframe origin
└── Supply Hub iframe origin
```

Each provider iframe is embedded with:

```html
<iframe allow="tools">
```

Each provider explicitly limits cross-origin tool exposure to the configured Relay Command origin.

### Origin requirements

The command bootstrap rejects the application before initialization when:

- production origins are not HTTPS
- two providers share an origin
- a provider shares the command origin
- a production command origin points to a localhost provider

Different localhost ports are accepted for local development because they are distinct origins.

## 3. Relay Command

The top-level page owns:

- incident objective and hard constraints
- persistent provider iframe mesh
- accepted provider state snapshots
- known non-binding proposals
- staged cross-provider plan
- deterministic policy validation
- human amendment controls
- consent UI
- ephemeral P-256 signing key
- receipt and provenance stream
- live WebMCP capability viewer
- deterministic WebMCP proof runner

### Permanent tools

- `relay_get_incident`
- `relay_get_mesh_state`
- `relay_stage_plan`
- `relay_get_plan`

### Dynamic tool

- `relay_request_approval`

The approval tool exists only while a live plan is valid and eligible for a human decision.

## 4. Provider applications

Each provider owns:

- resource inventory
- monotonic state version
- proposal map
- proposal expiry timer
- trusted Relay session public key
- origin-local receipts
- one local disruption control for the competition scenario

Each provider exposes:

- one read-only discovery tool
- one non-binding proposal tool
- one dynamic commit tool

Providers never trust Relay's internal JavaScript state. They independently verify the signed PACT token and re-check their own live capacity before mutation.

## 5. Persistent iframe invariant

Provider iframes are mounted exactly once for the lifetime of the Relay page.

Dynamic UI updates replace only dedicated command-page containers. They never replace the iframe mesh.

This invariant matters because an iframe owns:

- provider proposal memory
- provider state version
- Relay session trust
- dynamic tool registrations
- proposal expiry timers

Recreating a provider iframe during planning would destroy that state and make the visible page diverge from the agent's capability surface.

## 6. Communication planes

Relay intentionally separates agent actuation from UI synchronization.

### 6.1 Agent actuation plane

WebMCP carries:

- provider discovery calls
- provider proposal calls
- Relay plan staging
- human approval request
- provider commit calls

### 6.2 Visible state plane

Explicit-origin `postMessage` carries:

- provider ready signal
- provider state snapshot
- newly created proposal
- commit receipt
- Relay session public-key bootstrap

Relay accepts provider messages only when:

- `event.origin` equals the configured provider origin
- `event.source` equals that provider's exact persistent iframe
- message data passes type and value validation

Providers accept session initialization only when:

- `event.origin` equals the configured Relay origin
- `event.source` is the parent window
- the command origin inside the message matches the configured origin
- the JWK is a valid P-256 public verification key

## 7. PACT state machine

```text
DRAFT
  │ provider proposals
  ▼
VALIDATED ─────────────────────────────┐
  │ human amendment                  │ provider state changes
  │                                  ▼
  │                               STALE
  │ approval call
  ▼
AWAITING_APPROVAL
  │ human rejects → REJECTED
  │ agent/browser cancels → VALIDATED
  │ provider changes → STALE
  │ human approves
  ▼
APPROVED
  │ exact provider batches
  ▼
COMMITTED
```

The command state and agent-visible tool surface are updated together.

## 8. Dynamic capability surface

Relay uses WebMCP registration lifecycle as an authorization boundary.

### Approval capability

`relay_request_approval`:

- does not exist in `DRAFT`
- appears after plan and policy validation
- resolves asynchronously only after the human decision or cancellation
- disappears after approval, rejection or staleness

### Provider commit capability

A provider commit tool:

- does not exist without trusted current-version proposals
- appears after a non-binding proposal
- disappears automatically when proposals expire
- disappears when provider state advances
- disappears after commit

`AbortSignal` is used to revoke dynamic registrations.

The runtime handles concurrent enable calls and disable-during-registration races so obsolete tools cannot reappear after revocation.

## 9. Human approval as suspended execution

`relay_request_approval.execute()` returns a Promise that remains pending while the human consent surface is visible.

The tool result resolves only after one of:

- human approval → signed PACT token
- human rejection → explicit rejection result
- browser or agent cancellation → cancellation result
- provider state change → stale-plan result

The human is therefore an actual dependency inside the agent's execution path, not a notification recipient after the work is done.

## 10. Session trust bootstrap

```text
Relay Command                         Provider
     │                                   │
     │  creates ephemeral P-256 pair     │
     │                                   │
     │◄──── relay_provider_ready ─────────│
     │                                   │
     │──── relay_session_init ───────────►│
     │     session ID + public JWK        │
     │                                   │
     │  human approves exact plan         │
     │  private key signs payload         │
     │                                   │
     │──── agent presents token ─────────►│
     │                                   │ verifies signature + scope
```

The private key remains in Relay Command memory and has no WebMCP tool.

Providers reject:

- malformed JWKs
- private key material
- non-P-256 keys
- a different key presented under the same active session ID

## 11. Deterministic policy gate

Relay validates the evacuation plan before the approval capability appears and again immediately before signing.

The policy engine verifies:

- shelter capacity
- transport capacity
- accessible transport
- protected North Shelter reserve
- general evacuation kits
- mobility medical kits
- maximum authority

This prevents a persuasive agent rationale from substituting for executable constraint satisfaction.

## 12. Versioning and quote invalidation

Every provider state mutation increments a monotonically increasing `stateVersion`.

Every proposal captures the exact state version observed at proposal time.

A proposal against v4 cannot commit when the provider is at v5.

Any provider state advance invalidates every outstanding proposal from the previous version, including proposals unrelated to the changed resource. This rule is intentionally coarse. It favors safe invalidation and simple proof over maximum concurrency.

## 13. Proposal expiry

Proposals have a five-minute lifetime.

Each provider maintains a timer for the earliest open proposal expiry. When the timer fires:

1. expired proposals are removed
2. committable proposal count is recomputed
3. the dynamic commit tool is revoked when no live proposals remain
4. the provider UI updates

Expiry is therefore reflected in both provider state and the agent capability surface without waiting for another agent call.

## 14. Same-origin atomic batches

A provider commit accepts every approved proposal ID for that provider in one batch.

Before mutation, the provider validates:

- signature and session
- exact complete scope set
- proposal versions and expiry
- aggregate local resource demand
- current capacity

Capacity changes only after every local check succeeds.

This avoids a self-induced stale-state failure when one plan needs more than one resource from the same provider.

## 15. Cross-origin completion

Relay does not claim distributed atomicity across unrelated origins.

Each provider emits one receipt per committed proposal. Relay uses those origin-bound receipts to converge the plan toward `COMMITTED`.

A production system would add domain-specific reservation holds, prepare/commit semantics or compensating operations for cross-origin partial failure.

## 16. Built-in proof runner

The proof runner is a browser evaluation client that may use only:

```ts
document.modelContext.getTools()
document.modelContext.executeTool()
```

It does not import internal command or provider state.

The runner proves:

- descendant tool discovery
- non-binding proposal creation
- plan staging
- suspended human consent
- exact provider commits
- stale-state failure
- final receipt convergence

## 17. Verification layers

Relay has four verification layers:

1. **Type system**: shared contracts and application validation
2. **Pure tests**: PACT, policy and dynamic lifecycle adversarial tests
3. **Built-in browser proof**: tool-only execution through WebMCP
4. **Human-visible state**: provider frames, consent surface and provenance stream

The layers are deliberately independent. Passing one does not silently substitute for another.
