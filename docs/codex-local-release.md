# Codex local release runbook

Use this when the repository is available on the development machine.

The job is verification and release only. Do not add providers, workflows, product surfaces or abstractions.

## 1. Open the correct branch

```bash
cd /path/to/relay-webmcp
git fetch origin
git checkout build/pact-vertical-slice
git pull --ff-only origin build/pact-vertical-slice
git status --short
git rev-parse HEAD
```

The tree must be clean before continuing.

## 2. Pin the expected runtime

```bash
nvm use 22
node --version
npm --version
```

Required:

```text
Node 22.x
npm 10.x
```

## 3. Create the lockfile once if absent

```bash
npm install --package-lock-only --ignore-scripts --no-audit --no-fund
npm install --no-audit --no-fund
```

Review `package-lock.json`. It must not introduce unexpected packages or lifecycle scripts.

Commit the lockfile separately:

```bash
git add package-lock.json
git commit -m "chore: lock submission dependencies"
```

Return to a clean tree before running the release gate.

## 4. Run the single clean-checkout gate

```bash
node scripts/clean-release-gate.mjs
```

The gate refuses to continue when:

- branch is wrong
- tree is dirty
- Node major is not 22
- `package-lock.json` is absent

It then runs:

```text
npm ci
npm run verify
npm run check:origin-isolation
npm run check:competition
npm run check:local-registry
npm run check:provider-atomicity
```

Machine-readable output is written to:

```text
evidence/local/clean-release-gate-<commit>.json
```

## 5. Failure protocol

For each failure:

1. Preserve the exact command, exit code, stdout and stderr.
2. Reproduce the failing command directly.
3. Fix only the confirmed release blocker.
4. Add or strengthen a regression test.
5. Rerun the failing command.
6. Rerun `node scripts/clean-release-gate.mjs` from a clean tree.

Do not weaken a release gate to make it green.

## 6. Mandatory authority regression

The current release must prove:

```text
initial incident authority     €5,000
human-confirmed authority      €3,000
agent stale-recovery request   €5,000
effective recovered authority  €3,000
```

Relevant evidence:

```text
evidence/authority-persistence-2026-08-29.json
```

The clean release audit must reproduce this invariant.

## 7. Deployment after local green

Populate `.env.deploy` with four real hostnames, then run:

```bash
npm run deploy:check
npm run deploy:check:dns

docker compose --env-file .env.deploy build --pull
docker compose --env-file .env.deploy up -d
docker compose --env-file .env.deploy ps

npm run deploy:smoke
```

Do not proceed unless every origin returns:

```http
Origin-Agent-Cluster: ?1
```

## 8. Actual ChatGPT gate

Follow exactly:

```text
docs/chatgpt-validation.md
```

The decisive evidence must come from ChatGPT's supported built-in browser. Ordinary Chrome, Playwright and `?proof=1` do not satisfy this gate.

## 9. Final release rule

Do not merge PR #1 until:

```text
clean local gate PASS
four-origin deployment PASS
actual ChatGPT gate PASS
three consecutive full rehearsals PASS
three consecutive stale/recovery rehearsals PASS
public video recorded under three minutes
repository visibility requirement satisfied
```

Then merge through PR #1 and create the submission tag from the merged commit.
