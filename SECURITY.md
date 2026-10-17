# Security Policy (Beta)

> En español: [`SECURITY.es.md`](SECURITY.es.md).

Rino Docs is in **Beta**: client-only PWA, no backend, data stays in IndexedDB/LocalStorage.
There is no production SLA.

## Report a vulnerability

- Preferred: GitHub → Security → "Report a vulnerability" (private advisory).
- Include: version, affected area (`app/src/...`), steps to reproduce, impact.
- Do NOT open a public issue for sensitive bugs, and do NOT attach files with personal/student data.

## Scope notes

- Out of scope: Cloudflare account/DNS config, end-user devices.
- Secrets for deploy (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`) live only in GitHub Actions secrets, never in code.
