# Submission readiness

Status date: **2026-09-02**

Branch: `build/pact-vertical-slice`

Integration path: **draft PR #1 only**

# Current recommendation

## **DEPLOYED CHATGPT PRE-CONSENT PASS — KEEP PRIVATE AND DO NOT MERGE YET**

Release `f1f1ea5e447d847f0c525737df68256ddebbb17e` is deployed across four HTTPS origins. Its clean source gate, hosted CI, production smoke, ChatGPT release identity, executable provider diagnostic and complete pre-consent plan all passed. The repository intentionally remains private. The next candidate adds a plan-aware approval-sheet disruption and must be gated, committed, deployed and revalidated before the full consent/stale/recovery/commit recording.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate ran against the identified commit and machine-readable evidence exists. |
| **SOURCE-READY** | The implementation and fail-closed gate exist, but the gate has not run on a clean machine. |
| **BLOCKED** | A required human-controlled environment or credential is absent. |
| **FAIL** | The exact gate ran and failed. |

## What the source gate verifies

The branch contains source controls for:

- exact PACT scope, signature, provider-origin, state-version, expiry and authority verification
- registration-time and invocation-time human approval gating for top-level commit wrappers
- bounded five-second initial bridge readiness before diagnostics become callable
- stale capability teardown and retained human authority through recovery
- exact final plan, approval scope and receipt audit closure
- compiled, conflict-safe edge-header and `/release.json` commit identity equality
- production boot rejection of a missing or placeholder release SHA
- `Origin-Agent-Cluster: ?1` across Vite, Nginx and Caddy
- origin-scoped CSP and WebMCP Permissions-Policy
- read-only application containers and immutable hashed assets
- exact Node 22.16.0 and npm 10.9.2 pins across `.nvmrc`, package engines, CI, Docker and release gates
- dependency-free script syntax and static release-surface gates
- one canonical source release gate and one canonical deployment gate

These controls pass source verification. Public edge behavior and actual ChatGPT compatibility remain separate external runtime gates.

## Current hard boundary

| Gate | Status | Why |
| --- | --- | --- |
| Committed `package-lock.json` | **PASS** | Lockfile v3 is committed and consumed with npm 10.9.2. |
| Clean `npm ci` | **PASS** | Executed by the clean source gate. |
| Full `npm run verify` | **PASS** | The deployed `f1f1ea5…` release passed 88 release-contract checks, 79 tests, typecheck, smoke and release audits. Rerun for the next candidate. |
| Four Vite production builds | **PASS** | All four production bundles build inside the local gate and production image. |
| Production Docker image | **PASS** | The image verifies before runtime and all four app modes pass direct container health, headers and release-manifest smoke under the read-only Compose profile. |
| Hosted GitHub CI | **PASS** | Push and pull-request runs passed for deployed SHA `f1f1ea5…`. |
| Full public Compose stack | **PASS** | Four healthy application containers run behind the existing isolated Caddy edge. |
| Four public HTTPS origins and DNS | **PASS** | Relay, Shelter Grid, Transit Ops and Supply Hub pass production smoke. |
| ChatGPT identity and diagnostic | **PASS** | Release identity and all three executable provider read probes returned `ok: true`. |
| ChatGPT pre-consent plan | **PASS** | ChatGPT staged six non-binding proposals at €2,861, passed every policy check and exposed no commit capability. |
| Full stale/recovery/commit/audit path | **BLOCKED** | Must be rerun after the plan-aware disruption candidate is deployed. |
| Repository visibility | **BLOCKED** | Intentionally private until the user performs the final publication step. |
| Rehearsal and video | **BLOCKED** | Requires the final validated release and three reliable rehearsals. |

## Exact remaining sequence

```text
finish plan-aware disruption candidate
→ clean npm run gate:source
→ commit, push branch and observe hosted CI
→ deploy exact candidate SHA and run the four-origin release gate
→ relay_get_release_identity
→ relay_diagnose_webmcp with read probes
→ stale/recovery ChatGPT transaction
→ partial-commit recovery drill
→ repeated rehearsals
→ public video
→ merge PR #1 without squashing away release provenance
→ make the repository public and verify LICENSE detection
→ validate merged SHA
→ submission tag
```

## Verified local command path

Follow [`codex-local-release.md`](codex-local-release.md).

The completed source phase is reproducible with:

```bash
git checkout build/pact-vertical-slice
nvm install
nvm use
npm install --global npm@10.9.2 --no-audit --no-fund
node --version
npm --version
npm run gate:source
```

Required exact versions:

```text
v22.16.0
10.9.2
```

The source gate must produce:

```json
{
  "pass": true
}
```

under ignored `.relay-artifacts/release/`.

## Deployment gate

Follow [`production-operator-runbook.md`](production-operator-runbook.md).

Required deployment identity:

```env
RELAY_RELEASE_SHA=<exact output of git rev-parse HEAD>
```

Full command:

```bash
npm run gate:release -- --env .env.deploy
```

The deployed smoke must prove all four origins share:

```text
exact release SHA
valid release.json manifest
one non-conflicting X-Relay-Release identity
Origin-Agent-Cluster: ?1
correct CSP
correct tools Permissions-Policy
no localhost origins in compiled assets
healthy HTTPS application
```

## Actual ChatGPT gate

Follow [`chatgpt-validation.md`](chatgpt-validation.md).

Required first calls:

```text
relay_get_release_identity
relay_diagnose_webmcp { executeReadProbes: true }
```

Then prove:

- read and proposal tools are available before consent
- consequential commit wrappers are absent before consent
- a human visibly lowers authority from €5,000 to €3,000
- a provider mutation makes the plan stale
- stale commit capability disappears
- recovery does not restore the old €5,000 ceiling
- fresh exact human approval creates only the required commit wrappers
- every provider independently verifies and commits
- six unique receipts close the exact final plan
- audit bundle v2 returns `ok: true`
- partial cross-provider completion is represented honestly and recovered through fresh state and consent

Ordinary Chrome, Playwright and `?proof=1` remain harness evidence only.

## GitHub Actions status

The local source gate is green. Hosted Actions still needs a runner-backed result for the exact pushed commit; a pre-allocation failure or a run with zero executed steps is neither a code failure nor a verification pass.

## Merge rule

PR #1 remains draft. `main` remains frozen.

Merge only when all of these are real passes against an identified SHA:

```text
source gate
full deployment gate
actual ChatGPT gate
three canonical rehearsals
three stale/recovery rehearsals
partial-commit recovery drill
public video under three minutes
repository visibility requirement
```

Generated evidence must not be committed after deployment unless the resulting new commit is rebuilt, redeployed and revalidated.
