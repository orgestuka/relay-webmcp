# Submission readiness

## Authoritative checkpoint

This ledger covers the current release code and evidence chain:

```text
branch:          build/pact-vertical-slice
functional code: 0e2fa8408cca40be2ac27468ca7edb81061c1982
local evidence:  1e04f64496e73206c456d9f2c987bfb405730948
base:            main @ d89fbadceb4bed68d4745a3dbc25397c4e764796
PR:              #1, open and draft
```

Later commits on the branch may update only documentation or evidence. Use `git rev-parse HEAD` as the final checkout SHA and preserve the full history.

`main` must remain frozen until every external gate passes.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate was executed and evidence was captured. |
| **PARTIAL** | A lower-level property passed, but the full release gate was not executed. |
| **BLOCKED** | Required external input or environment is absent. |
| **FAIL** | The gate was executed and failed. |
| **NOT RUN** | The gate can be executed but has not yet run. |

## Evidence vocabulary

| Source | Meaning |
| --- | --- |
| `LOCAL_RECONSTRUCTED_CORE` | Current source reconstructed from the connected private branch and executed locally. Not a clean full checkout. |
| `LOCAL_INTERFACE_TYPECHECK` | Exact release source typechecked against strict declarations matching repository exports. Not a Vite build. |
| `LOCAL_DIAGNOSTIC_RUNTIME` | Exact diagnostic logic executed against deterministic WebMCP doubles. Not a deployed browser. |
| `LOCAL_BRIDGE_HARNESS` | Current fixed bridge executed against a deterministic origin-aware ModelContext. Not actual ChatGPT. |
| `REPOSITORY_CODE_REVIEW` | Static inspection only. |
| `GITHUB_ACTIONS_INFRA_FAILURE` | GitHub allocated no runner and executed zero steps. Not code evidence. |
| `DEPLOYED_FOUR_ORIGIN` | Evidence produced against four real HTTPS origins. |
| `ACTUAL_CHATGPT` | Raw output from ChatGPT's supported built-in browser. Required for compatibility claims. |
| `HARNESS` | Any browser, runtime double or proof runner outside actual ChatGPT. Useful but insufficient for Priority 0. |

## Executive release gate

```text
clean checkout passes
→ deployed four-origin smoke passes
→ actual ChatGPT browser test passes
→ stale/recovery/commit path passes
→ partial-commit recovery drill passes
→ demo rehearsed repeatedly
→ video recorded
→ README and reproduction guide finalized
→ repository made public or transferred if required
→ PR #1 merged
→ submission tag created
```

# Current recommendation: **DO NOT MERGE**

The implementation has reached the external-proof boundary. Real hostnames, deployment access and actual ChatGPT evidence are still absent.

---

## Priority 0: actual ChatGPT WebMCP compatibility

| Gate | Status | Exact command or action | Evidence location | Source | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Four real HTTPS origins configured | **BLOCKED** | Copy and populate `.env.deploy.example` | `.env.deploy` stays uncommitted | External input | Need four hostnames and DNS control. |
| Deployment manifest preflight | **NOT RUN** | `npm run deploy:check` | `evidence/deployment/01-preflight.json` | `DEPLOYED_FOUR_ORIGIN` | Needs populated environment file. |
| DNS preflight | **NOT RUN** | `npm run deploy:check:dns` | `evidence/deployment/02-dns.json` | `DEPLOYED_FOUR_ORIGIN` | Needs live DNS. |
| Four-origin container build | **NOT RUN** | `docker compose --env-file .env.deploy build --pull` | terminal or CI log | `DEPLOYED_FOUR_ORIGIN` | Need Docker host access. |
| Four-origin HTTPS startup | **NOT RUN** | `docker compose --env-file .env.deploy up -d` | `docker compose ps` | `DEPLOYED_FOUR_ORIGIN` | Same blocker. |
| HTTPS deployment smoke | **NOT RUN** | `npm run deploy:smoke` | `evidence/deployment/03-https-smoke.json` | `DEPLOYED_FOUR_ORIGIN` | Needs deployed URLs. |
| Relay tools visible in ChatGPT | **BLOCKED** | Call `relay_diagnose_webmcp` | `evidence/chatgpt/01-initial-diagnostic.json` | `ACTUAL_CHATGPT` | No deployed URL or actual ChatGPT browser access in this environment. |
| Provider origins discoverable | **BLOCKED** | Same diagnostic | same file | `ACTUAL_CHATGPT` | Same blocker. |
| Provider read tools semantically executable | **BLOCKED** | `{"executeReadProbes":true}` | same file | `ACTUAL_CHATGPT` | Same blocker. |
| One real proposal per provider | **BLOCKED** | Fixed bridge proposal tools | `evidence/chatgpt/02-provider-proposal-probes.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Dynamic creation and teardown observed | **BLOCKED** | Diagnostics before proposal, after proposal and after stale/commit | `03-capability-created.json`, `04-capability-torn-down.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Full stale, recovery, approval and commit path | **BLOCKED** | Exact prompt in `chatgpt-validation.md` | `05-full-path.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Final audit bundle | **BLOCKED** | `relay_get_audit_bundle` | `06-final-audit-bundle.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Partial-commit recovery drill | **BLOCKED** | Section 13 of `chatgpt-validation.md` | `07-partial-commit-recovery.json` | `ACTUAL_CHATGPT` | Same blocker. |

### Compatibility implementation

| Item | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
| Fixed top-level bridge | **PARTIAL** | Current source typechecks and deterministic bridge smoke passes | Actual ChatGPT invocation remains unproven. |
| Exact origin/tool binding | **PASS** | Wrong-origin same-name collision was ignored in bridge harness | Runtime deployment origin discovery still requires proof. |
| No arbitrary execute-any capability | **PASS** | Wrapper schemas contain no origin or tool-name selection and harness found no generic capability | None at source/harness layer. |
| Read and proposal wrappers for all providers | **PASS** | Bridge harness | Actual client visibility still requires ChatGPT. |
| Dynamic commit wrapper creation and teardown | **PARTIAL** | Bridge harness proves appearance and removal | Actual `toolchange` capture still requires ChatGPT. |
| Provider semantic rejection propagated | **PASS** | Bridge harness and diagnostic semantic probe | Actual provider failure still requires deployed proof. |
| Rejected authority not recorded | **PASS** | Bridge harness | Actual provider path still requires deployed proof. |
| Provider-accepted authority captured once | **PARTIAL** | Bridge harness records only accepted commit authority | Final deployed audit bundle remains unproven. |
| Provider-side PACT verification preserved | **PARTIAL** | Bridge only invokes the provider commit tool | Needs deployed cryptographic commit proof. |
| Local evidence reads avoid recursive WebMCP | **PASS** | Local registration ledger and audit source typecheck | Browser client visibility still requires ChatGPT. |
| Direct descendant mode isolated | **PASS** | `?direct=1` exists only for diagnosis | Static evidence. |

Exact actual-ChatGPT procedure and expected raw JSON:

- [`chatgpt-validation.md`](chatgpt-validation.md)

---

## Priority 1: hostile end-to-end release audit

### Commands executed

```bash
node --experimental-strip-types scripts/integrity-smoke.ts
tsc -p tsconfig.json --noEmit
node --experimental-strip-types scripts/release-audit.ts
tsc -p /tmp/relay-current-check/tsconfig.json --noEmit
node --experimental-strip-types /tmp/relay-current-check/runtime-smoke.mjs
tsc -p /tmp/relay-diag-check/tsconfig.json --noEmit
node --experimental-strip-types /tmp/relay-diag-runtime/run.mts
tsc -p /mnt/data/relay-bridge-harness/tsconfig.json --pretty false
node /mnt/data/relay-bridge-harness/dist/harness-release.js
```

Evidence:

- `evidence/local-core-smoke-2026-08-29.json`
- `evidence/release-audit-2026-08-29.json`
- `evidence/release-modules-typecheck-2026-08-29.json`
- `evidence/release-diagnostics-semantic-probe-2026-08-29.json`
- `evidence/compatibility-bridge-smoke-2026-08-29.json`

Boundaries:

- Core and release source were reconstructed from the connected private branch.
- Exact WebMCP runtime and release diagnostics passed strict typecheck.
- Local registration, execution, revocation and disable-during-registration race passed.
- Diagnostic probes reject semantic provider failures instead of treating valid JSON as success.
- Bridge routing, wrong-origin collision rejection, approval capture and dynamic teardown passed under a deterministic origin-aware ModelContext.
- `@types/node` is pinned so the root strict typecheck can resolve Node release scripts after installation.
- None of this is a clean full checkout, Vite build, Docker deployment or actual browser run.

### Required hostile cases

| # | Case | Status | Evidence | Source | Remaining blocker |
| ---: | --- | --- | --- | --- | --- |
| 1 | Normal 42-person evacuation completes | **PARTIAL** | 7/7 policy checks at €2,733 | `LOCAL_RECONSTRUCTED_CORE` | Provider mutation and receipt convergence not run. |
| 2 | Human lowers authority before approval | **PARTIAL** | €2,800 accepts €2,733; €2,700 rejects | `LOCAL_RECONSTRUCTED_CORE` | Human UI path not run. |
| 3 | Capacity change makes plan stale | **PARTIAL** | Version invalidation code reviewed | `REPOSITORY_CODE_REVIEW` | Needs deployed browser proof. |
| 4 | Stale approval and commit capabilities disappear | **PARTIAL** | Runtime revocation and bridge teardown pass | `LOCAL_BRIDGE_HARNESS` | Product-level stale teardown needs browser proof. |
| 5 | Agent replaces only invalidated provider work | **BLOCKED** | Recovery prompt prepared | `ACTUAL_CHATGPT` | Requires actual agent run. |
| 6 | Tampered approval rejected | **PASS** | Signature verification false | `LOCAL_RECONSTRUCTED_CORE` | End-to-end replay remains in browser gate. |
| 7 | Expired token rejected | **PASS** | `APPROVAL_EXPIRED` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 8 | Wrong session rejected | **PASS** | `SESSION_MISMATCH` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 9 | Wrong origin rejected | **PASS** | `ORIGIN_SCOPE_MISMATCH` and wrong-origin bridge collision ignored | `LOCAL_RECONSTRUCTED_CORE`, `LOCAL_BRIDGE_HARNESS` | None at source/harness layer. |
| 10 | Wrong provider version rejected | **PASS** | `VERSION_SCOPE_MISMATCH` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 11 | Aggregate cross-provider escalation rejected | **PASS** | `AGGREGATE_COST_EXCEEDED` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 12 | Same-origin batch failure changes no capacity | **PARTIAL** | Incomplete batch rejected with `INCOMPLETE_PROVIDER_BATCH` | `LOCAL_RECONSTRUCTED_CORE` | Need deployed before/after capacity snapshot. |
| 13 | Partial cross-provider completion represented honestly and recoverable | **PARTIAL** | Bridge rejection then retry succeeds; exact deployed drill documented | `LOCAL_BRIDGE_HARNESS` | Need Relay receipt/state evidence and actual ChatGPT recovery run. |
| 14 | Audit binds accepted approval, final state and receipts | **PARTIAL** | Local evidence access, consistency checks and digest source typecheck | `LOCAL_INTERFACE_TYPECHECK` | Needs completed deployed transaction and raw output. |

### Clean checkout and CI

| Gate | Status | Command | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| Clean install | **NOT RUN** | `npm install --no-audit --no-fund` | future log | No complete networked checkout in this environment. |
| Full verification | **NOT RUN** | `npm run verify` | future log | Same blocker. |
| Four production builds | **NOT RUN** | included in `npm run verify` | future log | Same blocker. |
| Docker build | **NOT RUN** | compose or CI build | future log | Docker unavailable here. |
| Compose structure audit | **PASS** | YAML parse and invariant inspection | local terminal output | Does not replace Docker execution. |
| GitHub Actions | **BLOCKED** | automatic workflow | run `33246441072`, job `99084616274` | Job contains `steps: null`; no hosted runner was allocated and no repository command executed. |

The red GitHub check is therefore infrastructure noise, not a discovered code failure. It must not be relabeled as green either.

---

## Priority 2: locked three-minute demo

| Requirement | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- |
| One objective across three provider websites | **PASS** | Existing topology | Deployment proof pending. |
| Deterministic seed data | **PASS** | Simulation fixtures | None. |
| One-click reset | **PASS** | `scenario-reset.ts` | Deployed click pending. |
| Exact recommended prompt | **PASS** | Demo and validation docs | None. |
| Visible provider versions | **PASS** | Provider UI | Deployed render pending. |
| Visible capability disappearance | **PARTIAL** | Capability surface, diagnostics and bridge teardown harness | Actual ChatGPT capture required. |
| Clear approval sheet | **PASS** | Existing consent UI and one-shot disruption control | Rehearsal pending. |
| Concise receipts and digest | **PARTIAL** | Provenance and audit code | Final visual rehearsal pending. |
| Proof console absent from judging URL | **PASS** | Enabled only with `?proof=1` | None. |
| Runtime 2:40–2:50 | **NOT RUN** | Timed rehearsal/video | Needs deployment and ChatGPT. |

Locked script:

- [`demo-script.md`](demo-script.md)

---

## Priority 3: freeze and release

| Action | Status | Required evidence or action |
| --- | --- | --- |
| Keep `main` frozen | **PASS** | `main` remains at `d89fbadceb4bed68d4745a3dbc25397c4e764796`. |
| Keep PR #1 draft | **PASS** | Do not mark ready or merge. |
| Preserve history | **PASS** | Release work remains on the build branch. |
| Four-origin smoke | **BLOCKED** | Hostnames, DNS and Docker access required. |
| Actual ChatGPT compatibility | **BLOCKED** | Deployed URL and manual test required. |
| Repeated rehearsal | **BLOCKED** | Deployed environment required. |
| Record public video | **BLOCKED** | Green rehearsal required. |
| Finalize README links | **PARTIAL** | Insert real URLs and evidence after deployment. |
| Public or transfer repository | **BLOCKED** | Human account action after evidence passes. |
| Merge PR #1 | **BLOCKED** | Every prior gate must pass. |
| Create submission tag | **BLOCKED** | Tag merged release commit only. |

## Exact human inputs still missing

```text
1. RELAY_HOST
2. SHELTER_HOST
3. TRANSIT_HOST
4. SUPPLY_HOST
5. DNS control for all four hosts
6. SSH or equivalent Docker access to the target server
7. ACME_EMAIL
8. Access to ChatGPT's supported built-in browser
```

No hostname or credential should be guessed.

## Final merge rule

```text
npm run verify                           PASS
npm run deploy:check:dns                 PASS
docker compose build                     PASS
docker compose up                        PASS
npm run deploy:smoke                     PASS
relay_diagnose_webmcp in actual ChatGPT  PASS
full stale/recovery/commit path           PASS
partial-commit recovery drill             PASS
relay_get_audit_bundle                    PASS
2:40–2:50 rehearsal                       PASS
public video                              RECORDED
repository visibility requirement        SATISFIED
```

Until then:

# **DO NOT MERGE**
