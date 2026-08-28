# Judging strategy

The official criteria are equally weighted. Relay is designed so the same demo proves all four.

## WebMCP leverage

Evidence in repo/demo:

- four WebMCP documents in one frame tree
- cross-origin providers with `allow="tools"`
- explicit origin exposure
- imperative tool registration
- read-only annotations
- dynamic tool registration/unregistration via abort signals
- async human-gated execution
- stateful tools visibly mutating the page that owns them

Target: **10/10**

## Execution

Evidence:

- coherent single-purpose command UI
- deterministic demo with no flaky external APIs
- visible provider state and provenance
- failure/recovery path
- signed approval token
- per-origin atomic commits

Target: **9/10**

## Potential impact

Concrete audience:

- operations teams coordinating actions across independent services
- procurement, logistics, incident response, travel disruption and regulated workflows

Concrete problem:

- agents can increasingly act, but cross-provider composition, stale state and bounded human authority are unresolved product problems

Target: **9/10**

## Creativity and ambition

Novelty:

- treats WebMCP as a federated transaction surface rather than a shortcut to existing buttons
- human is an execution dependency, not a chat participant
- dynamic tool availability becomes part of protocol state
- PACT generalizes beyond the evacuation demo

Target: **9–10/10**

## Do not dilute before submission

Avoid adding:

- generic chatbot UI
- unrelated workflows
- external API dependencies just for realism
- blockchain
- broad “agent platform” positioning
- claims of distributed ACID semantics

The winning story is one scenario, one protocol and one memorable failure/recovery sequence.
