# Actual ChatGPT WebMCP validation

Status: **required external gate**

This document is specifically for ChatGPT's supported built-in browser. Chrome harness evidence is useful but does not satisfy this gate.

## 1. Why Relay uses a top-level bridge by default

OpenAI's current site-tools documentation states that tools provided only by embedded content are not currently supported by ChatGPT's site-tools client:

- https://help.openai.com/en/articles/20001423-using-site-tools-in-the-chatgpt-desktop-app

Relay's providers remain independent WebMCP documents. Relay Command discovers their exact tools with:

```ts
document.modelContext.getTools({ fromOrigins: [providerOrigin] })
```

and exposes fixed top-level wrappers. Every wrapper is bound in code to one exact origin and one exact provider tool name. No generic `execute any tool` capability exists.

The provider still performs proposal creation, signature verification, state-version checks, capacity checks and mutation. The bridge does not bypass provider authorization.

Use `?direct=1` only to diagnose direct descendant support. The production and judging URL should use the default fixed bridge.

## 2. Required deployment inputs

Before this test can run, provide four distinct HTTPS hostnames:

```text
RELAY_HOST=
SHELTER_HOST=
TRANSIT_HOST=
SUPPLY_HOST=
```

All four DNS records must point to the Caddy host.

Generate the exact URLs with:

```bash
cp .env.deploy.example .env.deploy
# edit .env.deploy
npm run deploy:check -- .env.deploy
```

Expected output includes:

```json
{
  "pass": true,
  "urls": {
    "relay": "https://<RELAY_HOST>",
    "shelter": "https://<SHELTER_HOST>",
    "transit": "https://<TRANSIT_HOST>",
    "supply": "https://<SUPPLY_HOST>",
    "relayDirectDiagnostic": "https://<RELAY_HOST>/?direct=1",
    "relayProofHarness": "https://<RELAY_HOST>/?proof=1"
  }
}
```

## 3. Deploy and HTTPS-smoke first

```bash
npm run deploy:check:dns

docker compose --env-file .env.deploy build --pull

docker compose --env-file .env.deploy up -d

docker compose --env-file .env.deploy ps

npm run deploy:smoke
```

Do not start ChatGPT validation until all four HTTPS probes pass.

## 4. Open Relay in the supported ChatGPT browser

Open:

```text
https://<RELAY_HOST>
```

Do not use `?direct=1` for the primary test. The default URL loads the strict fixed top-level bridge.

Confirm the page visibly shows:

```text
WebMCP LIVE
3/3 PROVIDERS
signed Relay session on each provider
```

## 5. Machine-readable compatibility diagnostic

Send this exact instruction to ChatGPT:

```text
On the open Relay page, call relay_diagnose_webmcp with:
{"executeReadProbes":true}
Return the raw tool result JSON without summarizing it.
```

Required output conditions:

```json
{
  "ok": true,
  "compatibilityMode": "fixed-top-level-bridge-active",
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
  "providerExecutionPass": true,
  "providers": [
    {
      "id": "shelter",
      "discoveryPass": true,
      "executionPass": true
    },
    {
      "id": "transit",
      "discoveryPass": true,
      "executionPass": true
    },
    {
      "id": "supply",
      "discoveryPass": true,
      "executionPass": true
    }
  ]
}
```

A read probe counts as successful only when the provider actually returns a semantic `{ "ok": true }` result. A listed tool that throws, returns null, returns invalid JSON or returns `{ "ok": false }` fails this gate.

Save the complete raw JSON as:

```text
evidence/chatgpt/01-initial-diagnostic.json
```

The evidence file must state that the caller was ChatGPT's built-in browser. Do not relabel Chrome output as ChatGPT output.

## 6. Prove one real discovery and proposal per provider

Ask ChatGPT to use only these top-level bridge tools:

```text
1. relay_bridge_shelter_find_capacity
2. relay_bridge_shelter_propose_reservation
3. relay_bridge_transit_find_accessible_routes
4. relay_bridge_transit_propose_reservation
5. relay_bridge_supply_check_stock
6. relay_bridge_supply_propose_reservation
```

Minimum proposal proof:

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

Each result must contain:

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

Then click **Reset scenario** before the full evacuation run.

Save raw results as:

```text
evidence/chatgpt/02-provider-proposal-probes.json
```

## 7. Full ChatGPT evacuation prompt

After reset, send this exact prompt:

```text
Use Relay's fixed bridge tools to evacuate all 42 Riverside residents before 18:00.

Hard constraints:
- shelter all 42 residents
- provide transport for all 42
- provide at least 9 wheelchair-accessible positions
- preserve at least 20 unallocated beds at North Shelter
- provide 42 evacuation kits
- provide 9 mobility medical kits
- keep total authority at or below €3,000
- create non-binding proposals first
- do not commit anything before I approve the exact Relay plan

Use the provider tools, stage the returned proposal IDs with relay_stage_plan, then call relay_request_approval and stop for my decision.
```

Expected initial six operations:

```text
East Shelter        18 beds
South Shelter       24 beds
Rapid Bus 32        32 seats
Access Shuttle 10   10 accessible seats
Evacuation Kit      42 kits
Mobility Medical    9 kits
Total               €2,733
```

## 8. Prove dynamic tool creation

Before staging, call `relay_diagnose_webmcp` and preserve the raw output.

After proposals and plan staging, call it again.

Required change:

- provider commit wrappers appear after provider proposals
- `relay_request_approval` appears after valid plan staging
- `toolchange.observedEventCount` increases

Save:

```text
evidence/chatgpt/03-capability-created.json
```

## 9. Human amendment and stale-state proof

Set the authority ceiling to exactly:

```text
€3,000
```

Let ChatGPT call `relay_request_approval`.

While the tool call is suspended, click the red **Change shelter capacity** control in the approval sheet.

Required result:

- Shelter Grid state version advances
- old Shelter Grid proposals are invalidated
- plan status becomes `STALE`
- pending approval resolves with stale-plan failure
- shelter commit wrapper disappears
- `relay_request_approval` disappears
- no provider capacity was committed

Call `relay_diagnose_webmcp` again and save:

```text
evidence/chatgpt/04-capability-torn-down.json
```

The diagnostic must show a higher toolchange count and absence of the stale capabilities.

## 10. Recovery

Ask ChatGPT:

```text
Recover the stale Relay plan. Re-query and replace only the invalid Shelter Grid proposals. Reuse Transit Ops and Supply Hub proposals only if their provider state versions remain current. Restage, then request exact approval again.
```

Expected recovered shelter allocation:

```text
East Shelter    18 beds
South Shelter   12 beds
North Shelter   12 beds
```

Expected recovered total:

```text
€2,793
```

North Shelter should retain 34 beds.

## 11. Approval and commit

Approve the exact consent sheet.

ChatGPT must then call the complete same-origin batches:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

Each provider must independently return origin-bound receipts.

Required final state:

```text
COMMITTED
6 receipts
```

Save the complete raw ChatGPT tool sequence and final `relay_get_plan` output as:

```text
evidence/chatgpt/05-full-path.json
```

## 12. Final audit bundle

Ask ChatGPT:

```text
Call relay_get_audit_bundle and return the raw JSON without summarizing it.
```

The audit tool reads Relay's locally registered plan and mesh tools directly. It does not recursively invoke WebMCP from inside another WebMCP call.

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

Save:

```text
evidence/chatgpt/06-final-audit-bundle.json
```

Any `APPROVAL_EVIDENCE_MISSING`, `AUDIT_STATE_INCONSISTENT` or `AUDIT_CAPTURE_UNAVAILABLE` result fails the release gate. Preserve the raw failure rather than summarizing it away.

## 13. Partial cross-provider commitment and recovery drill

Run this as a separate validation after the main success path. Click **Reset scenario**, construct and approve the canonical six-operation plan again, then move quickly because the signed token expires after two minutes.

1. Commit the complete Shelter Grid batch successfully.
2. Call `relay_get_plan` and preserve the output. It must show:
   - status `APPROVED`, not `COMMITTED`
   - only Shelter Grid receipts present
   - Transit Ops and Supply Hub still pending
3. Intentionally call `relay_bridge_transit_commit_reservation` with only one of the two approved Transit Ops proposal IDs.
4. Required result:

```json
{
  "ok": false,
  "code": "INCOMPLETE_PROVIDER_BATCH"
}
```

5. Re-query Transit Ops immediately. Its state version and capacity must be unchanged because the failed local batch was atomic.
6. Call `relay_get_audit_bundle` during this partial state. Required result:

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

This is the honest partial-completion representation. It must not claim global success.

7. Retry Transit Ops with both approved Transit Ops proposal IDs and the same still-live PACT token.
8. Commit the complete Supply Hub batch.
9. Required final result:
   - status `COMMITTED`
   - all six receipts present once
   - final `relay_get_audit_bundle` returns `ok: true`

Save every raw result and before/after Transit Ops capacity snapshot as:

```text
evidence/chatgpt/07-partial-commit-recovery.json
```

A provider failure after token expiry or after that provider's state changes requires a fresh plan and fresh human approval. Do not reuse expired or stale authority.

## 14. Direct-descendant diagnostic only

Open:

```text
https://<RELAY_HOST>/?direct=1
```

Call `relay_diagnose_webmcp`.

This test records whether the current ChatGPT client directly exposes descendant provider tools. It is not the primary release path.

Expected current outcome based on OpenAI's published limitation:

- Relay top-level tools visible
- embedded provider tools may not be directly visible to ChatGPT
- document-level read probes may still pass
- `compatibilityMode` is `direct-only`

Save the output separately and do not confuse it with the fixed-bridge test.

## 15. Actual ChatGPT pass checklist

- [ ] Tested in ChatGPT's supported built-in browser, not ordinary Chrome
- [ ] `relay_diagnose_webmcp` returned raw JSON
- [ ] Relay permanent tools registered at runtime and were client-visible
- [ ] all three provider origins discovered by Relay Command
- [ ] all three read probes returned semantic success
- [ ] one real proposal executed against every provider
- [ ] commit wrappers appeared dynamically
- [ ] human amendment applied before consent
- [ ] stale provider state revoked approval and commit capabilities
- [ ] recovery replaced only stale provider work
- [ ] human approved exact scopes
- [ ] all three providers independently committed
- [ ] six receipts reached Relay
- [ ] final audit bundle and digest passed consistency
- [ ] partial cross-provider state was represented as incomplete and recovered safely
- [ ] all evidence files explicitly identify ChatGPT as the client

## 16. Gate verdict

Do not merge PR #1 until every checkbox above passes against deployed HTTPS origins.
