# Partial cross-provider commitment boundary

Status: submission-critical clarification for Relay v0.1

This document overrides any wording that implies an expired partial transaction can be repaired by merely staging a fresh plan.

## What Relay v0.1 guarantees

Relay guarantees atomicity **inside one provider origin**.

For an approved provider batch:

1. every approved proposal for that provider must be submitted exactly once
2. signature, session, origin, scope, state version, expiry and capacity are checked before mutation
3. if any local check fails, that provider changes no capacity
4. the agent may retry the exact complete provider batch while the human approval token and exact plan authority remain live

This is the release-tested recovery path.

## Canonical partial-commit recovery drill

1. Human approves the exact multi-provider plan.
2. Exactly three top-level provider commit wrappers appear.
3. Shelter Grid commits successfully.
4. Shelter Grid's wrapper disappears after its batch closes.
5. Relay remains `APPROVED`, not `COMMITTED`.
6. Transit Ops and Supply Hub wrappers remain available while exact authority remains live.
7. Transit Ops is called with only one of its two approved proposal IDs.
8. Transit Ops returns:

```json
{
  "ok": false,
  "code": "INCOMPLETE_PROVIDER_BATCH"
}
```

9. Transit Ops capacity and state version remain unchanged.
10. Audit bundle v2 returns `AUDIT_STATE_INCONSISTENT` with `committed: false` and `pass: false`.
11. The agent retries Transit Ops with the complete approved same-origin batch while the token is live.
12. Transit Ops commits and its wrapper disappears.
13. Supply Hub commits.
14. Relay reaches `COMMITTED` only after all six unique receipts arrive.
15. Audit bundle v2 returns `ok: true` only after exact receipt closure.

## What Relay v0.1 does not claim

Relay v0.1 does not implement:

- distributed ACID across independent websites
- compensation after a provider has committed
- a prepare/commit protocol across origins
- fresh reauthorization of remaining scopes after the original token expires
- rollback of a physical or irreversible provider action

## Expired authority after partial commitment

If the approval token expires after one provider has committed and before the others commit:

- committed receipts remain visible
- the plan remains honestly incomplete
- remaining commit capability disappears
- `relay_get_audit_bundle` fails exact final consistency
- the application does not claim `COMMITTED`
- a scenario reset is allowed only to start a separate isolated test run
- a reset must never be described as rollback, compensation or recovery of the partial transaction

This condition fails the submission rehearsal and must be avoided by completing the three provider commits inside the short-lived approval window.

A production PACT version would require explicit reservation holds, compensation or a distributed prepare/commit layer.

## Release evidence required

Save the raw actual-ChatGPT drill under ignored runtime evidence:

```text
.relay-artifacts/chatgpt/09-partial-commit-recovery.json
```

It must prove:

- one provider committed first
- Relay remained `APPROVED`
- the completed provider wrapper disappeared
- incomplete Transit Ops batch failed
- Transit Ops state did not change
- audit bundle v2 failed while partial
- retry with the exact full batch succeeded
- final state became `COMMITTED` only after all receipts arrived
- final audit bundle v2 passed

Anything broader than this is a non-claim for v0.1.
