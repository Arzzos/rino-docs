# CI/CD (reference)

Pipeline: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

- Triggers: push to `main`, PRs to `main`, manual dispatch.
- `check` job (in `app/`): pnpm install → oxlint → `tsc -b --force` → `vitest run` → `vite build`.
- `deploy` job: only on `push` to `main` (`if: github.ref == 'refs/heads/main'`). PRs never deploy. Needs `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets; deploys `app/dist` to Pages project `rino-docs`.
- Alternative without Actions: Cloudflare dashboard → Pages → connect repo (root `app`, build `pnpm build`, output `dist`, Node 20+) or CLI: `pnpm build && pnpm deploy` after `wrangler login` once; point DNS CNAME to `rino-docs.pages.dev` for `rinodocs.arzzos.com`.

Branch rule: never work on `main`; use `feat|fix|docs|test/<topic>` branches + PR. Protect `main` on GitHub (require PR reviews + green CI, block direct pushes).
