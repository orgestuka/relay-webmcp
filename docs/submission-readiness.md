# Submission readiness

## Authoritative checkpoint

This ledger was generated against the release source head:

```text
branch: build/pact-vertical-slice
source: 5c389a19c261a9caf636e2797753c06b748f0bfb
base:   main @ d89fbadceb4bed68d4745a3dbc25397c4e764796
PR:     #1, open and draft
```

The commit containing this ledger is a documentation-and-evidence-only child of the source head above. Use the PR head or `git rev-parse HEAD` as the final checkout SHA.

`main` must remain frozen until every external gate passes.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate was executed and evidence was captured. |
| **PARTIAL** | A lower-level property passed, but the full release gate was not executed. |
| **BLOCKED** | Required external input or environment is absent. |
| **FAIL** | The gate was executed and failed. |
| **NOT RUN** | The gate can be executed but has not been run. |

## Evidence vocabulary

| Source | Meaning |
| --- | --- |
| `LOCAL_RECONSTRUCTED_CORE` | Current source reconstructed from the connected private branch and executed locally. Not a clean full checkout. |
| `LOCAL_INTERFACE_TYPECHECK` | Exact release source typechecked against strict declarations matching repository exports. Not a Vite build. |
| `REPOSITORY_CODE_REVIEW` | Static inspection only. |
| `GITHUB_ACTIONS_INFRA_FAILURE` | GitHub allocated no runner and executed zero steps. Not code evidence. |
| `DEPLOYED_FOUR_ORIGIN` | Evidence produced against four real HTTPS origins. |
| `ACTUAL_CHATGPT` | Raw output from ChatGPT's supported built-in browser. Required for compatibility claims. |
| `HARNESS` | Browser or proof-runner evidence outside actual ChatGPT. Useful but insufficient for Priority 0. |

## Executive release gate

```text
clean checkout passes
→ deployed four-origin smoke passes
→ actual ChatGPT browser test passes
→ complete stale/recovery/commit path passes
→ demo rehearsed repeatedly
→ video recorded
→ README and reproduction guide finalized
→ repository made public or transferred if required
→ PR #1 merged
→ submission tag created
```

# Current recommendation: **DO NOT MERGE**

The code is at the external-proof boundary. Deployment inputs and actual ChatGPT evidence are absent.

---

## Priority 0: actual ChatGPT WebMCP compatibility

| Gate | Status | Command or action | Evidence location | Source | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Four real HTTPS origins configured | **BLOCKED** | Copy and populate `.env.deploy.example` | `.env.deploy` stays uncommitted | External input | Need four hostnames and DNS control. |
| Deployment manifest preflight | **NOT RUN** | `npm run deploy:check` | `evidence/deployment/01-preflight.json` | `DEPLOYED_FOUR_ORIGIN` | Needs populated environment file. |
| DNS preflight | **NOT RUN** | `npm run deploy:check:dns` | `evidence/deployment/02-dns.json` | `DEPLOYED_FOUR_ORIGIN` | Needs live DNS. |
| Four-origin container build | **NOT RUN** | `docker compose --env-file .env.deploy build --pull` | terminal or CI log | `DEPLOYED_FOUR_ORIGIN` | Need Docker host access. |
| Four-origin HTTPS startup | **NOT RUN** | `docker compose --env-file .env.deploy up -d` | `docker compose ps` | `DEPLOYED_FOUR_ORIGIN` | Same blocker. |
| HTTPS deployment smoke | **NOT RUN** | `npm run deploy:smoke` | `evidence/deployment/03-https-smoke.json` | `DEPLOYED_FOUR_ORIGIN` | Needs deployed URLs. |
| Relay tools visible in ChatGPT | **BLOCKED** | Call `relay_diagnose_webmcp` | `evidence/chatgpt/01-initial-diagnostic.json` | `ACTUAL_CHATGPT` | No deployed URL and no actual ChatGPT browser access in this tool environment. |
| Provider origins discoverable | **BLOCKED** | Same diagnostic | same file | `ACTUAL_CHATGPT` | Same blocker. |
| Provider read tools executable | **BLOCKED** | `{"executeReadProbes":true}` | same file | `ACTUAL_CHATGPT` | Same blocker. |
| One real proposal per provider | **BLOCKED** | Fixed bridge proposal tools | `evidence/chatgpt/02-provider-proposal-probes.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Dynamic creation and teardown observed | **BLOCKED** | Diagnostics before proposal, after proposal and after stale/commit | `03-capability-created.json`, `04-capability-torn-down.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Full approval and commit path | **BLOCKED** | Exact prompt in `chatgpt-validation.md` | `05-full-path.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Final audit bundle | **BLOCKED** | `relay_get_audit_bundle` | `06-final-audit-bundle.json` | `ACTUAL_CHATGPT` | Same blocker. |

### Compatibility implementation

| Item | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
| Fixed top-level bridge | **PARTIAL** | `compatibility-bridge.ts` | Current source typechecks. Actual ChatGPT invocation is unproven. |
| Exact origin/tool binding | **PASS** | Fixed mapping in source | Runtime origin discovery still requires deployment proof. |
| No arbitrary execute-any capability | **PASS** | No origin or tool-name input exists in wrapper schemas | Static evidence. |
| Dynamic capability mirroring | **PARTIAL** | `toolchange`, race-safe `DynamicTool` and periodic discovery fallback | Needs actual browser evidence. |
| Provider-side authorization preserved | **PARTIAL** | Commit bridge invokes provider commit tool; provider verifies PACT | Needs deployed commit proof. |
| Local registration evidence without recursive WebMCP | **PASS** | Local registry runtime smoke and current diagnostics typecheck | Browser client visibility still needs ChatGPT proof. |
| Provider-accepted approval capture | **PARTIAL** | Token recorded only after provider returns `ok: true` | Needs final deployed audit bundle. |
| Direct descendant mode isolated | **PASS** | `?direct=1` exists only for diagnosis | Static evidence. |

Exact manual procedure and expected JSON:

- [`chatgpt-validation.md`](chatgpt-validation.md)

---

## Priority 1: hostile end-to-end release audit

### Commands executed in this session

```bash
node --experimental-strip-types scripts/integrity-smoke.ts
tsc -p tsconfig.json --noEmit
node --experimental-strip-types scripts/release-audit.ts
tsc -p /tmp/relay-current-check/tsconfig.json --noEmit
node --experimental-strip-types /tmp/relay-current-check/runtime-smoke.mjs
```

Evidence:

- `evidence/local-core-smoke-2026-08-29.json`
- `evidence/release-audit-2026-08-29.json`
- `evidence/release-modules-typecheck-2026-08-29.json`

Boundaries:

- Core and current release source were reconstructed from the connected private branch.
- Exact current WebMCP runtime and release diagnostics passed strict typecheck.
- Local registration, execution, revocation and disable-during-registration race passed.
- This is not a clean checkout, production build, Docker deployment or browser run.

### Required hostile cases

| # | Case | Status | Evidence | Source | Remaining blocker |
| ---: | --- | --- | --- | --- | --- |
| 1 | Normal 42-person evacuation completes | **PARTIAL** | 7/7 policy checks at €2,733 | `LOCAL_RECONSTRUCTED_CORE` | Provider mutation and receipt convergence not run. |
| 2 | Human lowers authority before approval | **PARTIAL** | €2,800 accepts €2,733; €2,700 rejects | `LOCAL_RECONSTRUCTED_CORE` | Human UI path not run. |
| 3 | Capacity change makes plan stale | **PARTIAL** | Version invalidation code reviewed | `REPOSITORY_CODE_REVIEW` | Needs deployed browser proof. |
| 4 | Stale approval and commit capabilities disappear | **PARTIAL** | Dynamic revocation and registration race pass | `LOCAL_INTERFACE_TYPECHECK` | Product-level teardown needs browser proof. |
| 5 | Agent replaces only invalidated provider work | **BLOCKED** | Recovery prompt prepared | `ACTUAL_CHATGPT` | Requires actual agent run. |
| 6 | Tampered approval rejected | **PASS** | Signature verification false | `LOCAL_RECONSTRUCTED_CORE` | End-to-end replay remains in browser gate. |
| 7 | Expired token rejected | **PASS** | `APPROVAL_EXPIRED` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 8 | Wrong session rejected | **PASS** | `SESSION_MISMATCH` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 9 | Wrong origin rejected | **PASS** | `ORIGIN_SCOPE_MISMATCH` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 10 | Wrong provider version rejected | **PASS** | `VERSION_SCOPE_MISMATCH` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 11 | Aggregate cross-provider escalation rejected | **PASS** | `AGGREGATE_COST_EXCEEDED` | `LOCAL_RECONSTRUCTED_CORE` | None at verifier layer. |
| 12 | Same-origin batch failure changes no capacity | **PARTIAL** | Incomplete batch rejected with `INCOMPLETE_PROVIDER_BATCH` | `LOCAL_RECONSTRUCTED_CORE` | Need before/after capacity snapshot. |
| 13 | Partial cross-provider completion represented honestly and recoverable | **BLOCKED** | Receipts/audit consistency code exists | `ACTUAL_CHATGPT` or deployed harness | No runtime evidence yet. |
| 14 | Audit binds accepted approval, final state and receipts | **PARTIAL** | Audit consistency and digest source typecheck | `LOCAL_INTERFACE_TYPECHECK` | Needs a completed deployed transaction and raw output. |

### Clean checkout and CI

| Gate | Status | Command | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| Clean install | **NOT RUN** | `npm install --no-audit --no-fund` | future log | No complete networked checkout in this session. |
| Full verification | **NOT RUN** | `npm run verify` | future log | Same blocker. |
| Four production builds | **NOT RUN** | included in `npm run verify` | future log | Same blocker. |
| Docker build | **NOT RUN** | compose or CI build | future log | Docker unavailable here. |
| GitHub Actions | **BLOCKED** | automatic workflow | run `33245867200`, job `99083083778` | Job executed zero steps because no runner was allocated. Not a code failure. |

---

## Priority 2: locked three-minute demo

| Requirement | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- |
| One objective across three provider websites | **PASS** | Existing topology | Deployment proof pending. |
| Deterministic seed data | **PASS** | Simulation fixtures | None. |
| One-click reset | **PASS** | `scenario-reset.ts` | Deployed click pending. |
| Exact recommended prompt | **PASS** | Demo and validation docs | None. |
| Visible provider versions | **PASS** | Provider UI | Deployed render pending. |
| Visible capability disappearance | **PARTIAL** | Capability surface and diagnostics | Actual ChatGPT capture required. |
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
| Public/transfer repository | **BLOCKED** | Human account action after evidence passes. |
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
relay_get_audit_bundle                    PASS
2:40–2:50 rehearsal                       PASS
public video                              RECORDED
repository visibility requirement        SATISFIED
```

Until then:

# **DO NOT MERGE**
