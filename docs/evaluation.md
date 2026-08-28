# Relay evaluation plan

Relay is evaluated on two separate questions:

1. Does the experience materially depend on WebMCP?
2. Does consequential execution remain human-governed under failure and adversarial input?

## 1. WebMCP dependency test

The built-in proof runner is restricted to:

```ts
document.modelContext.getTools()
document.modelContext.executeTool()
```

It may not import application stores, provider runtimes, proposal maps, signing keys or commit functions.

A successful proof therefore establishes that the full workflow is reachable through the live WebMCP capability surface.

### Expected discovery surface

Relay Command:

- `relay_get_incident`
- `relay_get_mesh_state`
- `relay_stage_plan`
- `relay_get_plan`
- `relay_request_approval` after validation

Shelter Grid:

- `shelter_find_capacity`
- `shelter_propose_reservation`
- `shelter_commit_reservation` while current proposals exist

Transit Ops:

- `transit_find_accessible_routes`
- `transit_propose_reservation`
- `transit_commit_reservation` while current proposals exist

Supply Hub:

- `supply_check_stock`
- `supply_propose_reservation`
- `supply_commit_reservation` while current proposals exist

## 2. Deterministic success evaluation

### Objective

Evacuate all 42 Riverside residents before 18:00 while:

- providing 42 shelter beds
- providing 42 transport seats
- providing at least 9 wheelchair-accessible positions
- preserving 20 North Shelter beds
- providing 42 evacuation kits
- providing 9 mobility medical kits
- remaining beneath the human authority ceiling

### Expected plan

Six provider proposals with a total cost of €2,733.

### Expected state transitions

```text
DRAFT
→ VALIDATED
→ AWAITING_APPROVAL
→ APPROVED
→ COMMITTED
```

### Expected evidence

- six proposal IDs visible in Relay
- seven deterministic policy checks passing
- human approval modal showing exact origins, operations, versions and costs
- signed token returned only after the human click
- three same-origin commit calls
- six origin-bound receipts
- final plan status `COMMITTED`

## 3. Stale-state evaluation

### Procedure

1. Create and stage the canonical plan.
2. Call `relay_request_approval`.
3. While the agent call is suspended, click **Inject disruption** in Shelter Grid.

### Expected result

- South Shelter availability changes
- Shelter Grid advances its state version
- every prior shelter proposal is deleted
- Shelter Grid commit capability is removed
- Relay detects the version mismatch
- the plan becomes `STALE`
- the pending approval call resolves with a stale-plan result
- no provider capacity is consumed by the old plan

### Pass condition

The old proposal set can no longer reach provider mutation through any supported tool path.

## 4. Human-rejection evaluation

### Procedure

1. Stage a valid plan.
2. Call `relay_request_approval`.
3. Click **Reject**.

### Expected result

- approval resolves with `HUMAN_REJECTED`
- no signed token is returned
- provider inventory is unchanged
- the approval capability disappears
- plan status becomes `REJECTED`

## 5. Authorization adversarial matrix

| Attack | Expected result | Evidence |
| --- | --- | --- |
| Commit without a token | input rejected, no mutation | provider runtime |
| Token payload changed after signing | `INVALID_SIGNATURE` | PACT tests |
| Token from another session | `SESSION_MISMATCH` | PACT tests |
| Private JWK supplied as public trust material | key rejected | PACT tests |
| Same session ID with substituted public key | session update rejected | provider runtime |
| Scope repeats a proposal ID | `DUPLICATE_SCOPE` | PACT verifier |
| Scope total differs from quantity × unit cost | `SCOPE_COST_INCONSISTENT` | PACT tests |
| Aggregate scope cost exceeds human ceiling | `AGGREGATE_COST_EXCEEDED` | PACT tests |
| Resource or purpose changed after approval | `OPERATION_SCOPE_MISMATCH` | PACT tests |
| Provider origin changed | origin scope rejected | PACT verifier |
| Proposal state version changed | `VERSION_SCOPE_MISMATCH` or `STALE_PROPOSAL` | PACT tests and live drill |
| Proposal expires | commit capability removed and commit rejected | provider expiry timer |
| Only part of an approved provider batch is submitted | `INCOMPLETE_PROVIDER_BATCH` | PACT tests |
| Batch demand exceeds live capacity | entire local batch rejected | provider runtime |
| Same proposal committed twice | proposal no longer exists | provider runtime |
| Provider message comes from another frame | message rejected | Relay source binding |
| Production configuration points to localhost | boot rejected | Relay bootstrap |
| Dynamic tool enabled concurrently | one registration | lifecycle tests |
| Tool disabled during pending registration | eventual registration revoked | lifecycle tests |

## 6. Policy adversarial matrix

| Invalid plan | Expected failed check |
| --- | --- |
| 42 generic transport seats, zero accessible positions | `accessible_transport` |
| sufficient shelter by consuming protected North reserve | `north_reserve` |
| all general evacuation kits, no mobility kits | `mobility_kits` |
| feasible resources above the human ceiling | `budget` |
| fewer than 42 shelter beds | `shelter_capacity` |
| fewer than 42 transport seats | `transport_capacity` |
| fewer than 42 evacuation kits | `evacuation_kits` |

The policy engine runs before the approval capability appears and again immediately before signing.

## 7. Dynamic capability evaluation

The live capability panel should show these changes:

### Initial state

- Relay read and stage tools
- provider search and proposal tools
- no Relay approval tool
- no provider commit tools

### After provider proposal

- that provider's commit tool appears

### After valid plan staging

- `relay_request_approval` appears

### After provider disruption

- affected provider commit tool disappears
- `relay_request_approval` disappears when the plan becomes stale

### After approval

- Relay approval tool disappears
- provider commit tools remain only for approved current proposals

### After commit

- provider commit tool disappears

This validates that WebMCP is being used as a stateful capability system, not as a static list of button aliases.

## 8. Automated repository gates

Run:

```bash
npm run verify
```

The gate includes:

1. TypeScript validation for protocol and applications
2. PACT canonicalization, signature and authorization tests
3. dynamic WebMCP registration lifecycle tests
4. deterministic evacuation policy tests
5. production builds for all four applications

Relevant test files:

- `packages/pact/src/index.test.ts`
- `packages/webmcp-runtime/src/index.test.ts`
- `packages/simulation/src/policy.test.ts`

## 9. Supported-browser manual checklist

Before recording the final demo:

- [ ] all four applications load on distinct secure origins
- [ ] Relay reports `3/3 PROVIDERS`
- [ ] live capability panel shows remote provider tools
- [ ] proof runner discovers all expected tools
- [ ] canonical success path reaches `COMMITTED`
- [ ] six receipts appear
- [ ] page reload resets deterministic state
- [ ] stale-state drill invalidates the plan before approval
- [ ] human rejection consumes no capacity
- [ ] browser console contains no uncaught errors
- [ ] tool descriptions remain concise and unambiguous
- [ ] final video stays below three minutes

## 10. Rubric mapping

### WebMCP leverage

Evidence:

- cross-origin descendant tools
- `allow="tools"`
- `exposedTo` origin gating
- dynamic registration and revocation
- `toolchange` visualization
- suspended async human approval
- same-page visible state mutation
- proof runner limited to `getTools()` and `executeTool()`

### Execution

Evidence:

- deterministic policy engine
- exact signed authorization capsule
- automatic expiry
- atomic local batches
- persistent provider frames
- source-bound messaging
- adversarial test suites
- explicit non-claims

### Impact

The pattern generalizes to procurement, travel disruption, healthcare coordination, incident response, logistics and other workflows where one objective spans independent sites but authority cannot be delegated as a blank cheque.

### Creativity and ambition

Relay treats websites as federated trust and execution boundaries for agents. PACT proposes a reusable authorization primitive rather than adding AI to an existing single-site workflow.
