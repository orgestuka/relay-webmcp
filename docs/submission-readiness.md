# Submission readiness

Last audited branch at start of release-critical work:

```text
build/pact-vertical-slice
9c7880457516c6b4d0a94306caf0dee2b66ad362
```

The release-only checkpoint that contains this document must remain on the same branch. `main` must remain frozen until every external gate is green.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate was executed and evidence was captured. |
| **PARTIAL** | A lower-level property passed, but the full release gate was not executed. |
| **BLOCKED** | Required external input or environment is absent. |
| **FAIL** | The gate was executed and failed. |
| **NOT RUN** | The gate can be executed but has not yet been run. |

## Evidence vocabulary

| Evidence source | Meaning |
| --- | --- |
| `LOCAL_RECONSTRUCTED_CORE` | Current core files were reconstructed byte-for-byte from the connected private branch and executed locally. Not a clean full checkout. |
| `REPOSITORY_CODE_REVIEW` | Static inspection of the connected branch. Not execution evidence. |
| `GITHUB_ACTIONS_INFRA_FAILURE` | GitHub created a job but allocated no runner and executed zero steps. Not code evidence. |
| `DEPLOYED_FOUR_ORIGIN` | Evidence produced against four real HTTPS origins. |
| `ACTUAL_CHATGPT` | Raw output produced through ChatGPT's supported built-in browser. Required for compatibility claims. |
| `HARNESS` | Browser or proof-runner evidence outside actual ChatGPT. Useful but insufficient for Priority 0. |

## Executive release gate

```text
clean checkout passes
→ deployed four-origin smoke passes
→ actual ChatGPT browser test passes
→ full demo rehearsed repeatedly
→ video recorded
→ README and reproduction guide finalized
→ repository made public or transferred if required
→ PR #1 merged
→ submission tag created
```

Current recommendation:

# **DO NOT MERGE**

Reason: deployment hostnames, deployment credentials, four-origin smoke evidence and actual ChatGPT evidence are not available in this session.

## Priority 0: actual ChatGPT WebMCP compatibility

| Gate | Status | Command or action | Evidence location | Evidence source | Remaining blocker |
| --- | --- | --- | --- | --- | --- |
| Four real HTTPS origins configured | **BLOCKED** | `cp .env.deploy.example .env.deploy` then fill values | `.env.deploy` is intentionally uncommitted | External input | Need four hostnames, DNS records and SSH/Docker access to the target server. |
| Deployment manifest preflight | **NOT RUN** | `npm run deploy:check` | Save raw JSON to `evidence/deployment/01-preflight.json` | `DEPLOYED_FOUR_ORIGIN` | Requires populated `.env.deploy`. |
| DNS preflight | **NOT RUN** | `npm run deploy:check:dns` | `evidence/deployment/02-dns.json` | `DEPLOYED_FOUR_ORIGIN` | Requires live DNS. |
| Four-origin container build | **NOT RUN** | `docker compose --env-file .env.deploy build --pull` | terminal transcript or CI log | `DEPLOYED_FOUR_ORIGIN` | Docker unavailable here and no deployment host credentials. |
| Four-origin HTTPS startup | **NOT RUN** | `docker compose --env-file .env.deploy up -d` | `docker compose ps` output | `DEPLOYED_FOUR_ORIGIN` | Same blocker. |
| HTTPS deployment smoke | **NOT RUN** | `npm run deploy:smoke` | `evidence/deployment/03-https-smoke.json` | `DEPLOYED_FOUR_ORIGIN` | Requires deployed URLs. |
| Relay top-level tools register in ChatGPT | **BLOCKED** | Call `relay_diagnose_webmcp` in ChatGPT | `evidence/chatgpt/01-initial-diagnostic.json` | `ACTUAL_CHATGPT` | No deployed Relay URL and no access to ChatGPT's browser from this tool environment. |
| All provider origins visible to Relay Command | **BLOCKED** | Same diagnostic | same file | `ACTUAL_CHATGPT` | Same blocker. |
| Provider tools discoverable | **BLOCKED** | Same diagnostic | same file | `ACTUAL_CHATGPT` | Same blocker. |
| Provider read tools execute | **BLOCKED** | `{"executeReadProbes":true}` | same file | `ACTUAL_CHATGPT` | Same blocker. |
| One real proposal per provider through ChatGPT | **BLOCKED** | Fixed bridge proposal tools | `evidence/chatgpt/02-provider-proposal-probes.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Dynamic `toolchange` creation and teardown | **BLOCKED** | Diagnostics before proposal, after proposal, after stale/commit | `evidence/chatgpt/03-capability-created.json`, `04-capability-torn-down.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Full ChatGPT approval and commit path | **BLOCKED** | Exact prompt in `docs/chatgpt-validation.md` | `evidence/chatgpt/05-full-path.json` | `ACTUAL_CHATGPT` | Same blocker. |
| Final ChatGPT audit bundle | **BLOCKED** | `relay_get_audit_bundle` | `evidence/chatgpt/06-final-audit-bundle.json` | `ACTUAL_CHATGPT` | Same blocker. |

### Compatibility implementation status

| Item | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
| Strict fixed top-level bridge | **PARTIAL** | `apps/relay-command/src/compatibility-bridge.ts` | Code complete, not yet executed in actual ChatGPT. |
| Exact origin and tool binding | **PASS** | Static mapping in bridge source | Runtime origin discovery still needs deployment proof. |
| No arbitrary execute-any tool | **PASS** | No origin/tool-name input in any wrapper schema | Static evidence. |
| Dynamic wrapper mirroring | **PARTIAL** | `toolchange` synchronization and `DynamicTool` | Needs actual browser evidence. |
| Provider-side authorization preserved | **PARTIAL** | Bridge invokes provider commit tools; provider runtime verifies PACT | Needs end-to-end commit proof. |
| Direct iframe mode available only for diagnosis | **PASS** | `?direct=1` in bootstrap | Static evidence. |

Exact external procedure and expected outputs:

- [`chatgpt-validation.md`](chatgpt-validation.md)

## Priority 1: hostile release audit

### Commands executed in this session

```bash
node --experimental-strip-types scripts/integrity-smoke.ts
tsc -p tsconfig.json --noEmit
node --experimental-strip-types scripts/release-audit.ts
```

The current core files were reconstructed from the connected private branch because this execution environment could not resolve `github.com` and no complete checkout was mounted.

Evidence:

- `evidence/local-core-smoke-2026-08-29.json`
- `evidence/release-audit-2026-08-29.json`

### Required hostile cases

| # | Release case | Status | Exact command or action | Evidence location | Evidence source | Remaining blocker |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Normal 42-person evacuation completes | **PARTIAL** | `npm run audit:release`; then full ChatGPT prompt | release-audit JSON; future ChatGPT full-path JSON | `LOCAL_RECONSTRUCTED_CORE` | Policy and authorization pass. Actual provider mutation and receipt convergence not run. |
| 2 | Human lowers authority before approval | **PARTIAL** | Pure token at €2,800; UI amendment to €3,000 | release-audit JSON; future video/ChatGPT output | `LOCAL_RECONSTRUCTED_CORE` | Pure aggregate authority passes. Human UI path pending. |
| 3 | Provider capacity changes and plan becomes stale | **PARTIAL** | Human clicks consent-time shelter disruption | future `evidence/chatgpt/04-capability-torn-down.json` | `REPOSITORY_CODE_REVIEW` | State/version invalidation exists; deployed browser path not run. |
| 4 | Stale approval and commit capabilities disappear | **PARTIAL** | Diagnostic before and after disruption | future capability JSON | `REPOSITORY_CODE_REVIEW` | `DynamicTool` core revocation passed; product capability teardown needs browser proof. |
| 5 | Agent re-plans only invalidated provider work | **BLOCKED** | Recovery prompt in validation guide | future full-path JSON | `ACTUAL_CHATGPT` | Requires real agent run. |
| 6 | Tampered approval payload rejected | **PASS** | `npm run audit:release` | release-audit JSON | `LOCAL_RECONSTRUCTED_CORE` | None at pure verifier layer. End-to-end replay still part of full browser gate. |
| 7 | Expired token rejected | **PASS** | `npm run audit:release` | release-audit JSON | `LOCAL_RECONSTRUCTED_CORE` | None at pure verifier layer. |
| 8 | Wrong session rejected | **PASS** | `npm run audit:release` | release-audit JSON | `LOCAL_RECONSTRUCTED_CORE` | None at pure verifier layer. |
| 9 | Wrong origin rejected | **PASS** | `npm run audit:release` | release-audit JSON | `LOCAL_RECONSTRUCTED_CORE` | None at pure verifier layer. |
| 10 | Wrong provider version rejected | **PASS** | `npm run audit:release` | release-audit JSON | `LOCAL_RECONSTRUCTED_CORE` | None at pure verifier layer. |
| 11 | Aggregate cross-provider budget escalation rejected | **PASS** | `npm run audit:release` | release-audit JSON | `LOCAL_RECONSTRUCTED_CORE` | None at pure verifier layer. |
| 12 | Same-origin batch failure changes no capacity | **PARTIAL** | Partial-batch verifier test; then provider runtime mutation drill | release-audit JSON; future browser evidence | `LOCAL_RECONSTRUCTED_CORE` | Incomplete batch is rejected. Actual before/after capacity snapshot not captured. |
| 13 | Partial cross-provider commitment represented honestly and has recovery path | **BLOCKED** | Force one provider failure after another commits, inspect receipts and recovery | future `evidence/chatgpt/07-partial-commit-recovery.json` | `ACTUAL_CHATGPT` or deployed harness | Recovery semantics are documented but no runtime evidence exists. |
| 14 | Audit bundle binds final state, approval scopes and receipts | **PARTIAL** | `relay_get_audit_bundle` after final commit | future audit-bundle JSON | `REPOSITORY_CODE_REVIEW` | Tool is implemented. Actual nested browser invocation and final digest are untested. |

## Clean checkout and CI

| Gate | Status | Command | Evidence | Blocker |
| --- | --- | --- | --- | --- |
| Clean checkout install | **NOT RUN** | `npm install --no-audit --no-fund` | future terminal log | No full checkout/networked npm environment in this session. |
| Full verification | **NOT RUN** | `npm run verify` | future terminal or CI log | Same blocker. Pure core subset passed. |
| Four app production build | **NOT RUN** | included in `npm run verify` | future build log | Same blocker. |
| Docker image build | **NOT RUN** | CI or compose build | future log | Docker unavailable here. |
| GitHub Actions | **BLOCKED** | automatic PR workflow | run `33211800826` | GitHub allocated no runner; job contained zero steps. This is not a test failure. |

Do not write “CI failed” without the qualification above. The current evidence is **runner provisioning failure before execution**.

## Priority 2: three-minute demo lock

| Demo requirement | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- |
| One objective across three independent websites | **PASS** | application topology and provider frames | Deployment proof pending. |
| Deterministic seed data | **PASS** | `packages/simulation` | None. |
| One-click reset | **PASS** | `scenario-reset.ts` | Actual deployed click pending. |
| Exact recommended prompt | **PASS** | `docs/demo-script.md`, `docs/chatgpt-validation.md` | None. |
| Visible provider versions | **PASS** | provider UI | Actual deployed render pending. |
| Visible capability creation/disappearance | **PARTIAL** | capability surface, diagnostics and fixed bridge | Must capture in actual ChatGPT. |
| Clear approval sheet | **PASS** | command UI and consent-time fault control | Rehearsal pending. |
| Concise final receipts | **PARTIAL** | provenance and plan receipt data | Final visual rehearsal pending. |
| No unnecessary proof-console clutter | **PASS** | proof runner disabled unless `?proof=1` | None. |
| Final runtime 2:40 to 2:50 | **NOT RUN** | timed rehearsal and final video | Requires deployed app and actual ChatGPT. |

Final locked script:

- [`demo-script.md`](demo-script.md)

## Priority 3: freeze and release

| Release action | Status | Required evidence or action |
| --- | --- | --- |
| Keep `main` frozen | **PASS** | `main` remains at `d89fbadceb4bed68d4745a3dbc25397c4e764796`. |
| Keep PR #1 draft | **PASS** | Do not mark ready or merge. |
| Preserve history | **PASS** | Release changes committed to build branch only. |
| Deployed four-origin smoke | **BLOCKED** | Need hostnames, DNS and server access. |
| Actual ChatGPT compatibility | **BLOCKED** | Need deployed URL and manual test. |
| Rehearse repeatedly | **BLOCKED** | Need deployed environment. |
| Record public video | **BLOCKED** | Need green rehearsal. |
| README and reproduction guide | **PARTIAL** | Release docs complete; final deployed URLs and evidence links still need insertion. |
| Repository public or transferred | **BLOCKED** | Consequential human/account action; perform only after evidence passes. |
| Merge PR #1 | **BLOCKED** | Every prior release gate must pass. |
| Create submission tag | **BLOCKED** | Tag only the merged release commit. |

## Exact human inputs still missing

Only these external inputs are required to proceed:

```text
1. RELAY_HOST
2. SHELTER_HOST
3. TRANSIT_HOST
4. SUPPLY_HOST
5. DNS control for those four hostnames
6. SSH or equivalent Docker access to the target server
7. ACME_EMAIL
8. Access to ChatGPT's supported built-in browser for the manual validation
```

No hostname or credential should be guessed.

## Final merge rule

PR #1 may be merged only after this sequence is evidenced:

```text
npm run verify                           PASS
npm run deploy:check:dns                 PASS
docker compose build                     PASS
docker compose up                        PASS
npm run deploy:smoke                     PASS
relay_diagnose_webmcp in actual ChatGPT  PASS
full ChatGPT stale/recovery/commit path   PASS
relay_get_audit_bundle                    PASS
timed 2:40–2:50 rehearsal                PASS
public video                              RECORDED
repository visibility requirement        SATISFIED
```

Until then:

# **DO NOT MERGE**
