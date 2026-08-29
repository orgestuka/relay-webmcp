# Relay evidence

Evidence is separated by execution environment. Do not upgrade one evidence class into another in the submission narrative.

## Local core evidence

- `local-core-smoke-2026-08-29.json`
- `release-audit-2026-08-29.json`

These files prove pure PACT, policy and dynamic-capability properties against core files reconstructed from the connected private branch. They do not prove a clean checkout, production build, deployed provider mutation or ChatGPT compatibility.

## Deployment evidence

Create after four HTTPS origins are live:

```text
evidence/deployment/01-preflight.json
evidence/deployment/02-dns.json
evidence/deployment/03-https-smoke.json
```

## Actual ChatGPT evidence

Create only from ChatGPT's supported built-in browser:

```text
evidence/chatgpt/01-initial-diagnostic.json
evidence/chatgpt/02-provider-proposal-probes.json
evidence/chatgpt/03-capability-created.json
evidence/chatgpt/04-capability-torn-down.json
evidence/chatgpt/05-full-path.json
evidence/chatgpt/06-final-audit-bundle.json
evidence/chatgpt/07-partial-commit-recovery.json
```

Each file must preserve raw tool output and identify:

- deployed Relay URL
- test date
- ChatGPT desktop/browser build when visible
- branch commit SHA
- whether the default fixed bridge or `?direct=1` mode was used

Ordinary Chrome, Playwright and Relay's optional proof console are harness evidence and must not be stored or described as actual ChatGPT evidence.
