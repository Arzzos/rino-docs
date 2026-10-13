# CI/CD (referencia)

Checks: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — solo verificación, sin job de deploy.

- Disparadores: push a `main`, PRs a `main`, manual.
- Job `check` (en `app/`): pnpm install → oxlint → `tsc -b --force` → `vitest run` → `vite build`. El build prueba que `dist/` se genera limpio; publicar le toca a Pages.

Despliegues: dashboard de Cloudflare Pages (integración Git, vía principal).

- Conexión única: Workers & Pages → Create → Pages → Connect to Git → repo `rino-docs`. Ajustes: raíz `app`, build `pnpm build`, salida `dist`, `NODE_VERSION=20`, rama de producción `main`.
- Cada merge a `main` autodespliega a producción; cada PR obtiene su URL de preview. Rollback desde el dashboard (Deployments → anterior → Rollback).
- Dominio `rinodocs.arzzos.com`: Pages → Custom domains; si el DNS está fuera de Cloudflare, CNAME `rinodocs` → `rino-docs.pages.dev`.
- Sin secrets de GitHub para desplegar.

Alternativa manual (secundaria): CLI `cd app && pnpm build && pnpm deploy` tras `wrangler login` una vez.

Regla de ramas: nunca trabajar en `main`; usar ramas `feat|fix|docs|test/<tema>` + PR. Proteger `main` en GitHub (exigir revisión + CI verde, bloquear pushes directos).
