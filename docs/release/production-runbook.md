# Relay production release runbook

This path is retained for stable links only.

The canonical executable runbooks are:

1. [`../codex-local-release.md`](../codex-local-release.md) for lockfile generation, clean installation and the source release gate.
2. [`../production-operator-runbook.md`](../production-operator-runbook.md) for DNS, Docker, Caddy, Nginx, four-origin deployment and deployed smoke.
3. [`../chatgpt-validation.md`](../chatgpt-validation.md) for actual ChatGPT browser evidence.

Do not maintain a second command sequence in this file. A duplicate release procedure can silently drift on:

- npm version and lockfile requirements
- `RELAY_RELEASE_SHA`
- Caddy and Nginx validation
- evidence paths
- release identity fields
- approval-gated commit capability timing

The current canonical commands are:

```bash
npm run gate:source
npm run gate:release -- --env .env.deploy
```

PR #1 remains **DO NOT MERGE** until both gates, actual ChatGPT validation, rehearsals, video and repository visibility requirements pass against an identified commit.
