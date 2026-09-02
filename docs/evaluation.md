# Relay evaluation plan

Relay is evaluated on three independent questions:

1. Does the experience materially depend on WebMCP?
2. Does consequential capability remain human-governed under failure and adversarial input?
3. Can the deployed evidence be tied to the exact reviewed source commit?

A pass in one layer never substitutes for another.

## 1. Evidence classes

| Class | Proves | Does not prove |
| --- | --- | --- |
| Source gates | release invariants exist and parse | dependencies install or code executes |
| Unit and hostile tests | protocol, policy, audit and race behavior | deployed headers or ChatGPT compatibility |
| Deterministic browser harness | controlled WebMCP tool lifecycle | actual ChatGPT behavior |
| Four-origin deployment smoke | real HTTPS, headers, assets and release identity | agent-visible tools inside ChatGPT |
| Actual ChatGPT gate | supported client can discover and execute the deployed surface | repeated demo reliability until rehearsed |
| Rehearsal/video | judging path is legible and repeatable | stronger protocol guarantees than the underlying evidence |

## 2. Exact deployed identity evaluation

### Procedure

1. Run the full release gate from a clean checkout.
2. Open Relay in a fresh ChatGPT browser context.
3. Call `relay_get_release_identity`.

### Pass condition

```text
compiled application SHA
=
trusted X-Relay-Release edge header
=
/release.json SHA
=
git rev-parse HEAD
```

Required result:

```json
{
  "ok": true,
  "checks": {
    "responseOk": true,
    "compiledShaValid": true,
    "edgeHeaderConsistent": true,
    "edgeShaValid": true,
    "manifestValid": true,
    "allLayersConsistent": true
  }
}
```

Conflicting duplicate edge headers, a non-success manifest response or any mismatched layer fails the gate.

## 3. WebMCP dependency evaluation

The deterministic proof runner may use only:

```ts
document.modelContext.getTools()
document.modelContext.executeTool()
```

It may not import application stores, provider runtimes, proposal maps, signing keys or commit functions. Its output remains harness evidence.

The decisive client evaluation happens through ChatGPT's built-in browser.

### Initial ChatGPT-visible surface

Relay Command permanent tools:

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

Fixed provider read/proposal wrappers:

```text
relay_bridge_shelter_find_capacity
relay_bridge_shelter_propose_reservation
relay_bridge_transit_find_accessible_routes
relay_bridge_transit_propose_reservation
relay_bridge_supply_check_stock
relay_bridge_supply_propose_reservation
```

Before consent, all top-level provider commit wrappers must be absent.

### Diagnostic pass condition

`relay_diagnose_webmcp` with read probes must return:

```text
provenance pass
origin-isolation pass
permanent Relay registration pass
ChatGPT visibility pass
all three provider discovery passes
all three semantic read execution passes
origin-locked compatibility bridge initial registration and visibility passes
```

A listed tool that throws, returns null, invalid JSON or semantic `{ "ok": false }` fails.

## 4. Deterministic success evaluation

### Objective

Evacuate all 42 Riverside residents before 18:00 while:

- providing 42 shelter beds
- providing 42 transport positions
- providing at least 9 accessible positions
- preserving 20 North Shelter beds
- providing 42 evacuation kits
- providing 9 mobility medical kits
- remaining beneath human authority

### Initial expected plan

Six live proposals produce a policy-valid plan staged under the incident's **€5,000** ceiling. The exact shelter allocation and total may vary as the agent reasons over provider details.

### Required human action

The human visibly narrows authority:

```text
€5,000 → €3,000
```

The agent must not perform this narrowing.

### State transitions

```text
DRAFT
→ VALIDATED
→ AWAITING_APPROVAL
→ APPROVED
→ COMMITTED
```

### Capability transitions

```text
before approval
  read/proposal wrappers visible
  relay_request_approval visible after validation
  commit wrappers absent

after exact approval
  relay_request_approval absent
  exactly three provider commit wrappers visible

after each provider batch closes
  that provider's commit wrapper disappears

after global completion
  all commit wrappers absent
```

### Final evidence

- six proposal IDs
- eight deterministic policy checks, including the machine-evaluated completion deadline
- exact consent sheet
- signed token returned only after human approval
- three complete same-origin commit calls
- six unique receipts
- final `COMMITTED` status
- audit bundle v2 pass

## 5. Stale-state and authority-retention evaluation

### Procedure

1. Build the canonical plan at €5,000.
2. Human narrows authority to €3,000.
3. Call `relay_request_approval`.
4. While the call is suspended, use **Disrupt active shelter**.

### Required result

- Shelter Grid advances v1 → v2
- prior shelter proposals disappear
- plan becomes `STALE`
- pending approval resolves without a token
- `relay_request_approval` disappears
- top-level commit wrappers remain absent
- no provider capacity is consumed
- durable human authority remains €3,000

### Recovery pass condition

The agent replaces only invalid shelter work, reuses other proposals only if current and restages under `maxBudget: 3000`.

The recovered shelter work and total depend on the initial live allocation.
Pass when every stale shelter proposal is replaced, all policy checks pass and
the retained €3,000 authority ceiling is not increased.

## 6. Human rejection evaluation

### Procedure

1. Stage a valid plan.
2. Call `relay_request_approval`.
3. Human clicks **Reject**.

### Required result

- approval resolves with `HUMAN_REJECTED`
- no token is returned
- no top-level commit wrapper appears
- inventory is unchanged
- plan status becomes `REJECTED`

## 7. Authorization adversarial matrix

| Attack | Expected result |
| --- | --- |
| Stale captured bridge wrapper invoked after approval loss | `HUMAN_APPROVAL_REQUIRED`, provider not invoked |
| Commit without a token | input or provider authorization rejected, no mutation |
| Token payload changed after signing | `INVALID_SIGNATURE` |
| Token from another session | `SESSION_MISMATCH` |
| Private JWK supplied as trust material | key rejected |
| Public key substituted under active session ID | session update rejected |
| Duplicate proposal scope | `DUPLICATE_SCOPE` |
| Scope cost inconsistent | `SCOPE_COST_INCONSISTENT` |
| Aggregate scope cost above authority | `AGGREGATE_COST_EXCEEDED` |
| Resource, quantity, cost or purpose changed | `OPERATION_SCOPE_MISMATCH` |
| Provider origin changed | origin scope rejected |
| Provider version changed | `VERSION_SCOPE_MISMATCH` or `STALE_PROPOSAL` |
| Proposal or approval expires | capability removed and commit rejected |
| Partial approved provider batch submitted | `INCOMPLETE_PROVIDER_BATCH` |
| Batch demand exceeds capacity | entire local batch rejected |
| Same proposal committed twice | proposal no longer exists |
| Provider message comes from wrong frame | message rejected |
| Production configuration points to localhost | boot rejected |
| Production compiled SHA is absent or placeholder | boot rejected |
| Conflicting duplicate release headers | identity proof fails |
| Dynamic tool enabled concurrently | one registration |
| Tool disabled during pending registration | eventual registration revoked |

## 8. Policy adversarial matrix

| Invalid plan | Expected failed check |
| --- | --- |
| 42 generic transport seats, zero accessible positions | `accessible_transport` |
| sufficient shelter by consuming protected North reserve | `north_reserve` |
| all evacuation kits, no mobility kits | `mobility_kits` |
| feasible resources above authority | `budget` |
| fewer than 42 shelter beds | `shelter_capacity` |
| fewer than 42 transport positions | `transport_capacity` |
| fewer than 42 evacuation kits | `evacuation_kits` |

The policy engine runs before approval capability appears and again immediately before signing.

## 9. Partial cross-provider completion evaluation

Relay does not claim distributed ACID.

### Procedure

1. Approve the exact plan.
2. Commit Shelter Grid.
3. Submit an incomplete Transit Ops batch.

### Required result

- Shelter receipts remain visible
- plan remains `APPROVED`, not `COMMITTED`
- Transit inventory and version remain unchanged
- incomplete Transit batch returns `INCOMPLETE_PROVIDER_BATCH`
- audit bundle v2 returns `AUDIT_STATE_INCONSISTENT`
- valid remaining batches can complete while exact authority remains live

Expired or stale authority requires a fresh plan and fresh human approval.

## 10. Final audit evaluation

Audit bundle v2 passes only when:

```text
final plan proposal IDs
=
each matching approval's exact scope IDs and arguments
=
receipt proposal IDs and arguments
```

It also requires:

- current canonical plan hash
- one Relay session for matching approvals
- exact visible authority ceiling
- exact proposal and receipt totals
- one valid receipt per final proposal
- successful deployed release identity
- final `COMMITTED` status

Missing, duplicate, malformed, mutated or partial evidence fails even if the plan claims completion.

## 11. Automated gates

### Source release gate

```bash
npm run gate:source
```

Requires a clean exact branch, Node 22, npm 10.9.2, committed lockfile, script syntax, release-contract checks, fresh `npm ci`, all source gates, tests and four production builds.

### Full deployment gate

```bash
npm run gate:release -- --env .env.deploy
```

Adds DNS, Docker, Compose, Caddy, Nginx, production images and four-origin HTTPS/security/provenance smoke.

## 12. Final manual checklist

- [ ] exact source gate passes
- [ ] exact full deployment gate passes
- [ ] four distinct secure origins
- [ ] release identity passes in ChatGPT
- [ ] initial diagnostic passes in ChatGPT
- [ ] one real proposal succeeds against every provider
- [ ] commit wrappers are absent before consent
- [ ] human narrows authority to €3,000
- [ ] stale drill invalidates authority without mutation
- [ ] recovery retains €3,000
- [ ] exact approval creates exactly three commit wrappers
- [ ] three providers independently commit
- [ ] six unique receipts close the plan
- [ ] audit bundle v2 passes
- [ ] partial completion drill passes
- [ ] reset restores deterministic v1 state
- [ ] browser console has no uncaught error
- [ ] three canonical and three stale/recovery rehearsals pass
- [ ] final video is under three minutes

## 13. Rubric mapping

### WebMCP leverage

- four origin-keyed WebMCP documents
- `allow="tools"` and `exposedTo`
- exact-origin `getTools` and `executeTool`
- fixed compatibility bridge
- stateful registration and revocation
- `toolchange` evidence
- human-gated asynchronous tool execution
- same-page provider mutation

### Execution

- deterministic policy engine
- exact signed authorization
- invocation-time authority recheck
- proposal expiry and stale invalidation
- atomic same-origin batches
- persistent provider frames
- exact audit closure
- commit-bound release provenance
- one fail-closed source gate and one deployment gate

### Impact

The pattern generalizes to procurement, travel disruption, healthcare coordination, incident response, logistics and other workflows where one objective spans independent sites but authority cannot be delegated as a blank cheque.

### Creativity and ambition

Relay treats websites as federated trust and execution boundaries for agents. PACT is a reusable authorization primitive, not AI decoration on a single-site workflow.
