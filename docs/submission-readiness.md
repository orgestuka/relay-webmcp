# Submission readiness

Status date: **2026-08-29**

Branch: `build/pact-vertical-slice`

Integration path: **draft PR #1 only**

`main` must remain frozen until every external gate is green.

# Current recommendation

## **DO NOT MERGE**

The internal protocol and release hardening are materially stronger, but the decisive environment gates remain unproven:

- clean full-checkout verification
- production container build
- four real HTTPS origins
- deployed origin-isolation smoke
- actual ChatGPT built-in-browser tool discovery and execution
- full stale → recover → approve → commit rehearsal
- public video

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate ran and machine-readable evidence exists. |
| **PARTIAL** | A lower-level invariant passed, but the complete release gate did not run. |
| **BLOCKED** | Required credentials, hostnames or environment access are absent. |
| **NOT RUN** | The gate is runnable later but has not been executed. |
| **FAIL** | The exact gate ran and failed. |

## Evidence classes

| Evidence class | Meaning |
| --- | --- |
| `LOCAL_RECONSTRUCTED_CORE` | Current source modules were reconstructed from the connected private branch and executed locally. Not a full checkout. |
| `REPOSITORY_CODE_REVIEW` | Static inspection only. |
| `GITHUB_ACTIONS_INFRA_FAILURE` | GitHub created a failed job with zero steps and no logs. This is not code evidence. |
| `CLEAN_CHECKOUT` | Fresh clone, dependency install, verification and production builds. |
| `DEPLOYED_FOUR_ORIGIN` | Evidence from four real HTTPS origins. |
| `ACTUAL_CHATGPT` | Raw evidence produced by ChatGPT's supported built-in browser. |
| `HARNESS` | Playwright, ordinary Chrome or Relay proof-runner evidence. Useful but insufficient for ChatGPT compatibility. |

# Release sequence

```text
clean checkout passes
→ production container build passes
→ deployed four-origin smoke passes
→ actual ChatGPT browser test passes
→ complete demo rehearsed repeatedly
→ final video recorded
→ README and reproduction guide frozen
→ repository visibility requirement satisfied
→ PR #1 merged
→ submission tag created
```

# Internal release audit

| Gate | Status | Exact command or action | Evidence location | Evidence class | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| PACT signature and exact-scope verification | **PASS** | `node --experimental-strip-types scripts/integrity-smoke.ts` | `evidence/local-core-smoke-2026-08-29.json` | `LOCAL_RECONSTRUCTED_CORE` | Repeat from clean checkout. |
| Canonical €2,733 policy plan | **PASS** | `node --experimental-strip-types scripts/release-audit.ts` | `evidence/release-audit-2026-08-29.json` | `LOCAL_RECONSTRUCTED_CORE` | Repeat after current source changes. |
| Tampered approval rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Clean-checkout rerun. |
| Expired token rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Clean-checkout rerun. |
| Wrong session rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Clean-checkout rerun. |
| Wrong provider origin rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Clean-checkout rerun. |
| Wrong provider version rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Clean-checkout rerun. |
| Aggregate authority escalation rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Clean-checkout rerun. |
| Incomplete same-origin batch rejected | **PASS** | `npm run audit:release` | release-audit evidence | `LOCAL_RECONSTRUCTED_CORE` | Provider before/after capacity still needs deployed proof. |
| Human authority persists through stale restaging | **PASS** | strict TypeScript check plus `node --experimental-strip-types authority-check.ts` | `evidence/authority-persistence-2026-08-29.json` | `LOCAL_RECONSTRUCTED_CORE` | Repeat through the actual UI and ChatGPT. |
| Authority cannot increase after human tightening | **PASS** | authority persistence check | same evidence | `LOCAL_RECONSTRUCTED_CORE` | Actual UI proof pending. |
| Node release scripts have type definitions | **PARTIAL** | `npm run typecheck` | `package.json` pins `@types/node` | `REPOSITORY_CODE_REVIEW` | Full clean typecheck not run here. |
| WebMCP diagnostics reject semantic `{ok:false}` | **PARTIAL** | `npm test` | diagnostics source and tests | `REPOSITORY_CODE_REVIEW` | Clean test suite and actual browser probe pending. |
| Dynamic tool registration/revocation is race-safe | **PARTIAL** | `npm test` | runtime lifecycle tests | `REPOSITORY_CODE_REVIEW` | Clean test suite pending. |
| Provider local batch is atomic | **PARTIAL** | `npm test` | provider-runtime atomicity tests | `REPOSITORY_CODE_REVIEW` | Deployed before/after inventory proof pending. |
| North Shelter reserve is not double-subtracted after commit | **PARTIAL** | `npm test` | simulation regression tests | `REPOSITORY_CODE_REVIEW` | Full browser commit path pending. |
| Audit bundle binds accepted approval, receipts, plan and mesh | **PARTIAL** | `relay_get_audit_bundle` after commit | release diagnostics source | `REPOSITORY_CODE_REVIEW` | Actual committed browser output pending. |
| Origin-keyed agent cluster enforced | **PARTIAL** | `npm run check:origin-isolation` | Vite headers, Caddy header, bootstrap guard | `REPOSITORY_CODE_REVIEW` | Deployed header proof pending. |

# Clean checkout gate

Run when the repository is available locally:

```bash
git clone <REPOSITORY_URL>
cd relay-webmcp
git checkout build/pact-vertical-slice

node --version
npm --version
npm install --no-audit --no-fund
npm run verify
npm run check:origin-isolation
```

Required results:

| Gate | Status now | Required evidence |
| --- | --- | --- |
| Fresh dependency install | **NOT RUN** | terminal transcript |
| Strict TypeScript check | **NOT RUN** | successful command output |
| Dependency-free integrity smoke | **NOT RUN** on current full checkout | raw JSON output |
| Hostile release audit | **NOT RUN** on current full checkout | raw JSON output including authority persistence |
| Vitest suite | **NOT RUN** | passing test summary |
| All four Vite production builds | **NOT RUN** | build output |
| Origin-isolation static check | **NOT RUN** | raw JSON or terminal output |

A lockfile is not currently proven in this environment. Before release, generate and commit `package-lock.json` from Node 22 and npm 10, then prefer:

```bash
npm ci
```

# GitHub Actions status

| Gate | Status | Evidence | Interpretation |
| --- | --- | --- | --- |
| Hosted workflow execution | **BLOCKED** | latest failed job has `steps: []` and no logs | Runner provisioning failed before checkout. Do not describe this as a test failure or test pass. |

Do not spend release time repeatedly rerunning the same hosted job unless account-level Actions provisioning changes.

# Four-origin deployment gate

Required inputs:

```text
RELAY_HOST
SHELTER_HOST
TRANSIT_HOST
SUPPLY_HOST
ACME_EMAIL
DNS access
SSH or equivalent Docker access
```

Commands:

```bash
cp .env.deploy.example .env.deploy
# replace every placeholder

npm run deploy:check
npm run deploy:check:dns

docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
docker compose --env-file .env.deploy ps

npm run deploy:smoke
```

| Gate | Status | Evidence target | Remaining blocker |
| --- | --- | --- | --- |
| Four distinct hostnames configured | **BLOCKED** | `evidence/deployment/01-preflight.json` | Hostnames absent. |
| DNS resolves to deployment host | **BLOCKED** | `evidence/deployment/02-dns.json` | DNS absent. |
| Production image builds | **BLOCKED** | Docker build transcript | No Docker host access here. |
| All four services become healthy | **BLOCKED** | `docker compose ps` | Same blocker. |
| HTTPS roots load | **BLOCKED** | `evidence/deployment/03-https-smoke.json` | Deployment absent. |
| Compiled origins contain no localhost fallback | **BLOCKED** | deployment smoke asset inspection | Deployment absent. |
| `Origin-Agent-Cluster: ?1` on all four roots | **BLOCKED** | deployment smoke header checks | Deployment absent. |

# Actual ChatGPT WebMCP gate

Primary procedure:

- [`chatgpt-validation.md`](chatgpt-validation.md)

Required raw evidence:

```text
evidence/chatgpt/01-initial-diagnostic.json
evidence/chatgpt/02-provider-proposal-probes.json
evidence/chatgpt/03-capability-created.json
evidence/chatgpt/04-capability-torn-down.json
evidence/chatgpt/05-full-path.json
evidence/chatgpt/06-final-audit-bundle.json
evidence/chatgpt/07-partial-commit-recovery.json
```

| Gate | Status | Required proof |
| --- | --- | --- |
| Relay tools register and are visible to ChatGPT | **BLOCKED** | raw `relay_diagnose_webmcp` result |
| All three provider origins are discovered | **BLOCKED** | diagnostic provider entries |
| All three read tools execute semantically | **BLOCKED** | each `readProbe.result.ok === true` |
| One real proposal executes against every provider | **BLOCKED** | raw proposal outputs |
| Commit wrappers appear after proposals | **BLOCKED** | before/after diagnostic tool lists |
| Initial plan stages at €5,000 authority | **BLOCKED** | raw `relay_get_plan` |
| Human visibly tightens €5,000 → €3,000 | **BLOCKED** | UI plus raw plan revision |
| €3,000 cap survives stale recovery | **BLOCKED** | recovered `relay_get_plan` despite agent request for €5,000 |
| Stale approval and commit capabilities disappear | **BLOCKED** | teardown diagnostic |
| Agent replaces only invalidated shelter work | **BLOCKED** | recovered proposal sequence |
| Providers independently commit | **BLOCKED** | three commit outputs |
| Six unique receipts reach Relay | **BLOCKED** | final plan output |
| Final audit digest passes consistency | **BLOCKED** | raw audit bundle |
| Partial cross-provider completion is represented and recovered | **BLOCKED** | dedicated recovery evidence |

Do not claim ChatGPT compatibility from Playwright, ordinary Chrome or `?proof=1`.

# Demo lock

Final script:

- [`demo-script.md`](demo-script.md)

The locked sequence is:

```text
objective across three providers
→ agent discovers and stages at €5,000 authority
→ human tightens to €3,000
→ approval call suspends
→ shelter version changes
→ stale capabilities disappear
→ agent replaces only shelter work under retained €3,000 cap
→ human approves exact recovered scopes
→ providers verify and commit
→ six receipts and audit digest appear
```

| Demo gate | Status | Remaining blocker |
| --- | --- | --- |
| Deterministic reset | **PARTIAL** | Code complete; deployed proof pending. |
| Genuine human authority amendment | **PARTIAL** | Prompt and guard fixed; actual UI recording pending. |
| Capability disappearance legible | **PARTIAL** | UI and diagnostics complete; rehearsal pending. |
| 2:40–2:50 rehearsal | **BLOCKED** | Deployment and actual ChatGPT required. |
| Three consecutive successful rehearsals | **BLOCKED** | Same blocker. |
| Three consecutive stale/recovery rehearsals | **BLOCKED** | Same blocker. |
| Public video under three minutes | **BLOCKED** | Record only after green rehearsals. |

# Freeze and release

| Action | Status | Rule |
| --- | --- | --- |
| Keep `main` frozen | **PASS** | No direct commits. |
| Keep PR #1 draft | **PASS** | Do not mark ready yet. |
| Preserve commit history | **PASS** | No squash/reset workaround before release. |
| Final README/reproduction URLs | **BLOCKED** | Insert only real deployed URLs. |
| Repository public or transferred if required | **BLOCKED** | Human account action after evidence passes. |
| Merge PR #1 | **BLOCKED** | Every previous gate must pass. |
| Create submission tag | **BLOCKED** | Tag the merged release commit only. |

# Exact human actions still required

When back at the computer:

1. Open `build/pact-vertical-slice` in Codex.
2. Run the clean-checkout commands above.
3. Generate and commit `package-lock.json` if absent.
4. Fix only reproducible failures; do not add scope.
5. Supply four hostnames and point DNS to the Docker host.
6. Deploy the Caddy/Compose stack.
7. Run `npm run deploy:smoke`.
8. Open Relay in a fresh ChatGPT built-in browser context.
9. Execute every step in `docs/chatgpt-validation.md` and save raw JSON evidence.
10. Rehearse the locked script until repeatable in 2:40–2:50.
11. Record the public video.
12. Make the repository public or transfer it only if required by the competition.
13. Update this ledger to all green.
14. Merge through PR #1.
15. Create the submission tag.

Until those actions complete:

# **DO NOT MERGE**
