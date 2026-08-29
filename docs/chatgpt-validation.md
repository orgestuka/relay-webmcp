# Actual ChatGPT WebMCP validation

Status: **required external release gate**

Harness evidence is useful but does not satisfy this gate. The decisive run must happen in ChatGPT's supported built-in browser against four real HTTPS origins.

## 0. Mandatory origin-isolation gate

WebMCP tool registration and discovery require an origin-keyed agent cluster. Every Relay response must include:

```http
Origin-Agent-Cluster: ?1
```

Before opening ChatGPT, run:

```bash
npm run check:origin-isolation
npm run deploy:smoke
```

The deployment smoke must pass `origin_agent_cluster_header` for:

```text
Relay Command
Shelter Grid
Transit Ops
Supply Hub
```

After adding or correcting the header, open Relay in a **fresh ChatGPT browser context**. Do not trust a simple refresh of a context that previously loaded the origin without the header.

See [`webmcp-origin-isolation.md`](webmcp-origin-isolation.md).

## 1. Why Relay uses a fixed top-level bridge

ChatGPT may not expose tools supplied only by embedded provider documents directly to the agent client.

Relay preserves the three providers as independent WebMCP documents, then Relay Command:

1. discovers an exact provider capability with `getTools({ fromOrigins })`
2. registers a fixed top-level wrapper for one exact origin and tool name
3. invokes the underlying provider tool through `executeTool()`
4. removes the wrapper when the provider capability expires, commits or becomes stale

There is no generic origin parameter, tool-name parameter or unrestricted execute-any capability. Provider-side PACT verification remains authoritative.

Use the normal Relay URL for the primary validation. `?direct=1` exists only to diagnose direct descendant support.

## 2. Required deployment inputs

```text
RELAY_HOST=
SHELTER_HOST=
TRANSIT_HOST=
SUPPLY_HOST=
ACME_EMAIL=
```

All four DNS records must resolve to the Caddy deployment host.

```bash
cp .env.deploy.example .env.deploy
# populate every value

npm run deploy:check
npm run deploy:check:dns

docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
docker compose --env-file .env.deploy ps

npm run deploy:smoke
```

Do not begin ChatGPT validation until every deployed smoke probe passes.

## 3. Open Relay in ChatGPT

Open:

```text
https://<RELAY_HOST>
```

Confirm the visible UI shows:

```text
WebMCP LIVE
3/3 PROVIDERS
signed Relay session on each provider
```

## 4. Machine-readable compatibility diagnostic

Send this exact instruction:

```text
On the open Relay page, call relay_diagnose_webmcp with:
{"executeReadProbes":true}

Return the raw tool result JSON without summarizing it.
```

Required fields:

```json
{
  "ok": true,
  "compatibilityMode": "fixed-top-level-bridge-active",
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

Every provider entry must contain:

```json
{
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

A tool that is merely listed does not pass. Null output, invalid JSON, an exception or semantic `{ "ok": false }` fails the gate.

Save the raw output as:

```text
evidence/chatgpt/01-initial-diagnostic.json
```

Record that the caller was ChatGPT's built-in browser. Do not relabel ordinary Chrome output as ChatGPT evidence.

## 5. Prove one real discovery and proposal per provider

Use only the fixed top-level bridge tools:

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

Each result must include:

```json
{
  "ok": true,
  "proposal": {
    "proposalId": "...",
    "providerOrigin": "https://<EXPECTED_PROVIDER_HOST>",
    "stateVersion": 1
  }
}
```

Save all raw results as:

```text
evidence/chatgpt/02-provider-proposal-probes.json
```

Click **Reset scenario** before the full run.

## 6. Canonical evacuation prompt

Send exactly:

```text
Use Relay's fixed bridge tools to evacuate all 42 Riverside residents before 18:00.

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

Expected initial plan:

```text
East Shelter          18 beds                 €180
South Shelter         24 beds                 €216
Rapid Bus 32          32 seats                €928
Access Shuttle 10     10 accessible seats     €680
Evacuation Kits       42 kits                 €504
Mobility Medical Kits  9 kits                 €225
Total                                         €2,733
Initial authority ceiling                       €5,000
```

If `relay_get_plan` shows a ceiling below €5,000 before the human amendment, the run fails. Reset and repeat. The human, not the agent, must perform the narrowing step.

## 7. Prove dynamic capability creation

Capture `relay_diagnose_webmcp`:

1. before proposals
2. after provider proposals
3. after valid plan staging

Required changes:

- each provider commit wrapper appears only after that provider has a live proposal
- `relay_request_approval` appears only after the plan validates
- `toolchange.observedEventCount` increases
- runtime and client-visible tool lists reflect the same state

Save:

```text
evidence/chatgpt/03-capability-created.json
```

## 8. Human amendment and stale-state proof

Change the authority ceiling from:

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

While the call is suspended, click:

```text
Change shelter capacity
```

Required result:

- Shelter Grid advances from v1 to v2
- South Shelter falls from 24 to 12 available beds
- old Shelter Grid proposals are deleted
- the plan becomes `STALE`
- the pending approval call resolves with a stale-plan failure
- the Shelter Grid commit wrapper disappears
- `relay_request_approval` disappears
- no provider capacity was committed by the stale plan

Call the diagnostic again. Required:

- higher `toolchange.observedEventCount`
- stale capabilities absent from runtime and client-visible lists
- `environment.originIsolationPass` remains true

Save:

```text
evidence/chatgpt/04-capability-torn-down.json
```

## 9. Recover only invalidated work

Send:

```text
Recover the stale Relay plan. Re-query and replace only the invalid Shelter Grid proposals. Reuse Transit Ops and Supply Hub proposals only if their provider state versions remain current. Restage with maxBudget 3000 so the human-amended authority remains in force, then request exact approval again.
```

Expected replacement shelter operations:

```text
East Shelter    18 beds
South Shelter   12 beds
North Shelter   12 beds
```

Expected recovered total:

```text
€2,793
```

North Shelter must retain 34 beds before and after its committed 12-bed allocation is represented in the final policy evaluation. The committed reservation must not be subtracted twice.

## 10. Approve and commit

Approve the exact consent sheet.

ChatGPT then calls the complete same-origin batches:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

Required final state:

```text
COMMITTED
6 unique receipts
all provider commit wrappers removed
```

Save the raw tool sequence and final `relay_get_plan` output as:

```text
evidence/chatgpt/05-full-path.json
```

## 11. Final audit bundle

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
    "schema": "relay.audit.v1",
    "approvals": "<provider-accepted signed PACT capsules>",
    "consistency": {
      "planStatus": "COMMITTED",
      "allReceiptsApproved": true,
      "pass": true
    },
    "plan": "<final plan and receipts>",
    "mesh": "<final provider state>"
  }
}
```

Any of these fail the release gate:

```text
APPROVAL_EVIDENCE_MISSING
AUDIT_STATE_INCONSISTENT
AUDIT_CAPTURE_UNAVAILABLE
```

Save:

```text
evidence/chatgpt/06-final-audit-bundle.json
```

## 12. Partial cross-provider commitment drill

Run separately after resetting the scenario.

1. Build the canonical plan at €5,000 authority.
2. Human narrows authority to €3,000.
3. Approve the amended plan.
4. Commit Shelter Grid successfully.
5. Call `relay_get_plan`.
6. Required intermediate state:
   - status `APPROVED`, not `COMMITTED`
   - only Shelter Grid receipts present
   - Transit Ops and Supply Hub pending
7. Intentionally submit only one of the two approved Transit Ops proposal IDs.
8. Required result:

```json
{
  "ok": false,
  "code": "INCOMPLETE_PROVIDER_BATCH"
}
```

9. Re-query Transit Ops. Its capacity and version must be unchanged.
10. Call `relay_get_audit_bundle`. It must return:

```json
{
  "ok": false,
  "code": "AUDIT_STATE_INCONSISTENT",
  "bundle": {
    "consistency": {
      "planStatus": "APPROVED",
      "committed": false,
      "pass": false
    }
  }
}
```

11. Retry Transit Ops with both approved proposal IDs while the token is still live.
12. Commit Supply Hub.
13. Final audit must return `ok: true`.

Save:

```text
evidence/chatgpt/07-partial-commit-recovery.json
```

Expired or stale authority requires a fresh plan and fresh human approval.

## 13. Direct-descendant diagnostic only

Open:

```text
https://<RELAY_HOST>/?direct=1
```

Call `relay_diagnose_webmcp`.

This records whether that ChatGPT build directly exposes descendant provider tools. It is not the primary submission path and does not replace fixed-bridge evidence.

## 14. Final pass checklist

- [ ] Four distinct HTTPS origins
- [ ] `Origin-Agent-Cluster: ?1` on all four root responses
- [ ] Fresh ChatGPT browser context used after header deployment
- [ ] `environment.originIsolationPass === true`
- [ ] Relay permanent tools runtime-registered and client-visible
- [ ] All three provider origins discovered
- [ ] All three read probes return semantic success
- [ ] One real proposal succeeds against every provider
- [ ] Commit wrappers appear dynamically
- [ ] Initial plan stages with a €5,000 authority ceiling
- [ ] Human visibly narrows authority from €5,000 to €3,000
- [ ] Amended plan revision increments and remains `VALIDATED`
- [ ] Approval call visibly suspends
- [ ] Shelter state change invalidates stale authority
- [ ] Stale approval and commit capabilities disappear
- [ ] Recovery replaces only stale provider work
- [ ] Recovered plan retains the €3,000 human ceiling
- [ ] Human approves exact recovered scopes
- [ ] Providers independently verify and commit
- [ ] Six unique receipts reach Relay
- [ ] Final audit digest passes consistency
- [ ] Partial completion is represented honestly and recovered
- [ ] Raw evidence identifies ChatGPT as the client

## 15. Verdict

Do not merge PR #1 until every checkbox passes against the deployed HTTPS mesh.
