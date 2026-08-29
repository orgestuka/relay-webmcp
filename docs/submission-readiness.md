# Submission readiness

Status date: **2026-08-29**

Branch: `build/pact-vertical-slice`

Integration path: **draft PR #1 only**

# Current recommendation

## **DO NOT MERGE**

The GitHub-side implementation and release contract are hardened, but the exact current branch has not passed a clean machine execution. The next blocker is not another speculative code feature. It is generating the real npm lockfile and executing the branch on a human-controlled computer.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate ran against the identified commit and machine-readable evidence exists. |
| **SOURCE-READY** | The implementation and fail-closed gate exist, but the gate has not run on a clean machine. |
| **BLOCKED** | A required human-controlled environment or credential is absent. |
| **FAIL** | The exact gate ran and failed. |

## What is source-ready

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

These are **SOURCE-READY**, not runtime passes.

## Current hard boundary

| Gate | Status | Why |
| --- | --- | --- |
| Committed `package-lock.json` | **BLOCKED** | Must be generated from the real npm registry with Node 22.16.0 and npm 10.9.2. It must not be fabricated through GitHub. |
| Clean `npm ci` | **BLOCKED** | Requires the real lockfile and local filesystem. |
| Full `npm run verify` | **BLOCKED** | Requires installed dependencies and actual execution. |
| Four Vite production builds | **BLOCKED** | Included in verification but not executed on the exact head. |
| Docker image and Compose stack | **BLOCKED** | Requires Docker Engine/Desktop. |
| Four public HTTPS origins and DNS | **BLOCKED** | Requires domain and infrastructure control. |
| Actual ChatGPT built-in-browser proof | **BLOCKED** | Requires the deployed origins and a human-operated ChatGPT browser context. |
| Rehearsal and video | **BLOCKED** | Must use the validated deployment. |

## Exact remaining sequence

```text
generate and inspect package-lock.json
→ npm ci
→ npm run verify
→ commit lockfile
→ clean npm run gate:source
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

## Human handoff command path

Follow [`codex-local-release.md`](codex-local-release.md).

The first machine phase is:

```bash
git checkout build/pact-vertical-slice
git pull --ff-only origin build/pact-vertical-slice
nvm install
nvm use
npm install --global npm@10.9.2 --no-audit --no-fund
node --version
npm --version
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
rm -rf node_modules
npm ci --no-audit --no-fund
npm run verify
```

Required exact versions:

```text
v22.16.0
10.9.2
```

After the lockfile is reviewed and committed from a green working copy:

```bash
npm run gate:source
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

Hosted Actions has previously failed before runner allocation with zero executed steps. Until a run receives a real runner, do not label that state as either a code failure or a verification pass. The local source gate is the authoritative unblock path.

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
