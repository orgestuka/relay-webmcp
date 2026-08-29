# Relay audit bundle v2

`relay_get_audit_bundle` is the final proof that a visible Relay transaction, the human-approved PACT capsule and the provider receipts describe the same operation set.

The audit is deliberately stricter than checking that the plan status says `COMMITTED`.

## Invocation

After the complete ChatGPT success path, call:

```text
relay_get_audit_bundle
{}
```

Preserve the raw JSON without summarizing it.

## Required success shape

```json
{
  "ok": true,
  "algorithm": "SHA-256",
  "digest": "<base64url digest>",
  "bundle": {
    "schema": "relay.audit.v2",
    "currentPlanHash": "<canonical PACT plan hash>",
    "approvals": [
      {
        "payloadDigest": "<approval payload digest>",
        "token": {
          "algorithm": "ECDSA_P256_SHA256",
          "payload": {
            "planId": "<same plan ID>",
            "planHash": "<same currentPlanHash>",
            "maximumCost": 3000,
            "scopes": ["<exact plan scopes>"]
          }
        }
      }
    ],
    "consistency": {
      "approvalCount": 1,
      "exactApprovalPlan": true,
      "exactApprovalHash": true,
      "exactAuthorityCeiling": true,
      "exactScopeSet": true,
      "exactReceiptSet": true,
      "exactScopeArguments": true,
      "exactReceiptArguments": true,
      "planTotalConsistent": true,
      "scopeTotalConsistent": true,
      "receiptTotalConsistent": true,
      "withinAuthority": true,
      "committed": true,
      "pass": true,
      "failures": []
    },
    "plan": "<relay_get_plan output>",
    "mesh": "<relay_get_mesh_state output>"
  }
}
```

## Exact equality requirements

The audit passes only when all three sets are identical:

```text
current plan proposal IDs
=
human-approved PACT scope IDs
=
provider receipt proposal IDs
```

For every proposal, the audit also compares:

- provider ID
- provider origin
- resource ID and visible label
- quantity and unit
- unit cost and total cost
- stated purpose
- provider state version
- proposal expiry
- receipt amount and resulting state version

It separately proves:

- the approval plan ID equals the current plan ID
- the approval plan hash equals a newly computed canonical plan hash
- the approval ceiling equals the plan authority ceiling
- proposal, approval-scope and receipt aggregates all equal the plan total
- the plan total remains within human authority
- receipt IDs and receipt proposal IDs are unique
- the final plan status is `COMMITTED`

## Required failure behavior

Any inconsistency returns:

```json
{
  "ok": false,
  "code": "AUDIT_STATE_INCONSISTENT",
  "algorithm": "SHA-256",
  "digest": "<digest of the failed evidence bundle>",
  "failures": ["<specific failed invariants>"],
  "bundle": {
    "schema": "relay.audit.v2",
    "consistency": {
      "pass": false
    }
  }
}
```

The bundle and digest are still returned on failure so partial or adversarial states remain inspectable instead of disappearing.

Expected failures include:

- a missing receipt
- an extra or duplicated receipt
- receipt provenance that differs from the proposal origin
- a receipt amount or cost that differs from the proposal
- an approved scope changed after consent
- approval bound to another plan ID or hash
- an authority ceiling that differs from the visible plan
- multiple accepted approval capsules in one scenario
- a partial cross-provider state
- a plan that claims `COMMITTED` without exact receipt equality

## Submission evidence

Store the actual ChatGPT result at:

```text
evidence/chatgpt/06-final-audit-bundle.json
```

The evidence file must identify:

- deployed Relay URL
- tested commit SHA
- ChatGPT build when visible
- test timestamp
- fixed-bridge or direct mode

A harness result must not be relabeled as actual ChatGPT evidence.
