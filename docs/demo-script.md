# Final 2:45 demo script

Target runtime: **2:45**

Hard stop: **2:50**

The video proves one claim:

> One agent composes work across three independent websites. The human controls the exact consequential transaction.

Do not add another workflow, provider, explanation section or technical detour.

## Before recording

1. Run `npm run gate:release -- --env .env.deploy` for the exact commit.
2. Complete `docs/chatgpt-validation.md` in ChatGPT's built-in browser.
3. Open the normal Relay URL, not `?direct=1` and not `?proof=1`.
4. Confirm `relay_get_release_identity` and `relay_diagnose_webmcp` both pass.
5. Click **Reset scenario**.
6. Confirm:
   - `WebMCP LIVE`
   - `3/3 PROVIDERS`
   - each provider shows a signed Relay session
   - proposal and receipt counters are zero
   - read and proposal wrappers are visible
   - consequential commit wrappers are absent
7. Keep the live capability panel visible.
8. Hide DevTools and unnecessary browser chrome.
9. Use one continuous screen recording. Cut only model latency and repetitive tool transitions.

## Exact ChatGPT prompt

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

Use the provider tools and stage the returned proposal IDs with relay_stage_plan using maxBudget 5000 and completionDeadline "18:00". Do not tighten the authority ceiling yourself. Then call relay_request_approval and stop for my decision.
```

The initial staged authority must visibly be **€5,000**. If ChatGPT stages a lower ceiling, reset. The human performs the narrowing step.

## 0:00–0:12 — Hook

**Shot**

Relay Command, three provider websites and the live capability surface.

**Narration**

> “This agent can coordinate a 42-person evacuation across three independent websites. It can prepare everything. It cannot reserve one bed, vehicle or supply kit until the human approves the exact transaction.”

Briefly show the four HTTPS origins and the release identity pass.

## 0:12–0:27 — Human objective

Paste the exact prompt.

**Narration**

> “Each provider owns its own state and execution. Relay only composes their WebMCP capabilities.”

Cut model thinking time.

## 0:27–0:54 — Discover and stage

Show a fast readable sequence:

```text
relay_bridge_shelter_find_capacity
relay_bridge_transit_find_accessible_routes
relay_bridge_supply_check_stock
```

Then six non-binding proposals. Let ChatGPT choose the shelter allocation from
live capacity and risk details; do not force the reference combination:

```text
Shelter Grid           42 total beds, 20+ North beds preserved
Rapid Bus 32           32 seats
Access Shuttle 10      10 accessible seats
Evacuation Kits        42 kits
Mobility Medical Kits   9 kits
```

Then `relay_stage_plan`.

**Visual proof**

- proposal counters rise
- exact provider origins and versions appear
- eight deterministic checks pass, including the machine-evaluated 18:00 completion deadline
- total cost is computed from the live allocation and remains below €5,000
- staged authority is €5,000
- `relay_request_approval` appears
- all top-level provider commit wrappers remain absent

**Narration**

> “These are quotes, not commitments. Even though the providers can prepare commit implementations, ChatGPT receives no consequential commit capability before consent.”

## 0:54–1:05 — Human narrows authority

Change:

```text
€5,000 → €3,000
```

**Narration**

> “The human is not watching automation. The human narrows it. This €3,000 ceiling becomes part of the signed authorization.”

## 1:05–1:22 — Consent becomes an execution dependency

Let ChatGPT call `relay_request_approval`.

The approval sheet opens while the tool call remains pending.

Hold briefly on:

- exact operations
- provider origins
- state versions
- costs
- plan digest
- expiry

**Narration**

> “The agent is paused inside the tool call. No approval token and no commit capability exist until this human decides.”

## 1:22–1:39 — The unforgettable failure

Do not approve.

Click:

```text
Disrupt active shelter
```

**Visual proof**

- the largest shelter allocation in the exact staged plan becomes insufficient
- Shelter Grid advances v1 → v2
- stale shelter proposals disappear
- `relay_request_approval` disappears
- commit wrappers remain absent
- plan turns red and `STALE`
- the suspended ChatGPT call resolves with a stale-plan failure
- the €3,000 human ceiling remains in force

**Narration**

> “The plan was valid one second ago. It is invalid now. Relay revokes authority instead of executing stale work.”

Do not cut this moment too quickly.

## 1:39–1:58 — Agent recovers, not overrides

Ask ChatGPT:

```text
Recover the stale Relay plan. Re-query and replace only the invalid Shelter Grid proposals. Reuse Transit Ops and Supply Hub proposals only if their provider state versions remain current. Restage with the human-amended €3,000 ceiling, then request exact approval again.
```

The replacement shelter work and recovered total are intentionally adaptive.
Show that only stale Shelter Grid proposals are replaced, all eight policy checks
pass and the retained €3,000 ceiling is not increased.

**Narration**

> “The agent can recover by composing new valid work. It cannot restore the obsolete plan or the old €5,000 authority.”

## 1:58–2:17 — Exact human approval creates capability

The approval sheet reopens.

Show the changed Shelter Grid version, recovered operations and retained €3,000 ceiling.

Click:

```text
Approve & sign PACT token
```

Immediately show the capability panel changing from no consequential commit capability to exactly three provider commit wrappers.

**Narration**

> “This is not permission to complete the objective by any means. It authorizes these exact operations, origins, versions and costs for a limited time.”

## 2:17–2:36 — Independent provider verification

ChatGPT calls:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

Show:

- each provider changes inventory only after its own verification
- provider versions advance
- each commit wrapper disappears after its provider batch closes
- six receipts enter Relay
- plan reaches `COMMITTED`

**Narration**

> “Each website verifies the human authorization independently. No provider is asked to trust the agent.”

## 2:36–2:45 — Receipts, exact closure, thesis

Call or display `relay_get_audit_bundle`.

Show:

- `relay.audit.v2`
- release identity pass
- exact scope and receipt closure pass
- six receipts
- final SHA-256 digest
- `COMMITTED`

**Narration**

> “When agents become the interface, websites become visible trust and execution boundaries. Agents compose. Humans authorize. This is Relay.”

End frame:

```text
PACT
Propose → Amend → Consent → Transact
```

## Mandatory visible evidence

The final cut must contain:

- four distinct HTTPS origins
- exact release identity pass
- three independent provider websites
- six initial non-binding proposals
- a valid live-computed initial plan cost
- €5,000 initial authority ceiling
- top-level commit wrappers absent before consent
- human amendment from €5,000 to €3,000
- suspended approval call
- Shelter Grid v1 → v2
- stale plan state and capability teardown
- a recovered valid plan under the retained €3,000 ceiling
- exact approval sheet
- exactly three commit wrappers appearing after consent
- three independent provider commit calls
- six receipts
- audit bundle v2 digest
- final `COMMITTED` state

## Editing rules

Allowed:

- remove model thinking time
- speed up repetitive read/proposal calls
- use hard cuts between successful tool results
- zoom into versions, capability changes and consent fields

Forbidden:

- hiding a failure that changes the story
- implying distributed ACID across providers
- calling the optional proof runner “ChatGPT”
- using `?proof=1` in the final judging shot
- adding a second scenario
- adding unrelated source-code narration
- showing deployment or package installation

## Rehearsal gate

Before recording:

- [ ] full deployment gate passes for the exact SHA
- [ ] release identity and initial diagnostic pass
- [ ] initial plan stages at €5,000
- [ ] human visibly changes €5,000 to €3,000
- [ ] commit wrappers are absent before approval
- [ ] stale/recovery path completes three consecutive times
- [ ] canonical commit path completes three consecutive times
- [ ] approval creates exactly three commit wrappers
- [ ] reset returns all providers to v1 and zero proposals/receipts
- [ ] final audit bundle v2 passes
- [ ] runtime is 2:40–2:50 after cuts
- [ ] capability creation and teardown are legible at normal playback speed
- [ ] no hidden click is required outside Relay and ChatGPT
- [ ] no browser console error occurs
- [ ] final public video is under three minutes
