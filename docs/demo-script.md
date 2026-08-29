# Final 2:45 demo script

Target runtime: **2:45**

Hard stop: **2:50**

The video proves one claim:

> One agent composes work across three independent websites. The human controls the exact consequential transaction.

Do not add another workflow, provider, explanation section or technical detour.

## Before recording

1. Deploy four HTTPS origins.
2. Run `npm run deploy:smoke`.
3. Complete the actual ChatGPT checklist in `chatgpt-validation.md`.
4. Open the normal Relay URL, not `?direct=1` and not `?proof=1`.
5. Click **Reset scenario**.
6. Confirm:
   - `WebMCP LIVE`
   - `3/3 PROVIDERS`
   - each provider shows `signed Relay session`
   - no proposal or receipt counters are nonzero
7. Keep the live capability panel visible.
8. Hide DevTools and unnecessary browser chrome.
9. Use one continuous screen recording. Cut only model latency and repetitive tool transitions.

## Exact ChatGPT prompt

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

## 0:00–0:12 — Hook

**Shot**

Relay Command with all three provider websites and the live capability surface visible.

**Narration**

> “This agent can coordinate a 42-person evacuation across three independent websites. It can prepare everything. It cannot reserve one bed, vehicle or supply kit until the human approves the exact transaction.”

Briefly show the four HTTPS origins.

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

Then six non-binding proposals:

```text
East Shelter          18 beds
South Shelter         24 beds
Rapid Bus 32          32 seats
Access Shuttle 10     10 accessible seats
Evacuation Kits       42 kits
Mobility Medical Kits 9 kits
```

Then:

```text
relay_stage_plan
```

**Visual proof**

- provider proposal counters rise
- exact provider origins and versions appear in Relay
- seven deterministic checks pass
- total is €2,733
- `relay_request_approval` appears
- provider commit wrappers are visible but require signed authority

**Narration**

> “These are quotes, not commitments. Relay rejects plans that merely sound right but fail a hard constraint.”

## 0:54–1:05 — Human narrows authority

Set the authority ceiling to exactly:

```text
€3,000
```

**Narration**

> “The human is not watching automation. The human narrows it. This €3,000 ceiling becomes part of the signed authorization.”

## 1:05–1:22 — Consent becomes an execution dependency

Let ChatGPT call:

```text
relay_request_approval
```

The approval sheet opens while the ChatGPT tool call remains pending.

Hold for two seconds on:

- exact operations
- provider origins
- state versions
- costs
- plan digest
- two-minute expiry

**Narration**

> “The agent is now paused inside the tool call. No approval token exists until this human decides.”

## 1:22–1:39 — The unforgettable failure

Do not approve.

Click the red consent-sheet control:

```text
Change shelter capacity
```

**Visual proof**

- South Shelter falls from 24 to 12
- Shelter Grid advances from v1 to v2
- stale shelter proposals disappear
- shelter commit wrapper disappears
- `relay_request_approval` disappears
- plan turns red and `STALE`
- the suspended ChatGPT call resolves with stale-plan failure

**Narration**

> “The plan was valid one second ago. It is invalid now. Relay revokes the capability instead of executing stale work.”

Do not cut this moment too quickly.

## 1:39–1:58 — Agent recovers, not overrides

Ask ChatGPT:

```text
Recover the stale Relay plan. Re-query and replace only the invalid Shelter Grid proposals. Reuse Transit Ops and Supply Hub proposals only if their provider state versions remain current. Restage, then request exact approval again.
```

Expected new shelter work:

```text
East Shelter   18 beds
South Shelter  12 beds
North Shelter  12 beds
```

Recovered total:

```text
€2,793
```

North Shelter retains 34 beds.

**Narration**

> “The agent can recover by composing new valid work. It cannot force the obsolete plan through.”

## 1:58–2:17 — Exact human approval

The approval sheet reopens.

Show the changed Shelter Grid version and recovered operations.

Click:

```text
Approve & sign PACT token
```

**Narration**

> “This is not permission to complete the objective by any means. It authorizes these exact operations, at these exact origins and versions, for two minutes.”

## 2:17–2:36 — Independent provider verification

ChatGPT calls:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

Show:

- each provider inventory changes only after its own verification
- provider versions advance
- commit wrappers disappear after use
- six receipts enter Relay
- plan reaches `COMMITTED`

**Narration**

> “Each website verifies the human authorization independently. No provider is asked to trust the agent.”

## 2:36–2:45 — Receipts, digest, thesis

Call or display the result of:

```text
relay_get_audit_bundle
```

Show:

- `COMMITTED`
- six receipts
- final SHA-256 digest
- PACT rail

**Narration**

> “When agents become the interface, websites become visible trust and execution boundaries. Agents compose. Humans authorize. This is Relay.”

End frame:

```text
PACT
Propose → Amend → Consent → Transact
```

## Mandatory visible evidence

The final cut must visibly contain:

- four distinct HTTPS origins
- three independent provider websites
- six initial non-binding proposals
- €2,733 initial plan
- €3,000 human authority ceiling
- suspended approval call
- Shelter Grid v1 → v2
- stale plan state
- capability disappearance
- recovered €2,793 plan
- exact approval sheet
- three independent provider commit calls
- six receipts
- final audit digest
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

Before recording the final video:

- [ ] successful path completed three consecutive times
- [ ] stale/recovery path completed three consecutive times
- [ ] reset returns all providers to v1 and zero proposals/receipts
- [ ] total initial runtime is 2:40–2:50 after cuts
- [ ] capability creation and teardown are legible at normal playback speed
- [ ] no hidden click is required outside Relay and ChatGPT
- [ ] no browser console error occurs
- [ ] final public video is under three minutes
