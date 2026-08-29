# Submission readiness

## Authoritative checkpoint

```text
branch:          build/pact-vertical-slice
release source:  5622bf6e411792e0cf336f9ce3c558c7be226381
base:            main @ d89fbadceb4bed68d4745a3dbc25397c4e764796
PR:              #1, open and draft
```

Later commits may update only evidence or release documentation. Use `git rev-parse HEAD` as the final checkout SHA and preserve the full history.

`main` stays frozen until every external gate passes.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| **PASS** | The exact gate ran and evidence was captured. |
| **PARTIAL** | A lower-level property passed, but the release-level path remains unproven. |
| **BLOCKED** | Required external input or environment is absent. |
| **FAIL** | The exact gate ran and failed. |
| **NOT RUN** | The gate can run but has not run yet. |

## Evidence vocabulary

| Source | Meaning |
| --- | --- |
| `LOCAL_RECONSTRUCTED_CORE` | Current source reconstructed from the private branch and executed locally. Not a clean full checkout. |
| `LOCAL_INTERFACE_TYPECHECK` | Exact release modules typechecked with TypeScript 5.8. Not a Vite production build. |
| `LOCAL_SOURCE_GATE` | Dependency-free source invariant executed against the release configuration. |
| `LOCAL_DIAGNOSTIC_RUNTIME` | Diagnostic logic executed against deterministic WebMCP doubles. Not a deployed browser. |
| `LOCAL_BRIDGE_HARNESS` | Fixed bridge executed against an origin-aware ModelContext double. Not actual ChatGPT. |
| `REPOSITORY_CODE_REVIEW` | Static inspection only. |
| `GITHUB_ACTIONS_INFRA_FAILURE` | GitHub allocated no runner and executed zero steps. Not code evidence. |
| `DEPLOYED_FOUR_ORIGIN` | Evidence produced against four real HTTPS origins. |
| `ACTUAL_CHATGPT` | Raw output from ChatGPT's supported built-in browser. Required for compatibility claims. |

## Executive release gate

```text
clean checkout passes
→ four HTTPS origins pass origin-isolation smoke
→ actual ChatGPT compatibility passes
→ stale/recovery/commit path passes
→ partial-commit recovery passes
→ demo rehearsed repeatedly
→ video recorded
→ public repository requirement satisfied
→ PR #1 merged
→ submission tag created
```

# Current recommendation: **DO NOT MERGE**

The code is at the external-proof boundary. Hostnames, deployment access and actual ChatGPT evidence remain absent.

---

## Priority 0: actual ChatGPT WebMCP compatibility

### Newly closed source blocker: origin-keyed agent clusters

The WebMCP algorithms reject `registerTool()` and `getTools()` when a non-`file:` document is not in an origin-keyed agent cluster.

Relay now enforces:

```http
Origin-Agent-Cluster: ?1
```

across local Vite development, Vite preview and the production Caddy edge.

| Source-level invariant | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
| Caddy sets the header for all four hostnames | **PASS** | `deploy/Caddyfile`; origin source gate | Caddy runtime not executed here. |
| All four Vite dev servers set the header | **PASS** | four `vite.config.ts` files; origin source gate | Browser response not captured here. |
| All four Vite preview servers set the header | **PASS** | four `vite.config.ts` files; origin source gate | Preview process not executed here. |
| TypeScript 5.8 knows `window.originAgentCluster` | **PASS** | `globals.d.ts`; strict bootstrap/config typecheck | Full repository typecheck still external. |
| Relay Command rejects an explicit non-origin-keyed context | **PASS** | `bootstrap.ts`; source gate | Needs real browser proof. |
| Diagnostic reports and enforces origin isolation | **PASS** | `release-diagnostics.ts`; source gate | Tool must still be client-visible in ChatGPT. |
| Deployed smoke requires the exact response header | **PASS** | `deployment-smoke.mjs`; source gate | Requires deployed URLs. |
| Docker verification can read deployment source | **PASS** | Docker build now copies `deploy/` before `npm run verify` | Docker build not executed here. |

Evidence:

- `evidence/origin-isolation-hardening-2026-08-29.json`
- [`webmcp-origin-isolation.md`](webmcp-origin-isolation.md)

### External compatibility gates

| Gate | Status | Exact command or action | Evidence location | Remaining blocker |
| --- | --- | --- | --- | --- |
| Four real HTTPS origins configured | **BLOCKED** | Populate `.env.deploy` | uncommitted environment file | Need four hostnames and DNS control. |
| Deployment preflight | **NOT RUN** | `npm run deploy:check` | `evidence/deployment/01-preflight.json` | Needs populated environment file. |
| DNS preflight | **NOT RUN** | `npm run deploy:check:dns` | `evidence/deployment/02-dns.json` | Needs live DNS. |
| Container build | **NOT RUN** | `docker compose --env-file .env.deploy build --pull` | terminal or CI log | Need Docker host access. |
| HTTPS startup | **NOT RUN** | `docker compose --env-file .env.deploy up -d` | `docker compose ps` | Same blocker. |
| Header and asset smoke on all origins | **NOT RUN** | `npm run deploy:smoke` | `evidence/deployment/03-https-smoke.json` | Needs deployed URLs. |
| Fresh ChatGPT context reports `originIsolationPass: true` | **BLOCKED** | `relay_diagnose_webmcp` | `evidence/chatgpt/01-initial-diagnostic.json` | Need deployed URL and actual ChatGPT browser. |
| Relay permanent tools client-visible | **BLOCKED** | same diagnostic | same file | Same blocker. |
| Provider tools discoverable and semantically executable | **BLOCKED** | `{"executeReadProbes":true}` | same file | Same blocker. |
| One proposal per provider through ChatGPT | **BLOCKED** | fixed bridge proposal tools | `02-provider-proposal-probes.json` | Same blocker. |
| Dynamic capability creation and teardown | **BLOCKED** | diagnostics before/after proposal and stale state | `03-capability-created.json`, `04-capability-torn-down.json` | Same blocker. |
| Full stale, recovery, approval and commit path | **BLOCKED** | exact validation prompt | `05-full-path.json` | Same blocker. |
| Final audit bundle | **BLOCKED** | `relay_get_audit_bundle` | `06-final-audit-bundle.json` | Same blocker. |
| Partial-commit recovery drill | **BLOCKED** | documented drill | `07-partial-commit-recovery.json` | Same blocker. |

Exact procedure:

- [`chatgpt-validation.md`](chatgpt-validation.md)

---

## Priority 1: hostile release audit

### Evidence currently passing

- exact PACT signatures and scopes
- tampered payload rejection
- expired approval rejection
- wrong session rejection
- wrong origin rejection
- wrong provider version rejection
- aggregate cross-provider authority rejection
- incomplete same-origin batch rejection
- dynamic registration and revocation races
- fixed bridge origin/tool binding
- semantic provider execution probes
- accepted-approval capture only after provider success
- post-commit North Shelter reserve regression
- origin-isolation source invariant

Evidence files are indexed in [`../evidence/README.md`](../evidence/README.md).

### Required hostile cases

| # | Case | Status | Remaining blocker |
| ---: | --- | --- | --- |
| 1 | Normal 42-person evacuation completes | **PARTIAL** | Policy passes; deployed provider mutation and receipt convergence not run. |
| 2 | Human lowers authority before approval | **PARTIAL** | Pure authority arithmetic passes; human UI path not run. |
| 3 | Capacity change makes plan stale | **PARTIAL** | Version invalidation exists; deployed browser proof missing. |
| 4 | Stale approval and commit capabilities disappear | **PARTIAL** | Runtime and bridge teardown pass in harness; actual `toolchange` evidence missing. |
| 5 | Agent replaces only invalidated provider work | **BLOCKED** | Requires actual ChatGPT run. |
| 6 | Tampered approval rejected | **PASS** | None at verifier layer. |
| 7 | Expired token rejected | **PASS** | None at verifier layer. |
| 8 | Wrong session rejected | **PASS** | None at verifier layer. |
| 9 | Wrong origin rejected | **PASS** | None at source/harness layer. |
| 10 | Wrong provider version rejected | **PASS** | None at verifier layer. |
| 11 | Aggregate budget escalation rejected | **PASS** | None at verifier layer. |
| 12 | Same-origin batch failure changes no capacity | **PARTIAL** | Atomicity harness passes; deployed before/after snapshot missing. |
| 13 | Partial cross-provider completion represented and recovered | **PARTIAL** | Harness passes; actual Relay state and receipts missing. |
| 14 | Audit binds accepted approval, final state and receipts | **PARTIAL** | Source and harness pass; completed deployed transaction missing. |

### Clean checkout and CI

| Gate | Status | Evidence | Remaining blocker |
| --- | --- | --- | --- |
| Clean install | **NOT RUN** | future local terminal log | No complete networked checkout in this environment. |
| `npm run verify` | **NOT RUN** | future terminal log | Same blocker. |
| Four Vite production builds | **NOT RUN** | future build log | Same blocker. |
| Docker build | **NOT RUN** | future Docker log | Docker unavailable here. |
| GitHub Actions | **BLOCKED** | run `33247913551`, job `99088484372` | `runner_id: 0`, empty runner name and zero steps. No repository command executed. |

The red Actions badge is infrastructure noise, not a discovered code failure. It is not green evidence either.

---

## Priority 2: locked three-minute demo

| Requirement | Status | Remaining blocker |
| --- | --- | --- |
| One objective across three provider websites | **PASS** | Deployment proof pending. |
| Deterministic seed data | **PASS** | None. |
| One-click reset | **PASS** | Deployed click pending. |
| Exact prompt | **PASS** | None. |
| Visible provider versions | **PASS** | Deployed render pending. |
| Visible capability disappearance | **PARTIAL** | Actual ChatGPT capture required. |
| Clear approval sheet | **PASS** | Rehearsal pending. |
| Concise receipts and digest | **PARTIAL** | Final visual rehearsal pending. |
| Proof console absent from judging URL | **PASS** | None. |
| Runtime 2:40–2:50 | **NOT RUN** | Needs deployment and ChatGPT. |

Locked script:

- [`demo-script.md`](demo-script.md)

---

## Priority 3: freeze and release

| Action | Status |
| --- | --- |
| Keep `main` frozen | **PASS** |
| Keep PR #1 draft | **PASS** |
| Preserve history | **PASS** |
| Four-origin smoke | **BLOCKED** |
| Actual ChatGPT compatibility | **BLOCKED** |
| Rehearse repeatedly | **BLOCKED** |
| Record public video | **BLOCKED** |
| Insert final URLs and evidence links | **BLOCKED** |
| Make public or transfer if required | **BLOCKED** |
| Merge PR #1 | **BLOCKED** |
| Create submission tag | **BLOCKED** |

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
originIsolationPass in actual ChatGPT    PASS
provider discovery and execution         PASS
full stale/recovery/commit path           PASS
partial-commit recovery drill             PASS
relay_get_audit_bundle                    PASS
2:40–2:50 rehearsal                       PASS
public video                              RECORDED
repository visibility requirement        SATISFIED
```

Until then:

# **DO NOT MERGE**
