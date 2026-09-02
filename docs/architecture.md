# Relay architecture

## 1. Design objective

Relay demonstrates one human objective spanning independent WebMCP origins while preserving explicit, inspectable authority over consequential execution.

The architecture rests on four separations:

1. **composition is not authorization**
2. **provider capability is not agent authority**
3. **proposal state is not provider state**
4. **cross-origin coordination is not distributed atomicity**

## 2. Four-origin topology

Relay is a federation of four documents:

```text
Relay Command origin
├── Shelter Grid iframe origin
├── Transit Ops iframe origin
└── Supply Hub iframe origin
```

Every provider frame is mounted with:

```html
<iframe allow="tools">
```

Each provider limits WebMCP exposure to the configured Relay Command origin. Production boot rejects:

- an insecure command or provider origin
- duplicate provider origins
- a provider sharing the command origin
- a production command delegating to localhost
- a non-origin-keyed browser context
- a missing, malformed or placeholder compiled release SHA

Different localhost ports remain valid distinct origins for local development.

## 3. Three separate planes

Relay separates state, agent actuation and authority.

### 3.1 Visible state plane

Strict `postMessage` traffic synchronizes:

- provider readiness
- provider snapshots
- proposals
- receipts
- Relay session public-key bootstrap

Relay accepts a provider message only when:

```text
event.origin = configured provider origin
AND
event.source = that provider's persistent iframe
AND
message shape and values validate
```

Providers accept session initialization only from the configured parent Relay origin with a valid P-256 public JWK.

### 3.2 Provider capability plane

Each provider owns:

- inventory
- monotonic state version
- non-binding proposal map
- proposal expiry timer
- trusted Relay session key
- origin-local receipts
- one deterministic disruption control

Each provider implements:

- one read tool
- one proposal tool
- one dynamic commit tool

A provider commit implementation can become locally available once trusted current-version proposals exist. That does **not** mean ChatGPT is authorized to call a top-level commit wrapper.

### 3.3 Agent authority plane

Relay Command mirrors exact provider capabilities through an origin-locked compatibility bridge because an agent client may not directly surface tools supplied only by embedded documents.

Native cross-origin `getTools()`/`executeTool()` is preferred. If the client
implements only document-bound WebMCP, providers advertise the same locally
guarded implementations through `relay.provider-rpc.v1`. Relay accepts those
messages only from the configured origin and matching iframe window, uses exact
target origins, bounds payloads and execution time, and rejects replayed request
IDs. Business logic and inventory remain inside each provider origin.

Each wrapper is bound to:

```text
one exact provider origin
+ one exact provider tool name
+ one explicit schema
```

There is no generic origin selector, arbitrary tool-name argument or execute-any capability.

Read and proposal wrappers mirror exact provider availability.

Consequential commit wrappers require both:

```text
exact provider commit implementation exists
AND
current Relay plan status = APPROVED
```

The condition is enforced when the wrapper is registered and again immediately before invocation. A stale wrapper reference returns `HUMAN_APPROVAL_REQUIRED` without invoking the provider.

## 4. Relay Command responsibilities

Relay Command owns:

- incident objective and hard constraints
- persistent provider iframe mesh
- accepted provider snapshots
- known proposals
- staged cross-provider plan
- deterministic policy validation
- human amendment controls
- suspended consent surface
- ephemeral P-256 signing key
- receipt and provenance stream
- fixed compatibility bridge
- release identity, diagnostics and final audit tools

### Permanent coordination and evidence tools

```text
relay_get_incident
relay_get_mesh_state
relay_stage_plan
relay_get_plan
relay_get_release_identity
relay_diagnose_webmcp
relay_get_audit_bundle
relay_bridge_status
```

### Dynamic Relay tool

```text
relay_request_approval
```

It exists only while a valid plan remains eligible for a human decision.

### Initial bridge readiness

Relay waits for the permanent fixed read/proposal bridge surface for a bounded interval before diagnostics become callable. The wait cannot hang boot indefinitely, but it reduces false first-probe failures caused by asynchronous registration.

## 5. Persistent provider invariant

Provider iframes are mounted once for the Relay page lifetime.

Command UI renders into dedicated containers without replacing the iframe mesh. Recreating a provider iframe would destroy:

- proposal memory
- state version
- Relay session trust
- dynamic registrations
- expiry timers

Persistent documents keep visible provider state and the capability plane aligned.

## 6. PACT state machine

```text
DRAFT
  │ exact provider proposals
  ▼
VALIDATED ───────────────────────────────┐
  │ human amendment                    │ provider state changes
  │                                    ▼
  │                                  STALE
  │ relay_request_approval
  ▼
AWAITING_APPROVAL
  │ human rejects → REJECTED
  │ cancellation → VALIDATED
  │ provider changes → STALE
  │ human approves exact plan
  ▼
APPROVED
  │ exact provider batches
  ▼
COMMITTED
```

Human authority is monotonic during a scenario: it can remain equal or tighten. A human-confirmed €3,000 ceiling cannot be silently restored to the original €5,000 ceiling during stale recovery.

## 7. Human approval as suspended execution

`relay_request_approval.execute()` returns a Promise that remains pending while the visible consent sheet is open.

It resolves only after:

- human approval → signed PACT token
- human rejection → explicit rejection result
- cancellation → cancellation result
- provider state change → stale-plan result

No approval token exists before the human click. No top-level commit wrapper exists before the plan becomes `APPROVED`.

The human is an execution dependency, not a notification recipient.

## 8. Session trust and PACT authorization

Relay creates an ephemeral ECDSA P-256 key pair in page memory. Only the public JWK and session ID are sent to providers.

The private key:

- remains in Relay Command memory
- has no WebMCP tool
- signs only the exact visible approval payload

Every signed scope binds:

- proposal and resource identity
- provider ID and exact origin
- quantity, unit and price
- purpose
- provider state version
- proposal expiry

The approval payload binds:

- session ID
- plan ID
- canonical plan hash
- exact scope set
- aggregate human authority ceiling
- issuance and expiry

Providers reject invalid signatures, sessions, origins, operations, versions, expiry, incomplete batches and aggregate authority escalation.

## 9. Deterministic policy gate

Relay validates the evacuation plan before approval capability appears and again immediately before signing.

The policy engine verifies:

- 42 shelter beds
- protected North Shelter reserve
- 42 transport positions
- at least 9 accessible positions
- 42 evacuation kits
- 9 mobility medical kits
- total cost within human authority

Persuasive rationale cannot substitute for executable constraint satisfaction.

## 10. Versioning, expiry and revocation

Every provider state mutation increments `stateVersion`.

Every proposal captures the exact version observed at creation. A v4 proposal cannot commit against provider v5.

Any provider state advance invalidates all outstanding proposals from the previous version. The rule is intentionally coarse: simple safe invalidation is preferred over maximum concurrency for the competition proof.

Proposals expire after five minutes. Expiry removes proposals and revokes provider commit implementations. The compatibility bridge subsequently removes corresponding wrappers.

`AbortSignal` drives WebMCP revocation. The runtime handles concurrent enable calls and disable-during-registration races so obsolete tools cannot reappear.

## 11. Local atomicity and cross-origin completion

Each provider commit accepts the complete approved proposal batch for that origin.

Before mutation, the provider validates:

- signature and session
- exact complete local scope set
- proposal versions and expiry
- aggregate demand
- current capacity

Capacity changes only after every local check passes.

Relay does not claim distributed ACID across unrelated origins. Providers issue one receipt per committed proposal. Partial cross-provider completion remains visible as an `APPROVED` plan with an incomplete receipt set and causes audit bundle v2 to fail until valid recovery completes.

## 12. Release provenance

Production evidence is valid only when:

```text
compiled VITE_RELEASE_SHA
=
trusted X-Relay-Release response header
=
/release.json SHA
=
validated Git commit
```

`relay_get_release_identity` rejects:

- malformed or placeholder SHAs
- non-success manifest responses
- conflicting duplicate release headers
- wrong application manifests
- any mismatch between compiled, edge and manifest identity

`relay_diagnose_webmcp` includes release identity in its production pass condition. `relay_get_audit_bundle` refuses to certify a transaction whose deployed identity fails.

## 13. Response-policy requirements

Every deployed document, manifest, health response and static asset must preserve:

```http
Origin-Agent-Cluster: ?1
```

Caddy is the single owner of dynamic origin-aware CSP and Permissions-Policy. Relay Command delegates the `tools` feature only to itself and the three exact providers. Provider documents are self-only at the public edge.

Nginx repeats origin isolation, `nosniff` and referrer policy inside every location that owns an `add_header` set because Nginx header inheritance resets at that boundary.

## 14. Evidence layers

Relay separates evidence classes:

1. **source gates**: static invariants and syntax
2. **unit and hostile tests**: protocol, policy, audit and race behavior
3. **deterministic browser harness**: WebMCP behavior against a controlled model-context client
4. **deployed HTTPS smoke**: real four-origin headers, assets and release identity
5. **actual ChatGPT proof**: supported built-in browser against the deployed mesh
6. **human-visible evidence**: consent, provider mutation, capability changes and receipts

No lower evidence class is relabeled as a higher one.

The optional proof runner is harness evidence only. It does not prove actual ChatGPT compatibility.
