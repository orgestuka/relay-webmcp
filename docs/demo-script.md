# Three-minute demo script

## 0:00–0:20 — premise

Show Relay with three live provider frames.

> “WebMCP makes a website callable by an agent. Relay explores the harder case: one user objective spanning independent websites where the agent can prepare everything, but the human still controls consequential execution.”

## 0:20–0:55 — agent composes

Prompt:

> Evacuate all 42 Riverside residents before 18:00. Cover 9 wheelchair-accessible passengers, preserve 20 North Shelter beds and stay under €5,000. Prepare everything, but do not commit until I approve.

Show WebMCP calls hitting all three providers. Each provider visibly creates proposals. Relay stages the combined plan.

## 0:55–1:15 — human amends

In Relay, tighten the authority cap from €5,000 to €3,000.

Narration:

> “The human is not watching automation. They can narrow the agent’s authority. That amendment becomes part of the signed approval scope.”

## 1:15–1:40 — stale-state failure

Before approval, click **Inject disruption** in Shelter Grid.

South Shelter falls from 24 to 12 beds. Relay turns **STALE** and the shelter commit tool disappears.

> “The plan was valid one second ago. It is not valid now. Relay fails closed instead of letting the agent execute stale reservations.”

Ask the agent to recover. It re-queries Shelter Grid and replaces the stale shelter proposals while reusing still-valid transit and supply proposals.

## 1:40–2:15 — human consent

The agent calls `relay_request_approval`.

The agent tool invocation visibly waits. Relay opens the approval sheet with:

- exact proposal IDs
- origin identities
- provider state versions
- per-operation cost
- maximum authority
- plan hash
- two-minute expiry

Click **Approve & sign PACT token**.

> “Only this exact transaction receives authority.”

## 2:15–2:40 — transact

The agent presents the token to each provider's commit tool.

Show:

- per-origin atomic commit
- provider versions advancing
- receipts entering provenance stream
- Relay reaching **COMMITTED**

## 2:40–3:00 — thesis

Show PACT rail and repo architecture.

> “When agents become the interface, websites do not disappear. They become trusted, visible state and execution boundaries. Agents compose. Humans authorize. That is Relay.”
