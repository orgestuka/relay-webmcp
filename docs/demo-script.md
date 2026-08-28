# Three-minute demo script

## Core rule

The video must prove one idea:

> The agent can compose across independent websites. It cannot expand or exercise consequential authority without the human.

Do not narrate every implementation detail. Show the protocol through state changes.

## Recording setup

Before recording:

- open Relay Command in the supported browser surface
- verify all three provider frames show `WebMCP live`
- verify Relay shows `3/3 PROVIDERS`
- collapse unrelated browser chrome
- keep the capability surface visible
- keep the proof console visible but collapsed until needed
- reset all four applications to deterministic initial state
- use a 16:9 viewport large enough to show Relay and provider frames

## 0:00 to 0:12: hook

**Shot:** Relay Command with all three provider frames and the live capability panel.

**Narration:**

> “This agent can coordinate an evacuation across three independent websites. It can prepare everything. It cannot reserve a single bed, vehicle or supply kit until the human approves the exact transaction.”

Show the four distinct origins briefly.

## 0:12 to 0:30: the objective

**Shot:** Enter the prompt in ChatGPT's browser agent.

> Evacuate all 42 Riverside residents before 18:00. Provide at least 9 wheelchair-accessible positions, preserve 20 beds at North Shelter and stay below €5,000. Prepare everything, but do not commit any reservation until I approve the exact plan.

**Narration:**

> “Relay is not one site pretending to have four databases. Each provider owns its own state and WebMCP tools.”

## 0:30 to 0:58: compose through WebMCP

**Shot:** Accelerated but readable sequence of tool invocations.

The agent:

1. reads the incident
2. queries all three provider origins
3. creates six non-binding proposals
4. stages the exact proposal IDs in Relay

The canonical first plan is:

- East Shelter: 18 beds
- South Shelter: 24 beds
- Rapid Bus: 32 seats
- Access Shuttle: 10 accessible seats
- Evacuation Kits: 42
- Mobility Medical Kits: 9

Total: **€2,733**

**Visual proof:**

- provider proposal counters increase
- Relay plan table fills with exact origins and versions
- all seven deterministic policy checks pass
- `relay_request_approval` appears in the live capability surface

## 0:58 to 1:12: human amendment

**Shot:** Change maximum authority from €5,000 to €3,000 in Relay.

**Narration:**

> “The human is not watching automation. The human can narrow it. The visible summary, rationale, revision, operation scopes and €3,000 ceiling become part of the signed authorization.”

## 1:12 to 1:32: human becomes an execution dependency

**Shot:** The agent calls `relay_request_approval`.

The tool call remains pending and the consent sheet opens.

**Narration:**

> “The agent is now paused inside the tool call. No token exists until this human decides.”

Do not approve yet.

## 1:32 to 1:48: the failure moment

**Shot:** Click **Inject disruption** in Shelter Grid.

South Shelter drops from 24 to 12 beds. Shelter Grid advances its state version.

**Visual proof:**

- shelter proposals disappear
- shelter commit capability disappears
- Relay changes to `STALE`
- the suspended approval call resolves as a stale-plan failure

**Narration:**

> “The plan was valid one second ago. It is invalid now. Relay revokes the capability instead of executing stale work.”

This is the memorable moment. Leave it on screen long enough to register.

## 1:48 to 2:08: recover, do not override

**Shot:** The agent re-queries Shelter Grid and proposes:

- East Shelter: 18 beds
- South Shelter: 12 beds
- North Shelter: 12 beds

Transit and supply proposals remain valid because those provider versions did not change.

The recovered total is **€2,793**. North Shelter retains 34 beds, above the protected reserve.

The agent restages and requests approval again.

**Narration:**

> “The agent recovers by composing new valid work. It cannot force the old plan through.”

## 2:08 to 2:28: exact consent

**Shot:** Hold on the approval sheet.

Show:

- proposal IDs
- provider origins
- resource and quantity
- provider state versions
- per-operation cost
- €3,000 maximum authority
- plan hash
- two-minute expiry

Click **Approve & sign PACT token**.

**Narration:**

> “This is not permission to complete the objective by any means. It is authority for these exact operations, at these exact origins and versions, for two minutes.”

## 2:28 to 2:48: transact

**Shot:** The agent presents the token to each provider's commit tool.

Show:

- complete same-origin batches
- provider inventory changing only after verification
- state versions advancing
- six origin-bound receipts entering Relay
- plan reaching `COMMITTED`
- commit capabilities disappearing

**Narration:**

> “Each website verifies the human authorization independently. Relay does not ask the providers to trust the agent.”

## 2:48 to 2:58: close

**Shot:** PACT rail, final `COMMITTED` status and architecture diagram.

**Narration:**

> “When agents become the interface, websites do not disappear. They become visible trust and execution boundaries. Agents compose. Humans authorize. This is Relay.”

End on:

```text
PACT
Propose → Amend → Consent → Transact
```

## Deterministic fallback recording

The built-in proof console executes the same flow through only `getTools()` and `executeTool()`.

Use it when:

- the external agent chooses an unnecessarily slow tool sequence
- live narration needs a clean second take
- judges need deterministic reproduction after the video

The fallback must still show the real provider frames, capability changes, human consent sheet and receipts. Do not replace the product UI with a prerecorded simulation.

## Editing rules

Allowed:

- remove model thinking time
- speed up repetitive discovery and proposal calls
- use hard cuts between successful tool results
- zoom into state and capability changes

Do not:

- hide a tool failure that changes the story
- imply cross-origin atomicity
- call the proof runner an external AI model
- spend time on package installation or deployment
- show source code for more than a few seconds
- add unrelated workflows

## Final pre-export checklist

- [ ] total runtime is below three minutes
- [ ] four origins are visible
- [ ] six initial proposals are visible
- [ ] human amendment is visible
- [ ] approval call visibly waits
- [ ] disruption visibly changes provider version
- [ ] stale capability disappears
- [ ] recovered plan is valid
- [ ] exact consent fields are legible
- [ ] provider receipts are visible
- [ ] final state is `COMMITTED`
- [ ] final line is the product thesis, not a feature list
