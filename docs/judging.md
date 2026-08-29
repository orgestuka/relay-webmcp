# Judging strategy

## The one-line thesis

> Relay lets an agent compose work across independent websites while the human controls whether the exact consequential capabilities ever exist.

Everything in the submission should reinforce that sentence.

## The proof stack

Judges should be able to see five layers without reading source:

1. **Independent sites**: Relay Command, Shelter Grid, Transit Ops and Supply Hub are distinct HTTPS origins.
2. **Agent composition**: ChatGPT discovers live state and creates six non-binding provider proposals.
3. **Human authority**: the human narrows €5,000 to €3,000 and the approval call visibly waits.
4. **Capability lifecycle**: provider commit wrappers are absent before approval, appear only after exact consent and disappear after staleness or completion.
5. **Independent verification**: providers mutate their own state and issue six receipts; audit bundle v2 closes exact scope, receipt and release identity.

The capability transition is the differentiator. Many projects will display a confirmation modal. Relay changes the agent's actual callable surface.

## First 20 seconds

Show:

```text
four HTTPS origins
WebMCP LIVE
3/3 PROVIDERS
release identity PASS
NO CONSEQUENTIAL COMMIT CAPABILITY
```

Say:

> “The agent can prepare this evacuation across three independent sites. It cannot reserve one bed, vehicle or supply kit until the human approves the exact transaction.”

Do not begin with architecture diagrams, code or deployment.

## The unforgettable moment

The strongest judging sequence is:

1. six proposals create a valid €2,733 plan at €5,000 authority
2. human narrows authority to €3,000
3. approval call suspends
4. Shelter Grid changes v1 → v2
5. plan becomes `STALE`
6. pending approval resolves without a token
7. commit capability remains absent
8. recovery preserves the €3,000 ceiling
9. exact approval creates exactly three commit wrappers
10. provider commits remove them again

This makes revocation visible instead of merely claimed.

## What to emphasize

### WebMCP leverage

- provider capabilities originate inside visible provider documents
- exact-origin discovery and execution
- dynamic registration and `toolchange`
- browser-native suspended approval
- capability creation and teardown tied to state and human authority

### Technical seriousness

- P-256 signed exact scopes
- invocation-time authority recheck
- monotonic human ceiling through stale recovery
- complete atomic batches inside each provider origin
- honest partial cross-origin completion
- exact audit closure
- compiled, edge-header and manifest commit identity equality

### Product impact

The pattern generalizes to procurement, travel disruption, healthcare coordination, incident response and logistics wherever one objective spans sites but execution cannot be delegated as a blank cheque.

## What not to show

Do not spend judging time on:

- npm installation
- Docker logs
- source gates
- proof-runner internals
- generic AI explanation
- threat-model enumeration
- a second unrelated workflow

Those belong in the repository and evidence bundle, not the 2:45 video.

## Evidence credibility rules

Never blur evidence classes:

```text
source invariant ≠ executed test
browser harness ≠ ChatGPT
provider implementation ≠ ChatGPT authority
plan status ≠ exact audit closure
repository SHA ≠ deployed SHA without identity proof
```

The honest boundaries increase credibility.

## Pre-recording standard

Record only after:

```text
source gate                    PASS
full four-origin release gate PASS
actual ChatGPT identity        PASS
actual ChatGPT diagnostic      PASS
canonical path                 3 consecutive passes
stale/recovery path            3 consecutive passes
partial-completion drill       PASS
runtime                        2:40–2:50
```

## Competitive position

Relay should be scored as infrastructure for the emerging agentic web, not as another single-site assistant.

The strategic wedge is:

> WebMCP exposes site capabilities. Relay shows how independent capabilities become one human-governed transaction without erasing the websites that own state and execution.
