# Relay audit bundle v2

`relay_get_audit_bundle` is the final proof that the deployed release, visible Relay plan, human-approved PACT capsules and provider receipts describe the same operation set.

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
    "releaseIdentity": {
      "ok": true,
      "compiledSha": "<exact commit>",
      "edgeSha": "<same commit>",
      "manifest": {
        "schema": "relay.release.v1",
        "app": "relay-command",
        "sha": "<same commit>"
      }
    },
    "approvals": [
      {
        "payloadDigest": "<approval payload digest>",
        "token": {
          "algorithm": "ECDSA_P256_SHA256",
          "payload": {
            "planId": "<final plan ID>",
            "planHash": "<canonical final plan hash>",
            "maximumCost": 3000,
            "scopes": ["<exact final plan scopes>"]
          }
        }
      }
    ],
    "consistency": {
      "planStatus": "COMMITTED",
      "matchingApprovalCount": 1,
      "matchingApprovalSessionCount": 1,
      "approvalScopeCoverageExact": true,
      "approvalScopesMatchPlan": true,
      "approvalAuthorityMatchesPlan": true,
      "receiptCoverageExact": true,
      "receiptsMatchPlan": true,
      "planTotalMatchesProposals": true,
      "receiptTotalMatchesPlan": true,
      "committed": true,
      "pass": true
    },
    "plan": "<relay_get_plan output>",
    "mesh": "<relay_get_mesh_state output>"
  }
}
```

`matchingApprovalCount` can exceed one only for safe exact reapproval or recovery in the same Relay session. Every matching capsule must independently contain the exact final plan scope set, arguments and authority. A second broader, altered or cross-session capsule cannot make the audit pass.

## Exact equality requirements

The audit passes only when these sets are identical:

```text
final plan proposal IDs
=
each matching human-approved PACT scope set
=
provider receipt proposal IDs
```

For every proposal and scope, the audit compares:

- proposal ID
- provider ID and provider origin
- resource ID and visible label
- quantity and unit
- unit cost and maximum scoped cost
- stated purpose
- provider state version
- proposal expiry

For every receipt, it compares:

- receipt and proposal identity
- provider ID and provider origin
- committed amount and cost
- resulting provider state version
- valid commit timestamp

It separately proves:

- the final plan has a valid shape and unique proposal IDs
- the current canonical plan hash can be recomputed
- matching approvals bind the current plan ID and current plan hash
- every matching approval comes from one Relay session
- every matching approval contains one exact scope per final proposal
- every matching approval ceiling equals the visible plan authority ceiling
- every matching approval scope aggregate equals the visible plan total
- receipt IDs and receipt proposal IDs are unique
- every final proposal has exactly one matching receipt
- proposal and receipt aggregates equal the visible plan total
- final plan status is `COMMITTED`

## Release identity dependency

The audit first calls `relay_get_release_identity`. It refuses to certify a transaction unless:

```text
compiled application SHA
=
trusted X-Relay-Release edge header
=
/release.json SHA
```

A provenance failure returns:

```json
{
  "ok": false,
  "code": "AUDIT_RELEASE_IDENTITY_FAILED"
}
```

## Required failure behavior

A transaction-state inconsistency returns:

```json
{
  "ok": false,
  "code": "AUDIT_STATE_INCONSISTENT",
  "algorithm": "SHA-256",
  "digest": "<digest of the failed evidence bundle>",
  "bundle": {
    "schema": "relay.audit.v2",
    "consistency": {
      "pass": false
    }
  }
}
```

The failed bundle and digest remain inspectable. Relay does not hide partial or adversarial states.

Expected failures include:

- missing, extra or duplicated receipt
- malformed receipt data
- receipt provider provenance that differs from the proposal
- receipt amount or cost that differs from the proposal
- approval bound to another plan ID or plan hash
- missing final proposal scope
- altered scope resource, quantity, price, purpose, version or expiry
- authority ceiling or scope aggregate that differs from the visible plan
- matching approvals from multiple sessions
- a non-exact reapproval capsule
- partial cross-provider completion
- a plan that claims `COMMITTED` without exact receipt closure

## Submission evidence

Store actual ChatGPT output under ignored runtime evidence while validating:

```text
.relay-artifacts/chatgpt/08-final-audit-bundle.json
```

The evidence record must identify:

- deployed Relay URL
- tested commit SHA
- ChatGPT build when visible
- timestamp
- fixed-bridge or direct mode

A harness result must not be relabeled as actual ChatGPT evidence. Do not commit runtime evidence after deploying a SHA unless the resulting new commit is rebuilt, redeployed and revalidated.
