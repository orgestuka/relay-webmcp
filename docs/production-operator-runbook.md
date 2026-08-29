# Relay production operator runbook

This runbook takes one reviewed commit from a clean checkout to four evidenced HTTPS origins. It must not change product behavior.

## Release invariants

A release is invalid unless all conditions hold:

- branch is `build/pact-vertical-slice`
- worktree is clean before and after verification
- Node.js major version is 22
- npm is exactly `10.9.2`
- a committed `package-lock.json` with `lockfileVersion >= 3` exists
- `RELAY_RELEASE_SHA` equals `git rev-parse HEAD`
- Relay Command and all three providers use distinct hostnames
- all four hostnames resolve to the deployment server
- all four documents serve `Origin-Agent-Cluster: ?1`
- Relay Command delegates the WebMCP `tools` feature only to itself and the three exact providers
- providers allow the feature only for themselves and expose tools only to Relay
- every production bundle, edge header and `/release.json` manifest identifies the same commit
- no production bundle contains localhost origins
- actual ChatGPT evidence remains separate from harness evidence

## 1. Prepare DNS

Create four records pointing to the Docker host:

```text
relay.<domain>     A/AAAA → server
shelter.<domain>   A/AAAA → server
transit.<domain>   A/AAAA → server
supply.<domain>    A/AAAA → server
```

Ports 80 and 443 must reach Caddy. Port 443/UDP is optional for HTTP/3 but is exposed by Compose.

Do not place the origins behind a proxy that strips or rewrites:

```http
Origin-Agent-Cluster
Permissions-Policy
Content-Security-Policy
X-Relay-Release
Cache-Control
```

## 2. Start from a source-gate pass

Follow [`codex-local-release.md`](codex-local-release.md) first.

Then confirm:

```bash
git checkout build/pact-vertical-slice
git pull --ff-only origin build/pact-vertical-slice
git status --short
git rev-parse HEAD
node --version
npm --version
npm run gate:source
```

Do not deploy unless the source gate returns `"pass": true`.

## 3. Configure deployment

```bash
cp .env.deploy.example .env.deploy
```

Populate the ignored file:

```env
RELAY_HOST=relay.<domain>
SHELTER_HOST=shelter.<domain>
TRANSIT_HOST=transit.<domain>
SUPPLY_HOST=supply.<domain>
ACME_EMAIL=<operational email>
RELAY_IMAGE_TAG=submission
RELAY_RELEASE_SHA=<exact output of git rev-parse HEAD>
```

Verify the SHA before continuing:

```bash
EXPECTED_SHA="$(git rev-parse HEAD)"
grep '^RELAY_RELEASE_SHA=' .env.deploy
test "$(sed -n 's/^RELAY_RELEASE_SHA=//p' .env.deploy)" = "$EXPECTED_SHA"
```

## 4. Execute the full release gate

Docker Desktop or a reachable Docker Engine with Compose v2 must be running.

```bash
npm run gate:release -- --env .env.deploy
```

The full gate performs, in order:

1. branch, clean-tree and exact-head checks
2. Node 22 and npm 10.9.2 checks
3. committed lockfile validation
4. release-script syntax and static release-contract audit
5. fresh `npm ci`
6. complete repository verification and four production builds
7. hostname, DNS, release-SHA and clean-checkout preflight
8. Docker and Compose availability checks
9. Compose rendering
10. Caddy syntax validation with the exact release SHA
11. Nginx syntax validation
12. production image build
13. four-origin startup
14. deployed HTTPS, security-header, embedded-origin and release-provenance smoke
15. final Compose status and clean-tree check

Machine-readable output is written under:

```text
.relay-artifacts/release/full-deploy-release-gate-<commit>.json
```

The gate stops at the first failure and records the failed command.

## 5. Inspect deployed services

```bash
docker compose --env-file .env.deploy ps
docker compose --env-file .env.deploy logs --tail=100 caddy
docker compose --env-file .env.deploy logs --tail=50 relay-command shelter-grid transit-ops supply-hub
```

All application services must be healthy. Caddy must show successful certificate issuance or reuse.

Load the environment for manual checks:

```bash
set -a
. ./.env.deploy
set +a
```

Then inspect every edge:

```bash
for host in \
  "$RELAY_HOST" \
  "$SHELTER_HOST" \
  "$TRANSIT_HOST" \
  "$SUPPLY_HOST"
do
  echo "=== $host ==="
  curl -sSIL "https://$host" | sed -n '1,30p'
  curl -sS "https://$host/release.json"
  echo
done
```

Every root and release manifest response must identify `$RELAY_RELEASE_SHA` through `X-Relay-Release` and `release.json`.

## 6. Capture actual ChatGPT evidence

Open the Relay origin in a fresh ChatGPT built-in browser context. Do not reuse a context that loaded a Relay origin before origin isolation was configured.

Follow [`chatgpt-validation.md`](chatgpt-validation.md).

The first calls must be:

```text
relay_get_release_identity
relay_diagnose_webmcp { executeReadProbes: true }
```

Both must identify the same SHA as:

```bash
git rev-parse HEAD
```

## 7. Rehearse and record

Follow [`demo-script.md`](demo-script.md).

Minimum standard:

```text
canonical path              3 consecutive passes
stale/recovery path         3 consecutive passes
partial-commit drill        1 pass
scenario reset              verified between every run
final runtime               2:40–2:50
```

## 8. Evidence immutability rule

Generated release evidence defaults to ignored `.relay-artifacts/` so it cannot silently change the commit being proved.

Do not commit runtime evidence after deploying a SHA. Doing so creates a new commit and invalidates the release identity. Either:

- keep final machine evidence outside Git and upload it to the submission, or
- commit the evidence, set `RELAY_RELEASE_SHA` to the new commit and rerun the entire source and deployment gate.

Never relabel an old image with a new SHA.

## 9. Merge and tag

Only after every source, deployment, ChatGPT and rehearsal gate is green:

1. satisfy the repository visibility requirement
2. mark PR #1 ready for review
3. merge PR #1 without rewriting the validated history
4. build and deploy the merged commit if the merge commit changes the SHA
5. create the submission tag from the exact merged and validated commit

Suggested tag:

```bash
git checkout main
git pull --ff-only
git tag -a webmcp-submission-v1 -m "Relay WebMCP Challenge submission"
git push origin webmcp-submission-v1
```

## Failure handling

### Source gate failure

Do not deploy. Preserve the first failing command and its complete output. Fix only that boundary, return to a clean tree and rerun `npm run gate:source`.

### Caddy or Nginx validation failure

Do not start the stack. Correct the exact configuration defect and rerun the full gate.

### Deployed smoke failure

Preserve the raw gate report. Check DNS, certificate state, response headers, embedded origins and release identity. Do not begin ChatGPT validation.

### ChatGPT diagnostic failure

Preserve the raw JSON. Compare:

- compiled, edge and manifest SHA
- origin-agent-cluster state
- runtime-registered tools
- ChatGPT-visible tools
- provider discovery errors
- semantic execution probes

Do not compensate with UI automation or relabel harness output as ChatGPT evidence.

### Partial cross-provider commit

Do not claim global success. Preserve receipts, inspect live provider versions and follow the recovery drill in `chatgpt-validation.md`. Expired or stale authority requires a fresh plan and fresh human approval.

## Rollback

Rollback is commit-bound:

```bash
docker compose --env-file .env.deploy down
git checkout <validated-commit>
# Set RELAY_RELEASE_SHA in .env.deploy to that exact commit.
npm run gate:release -- --env .env.deploy
```
