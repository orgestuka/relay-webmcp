# Relay production operator runbook

This runbook is intentionally narrow. It exists to take one reviewed Relay commit from a clean checkout to four evidenced HTTPS origins without changing product behavior.

## Release invariants

A release is invalid unless all conditions hold:

- branch is `build/pact-vertical-slice`
- worktree is clean
- Node.js major version is 22
- `RELAY_BUILD_SHA` equals `git rev-parse HEAD`
- Relay Command and all three providers use distinct hostnames
- all four hostnames resolve to the deployment server
- all four documents serve `Origin-Agent-Cluster: ?1`
- Relay Command delegates the WebMCP `tools` feature only to itself and the three exact providers
- providers allow the feature for themselves
- every production bundle contains the exact release SHA
- no production bundle contains localhost origins
- actual ChatGPT evidence is captured separately from harness evidence

## 1. Prepare DNS

Create four records pointing to the Docker host:

```text
relay.<domain>     A/AAAA → server
shelter.<domain>   A/AAAA → server
transit.<domain>   A/AAAA → server
supply.<domain>    A/AAAA → server
```

Ports 80 and 443 must reach Caddy. Port 443/UDP is optional for HTTP/3 but is already exposed by Compose.

Do not proxy the origins through a service that strips or rewrites:

```http
Origin-Agent-Cluster
Permissions-Policy
Cache-Control
```

## 2. Prepare the exact checkout

```bash
git checkout build/pact-vertical-slice
git pull --ff-only

git status --short
git rev-parse HEAD
node --version
npm --version
```

Required:

```text
clean worktree
Node v22.x
```

Install and verify:

```bash
npm install --no-audit --no-fund
npm run gate:source -- --output evidence/source-gate.json
```

The source gate fails closed on:

- wrong branch
- detached or malformed Git head
- dirty worktree
- wrong Node major
- any typecheck, protocol test, policy test, adversarial test or production build failure

## 3. Configure deployment

```bash
cp .env.deploy.example .env.deploy
```

Populate:

```env
RELAY_HOST=relay.<domain>
SHELTER_HOST=shelter.<domain>
TRANSIT_HOST=transit.<domain>
SUPPLY_HOST=supply.<domain>
ACME_EMAIL=<operational email>
RELAY_BUILD_SHA=<exact output of git rev-parse HEAD>
RELAY_IMAGE_TAG=submission
```

`.env.deploy` is ignored by Git and must never be committed.

## 4. Execute the full release gate

```bash
npm run gate:release -- \
  --env .env.deploy \
  --output evidence/deployment/release-gate.json
```

The full gate runs, in order:

1. clean source verification
2. hostname, DNS, source-SHA and deployment-source preflight
3. Docker Compose rendering
4. Caddy syntax validation
5. Nginx syntax validation
6. production image build
7. four-origin startup
8. deployed HTTPS and WebMCP header smoke
9. final Compose status

The gate stops at the first failure and records the exact failed command.

## 5. Inspect deployed services

```bash
docker compose --env-file .env.deploy ps
docker compose --env-file .env.deploy logs --tail=100 caddy
docker compose --env-file .env.deploy logs --tail=50 relay-command shelter-grid transit-ops supply-hub
```

All services must be healthy. Caddy must show successful certificate issuance or reuse.

Manual header check:

```bash
for host in \
  "$RELAY_HOST" \
  "$SHELTER_HOST" \
  "$TRANSIT_HOST" \
  "$SUPPLY_HOST"
do
  echo "=== $host ==="
  curl -sSIL "https://$host" | sed -n '1,25p'
done
```

## 6. Capture actual ChatGPT evidence

Open Relay in a fresh ChatGPT built-in browser context. Do not reuse a context that loaded a Relay origin before origin isolation was configured.

Follow:

- [`chatgpt-validation.md`](chatgpt-validation.md)

Capture raw results under:

```text
evidence/chatgpt/
```

The first diagnostic must contain the same SHA as:

```bash
git rev-parse HEAD
```

## 7. Rehearse and record

Follow:

- [`demo-script.md`](demo-script.md)

Minimum rehearsal standard:

```text
canonical path             3 consecutive passes
stale/recovery path         3 consecutive passes
partial-commit drill        1 pass
scenario reset              verified between every run
final runtime               2:40–2:50
```

## 8. Freeze release evidence

Before merge, record:

```bash
git rev-parse HEAD
docker compose --env-file .env.deploy images
docker compose --env-file .env.deploy ps
npm run deploy:smoke > evidence/deployment/final-smoke.json
```

Insert the final URLs and video URL into the README and Devpost draft.

## 9. Merge and tag

Only after every release gate is green:

1. make the repository public or transfer it when required
2. mark PR #1 ready for review
3. merge PR #1 without rewriting the validated history
4. create the submission tag from the merged release commit

Suggested tag:

```bash
git checkout main
git pull --ff-only
git tag -a webmcp-submission-v1 -m "Relay WebMCP Challenge submission"
git push origin webmcp-submission-v1
```

## Failure handling

### Source gate failure

Do not deploy. Fix the exact failing check on the build branch and rerun from a clean worktree.

### Caddy or Nginx validation failure

Do not start the stack. Correct the configuration and rerun the full gate.

### Deployed smoke failure

Preserve the raw report. Check DNS, certificate state, response headers and embedded origins. Do not begin ChatGPT validation.

### ChatGPT diagnostic failure

Preserve the raw JSON. Compare:

- deployed source SHA
- origin-agent-cluster state
- runtime-registered tools
- ChatGPT-visible tools
- provider discovery errors
- semantic execution probes

Fix the narrow failed boundary. Do not compensate with UI automation or relabel harness output as ChatGPT evidence.

### Partial cross-provider commit

Do not claim global success. Preserve receipts, inspect live provider versions and follow the recovery drill in `chatgpt-validation.md`. Expired or stale authority requires a fresh plan and fresh human approval.

## Rollback

Relay state is deterministic and in-memory for the competition scenario. Rollback is code-level:

1. stop the stack
2. checkout the last validated commit
3. set `RELAY_BUILD_SHA` to that exact commit
4. rerun `npm run gate:release`

```bash
docker compose --env-file .env.deploy down
git checkout <validated-commit>
# update RELAY_BUILD_SHA in .env.deploy
npm run gate:release -- --env .env.deploy --output evidence/deployment/rollback-gate.json
```

Never relabel an old image with a new SHA.
