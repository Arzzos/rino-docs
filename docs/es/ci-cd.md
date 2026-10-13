# CI/CD (referencia)

Pipeline: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

- Disparadores: push a `main`, PRs a `main`, manual.
- Job `check` (en `app/`): pnpm install → oxlint → `tsc -b --force` → `vitest run` → `vite build`.
- Job `deploy`: solo en `push` a `main` (`if: github.ref == 'refs/heads/main'`). Los PRs nunca despliegan. Requiere secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`; publica `app/dist` en el proyecto Pages `rino-docs`.
- Alternativa sin Actions: dashboard Cloudflare → Pages → conectar repo (raíz `app`, build `pnpm build`, salida `dist`, Node 20+) o CLI: `pnpm build && pnpm deploy` tras `wrangler login` una vez; CNAME del DNS a `rino-docs.pages.dev` para `rinodocs.arzzos.com`.

Regla de ramas: nunca trabajar en `main`; usar ramas `feat|fix|docs|test/<tema>` + PR. Proteger `main` en GitHub (exigir revisión + CI verde, bloquear pushes directos).
