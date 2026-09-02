# Submission readiness

Status date: **2026-09-02**

Branch: `build/pact-vertical-slice`

Integration path: **draft PR #1 only**

# Current recommendation

## **SOURCE AND PACKAGED RUNTIME PASS — DO NOT MERGE YET**

The exact branch passes the clean source release gate and the production image builds and serves all four applications under the Compose read-only security profile. The remaining blockers are external: push/hosted CI visibility, four public HTTPS origins, actual ChatGPT validation, rehearsals and the public submission video.

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
| Full `npm run verify` | **PASS** | 81 release-contract checks, 75 tests, typecheck, smoke and release audits pass. |
| Four Vite production builds | **PASS** | All four production bundles build inside the local gate and production image. |
| Production Docker image | **PASS** | The image verifies before runtime and all four app modes pass direct container health, headers and release-manifest smoke under the read-only Compose profile. |
| Hosted GitHub CI | **BLOCKED** | The latest local commit must be pushed and a runner-backed workflow result observed. |
| Full public Compose stack | **BLOCKED** | Requires deployment configuration, public DNS and certificate issuance. |
| Four public HTTPS origins and DNS | **BLOCKED** | Requires domain and infrastructure control. |
| Actual ChatGPT built-in-browser proof | **BLOCKED** | Requires the deployed origins and a human-operated ChatGPT browser context. |
| Rehearsal and video | **BLOCKED** | Must use the validated deployment. |

## Exact remaining sequence

```text
push exact gated commit and observe hosted CI
→ configure four DNS names
→ clean npm run gate:release
→ relay_get_release_identity
→ relay_diagnose_webmcp with read probes
→ canonical ChatGPT transaction
→ stale/recovery ChatGPT transaction
→ partial-commit recovery drill
→ repeated rehearsals
→ public video
→ visibility requirement
→ PR #1 merge
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
