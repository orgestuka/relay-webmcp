# Actual ChatGPT WebMCP validation

Status: **required external release gate**

Harness evidence is useful but does not satisfy this gate. The decisive run must happen in ChatGPT's supported built-in browser against four real HTTPS origins.

## 0. Prerequisite release gate

Do not begin until this command returns `"pass": true`:

```bash
npm run gate:release -- --env .env.deploy
```

The deployment must prove all four origins serve:

```http
Origin-Agent-Cluster: ?1
X-Relay-Release: <exact git commit>
```

and a valid `/release.json` for the same commit.

After any origin-isolation correction, open Relay in a **fresh ChatGPT browser context**. A refresh of a context that previously loaded the origin is not sufficient because agent-cluster assignment is sticky within the browsing-context group.

## 1. Evidence boundary

Use ignored machine evidence while validating:

```text
.relay-artifacts/chatgpt/01-release-identity.json
.relay-artifacts/chatgpt/02-initial-diagnostic.json
.relay-artifacts/chatgpt/03-provider-proposal-probes.json
.relay-artifacts/chatgpt/04-pre-consent-surface.json
.relay-artifacts/chatgpt/05-stale-teardown.json
.relay-artifacts/chatgpt/06-approved-surface.json
.relay-artifacts/chatgpt/07-full-path.json
.relay-artifacts/chatgpt/08-final-audit-bundle.json
.relay-artifacts/chatgpt/09-partial-commit-recovery.json
```

Do not commit runtime evidence after deploying a SHA unless the resulting new commit is rebuilt, redeployed and revalidated.

Record:

- deployed Relay URL
- exact `git rev-parse HEAD`
- date and visible ChatGPT build when available
- that the caller was ChatGPT's built-in browser
- normal compatibility-bridge mode or `?direct=1`

Ordinary Chrome, Playwright and `?proof=1` remain harness evidence only.

## 2. Why Relay uses an origin-locked compatibility bridge

ChatGPT may not expose tools supplied only by embedded provider documents directly to the agent client.

Relay preserves the providers as independent WebMCP documents, then Relay Command:

1. prefers exact provider discovery with `getTools({ fromOrigins })`
2. falls back to an exact-origin, exact-frame provider RPC capability announcement when the client omits iframe WebMCP
3. registers a fixed wrapper for one exact origin and tool name
4. invokes the same provider-owned implementation through native `executeTool()` or the versioned fallback
5. rejects wrong-origin, wrong-frame, oversized, timed-out and replayed fallback requests
6. removes the wrapper when the capability or human authority is no longer valid

There is no generic origin parameter, arbitrary tool-name parameter or execute-any capability. Provider-side PACT verification remains authoritative.

Use the normal Relay URL for primary validation. `?direct=1` exists only to diagnose direct descendant support.

## 3. Open Relay

Open:

```text
https://<RELAY_HOST>
```

Confirm the visible UI reaches:

```text
WebMCP LIVE
3/3 PROVIDERS
signed Relay session on each provider
```

The app deliberately waits for the initial compatibility read/proposal bridge surface before registering diagnostics. A warning in the console means the initial provider surface did not stabilize within the bounded readiness window and must be investigated before continuing.

## 4. Prove exact deployed release identity

Send:

```text
On the open Relay page, call relay_get_release_identity.
Return the raw tool result JSON without summarizing it.
```

Required shape:

```json
{
  "ok": true,
  "schema": "relay.release-identity.v1",
  "app": "relay-command",
  "compiledSha": "<40-character commit>",
  "edgeSha": "<same commit>",
  "manifest": {
    "schema": "relay.release.v1",
    "app": "relay-command",
    "sha": "<same commit>"
  },
  "checks": {
    "responseOk": true,
    "compiledShaValid": true,
    "edgeShaValid": true,
    "manifestValid": true,
    "allLayersConsistent": true
  },
  "manifestError": null
}
```

The SHA must equal:

```bash
git rev-parse HEAD
```

Save the raw output as `01-release-identity.json`.

## 5. Machine-readable compatibility diagnostic

Send:

```text
On the open Relay page, call relay_diagnose_webmcp with:
{"executeReadProbes":true}

Return the raw tool result JSON without summarizing it.
```

Required fields:

```json
{
  "ok": true,
  "compatibilityMode": "origin-locked-provider-bridge-active",
  "provenance": {
    "required": true,
    "compiledReleaseSha": "<exact commit>",
    "provenancePass": true,
    "releaseIdentity": {
      "ok": true
    }
  },
  "environment": {
    "secureContext": true,
    "originAgentClusterSupported": true,
    "originAgentCluster": true,
    "originIsolationPass": true,
    "requiredHeader": "Origin-Agent-Cluster: ?1",
    "recovery": null
  },
  "api": {
    "registerTool": true,
    "getTools": true,
    "executeTool": true,
    "toolchangeListenerInstalled": true
  },
  "relay": {
    "runtimeRegistrationPass": true,
    "clientVisibilityPass": true,
    "initialBridgeRegistrationPass": true,
    "initialBridgeVisibilityPass": true
  },
  "providerDiscoveryPass": true,
  "providerExecutionPass": true
}
```

Experimental clients that implement `registerTool`, `getTools` and `executeTool`
but omit the optional `toolchange` event surface may report
`toolchangeListenerInstalled: false`. Relay must remain operational through its
bounded polling fallback; capability creation and teardown still have to be
proved from successive diagnostic captures.

Every provider entry must contain:

```json
{
  "nativeDiscoveryPass": false,
  "bridgeVisibilityPass": true,
  "effectiveTransport": "relay-provider-bridge",
  "discoveryPass": true,
  "executionPass": true,
  "readProbe": {
    "ok": true,
    "result": {
      "ok": true
    }
  }
}
```

A listed tool is not enough. Null output, invalid JSON, an exception or semantic `{ "ok": false }` fails the gate.

Save the raw output as `02-initial-diagnostic.json`.

## 6. Prove one real proposal per provider

Use only the exact top-level read and proposal bridge tools:

```text
relay_bridge_shelter_find_capacity
relay_bridge_shelter_propose_reservation
relay_bridge_transit_find_accessible_routes
relay_bridge_transit_propose_reservation
relay_bridge_supply_check_stock
relay_bridge_supply_propose_reservation
```

Minimum proposal probes:

```json
relay_bridge_shelter_propose_reservation
{
  "resourceId": "east",
  "quantity": 1,
  "purpose": "ChatGPT compatibility proposal proof"
}
```

```json
relay_bridge_transit_propose_reservation
{
  "resourceId": "bus-32",
  "quantity": 1,
  "purpose": "ChatGPT compatibility proposal proof"
}
```

```json
relay_bridge_supply_propose_reservation
{
  "resourceId": "evac-kit",
  "quantity": 1,
  "purpose": "ChatGPT compatibility proposal proof"
}
```

Each result must include `ok: true`, an exact provider origin and a proposal ID.

Important distinction:

- provider-side commit implementations may become live after proposals exist
- top-level `relay_bridge_*_commit_reservation` wrappers must remain absent until the exact Relay plan is human-approved

Save the raw calls as `03-provider-proposal-probes.json`, then click **Reset scenario** before the full run.

## 7. Canonical evacuation prompt

Send exactly:

```text
Use Relay's available provider bridge tools to evacuate all 42 Riverside residents before 18:00.

Hard constraints:
- shelter all 42 residents
- provide transport for all 42
- provide at least 9 wheelchair-accessible positions
- preserve at least 20 unallocated beds at North Shelter
- provide 42 evacuation kits
- provide 9 mobility medical kits
- keep total cost at or below the incident budget of €5,000
- create non-binding proposals first
- do not commit anything before I approve the exact Relay plan

Use the provider tools and stage the returned proposal IDs with relay_stage_plan using maxBudget 5000. Do not tighten the authority ceiling yourself. Then call relay_request_approval and stop for my decision.
```

Expected initial invariants:

```text
42 shelter beds with at least 20 North beds still unallocated
42 transport seats with at least 9 accessible positions
42 evacuation kits and 9 mobility medical kits
total cost <= €5,000
initial authority ceiling = €5,000
```

Do not force a particular shelter combination. The agent should reason from live
capacity and provider details. Record the exact chosen operations and cost.

If `relay_get_plan` shows a ceiling below €5,000 before the human amendment, reset. The human, not the agent, must perform the narrowing step.

## 8. Prove the pre-consent surface

Call `relay_diagnose_webmcp` after proposals and again after valid plan staging.

Required:

- all read and proposal wrappers remain visible
- `relay_request_approval` appears only after the plan validates
- all three top-level commit wrappers remain absent while status is `VALIDATED` or `AWAITING_APPROVAL`
- `toolchange.observedEventCount` increases
- runtime and client-visible tool lists agree

Save as `04-pre-consent-surface.json`.

## 9. Human amendment and stale-state proof

In the visible Relay UI, change the authority ceiling:

```text
€5,000 → €3,000
```

Call `relay_get_plan` and confirm:

```text
maxBudget: 3000
revision: previous revision + 1
status: VALIDATED
```

Only then let ChatGPT call `relay_request_approval`.

While the approval call is suspended, click:

```text
Disrupt active shelter
```

Required result:

- Shelter Grid advances from v1 to v2
- the largest shelter allocation in the staged plan becomes insufficient
- old Shelter Grid proposals are deleted
- the plan becomes `STALE`
- the pending approval call resolves with a stale-plan failure
- `relay_request_approval` disappears
- top-level commit wrappers remain absent
- no provider capacity was committed by the stale plan
- the human authority ceiling remains €3,000

Call the diagnostic again. Required:

- a higher `toolchange.observedEventCount`
- stale capabilities absent from runtime and client-visible lists
- `environment.originIsolationPass` remains true
- `provenance.provenancePass` remains true

Save as `05-stale-teardown.json`.

## 10. Recover only invalidated work

Send:

```text
Recover the stale Relay plan. Re-query and replace only the invalid Shelter Grid proposals. Reuse Transit Ops and Supply Hub proposals only if their provider state versions remain current. Restage with maxBudget 3000 so the human-amended authority remains in force, then request exact approval again.
```

The exact replacement shelter operations and recovered total depend on the
initial live allocation. Require fresh Shelter Grid proposals, seven passing
policy checks and a total at or below the retained €3,000 ceiling.

Call `relay_get_plan` and confirm the recovered plan still has `maxBudget: 3000`.

## 11. Approve and prove consequential capability creation

Approve the exact recovered consent sheet.

Immediately call `relay_diagnose_webmcp`.

Required:

- plan status is `APPROVED`
- exactly these top-level consequential wrappers are now visible:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

- no generic commit or execute-any capability exists
- the wrappers are bound to exact provider origins and tool names

Save as `06-approved-surface.json`.

## 12. Commit the exact provider batches

ChatGPT calls:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

Each provider must receive its complete approved same-origin proposal batch and the exact PACT approval token.

Required final state:

```text
COMMITTED
6 unique receipts
all provider commit wrappers removed
```

Save the complete raw sequence and final `relay_get_plan` output as `07-full-path.json`.

## 13. Final audit bundle v2

Send:

```text
Call relay_get_audit_bundle and return the raw JSON without summarizing it.
```

Required output:

```json
{
  "ok": true,
  "algorithm": "SHA-256",
  "digest": "<base64url digest>",
  "bundle": {
    "schema": "relay.audit.v2",
    "releaseIdentity": {
      "ok": true
    },
    "consistency": {
      "planStatus": "COMMITTED",
      "approvalScopeCoverageExact": true,
      "approvalScopesMatchPlan": true,
      "approvalAuthorityMatchesPlan": true,
      "receiptCoverageExact": true,
      "receiptsMatchPlan": true,
      "planTotalMatchesProposals": true,
      "receiptTotalMatchesPlan": true,
      "pass": true
    }
  }
}
```

Any of these fail the release gate:

```text
AUDIT_RELEASE_IDENTITY_FAILED
APPROVAL_EVIDENCE_MISSING
AUDIT_STATE_INCONSISTENT
AUDIT_CAPTURE_UNAVAILABLE
```

Save as `08-final-audit-bundle.json`.

## 14. Partial cross-provider commitment drill

Run separately after resetting the scenario.

1. Build the canonical plan at €5,000 authority.
2. Human narrows authority to €3,000.
3. Approve the amended plan.
4. Confirm all three commit wrappers appear.
5. Commit Shelter Grid successfully.
6. Call `relay_get_plan`.
7. Required intermediate state:
   - status `APPROVED`, not `COMMITTED`
   - only Shelter Grid receipts present
   - Shelter Grid commit wrapper removed
   - Transit Ops and Supply Hub commit wrappers still available while approval remains live
8. Intentionally submit only one of the two approved Transit Ops proposal IDs.
9. Required result:

```json
{
  "ok": false,
  "code": "INCOMPLETE_PROVIDER_BATCH"
}
```

10. Re-query Transit Ops. Its capacity and version must be unchanged.
11. Call `relay_get_audit_bundle`. It must return `AUDIT_STATE_INCONSISTENT` with `committed: false` and `pass: false`.
12. Retry Transit Ops with both approved proposal IDs while the exact approval remains live.
13. Commit Supply Hub.
14. Final audit must return `ok: true`.

Save as `09-partial-commit-recovery.json`.

Expired or stale authority requires a fresh plan and fresh human approval.

## 15. Direct-descendant diagnostic only

Open:

```text
https://<RELAY_HOST>/?direct=1
```

Call `relay_diagnose_webmcp`.

This records whether that ChatGPT build directly exposes descendant provider tools. It is not the primary path and does not replace compatibility-bridge evidence.

## 16. Final pass checklist

- [ ] Full deployment gate passed for the exact SHA
- [ ] Four distinct HTTPS origins
- [ ] `Origin-Agent-Cluster: ?1` on all four roots
- [ ] `X-Relay-Release` and `/release.json` match the compiled SHA
- [ ] Fresh ChatGPT browser context used
- [ ] `relay_get_release_identity.ok === true`
- [ ] `provenance.provenancePass === true`
- [ ] `environment.originIsolationPass === true`
- [ ] Relay permanent tools runtime-registered and client-visible
- [ ] All three provider origins discovered
- [ ] All three read probes return semantic success
- [ ] One real proposal succeeds against every provider
- [ ] Top-level commit wrappers are absent before consent
- [ ] Initial plan stages with a €5,000 authority ceiling
- [ ] Human visibly narrows authority from €5,000 to €3,000
- [ ] Approval call visibly suspends
- [ ] Shelter state change invalidates the plan
- [ ] Stale authority and approval capability disappear
- [ ] Recovery replaces only stale provider work
- [ ] Recovered plan retains the €3,000 human ceiling
- [ ] Exact approval creates only the three provider commit wrappers
- [ ] Providers independently verify and commit
- [ ] Six unique receipts reach Relay
- [ ] Final audit bundle v2 passes exact closure
- [ ] Partial completion is represented honestly and recovered
- [ ] Raw evidence identifies ChatGPT as the client

## 17. Verdict

Do not merge PR #1 until every checkbox passes against the deployed HTTPS mesh.
