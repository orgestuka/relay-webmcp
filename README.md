# Relay WebMCP

**Human-governed operations for the agentic web.**

[Live application](https://relay.0rgest.com) · [ChatGPT testing instructions](docs/chatgpt-validation.md) · [MIT license](LICENSE)

> One objective. Three independent provider websites. Six consequential operations. One exact human decision.

Relay coordinates a 42-person flood evacuation across:

- **Shelter Grid**: bed inventory and reservations
- **Transit Ops**: standard and wheelchair-accessible transport
- **Supply Hub**: evacuation and mobility medical supplies

The agent can discover live capacity, create non-binding proposals and stage a cross-provider plan. It cannot consume provider capacity until the human approves the exact operations, origins, versions and authority ceiling.

Relay's protocol is **PACT**:

> **Propose → Amend → Consent → Transact**

The agent composes. The human authorizes. Each website independently verifies and executes its own scope.

## The core capability boundary

Relay does not merely ask the agent to behave.

Before human approval, ChatGPT can receive:

```text
read capabilities
proposal capabilities
plan staging
approval request
```

It does **not** receive top-level provider commit capabilities.

Only while the exact Relay plan is `APPROVED` do these wrappers exist:

```text
relay_bridge_shelter_commit_reservation
relay_bridge_transit_commit_reservation
relay_bridge_supply_commit_reservation
```

Every invocation rechecks live plan authority. Each provider then independently verifies the signed PACT token, exact scope, session, origin, state version, expiry, complete local batch and current capacity.

## Why WebMCP matters

Without WebMCP, Relay would either centralize every provider behind one backend or rely on brittle visual automation.

With WebMCP:

- each visible provider website owns narrow capabilities
- provider tools execute inside the provider document
- provider origins remain independently identifiable
- tool availability changes with provider state
- the human sees the same state the agent operates
- obsolete capabilities can be revoked through the browser tool lifecycle

Relay uses WebMCP as a capability system, not as a button alias.

## ChatGPT compatibility architecture

Some agent clients do not surface tools supplied only by embedded provider documents. Relay therefore preserves the providers as independent WebMCP documents and exposes a **strict origin-locked compatibility bridge** from Relay Command.

Each wrapper is hard-bound to:

```text
one provider origin
+ one provider tool name
+ one explicit input schema
```

There is no arbitrary origin parameter and no generic execute-any wrapper.

The bridge prefers native cross-origin WebMCP. When a client exposes WebMCP
only to the top document, it falls back to a versioned, origin-locked iframe
RPC channel. Both transports execute the same guarded tool definition inside
the provider origin.

1. discover the exact provider capability through native `getTools({ fromOrigins })` or an exact provider capability announcement
2. mirror read and proposal capabilities while the provider implementation exists
3. expose commit wrappers only while the exact Relay plan remains human-approved
4. invoke only the exact underlying provider tool through native `executeTool()` or an exact-origin, exact-frame RPC request
5. reject wrong-origin, wrong-frame, oversized, timed-out and replayed RPC messages
6. unregister obsolete wrappers when provider capability or authority disappears

Relay allows a bounded five-second cold-start window for the permanent read/proposal bridge before diagnostics become callable. Provider-side PACT verification remains authoritative in both transports. The bridge cannot sign approval, bypass state versions or mutate inventory directly.

Use the normal Relay URL for judging. `?direct=1` disables the bridge only for controlled compatibility diagnosis.

## Reference scenario

One valid plan contains six operations:

| Provider | Operation | Quantity | Cost |
| --- | --- | ---: | ---: |
| Shelter Grid | East Shelter | 18 beds | €180 |
| Shelter Grid | South Shelter | 24 beds | €216 |
| Transit Ops | Rapid Bus 32 | 32 seats | €928 |
| Transit Ops | Access Shuttle 10 | 10 accessible seats | €680 |
| Supply Hub | Evacuation Kits | 42 kits | €504 |
| Supply Hub | Mobility Medical Kits | 9 kits | €225 |
|  | **Total** |  | **€2,733** |

The allocation is intentionally not hard-coded. ChatGPT may choose another valid
combination from live provider details. In the first deployed ChatGPT run it
avoided flood-exposed South Shelter, used 26 North and 16 East beds, preserved
exactly 20 North beds and staged a valid **€2,861** plan.

Hard constraints:

- complete the evacuation by 18:00
- shelter all 42 residents
- transport all 42 residents
- provide at least 9 wheelchair-accessible positions
- keep at least 20 beds unallocated at North Shelter
- provide 42 evacuation kits
- provide 9 mobility medical kits
- remain under the human authority ceiling
- commit nothing before explicit human approval

## The memorable failure path

1. The agent stages a valid plan at the incident's €5,000 ceiling.
2. The human narrows authority to €3,000.
3. The agent calls `relay_request_approval` and pauses.
4. The demo control reduces the largest shelter allocation in the exact staged plan while consent is pending.
5. Shelter Grid advances its state version and deletes old proposals.
6. The plan becomes `STALE` and the suspended approval resolves without authority.
7. No top-level commit capability exists.
8. The agent re-queries and replaces only stale shelter work.
9. The recovered plan retains the human's €3,000 ceiling.
10. Exact approval creates only the three provider commit wrappers.
11. Providers independently verify, commit and issue receipts.

Recovered shelter work and total depend on the agent's initial live allocation.
The invariants are fixed: all stale Shelter Grid proposals are replaced, still-live
Transit Ops and Supply Hub proposals may be reused, every policy check passes and
the human-amended **€3,000** ceiling remains in force.

## PACT authorization

Human approval signs an ephemeral ECDSA P-256 authorization capsule.

Every proposal scope binds:

- proposal ID
- provider ID and exact origin
- resource ID and visible label
- quantity and unit
- unit cost and maximum cost
- purpose
- provider state version
- proposal expiry

The plan hash also binds:

- plan ID and incident ID
- human-visible summary and rationale
- machine-evaluated completion deadline
- plan revision
- total authority ceiling
- sorted proposal scopes

The private key remains in Relay Command memory and is never exposed as a WebMCP tool.

Each provider independently rejects:

- missing or invalid signatures
- wrong sessions or origins
- changed operation arguments
- stale state versions
- expired proposals or approval
- aggregate authority escalation
- incomplete same-origin batches
- insufficient current capacity

A same-origin batch mutates nothing unless every local check passes.

Relay does **not** claim distributed ACID atomicity across unrelated websites. Cross-origin partial completion is represented through origin-bound receipts and must be recovered or compensated explicitly.

## Machine-readable release tools

### `relay_get_release_identity`

Proves equality between:

```text
compiled application commit
=
one non-conflicting X-Relay-Release edge identity
=
/release.json manifest commit
```

Production Relay fails to boot without a valid compiled release SHA. A non-success manifest or conflicting duplicate release header fails the identity gate.

### `relay_diagnose_webmcp`

Returns:

- release provenance state
- secure-context and origin-agent-cluster state
- Relay runtime and client-visible tool registration
- provider-origin discovery state
- semantic read-only execution probes
- effective provider-bridge transport and status
- `toolchange` capture history

### `relay_get_audit_bundle`

Audit bundle v2 binds the deployed release identity, final plan, exact matching PACT approval scopes, provider receipts and mesh state to a canonical SHA-256 digest. It fails on partial, duplicate or altered closure even if a plan claims `COMMITTED`.

### `relay_bridge_status`

Shows exact fixed origin-to-tool mappings, approval requirements and currently active wrappers.

## Repository architecture

```text
apps/
  relay-command/       command, consent, diagnostics, provenance and audit
  shelter-grid/        independent shelter provider
  transit-ops/         independent transport provider
  supply-hub/          independent supply provider
packages/
  contracts/           shared protocol types
  pact/                canonicalization, hashing, signing and verification
  webmcp-runtime/      registration and race-safe capability lifecycle
  provider-runtime/    versioned proposal and atomic local commit runtime
  simulation/          deterministic data and policy validation
scripts/
  check-script-syntax.mjs
  check-release-surface.mjs
  clean-release-gate.mjs
  release-gate.mjs
  deploy-preflight.mjs
  deployment-smoke.mjs
  integrity-smoke.ts
  release-audit.ts
deploy/
  Dockerfile
  Caddyfile
  nginx.conf
  entrypoint.sh
docs/
  codex-local-release.md
  production-operator-runbook.md
  chatgpt-validation.md
  demo-script.md
  audit-bundle-v2.md
  submission-readiness.md
```

## Local verification

Requirements exactly:

```text
Node.js 22.16.0
npm 10.9.2
committed package-lock.json with lockfileVersion >= 3
```

```bash
nvm install
nvm use
npm ci --no-audit --no-fund
npm run verify
```

`npm run verify` executes:

```text
release-script syntax
→ static release-surface contract
→ origin isolation
→ security headers
→ release provenance
→ audit closure
→ bridge authority
→ TypeScript
→ dependency-free PACT smoke
→ hostile authorization audit
→ unit and adversarial tests
→ all four production builds
```

The clean human handoff is documented in [`docs/codex-local-release.md`](docs/codex-local-release.md).

Local development:

```bash
npm run dev
```

| Application | Origin |
| --- | --- |
| Relay Command | `http://localhost:5173` |
| Shelter Grid | `http://localhost:5174` |
| Transit Ops | `http://localhost:5175` |
| Supply Hub | `http://localhost:5176` |

## Source release gate

From a clean release checkout using the exact pinned toolchain. The gate defaults
to `build/pact-vertical-slice`; set `RELAY_RELEASE_BRANCH` to the reviewed branch
name when releasing from another protected branch:

```bash
npm run gate:source
```

The gate runs a fresh `npm ci`, complete verification and clean-tree checks. Machine-readable evidence is written under ignored `.relay-artifacts/release/`.

## Four-origin HTTPS deployment

Relay ships a hardened Caddy and Docker Compose stack. Four real hostnames must resolve to the deployment server.

```bash
cp .env.deploy.example .env.deploy
# replace placeholders and set RELAY_RELEASE_SHA=$(git rev-parse HEAD)

npm run gate:release -- --env .env.deploy
```

The full gate validates DNS, Caddy, Nginx, Compose, production images, four HTTPS origins, security headers, embedded origins and release identity.

See:

- [`docs/production-operator-runbook.md`](docs/production-operator-runbook.md)
- [`docs/chatgpt-validation.md`](docs/chatgpt-validation.md)
- [`docs/submission-readiness.md`](docs/submission-readiness.md)

## Actual ChatGPT validation gate

A browser harness is not sufficient evidence.

The deployed Relay URL must be opened in ChatGPT's supported built-in browser and prove:

- `relay_get_release_identity` passes for the exact Git commit
- all permanent Relay tools are registered and client-visible
- all three provider origins are discoverable
- provider tools execute semantically, not merely list
- one real proposal succeeds against every provider
- top-level commit wrappers are absent before consent
- human amendment and stale recovery preserve the narrowed authority
- exact approval creates only the three provider commit wrappers
- providers independently commit
- six receipts close the final plan
- audit bundle v2 passes exact closure

Primary diagnostic instruction:

```text
On the open Relay page, call relay_diagnose_webmcp with:
{"executeReadProbes":true}
Return the raw tool result JSON without summarizing it.
```

Do not freeze or tag a release until the raw deployed ChatGPT evidence passes.

## Demo recording

The final script targets 2:45:

- [`docs/demo-script.md`](docs/demo-script.md)

The optional proof console is disabled in the judging URL and can be enabled only with `?proof=1`. It is harness evidence, not actual ChatGPT evidence.

## Release discipline

- release only a clean, reviewed commit that passes hosted CI and the exact local gate
- deploy that exact SHA across all four origins and verify immutable provenance
- keep raw ChatGPT evidence separate from harness evidence
- do not commit runtime evidence after deployment without rebuilding and revalidating the new SHA
- create the submission tag only from the exact merged, deployed and validated commit
- after the submission deadline, keep the tagged repository and live deployment frozen through judging
