# Relay production release runbook

This runbook is the execution path from a clean branch checkout to a four-origin ChatGPT validation build.

It does not authorize merging PR #1. `main` remains frozen until every external gate passes.

## 1. Release invariants

A valid Relay release has all of these properties:

- one exact Git commit across Relay Command and all three providers
- Node 22 and npm 10
- a committed npm lockfile with `lockfileVersion >= 3`
- a clean working tree before and after verification
- four distinct HTTPS origins
- `Origin-Agent-Cluster: ?1` on every origin
- strict origin-scoped CSP and WebMCP Permissions-Policy
- the same `X-Relay-Release` value on every origin
- a matching application-specific `/release.json` on every origin
- successful deployed smoke evidence
- successful actual ChatGPT WebMCP evidence

## 2. Prepare the exact branch

```bash
git checkout build/pact-vertical-slice
git pull --ff-only
git status --short
git rev-parse HEAD
```

The working tree must be empty.

Use Node 22 and npm 10:

```bash
nvm use 22
node --version
npm --version
```

### First-time lockfile gate

The repository must contain `package-lock.json` before release. Generate it once with the pinned toolchain, review it and commit it through PR #1:

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
git diff -- package-lock.json
git add package-lock.json
git commit -m "chore: lock Relay release dependencies"
```

After the lockfile is committed, never use `npm install` as release evidence. Use `npm ci`.

## 3. Run the clean release gate

```bash
npm run check:clean-release
```

This gate verifies:

- expected branch
- Node 22 and npm 10
- clean worktree
- `git diff --check`
- lockfile presence and version
- `npm ci`
- complete `npm run verify`
- clean worktree after build and tests

Evidence is written only to the ignored directory:

```text
.relay-artifacts/clean-release/
```

A failed gate is a blocker. Do not continue to deployment.

## 4. Configure the four origins

```bash
cp .env.deploy.example .env.deploy
```

Populate real values:

```env
RELAY_HOST=relay.your-domain.example
SHELTER_HOST=shelter.your-domain.example
TRANSIT_HOST=transit.your-domain.example
SUPPLY_HOST=supply.your-domain.example
ACME_EMAIL=ops@your-domain.example
RELAY_IMAGE_TAG=submission
RELAY_RELEASE_SHA=<output of git rev-parse HEAD>
```

`RELAY_RELEASE_SHA` must be the exact full 40-character SHA of the clean checkout being deployed. Placeholders and all-zero values fail preflight.

Create four DNS records pointing to the Docker host. Confirm DNS before building:

```bash
npm run deploy:check
npm run deploy:check:dns
```

## 5. Build and start

```bash
docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
docker compose --env-file .env.deploy ps
```

The image build:

1. installs pinned dependencies
2. executes the complete verification gate
3. builds all four applications
4. writes an identity-bound `release.json` into every application
5. copies only static production output into the runtime image

Caddy is the sole owner of dynamic origin-aware browser policy headers.

## 6. Prove the deployed edge

```bash
npm run deploy:smoke > .relay-artifacts/deployment-smoke.json
```

The smoke must prove, on all four real origins:

- HTTPS and application identity
- health endpoint
- `X-Content-Type-Options: nosniff`
- `Origin-Agent-Cluster: ?1`
- strict CSP
- exact WebMCP Permissions-Policy
- one-year HSTS
- no compiled development endpoints
- expected cross-origin configuration
- `X-Relay-Release` equals `RELAY_RELEASE_SHA`
- `/release.json` names the correct application and exact same SHA

Independent spot checks:

```bash
curl -sSI "https://${RELAY_HOST}" | grep -Ei 'origin-agent-cluster|permissions-policy|content-security-policy|strict-transport-security|x-relay-release'
curl -sS "https://${RELAY_HOST}/release.json" | jq .
curl -sS "https://${SHELTER_HOST}/release.json" | jq .
curl -sS "https://${TRANSIT_HOST}/release.json" | jq .
curl -sS "https://${SUPPLY_HOST}/release.json" | jq .
```

All four manifest SHAs and all four `X-Relay-Release` headers must match the checked-out commit.

## 7. Validate in actual ChatGPT

Open the Relay URL in a fresh ChatGPT built-in browser context. Do not reuse a browsing context that loaded an origin before `Origin-Agent-Cluster: ?1` was present.

Follow:

- [`../chatgpt-validation.md`](../chatgpt-validation.md)

The release is blocked until actual ChatGPT proves:

- top-level Relay tools are visible
- all provider tools are discoverable by Relay Command
- safe provider probes execute successfully
- one proposal call succeeds against every provider
- dynamic capability creation and teardown are visible
- stale work fails closed
- recovery replaces only invalid work
- exact human approval completes
- all providers independently commit
- six receipts converge
- final audit digest passes consistency

Harness output must never be relabeled as ChatGPT evidence.

## 8. Rehearse and record

Use the locked script:

- [`../demo-script.md`](../demo-script.md)

Required rehearsal threshold:

- three consecutive success-path runs
- three consecutive stale-and-recovery runs
- scenario reset returns every provider to deterministic v1 state
- final edited duration between 2:40 and 2:50
- no hidden manual repair during the sequence

## 9. Rollback

A rollback must also preserve one exact commit across all four origins.

```bash
git checkout <known-good-commit>
export RELAY_RELEASE_SHA=$(git rev-parse HEAD)
# update .env.deploy with that exact SHA and a distinct image tag
npm run deploy:check
docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
npm run deploy:smoke
```

Never roll back only one provider. A mixed-version federation must fail release provenance checks.

If a partial provider transaction already occurred, deployment rollback does not reverse that transaction. Preserve receipts and use the domain recovery path documented in the ChatGPT validation drill.

## 10. Final release order

```text
clean release gate passes
→ four-origin deployed smoke passes
→ actual ChatGPT validation passes
→ demo rehearsals pass
→ video recorded
→ README links finalized
→ repository visibility requirement satisfied
→ PR #1 marked ready
→ PR #1 merged
→ submission tag created from merged commit
→ Devpost submission frozen
```

Until that sequence is complete, the verdict remains:

# DO NOT MERGE
