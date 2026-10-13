# CI/CD (reference)

Checks: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — checks only, no deploy job.

- Triggers: push to `main`, PRs to `main`, manual dispatch.
- `check` job (in `app/`): pnpm install → oxlint → `tsc -b --force` → `vitest run` → `vite build`. The build proves `dist/` generates cleanly; publishing is Pages' job.

Deploys: Cloudflare Pages dashboard (Git integration, primary).

- Connect once: Workers & Pages → Create → Pages → Connect to Git → repo `rino-docs`. Settings: root `app`, build `pnpm build`, output `dist`, `NODE_VERSION=20`, production branch `main`.
- Every merge to `main` auto-deploys to production; every PR gets its own preview URL. Rollback from the dashboard (Deployments → previous → Rollback).
- Custom domain `rinodocs.arzzos.com`: Pages → Custom domains; if DNS is outside Cloudflare, add CNAME `rinodocs` → `rino-docs.pages.dev`.
- No GitHub secrets needed for deploys.

Manual alternative (secondary): CLI `cd app && pnpm build && pnpm deploy` after `wrangler login` once.

Branch rule: never work on `main`; use `feat|fix|docs|test/<topic>` branches + PR. Protect `main` on GitHub (require PR reviews + green CI, block direct pushes).
